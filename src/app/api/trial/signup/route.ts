import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function getPlanCode(businessType: string): string {
  switch (businessType) {
    case 'trading': return 'basic-trading'
    case 'service': return 'basic-service'
    case 'ngo':
    default:        return 'basic-ngo'
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { companyName, businessType } = await request.json()
  if (!companyName?.trim()) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  }

  // ── Prevent duplicate trials – only count ACTIVE companies ──
  const { count } = await supabaseAdmin
    .from('user_roles')
    .select('*, companies!inner(deleted_at)', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('companies.deleted_at', null)          // <‑ only companies that are NOT deleted

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'You already belong to an active company.' },
      { status: 400 }
    )
  }

  const type = businessType || 'ngo'
  const planCode = getPlanCode(type)

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, trial_days')
    .eq('code', planCode)
    .single()

  if (!plan) {
    return NextResponse.json({ error: `Plan "${planCode}" not found` }, { status: 500 })
  }

  // Create company
  const trialEnd = new Date(
    Date.now() + (plan.trial_days || 10) * 24 * 60 * 60 * 1000
  ).toISOString()
  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .insert({
      name: companyName.trim(),
      plan_id: plan.id,
      trial_ends_at: trialEnd,
      is_trial: true,
      business_type: type,
    })
    .select('id')
    .single()

  if (companyError || !company) {
    return NextResponse.json(
      { error: companyError?.message || 'Could not create company' },
      { status: 500 }
    )
  }

  // Seed chart of accounts
  await supabaseAdmin.rpc('seed_accounts_for_company', {
    target_company_id: company.id,
    business_type: type,
  })

  // Insert subscription
  await supabaseAdmin.from('subscriptions').insert({
    company_id: company.id,
    plan_type: planCode,
    status: 'trial',
    start_date: new Date().toISOString().split('T')[0],
    end_date: trialEnd.split('T')[0],
    max_users: 1,
    trial_count: 1,
    payment_status: 'pending',
  })

  // Assign admin role to the creator
  await supabaseAdmin.from('user_roles').insert({
    user_id: user.id,
    company_id: company.id,
    role: 'admin',
    is_active: true,
  })

  // ✅ DIRECTLY UPDATE USER'S app_metadata – no Edge Function needed
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      app_metadata: {
        company_id: company.id,
        role: 'admin',
      },
    }
  )

  if (updateError) {
    console.error('Failed to update JWT claims:', updateError)
    // Non‑fatal – the user will still work after logging out/in
  }

  return NextResponse.json({
    success: true,
    companyId: company.id,
    companyName: companyName.trim(),
    message: `${companyName.trim()} is ready with a ${
      plan.trial_days || 10
    }-day trial.`,
  })
}