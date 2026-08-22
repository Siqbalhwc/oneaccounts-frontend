import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════ POST – Record an Investor Capital Contribution ═════
//
// Dr  Bank/Cash account (from the selected bank_accounts row)
// Cr  Investor Capital (3100, Equity)
// Both lines tagged with project_id AND donor_id (the investor), so the
// GL can be filtered/reported per-site and per-investor without needing
// separate sub-accounts — same control-account-plus-dimension pattern
// already used for AR/AP.
//
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { project_id, donor_id, amount, contribution_date, bank_account_id, reference, notes } = body

  if (!project_id || !donor_id || !amount || amount <= 0) {
    return NextResponse.json({ error: 'project_id, donor_id, and a positive amount are required' }, { status: 400 })
  }
  if (!bank_account_id) {
    return NextResponse.json({ error: 'bank_account_id is required' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company associated with this user' }, { status: 400 })
  const userEmail = user.email || 'system'
  const contributionDate = contribution_date || new Date().toISOString().split('T')[0]

  // ── 1. Confirm this investor is actually assigned to this project ──
  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from('project_investors')
    .select('id, capital_contributed')
    .eq('project_id', project_id)
    .eq('donor_id', donor_id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (assignmentError || !assignment) {
    return NextResponse.json(
      { error: 'This investor is not assigned to this site yet. Add them with a profit-share % first.' },
      { status: 400 }
    )
  }

  // ── 2. Resolve the bank account's linked GL account ──
  const { data: bankAccount } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, account_id, bank_name')
    .eq('id', bank_account_id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!bankAccount?.account_id) {
    return NextResponse.json({ error: 'Selected bank account has no linked GL account' }, { status: 400 })
  }

  // ── 3. Resolve the investor's dedicated capital account ──
  // (One per investor, shared across every site they invest in — not
  // the old shared 3100 account, which is no longer posted to.)
  const { data: donor } = await supabaseAdmin
    .from('donors')
    .select('id, name, capital_account_id')
    .eq('id', donor_id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!donor?.capital_account_id) {
    return NextResponse.json(
      { error: 'This investor has no capital account yet — this should be created automatically when assigned to a site. Please contact support.' },
      { status: 500 }
    )
  }
  const capitalAccountId = donor.capital_account_id

  // ── 4. Post the journal entry ──
  const { data: entry, error: entryError } = await supabaseAdmin
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: `JE-INV-CAP-${Date.now()}`,
      date: contributionDate,
      description: `Investor capital contribution — ${reference || 'Site investment'}`,
    })
    .select('id')
    .single()

  if (entryError || !entry) {
    return NextResponse.json({ error: 'Failed to create journal entry: ' + entryError?.message }, { status: 500 })
  }

  const lines = [
    { entry_id: entry.id, company_id: companyId, account_id: bankAccount.account_id, debit: amount, credit: 0, project_id, donor_id, source_type: 'investor_contribution', source_id: entry.id },
    { entry_id: entry.id, company_id: companyId, account_id: capitalAccountId, debit: 0, credit: amount, project_id, donor_id, source_type: 'investor_contribution', source_id: entry.id },
  ]

  const { error: linesError } = await supabaseAdmin.from('journal_lines').insert(lines)
  if (linesError) {
    // Clean up the orphaned entry so we don't leave a half-posted transaction
    await supabaseAdmin.from('journal_entries').delete().eq('id', entry.id)
    return NextResponse.json({ error: 'Failed to post journal lines: ' + linesError.message }, { status: 500 })
  }

  // Update account balances (same debit-credit delta convention used everywhere else)
  for (const acc of [
    { id: bankAccount.account_id, delta: amount },
    { id: capitalAccountId, delta: -amount },
  ]) {
    const { data: current } = await supabaseAdmin.from('accounts').select('balance').eq('id', acc.id).single()
    if (current) {
      await supabaseAdmin.from('accounts').update({ balance: (current.balance || 0) + acc.delta }).eq('id', acc.id)
    }
  }

  // ── 5. Insert the ledger row ──
  const { error: contribError } = await supabaseAdmin.from('investor_contributions').insert({
    company_id: companyId,
    project_id,
    donor_id,
    amount,
    contribution_date: contributionDate,
    bank_account_id,
    reference: reference || null,
    notes: notes || null,
    journal_entry_id: entry.id,
    created_by: userEmail,
  })

  if (contribError) {
    return NextResponse.json({
      error: 'Journal entry posted, but recording the contribution ledger row failed: ' + contribError.message +
        `. Journal Entry #${entry.id} exists — please contact support to reconcile.`,
    }, { status: 500 })
  }

  // ── 6. Update the running capital_contributed total ──
  const newTotal = Math.round(((assignment.capital_contributed || 0) + amount) * 100) / 100
  const { error: updateError } = await supabaseAdmin
    .from('project_investors')
    .update({ capital_contributed: newTotal, updated_at: new Date().toISOString() })
    .eq('id', assignment.id)

  if (updateError) {
    console.error('Failed to update capital_contributed running total:', updateError)
    // Not a hard failure — investor_contributions is the source of truth;
    // this total is a convenience cache that can be recalculated.
  }

  return NextResponse.json({
    success: true,
    journal_entry_id: entry.id,
    new_capital_total: newTotal,
  })
}