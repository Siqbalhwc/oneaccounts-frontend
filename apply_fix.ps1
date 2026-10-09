# OneAccounts - Stage 2: server-side protection for the NGO budget workflow
# What it does (all enforced on the SERVER, not only on the screen):
#   - checks the user's role and company from the database for every budget action
#   - blocks non-admins from changing an APPROVED budget (save and monthly split)
#   - Submit / Approve: refuses unless EVERY budget line has a complete monthly split (checked on saved data)
#   - Submit only from Draft, Approve/Reject only from Pending; an Approved budget cannot be pushed back
#   - rows must belong to your company; amounts must be valid
#   - Submit / Approve / Reject are written to the audit log
# Files: new src\lib\budgetServer.ts, 6 files in src\app\api\budgets\, 2 lines in settings\budgets\page.tsx
# Safe: nothing is written unless every file passes its check first.
$ErrorActionPreference = "Stop"
$root = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)

function Edit-File($relPath, $reps) {
  $path = Join-Path $root $relPath
  $raw = [System.IO.File]::ReadAllBytes($path)
  $hasBom = ($raw.Length -ge 3 -and $raw[0] -eq 0xEF -and $raw[1] -eq 0xBB -and $raw[2] -eq 0xBF)
  $text = [System.IO.File]::ReadAllText($path)
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  foreach ($r in $reps) {
    $old = $r[0]; $new = $r[1]; $want = $r[2]
    $count = ([regex]::Matches($text, [regex]::Escape($old))).Count
    if ($count -ne $want) { throw "STOP: in $relPath expected $want match(es) but found $count for: $($old.Substring(0,[Math]::Min(60,$old.Length)))" }
    $text = $text.Replace($old, $new)
  }
  $enc = if ($hasBom) { $utf8Bom } else { $utf8 }
  [System.IO.File]::WriteAllText($path, $text, $enc)
  Write-Host "OK: $relPath" -ForegroundColor Green
}

# ---------- 1. Check everything BEFORE writing anything ----------
$libPath = Join-Path $root "lib\budgetServer.ts"
if (Test-Path -LiteralPath $libPath) { throw "STOP: lib\budgetServer.ts already exists - tell Claude." }
$pagePath = Join-Path $root "app\dashboard\settings\budgets\page.tsx"
$pageText = [System.IO.File]::ReadAllText($pagePath)
foreach ($a in @('setMonthlyVerified(true)', 'setFlash("Monthly budget confirmed and saved!")')) {
  if (([regex]::Matches($pageText, [regex]::Escape($a))).Count -ne 1) { throw "STOP: budgets page does not match what was expected ($a)" }
}
$checks = @(
  ,@('app\api\budgets\save\route.ts', 'save_budgets')
  ,@('app\api\budgets\monthly-save\route.ts', 'save_monthly_budgets')
  ,@('app\api\budgets\submit-for-approval\route.ts', 'pending_approval')
  ,@('app\api\budgets\approve\route.ts', '''approved''')
  ,@('app\api\budgets\reject\route.ts', 'rejection_reason')
  ,@('app\api\budgets\matrix\route.ts', 'get_budget_matrix_gl')
)
foreach ($c in $checks) {
  $p = Join-Path $root $c[0]
  if (-not (Test-Path -LiteralPath $p)) { throw "STOP: missing file $($c[0])" }
  if (-not ([System.IO.File]::ReadAllText($p)).Contains($c[1])) { throw "STOP: $($c[0]) is not the version expected" }
}

# ---------- 2. Contents ----------
$lib = @'
// Server-side helpers for the budget API routes (NGO / Construction).
// Everything here runs on the server with the service-role client, so every rule in it
// is enforced no matter what the screen does.

import { NextResponse } from 'next/server'
import { fetchAllFromBuilder } from '@/lib/budgetPeriod'

export type BudgetActor = { userId: string; companyId: string; role: string }

// Same roles the Budgets screen lets edit budgets.
export const BUDGET_EDIT_ROLES = ['admin', 'accountant']

