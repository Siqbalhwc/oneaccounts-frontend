import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function isSuperAdmin(user: any) {
  if (!user) return false
  const { data } = await supabaseAdmin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  return !!data
}

export async function POST(request: Request) {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { companyId, planType, paymentMethod, paymentRef, amount, startDate } = await request.json()
  if (!companyId || !planType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Mark company as paid (not trial) and set plan
  await supabaseAdmin.from('companies').update({
    plan_id: (await supabaseAdmin.from('plans').select('id').eq('code', planType).single()).data?.id,
    is_trial: false,
    trial_ends_at: null,
  }).eq('id', companyId)

  // Insert subscription record
  const { error } = await supabaseAdmin.from('subscriptions').insert({
    company_id: companyId,
    plan_type: planType,
    status: 'active',
    start_date: startDate || new Date().toISOString().split('T')[0],
    payment_method: paymentMethod,
    payment_reference: paymentRef,
    amount,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}