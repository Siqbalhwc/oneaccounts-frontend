import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helper: get or create Accounts Payable ─────────────────────────────────
async function getPayableAccount(supabase: any, companyId: string) {
  let { data: acc } = await supabase.from('accounts')
    .select('id,balance').eq('code','2000').eq('company_id', companyId).maybeSingle()
  if (acc) return acc
  const { data: anyLiability } = await supabase.from('accounts')
    .select('id,balance').eq('type','Liability').eq('company_id', companyId).limit(1).maybeSingle()
  if (anyLiability) return anyLiability
  const { data: created } = await supabase.from('accounts').insert({
    code:'2000', name:'Accounts Payable', type:'Liability', company_id: companyId
  }).select('id,balance').single()
  return created
}

// ── Helper: default GL per business type ──────────────────────────────────
async function getDefaultExpenseAccount(supabase: any, companyId: string, type: string) {
  if (type === 'trading') {
    const { data: inv } = await supabase.from('accounts')
      .select('id').eq('code','1200').eq('company_id', companyId).maybeSingle()
    if (inv) return inv.id
  }
  const { data: exp } = await supabase.from('accounts')
    .select('id').eq('code','5000').eq('company_id', companyId).maybeSingle()
  if (exp) return exp.id
  return null
}

// ── Create journal entry for a bill ────────────────────────────────────────
async function createBillJournalEntry(
  supabase: any,
  bill: any,
  items: any[],          // already inserted items with account_id, etc.
  companyId: string,
  businessType: string
) {
  const debitLines: any[] = []
  let totalDebit = 0

  for (const item of items) {
    const accountId = item.account_id || await getDefaultExpenseAccount(supabase, companyId, businessType)
    if (!accountId) continue

    const amount = item.qty * item.unit_price
    totalDebit += amount

    const line: any = {
      account_id: accountId,
      debit: amount,
      credit: 0,
    }

    // For NGO, attach project/activity/location/donor from budgets
    if (businessType === 'ngo' && item.activity_id) {
      const { data: donorRow } = await supabase.from('budgets')
        .select('donor_id, project_id, location_id')
        .eq('company_id', companyId)
        .eq('activity_id', item.activity_id)
        .is('month', null)
        .order('budgeted_amount', { ascending: false })
        .limit(1)
      if (donorRow && donorRow.length > 0) {
        line.donor_id = donorRow[0].donor_id || null
        line.project_id = donorRow[0].project_id || null
        line.location_id = donorRow[0].location_id || item.location_id
      } else {
        line.location_id = item.location_id || null
      }
      line.activity_id = item.activity_id
    } else if (businessType !== 'ngo') {
      // Service / Trading – no tagging
      line.activity_id = null
      line.location_id = null
      line.donor_id = null
      line.project_id = null
    }

    debitLines.push(line)
  }

  if (debitLines.length === 0) return null

  const payableAccount = await getPayableAccount(supabase, companyId)
  debitLines.push({
    account_id: payableAccount.id,
    debit: 0,
    credit: totalDebit,
  })

  // Insert journal entry
  const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-BILL-${bill.invoice_no}`,
    date: bill.date,
    description: `Purchase Bill ${bill.invoice_no}`,
  }).select('id').single()

  if (entryErr || !entry) throw new Error(entryErr?.message || 'JE insert failed')

  // Insert journal lines – NOW with source tracking
  const lineRows = debitLines.map(l => ({
    company_id: companyId,
    entry_id: entry.id,
    account_id: l.account_id,
    debit: l.debit,
    credit: l.credit,
    activity_id: l.activity_id || null,
    location_id: l.location_id || null,
    project_id: l.project_id || null,
    donor_id: l.donor_id || null,
    source_type: 'purchase_bill',   // ✅ new
    source_id: bill.id,             // ✅ new
  }))

  await supabase.from('journal_lines').insert(lineRows)

  // Update account balances
  for (const l of debitLines) {
    const { data: acc } = await supabase.from('accounts').select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
    if (acc) {
      const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
      await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
    }
  }

  return entry.id
}

// ── Reverse (delete) all journal entries for a bill ────────────────────────
async function reverseBillJournalEntry(supabase: any, billId: number, companyId: string) {
  const { data: entries } = await supabase.from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .ilike('description', `%Purchase Bill%`)

  if (!entries) return

  for (const e of entries) {
    const { data: lines } = await supabase.from('journal_lines')
      .select('account_id, debit, credit')
      .eq('entry_id', e.id)
    if (lines) {
      for (const l of lines) {
        const { data: acc } = await supabase.from('accounts')
          .select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
        if (acc) {
          const newBal = acc.balance - (l.debit || 0) + (l.credit || 0)
          await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
        }
      }
    }
    await supabase.from('journal_lines').delete().eq('entry_id', e.id)
    await supabase.from('journal_entries').delete().eq('id', e.id)
  }
}

// ═══════════════════ POST – Create Bill ═══════════════════
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { invoice_no, party_id, invoice_date, due_date, items, reference, notes } = body
  if (!invoice_no || !party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  // Get company business type
  const { data: company } = await supabase.from('companies')
    .select('business_type').eq('id', companyId).single()
  const businessType = company?.business_type || ''

  // Insert the bill header
  const { data: bill, error: headerError } = await supabase
    .from('invoices')
    .insert({
      invoice_no,
      type: 'purchase',
      party_id,
      date: invoice_date,
      due_date,
      total: 0,
      paid: 0,
      status: 'Unpaid',
      reference,
      notes,
      company_id: companyId,
    })
    .select('*')
    .single()

  if (headerError || !bill) {
    return NextResponse.json({ error: headerError?.message || 'Failed to create bill' }, { status: 500 })
  }

  // Insert items (with account_id if provided)
  let total = 0
  const itemRows = items.map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: bill.id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      account_id: item.account_id || null,
      company_id: companyId,
    }
  })

  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows)
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  // Update header total
  const { data: updatedBill, error: updateError } = await supabase
    .from('invoices')
    .update({ total })
    .eq('id', bill.id)
    .select('*')
    .single()

  if (updateError || !updatedBill) {
    return NextResponse.json({ error: updateError?.message || 'Failed to update total' }, { status: 500 })
  }

  // ── Create journal entry ──
  try {
    await createBillJournalEntry(supabase, updatedBill, itemRows, companyId, businessType)
  } catch (e: any) {
    // JE failed – rollback bill and items
    await supabase.from('invoice_items').delete().eq('invoice_id', bill.id)
    await supabase.from('invoices').delete().eq('id', bill.id)
    return NextResponse.json({ error: 'Journal entry failed: ' + e.message }, { status: 500 })
  }

  // Audit log
  await logDataChange('invoices', String(updatedBill.id), 'INSERT', undefined, updatedBill)

  return NextResponse.json({ success: true, bill: updatedBill })
}

// ═══════════════════ PUT – Update Bill ═══════════════════
export async function PUT(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, invoice_no, party_id, invoice_date, due_date, items, reference, notes } = body
  if (!id) return NextResponse.json({ error: 'Bill ID required' }, { status: 400 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  const { data: company } = await supabase.from('companies')
    .select('business_type').eq('id', companyId).single()
  const businessType = company?.business_type || ''

  const { data: oldBill } = await supabase.from('invoices')
    .select('*').eq('id', id).eq('company_id', companyId).single()
  if (!oldBill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  // ── Reverse old journal entry ──
  await reverseBillJournalEntry(supabase, oldBill.id, companyId)

  // Delete old items and re‑insert
  await supabase.from('invoice_items').delete().eq('invoice_id', id)

  let total = 0
  const itemRows = (items || []).map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      account_id: item.account_id || null,
      company_id: companyId,
    }
  })

  if (itemRows.length > 0) {
    await supabase.from('invoice_items').insert(itemRows)
  }

  const { data: updatedBill, error: updateError } = await supabase
    .from('invoices')
    .update({
      invoice_no, party_id, date: invoice_date, due_date, total, reference, notes,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !updatedBill) {
    return NextResponse.json({ error: updateError?.message || 'Update failed' }, { status: 500 })
  }

  // ── Create new journal entry ──
  try {
    await createBillJournalEntry(supabase, updatedBill, itemRows, companyId, businessType)
  } catch (e: any) {
    return NextResponse.json({ error: 'Journal entry failed after update: ' + e.message }, { status: 500 })
  }

  if (oldBill) {
    await logDataChange('invoices', String(id), 'UPDATE', oldBill, updatedBill)
  }

  return NextResponse.json({ success: true, bill: updatedBill })
}

// ═══════════════════ DELETE – remove bill and reverse JE ═══════
export async function DELETE(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Bill ID required' }, { status: 400 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  await reverseBillJournalEntry(supabase, id, companyId)

  const { data: oldBill } = await supabase.from('invoices')
    .select('*').eq('id', id).eq('company_id', companyId).single()

  await supabase.from('invoice_items').delete().eq('invoice_id', id)
  const { error } = await supabase.from('invoices')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (oldBill) {
    await logDataChange('invoices', String(id), 'DELETE', oldBill, undefined)
  }

  return NextResponse.json({ success: true })
}