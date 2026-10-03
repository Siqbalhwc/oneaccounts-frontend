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

  // The trial end date is stored in more than one place:
  //   companies.trial_ends_at / companies.is_trial  -> Super Admin status badge
  //   company_settings.trial_ends_at                -> TrialGuard + Upgrade page
  //   subscriptions.end_date (status 'trial')       -> subscription record
  // All of them must be updated together, otherwise they disagree.

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('id, trial_ends_at, is_trial')
    .eq('id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (companyErr || !company) {
    return NextResponse.json({ error: companyErr?.message || 'Company not found' }, { status: 404 })
  }

  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('trial_ends_at')
    .eq('company_id', companyId)
    .maybeSingle()

  // Base = latest of: now, companies.trial_ends_at, company_settings.trial_ends_at
  // So an already-expired trial gets "days" counted from today, not from a past date.
  const candidates: number[] = [Date.now()]
  if (company.trial_ends_at) candidates.push(new Date(company.trial_ends_at).getTime())
  if (settings?.trial_ends_at) candidates.push(new Date(settings.trial_ends_at).getTime())

  const baseDate = new Date(Math.max(...candidates))
  baseDate.setDate(baseDate.getDate() + days)
  const newEndDate = baseDate.toISOString()

  // 1. companies (also make sure it is flagged as a trial)
  const { error: compUpdErr } = await supabaseAdmin
    .from('companies')
    .update({ trial_ends_at: newEndDate, is_trial: true })
    .eq('id', companyId)

  if (compUpdErr) {
    return NextResponse.json({ error: compUpdErr.message }, { status: 500 })
  }

  // 2. company_settings (upgrade page + TrialGuard)
  const { error: settingsErr } = await supabaseAdmin
    .from('company_settings')
    .upsert(
      { company_id: companyId, trial_ends_at: newEndDate },
      { onConflict: 'company_id' }
    )

  if (settingsErr) {
    return NextResponse.json({ error: settingsErr.message }, { status: 500 })
  }

  // 3. latest trial subscription record (best effort - not a hard failure)
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'trial')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sub?.id) {
    const { error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .update({ end_date: newEndDate.split('T')[0] })
      .eq('id', sub.id)
    if (subErr) console.error('extend-trial: could not update subscription end_date:', subErr.message)
  }

  return NextResponse.json({ success: true, newTrialEndsAt: newEndDate })
}