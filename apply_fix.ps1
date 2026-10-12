# apply_fix.ps1 - Payroll Batch 1 (server-side security + workflow enforcement)
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
$ErrorActionPreference = 'Stop'
$enc = New-Object System.Text.UTF8Encoding($false)
function Write-Target($rel, $content) {
  $full = Join-Path (Get-Location).Path $rel
  $dir = Split-Path $full -Parent
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($full, $content, $enc)
  Write-Host ("WROTE   " + $rel)
}
function Patch-Target($rel, $old, $new) {
  $full = Join-Path (Get-Location).Path $rel
  if (-not (Test-Path -LiteralPath $full)) { throw "File not found: $rel" }
  $t = [System.IO.File]::ReadAllText($full)
  $nl = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }
  $o = $old.Replace("`r`n","`n").Replace("`n",$nl)
  $n = $new.Replace("`r`n","`n").Replace("`n",$nl)
  $i = $t.IndexOf($o)
  if ($i -lt 0) { throw "PATCH FAILED (text not found): $rel" }
  if ($t.IndexOf($o, $i + 1) -ge 0) { throw "PATCH FAILED (text found twice): $rel" }
  $t = $t.Substring(0,$i) + $n + $t.Substring($i + $o.Length)
  [System.IO.File]::WriteAllText($full, $t, $enc)
  Write-Host ("PATCHED " + $rel)
}

Write-Target 'src\lib\payrollServer.ts' @'
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
'@

Write-Target 'src\app\api\payroll\runs\generate\route.ts' @'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient, resolvePayrollActor, logPayrollEvent } from '@/lib/payrollServer'

