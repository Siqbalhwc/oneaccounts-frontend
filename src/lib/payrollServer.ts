import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Server-side helpers shared by every payroll API route.
// Rule: the screen may hide buttons, but the SERVER decides who may do what.

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export type PayrollActor = { userId: string; companyId: string; role: string }
export type ApprovalSettings = {
  levels: '1' | '2' | '3'
  submitRoles: string[]
  approveRoles: string[]
  postRoles: string[]
}

// Same client the payroll routes have always used for their data work (unchanged behaviour).
export async function createRouteClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

// Who is calling, which company, which role, and is Payroll switched on for that company.
export async function resolvePayrollActor(
  supabase: any
): Promise<{ actor?: PayrollActor; response?: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const claimed = (user.app_metadata as any)?.company_id
  let query = supabaseAdmin
    .from('user_roles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
  if (claimed) query = query.eq('company_id', claimed)

  const { data: roles, error } = await query
  if (error) {
    return { response: NextResponse.json({ error: 'Could not verify your access' }, { status: 500 }) }
  }
  if (!roles || roles.length === 0) {
    return { response: NextResponse.json({ error: 'You do not have access to this company' }, { status: 403 }) }
  }
  if (!claimed && roles.length > 1) {
    return { response: NextResponse.json({ error: 'Please select your company again and retry' }, { status: 400 }) }
  }

  const companyId = roles[0].company_id as string
  const role = String(roles[0].role || '')

  // Payroll is only for admin and accountant (same as the screens).
  if (role !== 'admin' && role !== 'accountant') {
    return { response: NextResponse.json({ error: 'You do not have permission to use Payroll' }, { status: 403 }) }
  }

  // Feature must be enabled for this company.
  const { data: feature } = await supabaseAdmin
    .from('features').select('id').eq('code', 'payroll').maybeSingle()
  if (!feature) {
    return { response: NextResponse.json({ error: 'Payroll feature not configured' }, { status: 403 }) }
  }
  const { data: cf } = await supabaseAdmin
    .from('company_features')
    .select('enabled')
    .eq('company_id', companyId)
    .eq('feature_id', feature.id)
    .maybeSingle()
  if (!cf?.enabled) {
    return { response: NextResponse.json({ error: 'Payroll feature is not enabled' }, { status: 403 }) }
  }

  return { actor: { userId: user.id, companyId, role } }
}

// The company's approval workflow. If nothing has been saved yet: 1 stage, admin/accountant.
export async function loadApprovalSettings(companyId: string): Promise<ApprovalSettings> {
  const { data } = await supabaseAdmin
    .from('payroll_approval_settings')
    .select('approval_levels, submit_roles, approve_roles, post_roles')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!data) {
    return {
      levels: '1',
      submitRoles: ['admin', 'accountant'],
      approveRoles: ['admin', 'accountant'],
      postRoles: ['admin', 'accountant'],
    }
  }
  const lv = String(data.approval_levels)
  return {
    levels: (lv === '2' || lv === '3' ? lv : '1') as '1' | '2' | '3',
    submitRoles: Array.isArray(data.submit_roles) ? data.submit_roles : [],
    approveRoles: Array.isArray(data.approve_roles) ? data.approve_roles : [],
    postRoles: Array.isArray(data.post_roles) ? data.post_roles : [],
  }
}

// Audit trail (same table and columns the budget module already uses successfully).
export async function logPayrollEvent(p: {
  companyId: string
  userId: string
  tableName: string
  recordId: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  oldValues?: any
  newValues?: any
}) {
  const { error } = await supabaseAdmin.from('data_change_logs').insert({
    table_name: p.tableName,
    record_id: p.recordId,
    action: p.action,
    old_values: p.oldValues ?? null,
    new_values: p.newValues ?? null,
    changed_by: p.userId,
    company_id: p.companyId,
    changed_at: new Date().toISOString(),
  })
  if (error) console.error('Payroll audit log failed:', error.message)
}

export function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}