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

export async function PATCH(request: Request) {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { companyId, days } = await request.json()
  if (!companyId || !days || ![7, 15, 30].includes(days)) {
    return NextResponse.json({ error: 'Missing or invalid fields. days must be 7, 15, or 30.' }, { status: 400 })
  }

  // Get current trial_ends_at
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('trial_ends_at')
    .eq('id', companyId)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Calculate new trial end date
  const baseDate = company.trial_ends_at ? new Date(company.trial_ends_at) : new Date()
  baseDate.setDate(baseDate.getDate() + days)
  const newEndDate = baseDate.toISOString()

  // Update
  const { error } = await supabaseAdmin
    .from('companies')
    .update({ trial_ends_at: newEndDate })
    .eq('id', companyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, newTrialEndsAt: newEndDate })
}