export async function POST(request: NextRequest) {
  const supabase = await createRouteClient()

  // 1. Auth, company, role (admin/accountant) and payroll feature
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const body = await request.json().catch(() => ({}))
  const rawMonth = String(body?.month || '')
  const department_id = body?.department_id || null

  const mm = rawMonth.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (!mm || Number(mm[2]) < 1 || Number(mm[2]) > 12) {
    return NextResponse.json({ error: 'A valid month is required' }, { status: 400 })
  }
  // Runs are always stored against the 1st of the month (reports rely on this)
  const month = `${mm[1]}-${mm[2]}-01`

  // 2. Existing run check (all-department runs are matched with IS NULL, not = null)
  let sameQuery = supabase
    .from('payroll_runs')
    .select('id')
    .eq('company_id', companyId)
    .eq('month', month)
  sameQuery = department_id ? sameQuery.eq('department_id', department_id) : sameQuery.is('department_id', null)
  const { data: sameRows } = await sameQuery.limit(1)
  if (sameRows && sameRows.length > 0) {
    return NextResponse.json({ error: 'A payroll run already exists for this month and department', run_id: sameRows[0].id }, { status: 409 })
  }

  // 3. An all-employee run and a department run for the same month would pay people twice
  const { data: monthRuns } = await supabase
    .from('payroll_runs')
    .select('id, department_id, status')
    .eq('company_id', companyId)
    .eq('month', month)
    .neq('status', 'reversed')
  if (monthRuns && monthRuns.length > 0) {
    const overlaps = !department_id ? true : monthRuns.some((r: any) => r.department_id === null)
    if (overlaps) {
      return NextResponse.json({
        error: !department_id
          ? 'Department runs already exist for this month. An all-employee run would pay those employees twice.'
          : 'An all-employee run already exists for this month. A department run would pay those employees twice.',
        run_id: monthRuns[0].id,
      }, { status: 409 })
    }
  }

  // 4. Fetch active employees
  let employeeQuery = supabase
    .from('employees')
    .select('id, full_name, salary_structure_id')
    .eq('company_id', companyId)
    .eq('status', 'active')
  if (department_id) {
    employeeQuery = employeeQuery.eq('department_id', department_id)
  }
  const { data: employees, error: empErr } = await employeeQuery
  if (empErr || !employees || employees.length === 0) {
    return NextResponse.json({ error: 'No active employees found' }, { status: 404 })
  }

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const startDate = month
  const endDate = `${y}-${String(m).padStart(2, '0')}-${daysInMonth}`

  const runLines: any[] = []

  for (const emp of employees) {
    // Salary revision
    let { data: revision } = await supabase
      .from('employee_salary_revisions')
      .select('id, salary_structure_id, basic_salary')
      .eq('employee_id', emp.id)
      .lte('effective_date', month)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!revision) {
      revision = {
        id: 0,
        salary_structure_id: emp.salary_structure_id,
        basic_salary: 0,
      }
    }

    if (!revision.salary_structure_id) continue

    // Structure components
    const { data: components } = await supabase
      .from('salary_structure_components')
      .select('calculation_type, value, salary_component_id, salary_components!inner(id, name, type, gl_account_id)')
      .eq('salary_structure_id', revision.salary_structure_id)

    if (!components) continue

    let gross = 0
    let deductions = 0
    const lineComponents: any[] = []

    for (const comp of components) {
      let amount = 0
      if (comp.calculation_type === 'percentage') {
        amount = (revision.basic_salary * comp.value) / 100
      } else {
        amount = comp.value
      }
      amount = Math.round(amount * 100) / 100

      lineComponents.push({
        salary_component_id: comp.salary_component_id,
        component_name: (comp.salary_components as any)?.name || 'Unknown',
        amount,
        type: (comp.salary_components as any)?.type,
        gl_account_id: (comp.salary_components as any)?.gl_account_id,
        source_type: null,
        source_id: null,
      })

      if ((comp.salary_components as any)?.type === 'earning') {
        gross += amount
      } else {
        deductions += amount
      }
    }

    // ----- Attendance Integration -----
    let absentDays = 0
    let halfDays = 0
    let overtimeTotal = 0

    const { data: attRecords } = await supabase
      .from('attendance_records')
      .select('raw_status, overtime_amount')
      .eq('company_id', companyId)
      .eq('employee_id', emp.id)
      .eq('verified_status', 'approved')
      .gte('date', startDate)
      .lte('date', endDate)

    if (attRecords) {
      for (const rec of attRecords) {
        if (rec.raw_status === 'absent') absentDays++
        else if (rec.raw_status === 'half_day') halfDays++
        overtimeTotal += Number(rec.overtime_amount || 0)
      }
    }

    const dailyRate = revision.basic_salary > 0 ? revision.basic_salary / daysInMonth : 0
    const absenceDeduction = Math.round(dailyRate * (absentDays + halfDays * 0.5) * 100) / 100

    if (absenceDeduction > 0) {
      lineComponents.push({
        salary_component_id: null,
        component_name: 'Attendance Deduction',
        amount: absenceDeduction,
        type: 'deduction',
        gl_account_id: null,
        source_type: null,
        source_id: null,
      })
      deductions += absenceDeduction
    }

    if (overtimeTotal > 0) {
      lineComponents.push({
        salary_component_id: null,
        component_name: 'Overtime',
        amount: overtimeTotal,
        type: 'earning',
        gl_account_id: null,
        source_type: null,
        source_id: null,
      })
      gross += overtimeTotal
    }

    // ----- Employee Loans Integration (with source tracking) -----
    const { data: activeLoans } = await supabase
      .from('employee_loans')
      .select('id, monthly_installment')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (activeLoans) {
      for (const loan of activeLoans) {
        const installment = Number(loan.monthly_installment || 0)
        if (installment > 0) {
          lineComponents.push({
            salary_component_id: null,
            component_name: 'Loan Deduction',
            amount: installment,
            type: 'deduction',
            gl_account_id: null,
            source_type: 'loan',
            source_id: loan.id,
          })
          deductions += installment
        }
      }
    }

    // ----- Salary Advances Integration (with source tracking) -----
    const { data: activeAdvances } = await supabase
      .from('salary_advances')
      .select('id, monthly_recovery')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (activeAdvances) {
      for (const adv of activeAdvances) {
        const recovery = Number(adv.monthly_recovery || 0)
        if (recovery > 0) {
          lineComponents.push({
            salary_component_id: null,
            component_name: 'Salary Advance Recovery',
            amount: recovery,
            type: 'deduction',
            gl_account_id: null,
            source_type: 'advance',
            source_id: adv.id,
          })
          deductions += recovery
        }
      }
    }

    const net = gross - deductions

    // Attendance summary
    const attendanceSummary = {
      working_days: daysInMonth,
      present: daysInMonth - absentDays - halfDays,
      absent: absentDays,
      half_days: halfDays,
      overtime_hours: overtimeTotal > 0 ? overtimeTotal : 0,
      deduction: absenceDeduction,
    }

    // Dimensions snapshot
    const { data: dims } = await supabase
      .from('employee_default_dimensions')
      .select('department_id, location_id, project_id, activity_id, cost_center_id')
      .eq('employee_id', emp.id)
      .maybeSingle()

    const structureSnapshot = {
      id: revision.salary_structure_id,
      components: lineComponents.map(c => ({
        name: c.component_name,
        type: c.type,
        amount: c.amount,
        gl_account_id: c.gl_account_id,
      })),
    }

    const dimensionsSnapshot = {
      project_id: dims?.project_id || null,
      activity_id: dims?.activity_id || null,
      location_id: dims?.location_id || null,
      donor_id: null,
      department_id: dims?.department_id || null,
    }

    runLines.push({
      employee_id: emp.id,
      salary_structure_snapshot: structureSnapshot,
      attendance_summary: attendanceSummary,
      gross_amount: gross,
      total_deductions: deductions,
      net_amount: net,
      dimensions_snapshot: dimensionsSnapshot,
      components: lineComponents,
    })
  }

  if (runLines.length === 0) {
    return NextResponse.json({ error: 'No employees with valid salary structures found' }, { status: 400 })
  }

  // 6. Insert run and lines
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .insert({
      company_id: companyId,
      month,
      department_id: department_id || null,
      status: 'draft',
    })
    .select('id')
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message || 'Failed to create run' }, { status: 500 })
  }

  for (const line of runLines) {
    const { data: runLine, error: lineErr } = await supabase
      .from('payroll_run_lines')
      .insert({
        payroll_run_id: run.id,
        employee_id: line.employee_id,
        salary_structure_snapshot: line.salary_structure_snapshot,
        attendance_summary: line.attendance_summary,
        gross_amount: line.gross_amount,
        total_deductions: line.total_deductions,
        net_amount: line.net_amount,
        dimensions_snapshot: line.dimensions_snapshot,
      })
      .select('id')
      .single()

    if (lineErr || !runLine) {
      await supabase.from('payroll_runs').delete().eq('id', run.id)
      return NextResponse.json({ error: lineErr?.message || 'Failed to create run line' }, { status: 500 })
    }

    const compRows = line.components.map((c: any) => ({
      payroll_run_line_id: runLine.id,
      salary_component_id: c.salary_component_id,
      component_name: c.component_name,
      amount: c.amount,
      source_type: c.source_type || null,
      source_id: c.source_id || null,
    }))

    const { error: compErr } = await supabase
      .from('payroll_run_line_components')
      .insert(compRows)

    if (compErr) {
      await supabase.from('payroll_runs').delete().eq('id', run.id)
      return NextResponse.json({ error: compErr.message }, { status: 500 })
    }
  }

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(run.id), action: 'INSERT',
    newValues: { month, department_id, employees: runLines.length },
  })

  return NextResponse.json({ success: true, run_id: run.id })
}
'@

