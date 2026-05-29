import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// Map business type to plan code
function getPlanCode(businessType: string): string {
  switch (businessType) {
    case 'trading': return 'basic-trading'
    case 'service': return 'basic-service'
    case 'ngo':
    default:        return 'basic-ngo'
  }
}

// Features to enable based on business type (beyond base)
function getTypeFeatures(businessType: string): string[] {
  switch (businessType) {
    case 'trading':
      return ['inventory', 'product_register']
    case 'ngo':
      return ['project_tracking', 'ngo_dashboard', 'budget_vs_actual']
    case 'service':
    default:
      return []
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

  // Prevent duplicate trials
  const { count } = await supabaseAdmin
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (count && count > 0) {
    return NextResponse.json({ error: 'You already belong to a company.' }, { status: 400 })
  }

  const type = businessType || 'ngo'
  const planCode = getPlanCode(type)

  // Get plan from new plans table
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, trial_days')
    .eq('code', planCode)
    .single()

  if (!plan) {
    return NextResponse.json({ error: `Plan "${planCode}" not found` }, { status: 500 })
  }

  // Create company with business type
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

  // Insert subscription row
  const { error: subError } = await supabaseAdmin
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

  if (subError) {
    console.error('Subscription creation failed:', subError)
    // Non-fatal – continue
  }

  // Seed accounts with business type awareness
  await supabaseAdmin.rpc('seed_accounts_for_company', {
    target_company_id: company.id,
    actor_user_id: user.id,
    business_type: type,
  })

  // Enable base features for all plans + type-specific features
  const baseFeatures = [
    'invoices', 'bills', 'receipts', 'payments',
    'banking', 'journal', 'reports',
    'trial_balance', 'profit_loss', 'balance_sheet',
    'general_ledger', 'customer_ledger', 'vendor_ledger',
  ]

  const typeFeatures = getTypeFeatures(type)
  const allFeatures = [...baseFeatures, ...typeFeatures]

  // Get feature IDs
  const { data: featureRows } = await supabaseAdmin
    .from('features')
    .select('id, code')
    .in('code', allFeatures)

  if (featureRows) {
    const featureIds = featureRows.map(f => f.id)
    // Use upsert to enable features
    const featureInserts = featureRows.map(f => ({
      company_id: company.id,
      feature_id: f.id,
      enabled: true,
    }))
    await supabaseAdmin.from('company_features').upsert(featureInserts, {
      onConflict: 'company_id,feature_id',
    })
  }

  // Upsert admin role
  await supabaseAdmin.from('user_roles')
    .update({ is_active: false })
    .eq('user_id', user.id)

  await supabaseAdmin.from('user_roles')
    .upsert({
      user_id: user.id,
      company_id: company.id,
      role: 'admin',
      is_active: true,
    })

  // Refresh JWT
  await supabaseAdmin.functions.invoke('custom-claims', { body: { userId: user.id } })

  // Set active company cookie
  const response = NextResponse.json({
    success: true,
    companyId: company.id,
    companyName: companyName.trim(),
    message: `${companyName.trim()} is ready with a ${plan.trial_days || 10}-day trial.`,
  })

  response.cookies.set('active_company_id', company.id, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}