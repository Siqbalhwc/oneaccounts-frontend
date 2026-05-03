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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { company_name, plan_code, reference_code, evidence_url } = await request.json()
  if (!company_name?.trim() || !plan_code || !reference_code) {
    return NextResponse.json({ error: 'Company name, plan, and reference are required' }, { status: 400 })
  }

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('code', plan_code)
    .single()
  if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const { error: insertErr } = await supabaseAdmin
    .from('company_creation_requests')
    .insert({
      user_id: user.id,
      company_name: company_name.trim(),
      plan_code,
      amount: plan_code === 'basic' ? 1999 : plan_code === 'pro' ? 4999 : 0,
      payment_method: 'bank_transfer',
      reference_code,
      evidence_url: evidence_url || null,
      status: 'pending',
    })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Request submitted for verification.' })
}