Write-Target 'src\app\api\payroll\runs\[runId]\submit\route.ts' @'
import { NextRequest, NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, loadApprovalSettings, logPayrollEvent, forbidden,
} from '@/lib/payrollServer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: runIdStr } = await params
  const supabase = await createRouteClient()

  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const runId = parseInt(runIdStr, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  // Workflow rules come from the company's saved approval settings.
  const settings = await loadApprovalSettings(companyId)
  if (settings.levels !== '3') {
    return NextResponse.json({ error: 'Submit step is not part of this company\'s approval workflow' }, { status: 409 })
  }
  if (!settings.submitRoles.includes(actor.role)) {
    return forbidden('Your role is not allowed to submit payroll runs')
  }

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status !== 'draft') return NextResponse.json({ error: 'Run must be in draft status to submit' }, { status: 409 })

  const { data: updated, error: updateErr } = await supabase
    .from('payroll_runs')
    .update({
      status: 'submitted',
      submitted_by: actor.userId,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .select('id')

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'The run status changed - please refresh and try again' }, { status: 409 })
  }

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(runId), action: 'UPDATE',
    oldValues: { status: 'draft' }, newValues: { status: 'submitted' },
  })

  return NextResponse.json({ success: true })
}
'@

Write-Target 'src\app\api\payroll\runs\[runId]\approve\route.ts' @'
import { NextRequest, NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, loadApprovalSettings, logPayrollEvent, forbidden,
} from '@/lib/payrollServer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: runIdStr } = await params
  const supabase = await createRouteClient()

  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const runId = parseInt(runIdStr, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  const settings = await loadApprovalSettings(companyId)
  if (settings.levels === '1') {
    return NextResponse.json({ error: 'Approval step is not part of this company\'s approval workflow' }, { status: 409 })
  }
  if (!settings.approveRoles.includes(actor.role)) {
    return forbidden('Your role is not allowed to approve payroll runs')
  }

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  // 2-stage: a draft (or submitted) run can be approved. 3-stage: it must be submitted first.
  const allowedFrom = settings.levels === '2' ? ['draft', 'submitted'] : ['submitted']
  if (!allowedFrom.includes(run.status)) {
    const msg = settings.levels === '3' && run.status === 'draft'
      ? 'This run must be submitted before it can be approved'
      : 'Run cannot be approved in its current status'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('payroll_runs')
    .update({
      status: 'approved',
      approved_by: actor.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('company_id', companyId)
    .eq('status', run.status)
    .select('id')

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'The run status changed - please refresh and try again' }, { status: 409 })
  }

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(runId), action: 'UPDATE',
    oldValues: { status: run.status }, newValues: { status: 'approved' },
  })

  return NextResponse.json({ success: true })
}
'@