// Who is calling, for which company, with which role - read from user_roles on the server.
// The "active company" in the login token is only used to choose between several companies;
// it is always checked against the user's own active role records.
export async function resolveBudgetActor(
  user: any,
  admin: any
): Promise<{ actor?: BudgetActor; response?: NextResponse }> {
  const claimed = user?.app_metadata?.company_id
  let query = admin
    .from('user_roles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
  if (claimed) query = query.eq('company_id', claimed)
  const { data, error } = await query
  if (error) {
    return { response: NextResponse.json({ error: 'Could not verify your access' }, { status: 500 }) }
  }
  if (!data || data.length === 0) {
    return { response: NextResponse.json({ error: 'You do not have access to this company' }, { status: 403 }) }
  }
  if (!claimed && data.length > 1) {
    return { response: NextResponse.json({ error: 'Please select your company again and retry' }, { status: 400 }) }
  }
  return { actor: { userId: user.id, companyId: data[0].company_id, role: data[0].role } }
}

// The project must belong to this company and not be deleted.
export async function loadProject(admin: any, companyId: string, projectId: any) {
  const id = parseInt(projectId)
  if (!id) return null
  const { data } = await admin
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()
  return data || null
}

// The budget status row of a project (one per project; if several exist the one for the hinted year wins).
export async function loadStatusRow(admin: any, companyId: string, projectId: number, yearHint?: any) {
  const { data } = await admin
    .from('project_budget_status')
    .select('*')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
  const rows: any[] = data || []
  if (rows.length === 0) return null
  const hinted = rows.find((r: any) => Number(r.fiscal_year) === Number(yearHint))
  if (hinted) return hinted
  return [...rows].sort((a: any, b: any) => (b.fiscal_year || 0) - (a.fiscal_year || 0))[0]
}

// Is any of these projects approved? (Approved budgets can only be changed by an admin.)
export async function approvedProjectIds(admin: any, companyId: string, projectIds: number[]): Promise<number[]> {
  if (projectIds.length === 0) return []
  const { data } = await admin
    .from('project_budget_status')
    .select('project_id, status')
    .eq('company_id', companyId)
    .in('project_id', projectIds)
  return (data || []).filter((r: any) => r.status === 'approved').map((r: any) => Number(r.project_id))
}

// Rows posted by the screen must be sane and must only refer to this company's own records.
// Returns an error message, or null when everything is fine.
export async function validateBudgetRefs(
  admin: any,
  companyId: string,
  rows: any[],
  donorId?: any
): Promise<string | null> {
  const activityIds = new Set<number>()
  const accountIds = new Set<number>()
  const locationIds = new Set<number>()
  for (const r of rows) {
    const amount = Number(r?.budgeted_amount)
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e13) {
      return 'A budget amount is not valid (it must be a number, zero or more).'
    }
    const a = parseInt(r?.activity_id); if (a > 0) activityIds.add(a)
    const c = parseInt(r?.account_id); if (c > 0) accountIds.add(c)
    const l = parseInt(r?.location_id); if (l > 0) locationIds.add(l)
  }
  const countOwned = async (table: string, ids: Set<number>) => {
    if (ids.size === 0) return 0
    const { data } = await admin.from(table).select('id').eq('company_id', companyId).in('id', Array.from(ids))
    return (data || []).length
  }
  if ((await countOwned('activities', activityIds)) !== activityIds.size) return 'A budget line refers to an activity that does not belong to this company.'
  if ((await countOwned('accounts', accountIds)) !== accountIds.size) return 'A budget line refers to an account that does not belong to this company.'
  if ((await countOwned('locations', locationIds)) !== locationIds.size) return 'A budget line refers to a location that does not belong to this company.'
  const d = parseInt(donorId)
  if (d > 0 && (await countOwned('donors', new Set([d]))) !== 1) return 'The donor does not belong to this company.'
  return null
}

