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