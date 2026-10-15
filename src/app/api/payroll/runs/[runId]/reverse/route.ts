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

  // 1. Auth, company, role
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const runId = parseInt(runIdStr, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  const settings = await loadApprovalSettings(companyId)
  if (!settings.postRoles.includes(actor.role)) {
    return forbidden('Your role is not allowed to reverse payroll runs')
  }

  // 2. Fetch the run
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status, journal_entry_id')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (!['posted', 'locked'].includes(run.status)) {
    return NextResponse.json({ error: 'Only posted or locked runs can be reversed' }, { status: 409 })
  }

  if (!run.journal_entry_id) {
    return NextResponse.json({ error: 'No journal entry found for this run' }, { status: 400 })
  }

  // Never reverse twice
  const entryNo = `JE-REV-${runId}`
  const { data: existingRev } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('entry_no', entryNo)
    .limit(1)
  if (existingRev && existingRev.length > 0) {
    return NextResponse.json({ error: 'A reversal entry already exists for this run' }, { status: 409 })
  }

  // 3. Get the original journal entry lines
  const { data: originalLines } = await supabase
    .from('journal_lines')
    .select('account_id, debit, credit, project_id, activity_id, location_id, donor_id, employee_id, narration')
    .eq('entry_id', run.journal_entry_id)

  if (!originalLines || originalLines.length === 0) {
    return NextResponse.json({ error: 'No journal lines found for this entry' }, { status: 400 })
  }

  // 4. Reason (required)
  const body = await request.json().catch(() => ({}))
  const reason = String(body?.reason || '').trim()
  if (!reason) {
    return NextResponse.json({ error: 'A reason is required to reverse a payroll run' }, { status: 400 })
  }

  // 5. Create a new reversing journal entry
  const { data: reverseEntry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: entryNo,
      date: new Date().toISOString().split('T')[0],
      description: `Reversal of Payroll ${reason}`,
      source_type: 'payroll_reversal',
      source_id: runId,
    })
    .select('id')
    .single()

  if (entryErr || !reverseEntry) {
    return NextResponse.json({ error: entryErr?.message || 'Failed to create reversal entry' }, { status: 500 })
  }

  // 6. Insert reversed lines (swap debit and credit)
  const reversalLines = originalLines.map((line: any) => ({
    entry_id: reverseEntry.id,
    company_id: companyId,
    account_id: line.account_id,
    debit: line.credit,
    credit: line.debit,
    project_id: line.project_id,
    activity_id: line.activity_id,
    location_id: line.location_id,
    donor_id: line.donor_id,
    employee_id: line.employee_id,
    narration: line.narration ? `${line.narration} (reversed)` : 'Payroll reversal',
    source_type: 'payroll_reversal',
    source_id: runId,
  }))

  const { error: linesErr } = await supabase
    .from('journal_lines')
    .insert(reversalLines)

  if (linesErr) {
    await supabase.from('journal_entries').delete().eq('id', reverseEntry.id)
    return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  // 7. Update account balances - aggregate deltas per account
  const deltaMap: Record<number, number> = {}
  for (const line of reversalLines) {
    const delta = Number(line.debit) - Number(line.credit)
    deltaMap[line.account_id] = (deltaMap[line.account_id] || 0) + delta
  }

  for (const [accountId, delta] of Object.entries(deltaMap)) {
    const { error: rpcErr } = await supabase.rpc('update_account_balance', {
      p_account_id: parseInt(accountId),
      p_company_id: companyId,
      p_delta: delta,
    })
    if (rpcErr) {
      console.error('Failed to update balance for account', accountId, rpcErr)
    }
  }

  // Give back the loan / advance recoveries this run made, so the loan records agree with the ledger
  const { data: recovered } = await supabase
    .from('payroll_run_line_components')
    .select('amount, source_type, source_id, payroll_run_lines!inner(payroll_run_id)')
    .eq('payroll_run_lines.payroll_run_id', runId)
    .in('source_type', ['loan', 'advance'])
  for (const r of (recovered || []) as any[]) {
    const table = r.source_type === 'loan' ? 'employee_loans' : 'salary_advances'
    const { data: rec } = await supabase.from(table).select('balance').eq('id', r.source_id).maybeSingle()
    if (rec) {
      await supabase.from(table)
        .update({ balance: Number(rec.balance) + Number(r.amount), status: 'active' })
        .eq('id', r.source_id)
    }
  }

  // 8. Mark the run as reversed, store reason
  const { error: updateErr } = await supabase
    .from('payroll_runs')
    .update({
      status: 'reversed',
      reversal_reason: reason,
    })
    .eq('id', runId)
    .eq('company_id', companyId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 9. Reversal record
  await supabase
    .from('payroll_reversals')
    .insert({
      payroll_run_id: runId,
      reversal_journal_entry_id: reverseEntry.id,
      reason,
      created_by: actor.userId,
    })

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'payroll_runs', recordId: String(runId), action: 'UPDATE',
    oldValues: { status: run.status }, newValues: { status: 'reversed', reason, reversal_entry_id: reverseEntry.id },
  })

  return NextResponse.json({ success: true, reversal_entry_id: reverseEntry.id })
}