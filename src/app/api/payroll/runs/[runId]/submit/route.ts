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

  // Workflow rules come from the company's saved approval settings.
  const settings = await loadApprovalSettings(companyId)
  if (settings.levels !== '3') {
    return NextResponse.json({ error: 'Submit step is not part of this company\'s approval workflow' }, { status: 409 })
  }
  if (!settings.submitRoles.includes(actor.role)) {
    return forbidden('Your role is not allowed to submit payroll runs')
  }

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status !== 'draft') return NextResponse.json({ error: 'Run must be in draft status to submit' }, { status: 409 })

  const { data: updated, error: updateErr } = await supabase
    .from('payroll_runs')
    .update({
      status: 'submitted',
      submitted_by: actor.userId,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .select('id')

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'The run status changed - please refresh and try again' }, { status: 409 })
  }

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(runId), action: 'UPDATE',
    oldValues: { status: 'draft' }, newValues: { status: 'submitted' },
  })

  return NextResponse.json({ success: true })
}