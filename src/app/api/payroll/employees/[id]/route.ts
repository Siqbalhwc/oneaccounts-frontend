import { NextRequest, NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, logPayrollEvent,
} from '@/lib/payrollServer'

// Edit an employee's details, or change the employment status (resign / terminate / re-activate).

const EMPLOYMENT_TYPES = ['permanent', 'contract', 'daily_wage', 'consultant']
const PAYMENT_METHODS = ['bank', 'cash']
const CNIC_REGEX = /^\d{5}-\d{7}-\d$/
const MOBILE_REGEX = /^03\d{2}-\d{7}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createRouteClient()

  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const employeeId = parseInt(id, 10)
  if (isNaN(employeeId)) return NextResponse.json({ error: 'Invalid employee ID' }, { status: 400 })

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))

  // ---------------- Status change ----------------
  if (body?.action === 'status') {
    const status = String(body.status || '')
    if (!['resigned', 'terminated', 'active'].includes(status)) {
      return NextResponse.json({ error: 'Status must be resigned, terminated or active' }, { status: 400 })
    }
    let exitDate: string | null = null
    let exitReason: string | null = null
    if (status !== 'active') {
      exitDate = String(body.exit_date || '')
      if (!DATE_REGEX.test(exitDate)) return NextResponse.json({ error: 'Last working day is required' }, { status: 400 })
      if (employee.joining_date && exitDate < employee.joining_date) {
        return NextResponse.json({ error: 'Last working day cannot be before the joining date' }, { status: 400 })
      }
      exitReason = String(body.exit_reason || '').trim() || null
    }

    const { error: updErr } = await supabase
      .from('employees')
      .update({ status, exit_date: exitDate, exit_reason: exitReason })
      .eq('id', employeeId)
      .eq('company_id', companyId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await logPayrollEvent({
      companyId, userId: actor.userId, tableName: 'employees', recordId: String(employeeId), action: 'UPDATE',
      oldValues: { status: employee.status, exit_date: employee.exit_date },
      newValues: { status, exit_date: exitDate, exit_reason: exitReason },
    })
    return NextResponse.json({ success: true })
  }

  // ---------------- Edit details ----------------
  const d = body?.data || {}
  const fullName = String(d.full_name || '').trim()
  if (!fullName) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })

  const cnic = String(d.cnic || '').trim()
  if (cnic && !CNIC_REGEX.test(cnic)) return NextResponse.json({ error: 'CNIC format must be 00000-0000000-0' }, { status: 400 })
  const mobile = String(d.mobile || '').trim()
  if (mobile && !MOBILE_REGEX.test(mobile)) return NextResponse.json({ error: 'Mobile format must be 03XX-XXXXXXX' }, { status: 400 })
  const email = String(d.email || '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Email address is not valid' }, { status: 400 })

  const employmentType = String(d.employment_type || employee.employment_type)
  if (!EMPLOYMENT_TYPES.includes(employmentType)) return NextResponse.json({ error: 'Invalid employment type' }, { status: 400 })
  const paymentMethod = String(d.payment_method || employee.payment_method)
  if (!PAYMENT_METHODS.includes(paymentMethod)) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
  const bankAccount = String(d.bank_account_no || '').trim()
  if (paymentMethod === 'bank' && !bankAccount) return NextResponse.json({ error: 'Bank account number is required for bank payment' }, { status: 400 })

  const joiningDate = String(d.joining_date || '')
  if (!DATE_REGEX.test(joiningDate)) return NextResponse.json({ error: 'Joining date is required' }, { status: 400 })
  if (employee.exit_date && joiningDate > employee.exit_date) {
    return NextResponse.json({ error: 'Joining date cannot be after the last working day' }, { status: 400 })
  }

  // Department and designation must belong to this company
  const departmentId = d.department_id ? Number(d.department_id) : null
  const designationId = d.designation_id ? Number(d.designation_id) : null
  if (departmentId) {
    const { count } = await supabase.from('departments').select('*', { count: 'exact', head: true }).eq('id', departmentId).eq('company_id', companyId)
    if (!count) return NextResponse.json({ error: 'Department not found' }, { status: 400 })
  }
  if (designationId) {
    const { count } = await supabase.from('designations').select('*', { count: 'exact', head: true }).eq('id', designationId).eq('company_id', companyId)
    if (!count) return NextResponse.json({ error: 'Designation not found' }, { status: 400 })
  }

  const next = {
    full_name: fullName,
    cnic: cnic || null,
    email: email || null,
    mobile: mobile || null,
    employment_type: employmentType,
    payment_method: paymentMethod,
    bank_account_no: bankAccount || null,
    tax_status: String(d.tax_status || '').trim() || null,
    department_id: departmentId,
    designation_id: designationId,
    joining_date: joiningDate,
  }

  const { error: updErr } = await supabase
    .from('employees')
    .update(next)
    .eq('id', employeeId)
    .eq('company_id', companyId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const oldValues: any = {}
  const newValues: any = {}
  for (const k of Object.keys(next) as (keyof typeof next)[]) {
    if ((employee as any)[k] !== next[k] && !(employee[k] == null && next[k] == null)) {
      oldValues[k] = employee[k]
      newValues[k] = next[k]
    }
  }
  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'employees', recordId: String(employeeId), action: 'UPDATE',
    oldValues, newValues,
  })

  return NextResponse.json({ success: true })
}
