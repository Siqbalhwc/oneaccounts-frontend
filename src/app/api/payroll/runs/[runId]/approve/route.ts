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