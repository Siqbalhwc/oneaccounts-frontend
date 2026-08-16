import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const body = await request.json()
  const { projectId, fiscalYear, donorId, rows, annualTotals } = body
  // rows: [{ activity_id, account_id, location_id, month, budgeted_amount }, ...]
  // annualTotals: [{ activity_id, account_id, location_id, annual_amount }, ...]
  // - used to validate every row's months sum to its annual amount before saving.

  if (!projectId || !fiscalYear || !Array.isArray(rows) || !Array.isArray(annualTotals)) {
    return NextResponse.json({ error: 'projectId, fiscalYear, rows, and annualTotals are required' }, { status: 400 })
  }

  // Validate full allocation: for every (activity, account, location) key in
  // annualTotals, the sum of its monthly rows must equal the annual amount.
  // No auto-rounding here - the frontend already handles the initial equal
  // split; this is the final gate before saving.
  const keyOf = (r: any) => `${r.activity_id}|${r.account_id}|${r.location_id ?? 'null'}`
  const monthlySums: Record<string, number> = {}
  for (const r of rows) {
    const k = keyOf(r)
    monthlySums[k] = (monthlySums[k] || 0) + (Number(r.budgeted_amount) || 0)
  }

  const mismatches: any[] = []
  for (const a of annualTotals) {
    const k = keyOf(a)
    const monthlySum = monthlySums[k] || 0
    const annual = Number(a.annual_amount) || 0
    const diff = Math.round((annual - monthlySum) * 100) / 100
    if (Math.abs(diff) > 0.01) {
      mismatches.push({ activity_id: a.activity_id, account_id: a.account_id, location_id: a.location_id, difference: diff })
    }
  }

  if (mismatches.length > 0) {
    return NextResponse.json({
      error: 'Monthly budget does not fully match the annual budget for some rows. Please resolve the differences before saving.',
      mismatches,
    }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin.rpc('save_monthly_budgets', {
      p_company_id: companyId,
      p_project_id: parseInt(projectId),
      p_fiscal_year: fiscalYear,
      p_donor_id: donorId || null,
      p_rows: rows,
    })
    if (error) throw new Error(error.message)

    // Mark monthly budget as verified for this project/year.
    const { error: statusError } = await supabaseAdmin
      .from('project_budget_status')
      .upsert({
        company_id: companyId,
        project_id: parseInt(projectId),
        fiscal_year: fiscalYear,
        monthly_budget_verified: true,
      }, { onConflict: 'company_id,project_id,fiscal_year' })
    if (statusError) console.error('Failed to set monthly_budget_verified:', statusError.message)

    const { error: auditError } = await supabaseAdmin.from('data_change_logs').insert({
      table_name: 'budgets',
      record_id: `monthly_${projectId}_${fiscalYear}`,
      action: 'UPDATE',
      old_values: null,
      new_values: rows,
      changed_by: user.id,
      changed_at: new Date().toISOString(),
      company_id: companyId,
    })
    if (auditError) console.error('Failed to write monthly budget audit log:', auditError.message)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}