Write-Target 'src\app\api\payroll\runs\[runId]\post\route.ts' @'
import { NextRequest, NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, loadApprovalSettings, logPayrollEvent, forbidden,
} from '@/lib/payrollServer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: runIdStr } = await params
  const supabase = await createRouteClient()

  // 1. Who is calling (also checks company access and the payroll feature)
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const runId = parseInt(runIdStr, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  // 2. Role from the company's approval workflow
  const settings = await loadApprovalSettings(companyId)
  if (!settings.postRoles.includes(actor.role)) {
    return forbidden('Your role is not allowed to post payroll runs')
  }

  // 3. The run must belong to this company and be at the right workflow step
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (['posted', 'locked', 'reversed'].includes(run.status)) {
    return NextResponse.json({ error: 'Run already posted/locked/reversed' }, { status: 409 })
  }

  // 1-stage: any unposted run may be posted. 2/3-stage: it must be approved first.
  const allowedFrom = settings.levels === '1' ? ['draft', 'submitted', 'approved'] : ['approved']
  if (!allowedFrom.includes(run.status)) {
    return NextResponse.json({ error: 'This run must be approved before it can be posted' }, { status: 409 })
  }

  // 4. Post (database function creates the journal entry and locks the run)
  const { data, error: rpcError } = await supabase.rpc('create_payroll_transaction', {
    p_run_id: runId,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(runId), action: 'UPDATE',
    oldValues: { status: run.status }, newValues: { status: 'posted', result: data },
  })

  return NextResponse.json({ success: true, data })
}
'@

