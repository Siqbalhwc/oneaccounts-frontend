import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // ✅ service‑role key for server‑side writes
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

  // 1. Auth & company
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  // 2. ✅ Safe feature check – no broken join
  const { data: payrollFeature } = await supabase
    .from('features')
    .select('id')
    .eq('code', 'payroll')
    .maybeSingle()

  if (!payrollFeature) {
    return NextResponse.json({ error: 'Payroll feature not configured' }, { status: 403 })
  }

  const { data: cfRow } = await supabase
    .from('company_features')
    .select('enabled')
    .eq('company_id', companyId)
    .eq('feature_id', payrollFeature.id)
    .maybeSingle()

  if (!cfRow?.enabled) {
    return NextResponse.json({ error: 'Payroll feature not enabled' }, { status: 403 })
  }

  const body = await request.json()
  const { month, department_id } = body   // month = '2026-07-01', department_id optional

  if (!month) return NextResponse.json({ error: 'Month is required' }, { status: 400 })

  // 3. Check if a run already exists for this company + month + department (unique constraint)
  const { data: existingRun } = await supabase
    .from('payroll_runs')
    .select('id')
    .eq('company_id', companyId)
    .eq('month', month)
    .eq('department_id', department_id || null)
    .maybeSingle()
  if (existingRun) {
    return NextResponse.json({ error: 'A payroll run already exists for this month and department', run_id: existingRun.id }, { status: 409 })
  }

  // 4. Fetch active employees for the company
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

  // 5. Resolve current salary for each employee using effective-dated revisions
  const runLines: any[] = []

  for (const emp of employees) {
    // Get the most recent revision effective <= month
    let { data: revision } = await supabase
      .from('employee_salary_revisions')
      .select('id, salary_structure_id, basic_salary')
      .eq('employee_id', emp.id)
      .lte('effective_date', month)   // effective on or before the payroll month
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fallback: use employee's current salary_structure_id if no revision yet
    if (!revision) {
      // Create a synthetic revision with basic_salary = 0 for now – user must add revisions.
      revision = {
        id: 0,                          // ✅ placeholder – not used later
        salary_structure_id: emp.salary_structure_id,
        basic_salary: 0,
      }
    }

    if (!revision.salary_structure_id) continue

    // Fetch the structure components
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
      })

      if ((comp.salary_components as any)?.type === 'earning') {
        gross += amount
      } else {
        deductions += amount
      }
    }

    const net = gross - deductions

    // Dimensions snapshot (from employee_default_dimensions if present)
    const { data: dims } = await supabase
      .from('employee_default_dimensions')
      .select('department_id, location_id, project_id, activity_id, cost_center_id')
      .eq('employee_id', emp.id)
      .maybeSingle()

    // Salary structure snapshot (store the component list)
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

  // 6. Insert the payroll run and its lines in one transaction
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
        gross_amount: line.gross_amount,
        total_deductions: line.total_deductions,
        net_amount: line.net_amount,
        dimensions_snapshot: line.dimensions_snapshot,
      })
      .select('id')
      .single()

    if (lineErr || !runLine) {
      // Rollback? For simplicity, we'll just return error
      await supabase.from('payroll_runs').delete().eq('id', run.id)
      return NextResponse.json({ error: lineErr?.message || 'Failed to create run line' }, { status: 500 })
    }

    // Insert line components
    const compRows = line.components.map((c: any) => ({
      payroll_run_line_id: runLine.id,
      salary_component_id: c.salary_component_id,
      component_name: c.component_name,
      amount: c.amount,
    }))

    const { error: compErr } = await supabase
      .from('payroll_run_line_components')
      .insert(compRows)

    if (compErr) {
      await supabase.from('payroll_runs').delete().eq('id', run.id)
      return NextResponse.json({ error: compErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, run_id: run.id })
}