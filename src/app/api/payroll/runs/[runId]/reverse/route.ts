import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: runIdStr } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  const runId = parseInt(runIdStr, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

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

  // 3. Get the original journal entry lines
  const { data: originalLines } = await supabase
    .from('journal_lines')
    .select('account_id, debit, credit, project_id, activity_id, location_id, donor_id')
    .eq('entry_id', run.journal_entry_id)

  if (!originalLines || originalLines.length === 0) {
    return NextResponse.json({ error: 'No journal lines found for this entry' }, { status: 400 })
  }

  // 4. Read reason from body
  const body = await request.json()
  const reason = body?.reason?.trim() || 'Reversal'

  // 5. Create a new reversing journal entry
  const { data: reverseEntry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: `JE-REV-${runId}`,
      date: new Date().toISOString().split('T')[0],
      description: `Reversal of Payroll ${reason}`,
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

  // 7. Update account balances – aggregate deltas per account
  const deltaMap: Record<number, number> = {}
  for (const line of reversalLines) {
    const delta = line.debit - line.credit
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

  // 9. Insert into payroll_reversals table
  await supabase
    .from('payroll_reversals')
    .insert({
      payroll_run_id: runId,
      reversal_journal_entry_id: reverseEntry.id,
      reason,
      created_by: user.id,
    })

  return NextResponse.json({ success: true, reversal_entry_id: reverseEntry.id })
}