Write-Target 'src\app\api\payroll\runs\[runId]\reverse\route.ts' @'
import { NextRequest, NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, loadApprovalSettings, logPayrollEvent, forbidden,
} from '@/lib/payrollServer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: runIdStr } = await params
  const supabase = await createRouteClient()

  // 1. Auth, company, role
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const runId = parseInt(runIdStr, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  const settings = await loadApprovalSettings(companyId)
  if (!settings.postRoles.includes(actor.role)) {
    return forbidden('Your role is not allowed to reverse payroll runs')
  }

  // 2. Fetch the run
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status, journal_entry_id')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (!['posted', 'locked'].includes(run.status)) {
    return NextResponse.json({ error: 'Only posted or locked runs can be reversed' }, { status: 409 })
  }

  if (!run.journal_entry_id) {
    return NextResponse.json({ error: 'No journal entry found for this run' }, { status: 400 })
  }

  // Never reverse twice
  const entryNo = `JE-REV-${runId}`
  const { data: existingRev } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('entry_no', entryNo)
    .limit(1)
  if (existingRev && existingRev.length > 0) {
    return NextResponse.json({ error: 'A reversal entry already exists for this run' }, { status: 409 })
  }

  // 3. Get the original journal entry lines
  const { data: originalLines } = await supabase
    .from('journal_lines')
    .select('account_id, debit, credit, project_id, activity_id, location_id, donor_id')
    .eq('entry_id', run.journal_entry_id)

  if (!originalLines || originalLines.length === 0) {
    return NextResponse.json({ error: 'No journal lines found for this entry' }, { status: 400 })
  }

  // 4. Reason (required)
  const body = await request.json().catch(() => ({}))
  const reason = String(body?.reason || '').trim()
  if (!reason) {
    return NextResponse.json({ error: 'A reason is required to reverse a payroll run' }, { status: 400 })
  }

  // 5. Create a new reversing journal entry
  const { data: reverseEntry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: entryNo,
      date: new Date().toISOString().split('T')[0],
      description: `Reversal of Payroll ${reason}`,
    })
    .select('id')
    .single()

  if (entryErr || !reverseEntry) {
    return NextResponse.json({ error: entryErr?.message || 'Failed to create reversal entry' }, { status: 500 })
  }

  // 6. Insert reversed lines (swap debit and credit)
  const reversalLines = originalLines.map((line: any) => ({
    entry_id: reverseEntry.id,
    company_id: companyId,
    account_id: line.account_id,
    debit: line.credit,
    credit: line.debit,
    project_id: line.project_id,
    activity_id: line.activity_id,
    location_id: line.location_id,
    donor_id: line.donor_id,
    source_type: 'payroll_reversal',
    source_id: runId,
  }))

  const { error: linesErr } = await supabase
    .from('journal_lines')
    .insert(reversalLines)

  if (linesErr) {
    await supabase.from('journal_entries').delete().eq('id', reverseEntry.id)
    return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  // 7. Update account balances - aggregate deltas per account
  const deltaMap: Record<number, number> = {}
  for (const line of reversalLines) {
    const delta = Number(line.debit) - Number(line.credit)
    deltaMap[line.account_id] = (deltaMap[line.account_id] || 0) + delta
  }

  for (const [accountId, delta] of Object.entries(deltaMap)) {
    const { error: rpcErr } = await supabase.rpc('update_account_balance', {
      p_account_id: parseInt(accountId),
      p_company_id: companyId,
      p_delta: delta,
    })
    if (rpcErr) {
      console.error('Failed to update balance for account', accountId, rpcErr)
    }
  }

  // 8. Mark the run as reversed, store reason
  const { error: updateErr } = await supabase
    .from('payroll_runs')
    .update({
      status: 'reversed',
      reversal_reason: reason,
    })
    .eq('id', runId)
    .eq('company_id', companyId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 9. Reversal record
  await supabase
    .from('payroll_reversals')
    .insert({
      payroll_run_id: runId,
      reversal_journal_entry_id: reverseEntry.id,
      reason,
      created_by: actor.userId,
    })

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(runId), action: 'UPDATE',
    oldValues: { status: run.status }, newValues: { status: 'reversed', reason, reversal_entry_id: reverseEntry.id },
  })

  return NextResponse.json({ success: true, reversal_entry_id: reverseEntry.id })
}
'@

