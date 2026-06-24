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
  const { userId, email, companyName, businessType } = await request.json()

  // ── 1. Basic input validation ──
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid userId' }, { status: 400 })
  }
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid email' }, { status: 400 })
  }
  if (!companyName?.trim()) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  }

  // ── 2. Verify the user actually exists AND that the email matches ──
  // This is the critical security check. Without it, anyone who knows
  // (or guesses) a userId could create a company linked to a stranger's
  // account. By requiring the email to match too, an attacker would need
  // to already know both the userId AND the email of the victim's brand
  // new, not-yet-linked account — which is not exposed anywhere in the UI.
  const { data: userCheck, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)

  if (userError || !userCheck?.user) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 401 })
  }

  const user = userCheck.user

  if (user.email?.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: 'User/email mismatch' }, { status: 401 })
  }

  // ── 3. Prevent linking a company to a user that's already linked ──
  // (covers both the "already has an active company" case AND blocks
  // someone from replaying this request to attach a 2nd company)
  const { count } = await supabaseAdmin
    .from('user_roles')
    .select('*, companies!inner(deleted_at)', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('companies.deleted_at', null)

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

  // ── 4. Create company ──
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

  // ── 5. Seed chart of accounts ──
  const { error: seedError } = await supabaseAdmin.rpc('seed_accounts_for_company', {
    target_company_id: company.id,
    business_type: type,
  })
  if (seedError) {
    console.error('Failed to seed accounts:', seedError)
  }

  // ── 6. Insert subscription ──
  const { error: subError } = await supabaseAdmin.from('subscriptions').insert({
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
    console.error('Failed to insert subscription:', subError)
  }

  // ── 7. Assign admin role to the creator (THE critical linking step) ──
  const { error: roleError } = await supabaseAdmin.from('user_roles').insert({
    user_id: user.id,
    company_id: company.id,
    role: 'admin',
    is_active: true,
  })

  if (roleError) {
    // This is the row that actually links the user to the company.
    // If it fails, the whole signup is broken even if "company" was
    // created — so we treat this as a hard failure and report it.
    console.error('Failed to insert user_roles:', roleError)
    return NextResponse.json(
      { error: 'Could not link user to company' },
      { status: 500 }
    )
  }

  // ── 8. Enable default features per business type ──
  if (type === 'trading') {
    const { data: feature } = await supabaseAdmin
      .from('features')
      .select('id')
      .eq('code', 'inventory')
      .single()

    if (feature) {
      const { error: featureError } = await supabaseAdmin.from('company_features').upsert(
        { company_id: company.id, feature_id: feature.id, enabled: true },
        { onConflict: 'company_id,feature_id' }
      )
      if (featureError) {
        console.error('Failed to enable feature:', featureError)
      }
    }
  }

  // ── 9. Directly update user's app_metadata – no Edge Function needed ──
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
    // Not a hard failure: user_roles already has the link, and your
    // app's fallback (company_id from user_roles when app_metadata is
    // empty) will still work correctly at login.
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