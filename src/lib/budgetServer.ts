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
