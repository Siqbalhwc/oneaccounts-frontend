import { NextRequest, NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, logPayrollEvent,
} from '@/lib/payrollServer'

// Discard a payroll run that has NOT been posted (draft, submitted or approved).
// A posted run must be reversed instead.
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

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status, month, department_id')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (!['draft', 'submitted', 'approved'].includes(run.status)) {
    return NextResponse.json({
      error: 'Only a run that has not been posted can be discarded. Use Reverse for a posted run.',
    }, { status: 409 })
  }

  const { error: rpcError } = await supabase.rpc('discard_payroll_run', { p_run_id: runId })
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(runId), action: 'DELETE',
    oldValues: { status: run.status, month: run.month, department_id: run.department_id },
  })

  return NextResponse.json({ success: true })
}
