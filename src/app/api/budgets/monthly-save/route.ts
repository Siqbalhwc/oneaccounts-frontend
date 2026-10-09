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
