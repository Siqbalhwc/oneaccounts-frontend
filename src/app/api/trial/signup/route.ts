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

  const { companyName } = await request.json()
  if (!companyName?.trim()) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  }

  // Don't allow someone who already has a company
  const { count } = await supabaseAdmin
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (count && count > 0) {
    return NextResponse.json({ error: 'You already belong to a company.' }, { status: 400 })
  }

  // Use Professional plan
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('code', 'pro')
    .single()
  if (!plan) {
    return NextResponse.json({ error: 'Professional plan not found' }, { status: 500 })
  }

  // Create company with 14‑day trial
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .insert({
      name: companyName.trim(),
      plan_id: plan.id,
      trial_ends_at: trialEnd,
      is_trial: true,
    })
    .select('id')
    .single()

  if (companyError || !company) {
    return NextResponse.json(
      { error: companyError?.message || 'Could not create company' },
      { status: 500 }
    )
  }

  // Seed accounts and assign admin role
  await supabaseAdmin.rpc('seed_accounts_for_company', { target_company_id: company.id })
  await supabaseAdmin.from('user_roles').insert({
    user_id: user.id,
    company_id: company.id,
    role: 'admin',
  })

  // Refresh the user's JWT to include the new company_id claim
  await supabaseAdmin.functions.invoke('custom-claims', { body: { userId: user.id } })

  // Build the response and set the active_company_id cookie
  const response = NextResponse.json({
    success: true,
    companyId: company.id,
    companyName: companyName.trim(),
    message: `${companyName.trim()} is ready with a 14‑day Professional trial.`,
  })

  response.cookies.set('active_company_id', company.id, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}