// The projects an edit really touches: the selected project plus the project of every activity in the rows.
export async function projectsTouched(admin: any, companyId: string, projectId: any, rows: any[]): Promise<number[]> {
  const ids = new Set<number>()
  const p = parseInt(projectId); if (p > 0) ids.add(p)
  const activityIds = Array.from(new Set(rows.map((r) => parseInt(r?.activity_id)).filter((n) => n > 0)))
  if (activityIds.length > 0) {
    const { data } = await admin.from('activities').select('id, project_id').eq('company_id', companyId).in('id', activityIds)
    ;(data || []).forEach((a: any) => { if (a.project_id) ids.add(Number(a.project_id)) })
  }
  return Array.from(ids)
}

export type MonthlyMismatch = { activity_id: number; account_id: number; location_id: number | null; annual: number; monthly: number; difference: number }

// The rule "every budget line has a complete monthly split", checked against the SAVED data.
// For every annual budget line of the project the months must add up exactly to the annual amount.
export async function checkMonthlyIntegrity(
  admin: any,
  companyId: string,
  projectId: number
): Promise<{ lines: number; mismatches: MonthlyMismatch[] }> {
  const base = () =>
    admin
      .from('budgets')
      .select('activity_id, account_id, location_id, budgeted_amount')
      .eq('company_id', companyId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .not('activity_id', 'is', null)
  const [annual, monthly] = await Promise.all([
    fetchAllFromBuilder(base().is('month', null)),
    fetchAllFromBuilder(base().not('month', 'is', null)),
  ])
  if (annual.error || monthly.error) throw new Error('Could not read the saved budget')
  const keyOf = (r: any) => `${r.activity_id}|${r.account_id}|${r.location_id ?? 'null'}`
  const annualSum: Record<string, any> = {}
  for (const r of annual.data) {
    const k = keyOf(r)
    if (!annualSum[k]) annualSum[k] = { row: r, total: 0 }
    annualSum[k].total += Number(r.budgeted_amount) || 0
  }
  const monthlySum: Record<string, number> = {}
  for (const r of monthly.data) {
    const k = keyOf(r)
    monthlySum[k] = (monthlySum[k] || 0) + (Number(r.budgeted_amount) || 0)
  }
  let lines = 0
  const mismatches: MonthlyMismatch[] = []
  for (const k of Object.keys(annualSum)) {
    const total = Math.round(annualSum[k].total * 100) / 100
    if (total <= 0) continue
    lines++
    const m = Math.round((monthlySum[k] || 0) * 100) / 100
    if (Math.abs(total - m) > 0.01) {
      const r = annualSum[k].row
      mismatches.push({
        activity_id: r.activity_id,
        account_id: r.account_id,
        location_id: r.location_id ?? null,
        annual: total,
        monthly: m,
        difference: Math.round((total - m) * 100) / 100,
      })
    }
  }
  return { lines, mismatches }
}

export function monthlyMismatchMessage(count: number): string {
  return `${count} budget line(s) do not have a complete monthly split. Open the Month view, balance every row and save the monthly budget first.`
}

// One line in the audit log for approval-workflow events.
export async function logBudgetEvent(
  admin: any,
  p: { companyId: string; userId: string; recordId: string; oldValues: any; newValues: any }
) {
  const { error } = await admin.from('data_change_logs').insert({
    table_name: 'project_budget_status',
    record_id: p.recordId,
    action: 'UPDATE',
    old_values: p.oldValues,
    new_values: p.newValues,
    changed_by: p.userId,
    company_id: p.companyId,
    changed_at: new Date().toISOString(),
  })
  if (error) console.error('Failed to write budget workflow audit log:', error.message)
}
'@
$lib = $lib.Replace("`r`n", "`n") + "`n"
$f0 = @'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, BUDGET_EDIT_ROLES, validateBudgetRefs, projectsTouched, approvedProjectIds, loadProject } from '@/lib/budgetServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actor, response } = await resolveBudgetActor(user, supabaseAdmin)
  if (!actor) return response!
  const companyId = actor.companyId

  if (!BUDGET_EDIT_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'You do not have permission to edit budgets' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { fiscalYear, projectId, donorId, rows } = body || {}
  if (!fiscalYear || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'fiscalYear and rows are required' }, { status: 400 })
  }
  if (!projectId && !donorId) {
    return NextResponse.json({ error: 'Select a project or a donor first' }, { status: 400 })
  }

  try {
    if (projectId && !(await loadProject(supabaseAdmin, companyId, projectId))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const refError = await validateBudgetRefs(supabaseAdmin, companyId, rows, donorId)
    if (refError) return NextResponse.json({ error: refError }, { status: 400 })

    // An approved budget can only be changed by an admin - checked here, not only on the screen.
    if (actor.role !== 'admin') {
      const touched = await projectsTouched(supabaseAdmin, companyId, projectId, rows)
      const locked = await approvedProjectIds(supabaseAdmin, companyId, touched)
      if (locked.length > 0) {
        return NextResponse.json({ error: 'This budget is approved. Only an admin can edit it.' }, { status: 403 })
      }
    }

    // Save budgets via RPC
    const { error } = await supabaseAdmin.rpc('save_budgets', {
      p_company_id: companyId,
      p_fiscal_year: fiscalYear,
      p_rows: rows,
      p_project_id: projectId || null,
      p_donor_id: donorId || null,
    })
    if (error) throw new Error(error.message)

    // Audit log
    const { error: auditError } = await supabaseAdmin.from('data_change_logs').insert({
      table_name: 'budgets',
      record_id: `${projectId || 'all'}_${fiscalYear}`,
      action: 'UPDATE',
      old_values: null,
      new_values: rows,
      changed_by: actor.userId,
      company_id: companyId,
      changed_at: new Date().toISOString(),
    })
    if (auditError) {
      console.error('Failed to write budget audit log:', auditError.message)
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
'@
$f0 = $f0.Replace("`r`n", "`n") + "`n"
$f1 = @'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, BUDGET_EDIT_ROLES, validateBudgetRefs, loadProject, loadStatusRow, checkMonthlyIntegrity } from '@/lib/budgetServer'
import { fetchAllFromBuilder } from '@/lib/budgetPeriod'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actor, response } = await resolveBudgetActor(user, supabaseAdmin)
  if (!actor) return response!
  const companyId = actor.companyId

  if (!BUDGET_EDIT_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'You do not have permission to edit budgets' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { projectId, fiscalYear, donorId, rows } = body || {}
  // rows: [{ activity_id, account_id, location_id, month, budgeted_amount }, ...]
  if (!projectId || !fiscalYear || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'projectId, fiscalYear and rows are required' }, { status: 400 })
  }

  try {
    const project = await loadProject(supabaseAdmin, companyId, projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const pid = Number(project.id)

    const status = await loadStatusRow(supabaseAdmin, companyId, pid, fiscalYear)
    if (status?.status === 'approved' && actor.role !== 'admin') {
      return NextResponse.json({ error: 'This budget is approved. Only an admin can edit it.' }, { status: 403 })
    }

    const refError = await validateBudgetRefs(supabaseAdmin, companyId, rows, donorId)
    if (refError) return NextResponse.json({ error: refError }, { status: 400 })
    for (const r of rows) {
      const m = Number(r?.month)
      if (!Number.isInteger(m) || m < 1 || m > 120) {
        return NextResponse.json({ error: 'A monthly row has an invalid month number.' }, { status: 400 })
      }
    }

    // Validate against the SAVED annual budget (not against totals sent by the screen):
    // for every line being saved, its months must add up exactly to its annual amount.
    const annual = await fetchAllFromBuilder(
      supabaseAdmin.from('budgets')
        .select('activity_id, account_id, location_id, budgeted_amount')
        .eq('company_id', companyId).eq('project_id', pid)
        .is('month', null).is('deleted_at', null).not('activity_id', 'is', null)
    )
    if (annual.error) throw new Error('Could not read the saved annual budget')
    const keyOf = (r: any) => `${parseInt(r.activity_id)}|${parseInt(r.account_id)}|${parseInt(r.location_id) > 0 ? parseInt(r.location_id) : 'null'}`
    const annualByKey: Record<string, number> = {}
    for (const a of annual.data) annualByKey[keyOf(a)] = (annualByKey[keyOf(a)] || 0) + (Number(a.budgeted_amount) || 0)
    const monthlyByKey: Record<string, number> = {}
    for (const r of rows) monthlyByKey[keyOf(r)] = (monthlyByKey[keyOf(r)] || 0) + (Number(r.budgeted_amount) || 0)

    const problems: any[] = []
    for (const k of Object.keys(monthlyByKey)) {
      const annualAmount = Math.round((annualByKey[k] || 0) * 100) / 100
      const monthlyAmount = Math.round(monthlyByKey[k] * 100) / 100
      if (Math.abs(annualAmount - monthlyAmount) > 0.01) {
        problems.push({ line: k, annual: annualAmount, monthly: monthlyAmount, difference: Math.round((annualAmount - monthlyAmount) * 100) / 100 })
      }
    }
    if (problems.length > 0) {
      return NextResponse.json({
        error: `${problems.length} line(s) do not match the saved annual budget. Save the annual budget first, then make every row's months add up to it.`,
        mismatches: problems,
      }, { status: 400 })
    }

    const { error } = await supabaseAdmin.rpc('save_monthly_budgets', {
      p_company_id: companyId,
      p_project_id: pid,
      p_fiscal_year: fiscalYear,
      p_donor_id: donorId || null,
      p_rows: rows,
    })
    if (error) throw new Error(error.message)

    // "Monthly budget verified" is true only when EVERY annual line of the project now has a complete split.
    const integrity = await checkMonthlyIntegrity(supabaseAdmin, companyId, pid)
    const verified = integrity.lines > 0 && integrity.mismatches.length === 0
    const { error: statusError } = await supabaseAdmin
      .from('project_budget_status')
      .upsert({
        company_id: companyId,
        project_id: pid,
        fiscal_year: status?.fiscal_year ?? fiscalYear,
        monthly_budget_verified: verified,
      }, { onConflict: 'company_id,project_id,fiscal_year' })
    if (statusError) console.error('Failed to set monthly_budget_verified:', statusError.message)

    const { error: auditError } = await supabaseAdmin.from('data_change_logs').insert({
      table_name: 'budgets',
      record_id: `monthly_${pid}_${fiscalYear}`,
      action: 'UPDATE',
      old_values: null,
      new_values: rows,
      changed_by: actor.userId,
      changed_at: new Date().toISOString(),
      company_id: companyId,
    })
    if (auditError) console.error('Failed to write monthly budget audit log:', auditError.message)

    return NextResponse.json({ success: true, monthlyVerified: verified, linesStillIncomplete: integrity.mismatches.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
'@
$f1 = $f1.Replace("`r`n", "`n") + "`n"
$f2 = @'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, BUDGET_EDIT_ROLES, loadProject, loadStatusRow, checkMonthlyIntegrity, monthlyMismatchMessage, logBudgetEvent } from '@/lib/budgetServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actor, response } = await resolveBudgetActor(user, supabaseAdmin)
  if (!actor) return response!
  const companyId = actor.companyId

  if (!BUDGET_EDIT_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'You do not have permission to submit budgets' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { projectId, fiscalYear } = body || {}
  if (!projectId || !fiscalYear) {
    return NextResponse.json({ error: 'projectId and fiscalYear are required' }, { status: 400 })
  }

  try {
    const project = await loadProject(supabaseAdmin, companyId, projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const pid = Number(project.id)

    // Only a draft (or a budget never submitted) can be sent for approval.
    const status = await loadStatusRow(supabaseAdmin, companyId, pid, fiscalYear)
    const current = status?.status || 'draft'
    if (current === 'pending_approval') {
      return NextResponse.json({ error: 'This budget is already waiting for approval.' }, { status: 409 })
    }
    if (current === 'approved') {
      return NextResponse.json({ error: 'This budget is already approved.' }, { status: 409 })
    }

    // Rule: every budget line must have a complete monthly split - checked on the saved data.
    const integrity = await checkMonthlyIntegrity(supabaseAdmin, companyId, pid)
    if (integrity.lines === 0) {
      return NextResponse.json({ error: 'There is no budget to submit for this project.' }, { status: 400 })
    }
    if (integrity.mismatches.length > 0) {
      return NextResponse.json({ error: monthlyMismatchMessage(integrity.mismatches.length), mismatches: integrity.mismatches }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('project_budget_status')
      .upsert({
        company_id: companyId,
        project_id: pid,
        fiscal_year: status?.fiscal_year ?? fiscalYear,
        status: 'pending_approval',
        monthly_budget_verified: true,
        submitted_by: actor.userId,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'company_id,project_id,fiscal_year' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logBudgetEvent(supabaseAdmin, {
      companyId, userId: actor.userId, recordId: `${pid}_${status?.fiscal_year ?? fiscalYear}`,
      oldValues: { status: current }, newValues: { status: 'pending_approval', project: project.name },
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
'@
$f2 = $f2.Replace("`r`n", "`n") + "`n"
$f3 = @'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, loadProject, loadStatusRow, checkMonthlyIntegrity, monthlyMismatchMessage, logBudgetEvent } from '@/lib/budgetServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actor, response } = await resolveBudgetActor(user, supabaseAdmin)
  if (!actor) return response!
  const companyId = actor.companyId

  // Server-side role check - only admins may approve a budget.
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can approve a budget' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { projectId, fiscalYear } = body || {}
  if (!projectId || !fiscalYear) {
    return NextResponse.json({ error: 'projectId and fiscalYear are required' }, { status: 400 })
  }

  try {
    const project = await loadProject(supabaseAdmin, companyId, projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const pid = Number(project.id)

    const status = await loadStatusRow(supabaseAdmin, companyId, pid, fiscalYear)
    if (!status || status.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Only a budget that is waiting for approval can be approved.' }, { status: 409 })
    }

    // Rule: every budget line must have a complete monthly split - checked again at approval time.
    const integrity = await checkMonthlyIntegrity(supabaseAdmin, companyId, pid)
    if (integrity.lines === 0) {
      return NextResponse.json({ error: 'There is no budget to approve for this project.' }, { status: 400 })
    }
    if (integrity.mismatches.length > 0) {
      return NextResponse.json({ error: monthlyMismatchMessage(integrity.mismatches.length), mismatches: integrity.mismatches }, { status: 400 })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('project_budget_status')
      .update({
        status: 'approved',
        monthly_budget_verified: true,
        approved_by: actor.userId,
        approved_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('project_id', pid)
      .eq('fiscal_year', status.fiscal_year)
      .eq('status', 'pending_approval')
      .select('project_id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'The budget status changed - please refresh and try again.' }, { status: 409 })
    }

    await logBudgetEvent(supabaseAdmin, {
      companyId, userId: actor.userId, recordId: `${pid}_${status.fiscal_year}`,
      oldValues: { status: 'pending_approval' }, newValues: { status: 'approved', project: project.name },
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
'@
$f3 = $f3.Replace("`r`n", "`n") + "`n"
$f4 = @'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, loadProject, loadStatusRow, logBudgetEvent } from '@/lib/budgetServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actor, response } = await resolveBudgetActor(user, supabaseAdmin)
  if (!actor) return response!
  const companyId = actor.companyId

  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can reject a budget' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { projectId, fiscalYear, reason } = body || {}
  if (!projectId || !fiscalYear) {
    return NextResponse.json({ error: 'projectId and fiscalYear are required' }, { status: 400 })
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 })
  }

  try {
    const project = await loadProject(supabaseAdmin, companyId, projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const pid = Number(project.id)

    const status = await loadStatusRow(supabaseAdmin, companyId, pid, fiscalYear)
    if (!status || status.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Only a budget that is waiting for approval can be rejected.' }, { status: 409 })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('project_budget_status')
      .update({
        status: 'draft',
        rejection_reason: reason.trim(),
        rejected_by: actor.userId,
        rejected_at: new Date().toISOString(),
        monthly_budget_verified: false,
      })
      .eq('company_id', companyId)
      .eq('project_id', pid)
      .eq('fiscal_year', status.fiscal_year)
      .eq('status', 'pending_approval')
      .select('project_id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'The budget status changed - please refresh and try again.' }, { status: 409 })
    }

    await logBudgetEvent(supabaseAdmin, {
      companyId, userId: actor.userId, recordId: `${pid}_${status.fiscal_year}`,
      oldValues: { status: 'pending_approval' }, newValues: { status: 'draft', rejected: true, reason: reason.trim(), project: project.name },
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
'@
$f4 = $f4.Replace("`r`n", "`n") + "`n"
$f5 = @'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor } from '@/lib/budgetServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actor, response } = await resolveBudgetActor(user, supabaseAdmin)
  if (!actor) return response!
  const companyId = actor.companyId

  const { searchParams } = new URL(request.url)
  const fiscalYear = parseInt(searchParams.get('fiscalYear') || '2026')
  const projectId = searchParams.get('projectId') || undefined
  const donorId = searchParams.get('donorId') || undefined
  const locationId = searchParams.get('locationId') || undefined
  const view = searchParams.get('view') || 'gl'
  const duration = parseInt(searchParams.get('duration') || '12')

  try {
    let data
    if (view === 'month') {
      const { data: rows, error } = await supabaseAdmin.rpc('get_budget_matrix_monthly', {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
        p_project_id: projectId ? parseInt(projectId) : null,
        p_donor_id: donorId ? parseInt(donorId) : null,
        p_location_id: locationId ? parseInt(locationId) : null,
        p_project_duration: duration,
      })
      if (error) throw new Error(error.message)
      data = rows
    } else {
      const { data: rows, error } = await supabaseAdmin.rpc('get_budget_matrix_gl', {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
        p_project_id: projectId ? parseInt(projectId) : null,
        p_donor_id: donorId ? parseInt(donorId) : null,
        p_location_id: locationId ? parseInt(locationId) : null,
      })
      if (error) throw new Error(error.message)
      data = rows
    }
    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
'@
$f5 = $f5.Replace("`r`n", "`n") + "`n"

# ---------- 3. Write ----------
[System.IO.File]::WriteAllText($libPath, $lib, $utf8)
Write-Host "OK: lib\budgetServer.ts (new)" -ForegroundColor Green
[System.IO.File]::WriteAllText((Join-Path $root 'app\api\budgets\save\route.ts'), $f0, $utf8)
Write-Host "OK: app\api\budgets\save\route.ts" -ForegroundColor Green
[System.IO.File]::WriteAllText((Join-Path $root 'app\api\budgets\monthly-save\route.ts'), $f1, $utf8)
Write-Host "OK: app\api\budgets\monthly-save\route.ts" -ForegroundColor Green
[System.IO.File]::WriteAllText((Join-Path $root 'app\api\budgets\submit-for-approval\route.ts'), $f2, $utf8)
Write-Host "OK: app\api\budgets\submit-for-approval\route.ts" -ForegroundColor Green
[System.IO.File]::WriteAllText((Join-Path $root 'app\api\budgets\approve\route.ts'), $f3, $utf8)
Write-Host "OK: app\api\budgets\approve\route.ts" -ForegroundColor Green
[System.IO.File]::WriteAllText((Join-Path $root 'app\api\budgets\reject\route.ts'), $f4, $utf8)
Write-Host "OK: app\api\budgets\reject\route.ts" -ForegroundColor Green
[System.IO.File]::WriteAllText((Join-Path $root 'app\api\budgets\matrix\route.ts'), $f5, $utf8)
Write-Host "OK: app\api\budgets\matrix\route.ts" -ForegroundColor Green

# ---------- 4. Budgets page: the screen now believes the server about "monthly budget complete" ----------
Edit-File "app\dashboard\settings\budgets\page.tsx" @(
  ,@('setMonthlyVerified(true)', 'setMonthlyVerified(result.monthlyVerified !== false)', 1)
  ,@('setFlash("Monthly budget confirmed and saved!")', 'setFlash(result.monthlyVerified === false ? "Monthly budget saved, but other budget lines still need a complete monthly split." : "Monthly budget confirmed and saved!")', 1)
)

Write-Host ""
Write-Host "All done. Now deploy." -ForegroundColor Cyan