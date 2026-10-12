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
        source_type: 'absence',
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
        source_type: 'overtime',
        source_id: null,
      })
      gross += overtimeTotal
    }

    // ----- Employee Loans Integration (with source tracking) -----
    const { data: activeLoans } = await supabase
      .from('employee_loans')
      .select('id, monthly_installment, balance, start_date')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
      .gt('balance', 0)
      .or(`start_date.is.null,start_date.lte.${endDate}`)
      .order('created_at', { ascending: false })

    if (activeLoans) {
      for (const loan of activeLoans) {
        // Never recover more than what is still owed (last installment is the remaining balance)
        const installment = Math.min(Number(loan.monthly_installment || 0), Number(loan.balance || 0))
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
      .select('id, monthly_recovery, balance, start_date')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
      .gt('balance', 0)
      .or(`start_date.is.null,start_date.lte.${endDate}`)
      .order('created_at', { ascending: false })

    if (activeAdvances) {
      for (const adv of activeAdvances) {
        const recovery = Math.min(Number(adv.monthly_recovery || 0), Number(adv.balance || 0))
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