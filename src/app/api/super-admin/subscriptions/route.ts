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

  const { companyId, planType, paymentMethod, paymentRef, amount, startDate, topups } = await request.json()
  if (!companyId || !planType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Find the plan id from the code
  const { data: planData, error: planError } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('code', planType)
    .single()

  if (planError || !planData) {
    return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 })
  }

  const start = startDate || new Date().toISOString().split('T')[0]
  // Set end date to 1 year after start
  const endDate = new Date(start)
  endDate.setFullYear(endDate.getFullYear() + 1)
  const end = endDate.toISOString().split('T')[0]

  // Update company: set plan, clear trial flags
  const { error: updateError } = await supabaseAdmin
    .from('companies')
    .update({
      plan_id: planData.id,
      is_trial: false,
      trial_ends_at: null,
    })
    .eq('id', companyId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Insert subscription record with end_date
  const { error: insertError } = await supabaseAdmin
    .from('subscriptions')
    .insert({
      company_id: companyId,
      plan_type: planType,
      status: 'active',
      start_date: start,
      end_date: end,
      payment_method: paymentMethod,
      payment_reference: paymentRef,
      amount,
      topups: topups || [],
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Also insert a payment notification with breakdown
  const { error: notifError } = await supabaseAdmin
    .from('payment_notifications')
    .insert({
      company_id: companyId,
      amount,
      plan_code: planType,
      period: '1 year',
      topups: topups || [],
    })

  if (notifError) {
    console.error('Failed to insert payment notification:', notifError)
  }

  return NextResponse.json({ success: true })
}