Write-Target 'src\app\api\payroll\salary-structures\[id]\duplicate\route.ts' @'
import { NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, logPayrollEvent,
} from '@/lib/payrollServer'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteClient()

  // Must be a logged-in admin/accountant of a company that has Payroll enabled
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const { id } = await params
  const structureId = Number(id)
  if (!structureId) return NextResponse.json({ error: 'Invalid structure ID' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // The structure must belong to THIS company
  const { data: structure, error: structErr } = await supabase
    .from('salary_structures')
    .select('id, company_id')
    .eq('id', structureId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (structErr || !structure) {
    return NextResponse.json({ error: 'Structure not found' }, { status: 404 })
  }

  const { data: components, error: compErr } = await supabase
    .from('salary_structure_components')
    .select('salary_component_id, calculation_type, value')
    .eq('salary_structure_id', structureId)

  if (compErr) {
    return NextResponse.json({ error: 'Failed to fetch components' }, { status: 500 })
  }

  const { data: newStructure, error: insertErr } = await supabase
    .from('salary_structures')
    .insert({
      company_id: companyId,
      name,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertErr || !newStructure) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to duplicate structure' }, { status: 500 })
  }

  if (components && components.length > 0) {
    const newComponents = components.map((c: any) => ({
      salary_structure_id: newStructure.id,
      salary_component_id: c.salary_component_id,
      calculation_type: c.calculation_type,
      value: c.value,
    }))

    const { error: compInsertErr } = await supabase
      .from('salary_structure_components')
      .insert(newComponents)

    if (compInsertErr) {
      // Do not leave an empty half-copy behind
      await supabase.from('salary_structures').delete().eq('id', newStructure.id).eq('company_id', companyId)
      return NextResponse.json({ error: 'Could not copy components: ' + compInsertErr.message }, { status: 500 })
    }
  }

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'salary_structures', recordId: String(newStructure.id), action: 'INSERT',
    newValues: { name, copied_from: structureId },
  })

  return NextResponse.json(newStructure)
}
'@

Patch-Target 'src\app\dashboard\payroll\salary-structures\page.tsx' @'
    const { error } = await supabase.functions.invoke("duplicate-salary-structure", {
      body: { id: duplicateTarget.id, name: duplicateName.trim() },
    }) // We'll use a serverless function? Better to call an API route. We'll create the route, but for now we'll do a direct POST.
    // I'll implement duplication via fetch to our new API route.

'@ @'

'@

Patch-Target 'src\app\dashboard\payroll\salary-structures\page.tsx' @'
      if (!res.ok) throw new Error("Duplication failed")

'@ @'
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error || "Duplication failed")
      }

'@

Patch-Target 'src\app\dashboard\payroll\runs\[id]\page.tsx' @'
  const canApprove = run && (run.status === "draft" || run.status === "submitted") &&
    (approvalLevels === "2" || approvalLevels === "3") && approveRoles.includes(role ?? "")
'@ @'
  const canApprove = run && (
    (approvalLevels === "2" && (run.status === "draft" || run.status === "submitted")) ||
    (approvalLevels === "3" && run.status === "submitted")
  ) && approveRoles.includes(role ?? "")
'@

Write-Host ''
Write-Host 'Batch 1 applied. Next: Remove-Item -Recurse -Force .next ; npm run build' -ForegroundColor Green
