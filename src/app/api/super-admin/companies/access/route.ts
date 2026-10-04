import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isValidDateStr } from '@/lib/access'

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

// One endpoint for the three things a super admin can do to a company's access:
//   { companyId, action: 'set_date',   accessUntil: 'YYYY-MM-DD' }  -> set last working day
//   { companyId, action: 'suspend',    reason: '...' }              -> block now
//   { companyId, action: 'reactivate' }                             -> remove suspension
export async function PATCH(request: Request) {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { companyId, action } = body
  if (!companyId || !action) {
    return NextResponse.json({ error: 'Missing companyId or action' }, { status: 400 })
  }

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('id, is_trial')
    .eq('id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (companyErr || !company) {
    return NextResponse.json({ error: companyErr?.message || 'Company not found' }, { status: 404 })
  }

  if (action === 'set_date') {
    const { accessUntil } = body
    if (!isValidDateStr(accessUntil)) {
      return NextResponse.json({ error: 'Please choose a valid date.' }, { status: 400 })
    }

    const update: Record<string, any> = { access_until: accessUntil }
    if (company.is_trial) {
      // keep the older trial column in step, end of that day Pakistan time
      update.trial_ends_at = `${accessUntil}T23:59:59+05:00`
    }
    const { error } = await supabaseAdmin.from('companies').update(update).eq('id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (company.is_trial) {
      // update only (never creates a row)
      await supabaseAdmin
        .from('company_settings')
        .update({ trial_ends_at: update.trial_ends_at })
        .eq('company_id', companyId)
    } else {
      // keep the latest active subscription's end date in step
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (sub?.id) {
        const { error: subErr } = await supabaseAdmin
          .from('subscriptions').update({ end_date: accessUntil }).eq('id', sub.id)
        if (subErr) console.error('access: subscription end_date not updated:', subErr.message)
      }
    }
  } else if (action === 'suspend') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return NextResponse.json({ error: 'Please enter a reason for the suspension.' }, { status: 400 })
    }
    const { error } = await supabaseAdmin
      .from('companies')
      .update({ suspended_at: new Date().toISOString(), suspended_reason: reason })
      .eq('id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'reactivate') {
    const { error } = await supabaseAdmin
      .from('companies')
      .update({ suspended_at: null, suspended_reason: null })
      .eq('id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  // Report the resulting state so the screen can tell the truth
  const { data: access } = await supabaseAdmin.rpc('company_access_for', { p_company_id: companyId })
  return NextResponse.json({ success: true, access })
}