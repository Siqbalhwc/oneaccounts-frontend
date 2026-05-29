import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

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

  const type = businessType || 'ngo'
  const planCode =
    type === 'trading' ? 'basic-trading' :
    type === 'service' ? 'basic-service' :
    'basic-ngo'

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, trial_days')
    .eq('code', planCode)
    .single()
  if (!plan) {
    return NextResponse.json({ error: `Plan "${planCode}" not found` }, { status: 500 })
  }

  const trialEnd = new Date(Date.now() + (plan.trial_days || 10) * 24 * 60 * 60 * 1000).toISOString()
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

  // Insert subscription
  await supabaseAdmin
    .from('subscriptions')
    .insert({
      company_id: company.id,
      plan_type: planCode,
      status: 'trial',
      start_date: new Date().toISOString().split('T')[0],
      end_date: trialEnd.split('T')[0],
      max_users: 1,
      trial_count: 1,
      payment_status: 'pending',
    })

  // Seed chart of accounts
  await supabaseAdmin.rpc('seed_accounts_for_company', {
    target_company_id: company.id,
    business_type: type,
  })

  // Make creator admin
  await supabaseAdmin.from('user_roles').insert({
    user_id: user.id,
    company_id: company.id,
    role: 'admin',
  })

  // Refresh JWT
  await supabaseAdmin.functions.invoke('custom-claims', { body: { userId: user.id } })

  return NextResponse.json({
    success: true,
    companyId: company.id,
    companyName: companyName.trim(),
    message: `Company "${companyName.trim()}" created with a ${plan.trial_days || 10}-day trial.`,
  })
}