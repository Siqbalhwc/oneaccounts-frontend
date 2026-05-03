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

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('code', 'basic')
    .single()
  if (!plan) {
    return NextResponse.json({ error: 'Basic plan not found' }, { status: 500 })
  }

  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .insert({
      name: companyName.trim(),
      plan_id: plan.id,
      trial_ends_at: trialEnd,
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
  })

  // Make creator admin
  await supabaseAdmin.from('user_roles').insert({
    user_id: user.id,
    company_id: company.id,
    role: 'admin',
  })

  // Update JWT custom claims so the app uses this company
  const { error: refreshError } = await supabaseAdmin.functions.invoke(
    'custom-claims',
    { body: { userId: user.id } }
  )
  if (refreshError) {
    console.error('Failed to update JWT claim:', refreshError)
    // Non-fatal
  }

  return NextResponse.json({
    success: true,
    companyId: company.id,
    companyName: companyName.trim(),
    message: `Company "${companyName.trim()}" created with a 14‑day free trial.`,
  })
}