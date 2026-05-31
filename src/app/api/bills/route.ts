import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// Helper: get the Accounts Payable account (or create it)
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

async function applyStockChanges(supabase: any, companyId: string, items: any[], direction: 'add' | 'remove') {
  for (const item of items) {
    if (!item.product_id) continue
    const qty = Number(item.qty || 0)
    if (qty <= 0) continue

    const { data: product } = await supabase
      .from('products')
      .select('qty_on_hand, total_inflow')
      .eq('id', item.product_id)
      .eq('company_id', companyId)
      .single()

    if (!product) continue

    const multiplier = direction === 'add' ? 1 : -1
    const newQtyOnHand = (product.qty_on_hand || 0) + qty * multiplier
    const newTotalInflow = (product.total_inflow || 0) + qty * multiplier

    await supabase
      .from('products')
      .update({ qty_on_hand: newQtyOnHand, total_inflow: newTotalInflow })
      .eq('id', item.product_id)
      .eq('company_id', companyId)
  }
}

// ── Create the journal entry for a purchase bill ─────────────────
async function createBillJournalEntry(
  supabase: any,
  bill: any,
  items: any[],
  companyId: string,
  businessType: string
) {
  const debitLines: any[] = []
  let totalDebit = 0

  for (const item of items) {
    const amount = (item.qty || 0) * (item.unit_price || 0)
    if (amount <= 0) continue

    let accountId = item.account_id || null
    if (!accountId && item.product_id) {
      const invAcc = await supabase.from('accounts')
        .select('id').eq('code','1200').eq('company_id', companyId).maybeSingle()
      accountId = invAcc?.id || null
    }
    if (!accountId) {
      accountId = await getDefaultExpenseAccount(supabase, companyId, businessType)
    }
    if (!accountId) continue

    totalDebit += amount

    const line: any = {
      account_id: accountId,
      debit: amount,
      credit: 0,
      location_id: item.location_id || null,
      activity_id: item.activity_id || null,
    }

    if (businessType === 'ngo' && item.activity_id) {
      const { data: actData } = await supabase.from('activities')
        .select('project_id')
        .eq('id', item.activity_id)
        .single()
      line.project_id = actData?.project_id || null

      const { data: donorRow } = await supabase.from('budgets')
        .select('donor_id')
        .eq('company_id', companyId)
        .eq('activity_id', item.activity_id)
        .is('month', null)
        .order('budgeted_amount', { ascending: false })
        .limit(1)
      line.donor_id = donorRow?.[0]?.donor_id || null
    } else {
      line.project_id = null
      line.donor_id = null
    }

    debitLines.push(line)
  }

  if (debitLines.length === 0) return null

  const payableAccount = await getPayableAccount(supabase, companyId)
  debitLines.push({
    account_id: payableAccount.id,
    debit: 0,
    credit: totalDebit,
    location_id: null,
    activity_id: null,
    project_id: null,
    donor_id: null,
  })

  const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-BILL-${bill.invoice_no}`,
    date: bill.date,
    description: `Purchase Bill ${bill.invoice_no}`,
  }).select('id').single()

  if (entryErr || !entry) throw new Error(entryErr?.message || 'JE insert failed')

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
    source_type: 'purchase_bill',
    source_id: bill.id,
  }))

  await supabase.from('journal_lines').insert(lineRows)

  // ⚡ Batch update account balances (faster than loop)
  const accountUpdates = debitLines.reduce((acc, l) => {
    const existing = acc.find((u: any) => u.account_id === l.account_id)
    if (existing) {
      existing.delta += (l.debit || 0) - (l.credit || 0)
    } else {
      acc.push({ account_id: l.account_id, delta: (l.debit || 0) - (l.credit || 0) })
    }
    return acc
  }, [] as { account_id: number; delta: number }[])

  if (accountUpdates.length > 0) {
    await supabase.rpc('bulk_update_account_balances', { data: accountUpdates })
  }

  await applyStockChanges(supabase, companyId, items, 'add')

  return entry.id
}

// ── Generate sequential bill number: PB/YYYYMM/0001 ──────────────────
async function generateBillNo(supabase: any, companyId: string): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const prefix = `PB/${ym}/`
  const { data: last } = await supabase
    .from("invoices")
    .select("invoice_no")
    .like("invoice_no", `${prefix}%`)
    .eq("type", "purchase")
    .order("invoice_no", { ascending: false })
    .limit(1)
  let nextNum = 1
  if (last && last.length > 0) {
    const match = last[0].invoice_no.match(/\/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`
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
  const { party_id, invoice_date, due_date, items, reference, notes, po_id } = body
  if (!party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const userEmail = user.email || 'system'

  const { data: company } = await supabase.from('companies')
    .select('business_type').eq('id', companyId).single()
  const businessType = company?.business_type || ''

  // ── Budget validation for NGO ─────────────────────────────────────
  if (businessType === 'ngo') {
    const today = new Date()
    const fiscalYear = today.getFullYear()
    for (const item of items) {
      if (!item.activity_id || !item.account_id) continue
      const amount = (item.qty || 0) * (item.unit_price || 0)
      const locId = item.location_id || null

      let budgetQuery = supabase
        .from('budgets')
        .select('budgeted_amount')
        .eq('company_id', companyId)
        .eq('activity_id', item.activity_id)
        .eq('account_id', item.account_id)
        .eq('fiscal_year', fiscalYear)
        .is('month', null)
      if (locId) budgetQuery = budgetQuery.eq('location_id', locId)
      const { data: budgetRow } = await budgetQuery.maybeSingle()
      const budget = budgetRow?.budgeted_amount || 0

      let spentQuery = supabase
        .from('journal_lines')
        .select('debit, credit')
        .eq('company_id', companyId)
        .eq('activity_id', item.activity_id)
        .eq('account_id', item.account_id)
      if (locId) spentQuery = spentQuery.eq('location_id', locId)
      const { data: spentRows } = await spentQuery
      const spent = (spentRows || []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0)

      if (budgetRow && amount > (budget - spent)) {
        return NextResponse.json({
          error: `Budget exceeded for activity ${item.activity_id} – available: ${(budget - spent).toFixed(2)}, requested: ${amount.toFixed(2)}`
        }, { status: 400 })
      }
    }
  }

  // ── Generate unique bill number with retry ──
  let billNo = ''
  let bill: any = null
  let total = 0

  for (let attempt = 0; attempt < 3; attempt++) {
    billNo = await generateBillNo(supabase, companyId)

    const { data: inv, error: headerError } = await supabase
      .from('invoices')
      .insert({
        invoice_no: billNo,
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
        created_by: userEmail,
        updated_by: userEmail,
        po_id: po_id || null,
      })
      .select('*')
      .single()

    if (!headerError) {
      bill = inv
      break
    }
    if (headerError.code === '23505' || headerError.message?.includes('duplicate key')) continue
    return NextResponse.json({ error: headerError.message }, { status: 500 })
  }

  if (!bill) return NextResponse.json({ error: 'Could not generate unique bill number' }, { status: 500 })

  // Insert items and calculate total (FIXED: include product_id, account_id, location_id, activity_id)
  const itemRowsForDb = items.map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: bill.id,
      product_id: item.product_id || null,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      account_id: item.account_id || null,
      location_id: item.location_id || null,
      activity_id: item.activity_id || null,
      company_id: companyId,
    }
  })

  if (itemRowsForDb.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemRowsForDb)
    if (itemsError) {
      await supabase.from('invoices').delete().eq('id', bill.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  const { data: updatedBill, error: updateError } = await supabase
    .from('invoices')
    .update({ total })
    .eq('id', bill.id)
    .select('*')
    .single()

  if (updateError || !updatedBill) {
    await supabase.from('invoices').delete().eq('id', bill.id)
    return NextResponse.json({ error: updateError?.message || 'Failed to update total' }, { status: 500 })
  }

  try {
    await createBillJournalEntry(supabase, updatedBill, items, companyId, businessType)
  } catch (e: any) {
    await supabase.from('invoice_items').delete().eq('invoice_id', bill.id)
    await supabase.from('invoices').delete().eq('id', bill.id)
    return NextResponse.json({ error: 'Journal entry failed: ' + e.message }, { status: 500 })
  }

  // Update supplier balance
  const { data: supplier } = await supabase.from('suppliers')
    .select('balance').eq('id', party_id).eq('company_id', companyId).single()
  if (supplier) {
    await supabase.from('suppliers')
      .update({ balance: (supplier.balance || 0) + total })
      .eq('id', party_id).eq('company_id', companyId)
  }

  await logDataChange('invoices', String(updatedBill.id), 'INSERT', undefined, updatedBill)

  return NextResponse.json({ success: true, bill: updatedBill })
}

// ── PUT (Update) ─────────────────────────────────────────────────────
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
  const { id, party_id, invoice_date, due_date, items, reference, notes, po_id } = body
  if (!id) return NextResponse.json({ error: 'Bill ID required' }, { status: 400 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const userEmail = user.email || 'system'

  const { data: company } = await supabase.from('companies')
    .select('business_type').eq('id', companyId).single()
  const businessType = company?.business_type || ''

  // ── Budget validation (same as POST) ─────────────────────────────
  if (businessType === 'ngo') {
    const today = new Date()
    const fiscalYear = today.getFullYear()
    for (const item of items) {
      if (!item.activity_id || !item.account_id) continue
      const amount = (item.qty || 0) * (item.unit_price || 0)
      const locId = item.location_id || null

      let budgetQuery = supabase
        .from('budgets')
        .select('budgeted_amount')
        .eq('company_id', companyId)
        .eq('activity_id', item.activity_id)
        .eq('account_id', item.account_id)
        .eq('fiscal_year', fiscalYear)
        .is('month', null)
      if (locId) budgetQuery = budgetQuery.eq('location_id', locId)
      const { data: budgetRow } = await budgetQuery.maybeSingle()
      const budget = budgetRow?.budgeted_amount || 0

      let spentQuery = supabase
        .from('journal_lines')
        .select('debit, credit')
        .eq('company_id', companyId)
        .eq('activity_id', item.activity_id)
        .eq('account_id', item.account_id)
      if (locId) spentQuery = spentQuery.eq('location_id', locId)
      const { data: spentRows } = await spentQuery
      const spent = (spentRows || []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0)

      if (budgetRow && amount > (budget - spent)) {
        return NextResponse.json({
          error: `Budget exceeded for activity ${item.activity_id} – available: ${(budget - spent).toFixed(2)}, requested: ${amount.toFixed(2)}`
        }, { status: 400 })
      }
    }
  }

  const { data: oldBill } = await supabase.from('invoices')
    .select('*').eq('id', id).eq('company_id', companyId).single()
  if (!oldBill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  // Reverse old stock changes
  const { data: oldItems } = await supabase.from('invoice_items').select('*').eq('invoice_id', id)
  if (oldItems) {
    await applyStockChanges(supabase, companyId, oldItems, 'remove')
  }

  // Reverse old journal entry
  const { data: oldEntries } = await supabase.from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .ilike('description', `%Purchase Bill%`)
  if (oldEntries) {
    for (const e of oldEntries) {
      const { data: lines } = await supabase.from('journal_lines').select('account_id, debit, credit').eq('entry_id', e.id)
      if (lines) {
        for (const l of lines) {
          const { data: acc } = await supabase.from('accounts').select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
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

  // Reverse old supplier balance
  if (oldBill.party_id) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', oldBill.party_id).eq('company_id', companyId).single()
    if (supp) {
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) - (oldBill.total || 0) })
        .eq('id', oldBill.party_id).eq('company_id', companyId)
    }
  }

  // Delete old items and insert new (FIXED: include product_id, account_id, location_id, activity_id)
  await supabase.from('invoice_items').delete().eq('invoice_id', id)

  let total = 0
  const itemRows = (items || []).map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: id,
      product_id: item.product_id || null,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      account_id: item.account_id || null,
      location_id: item.location_id || null,
      activity_id: item.activity_id || null,
      company_id: companyId,
    }
  })

  if (itemRows.length > 0) {
    await supabase.from('invoice_items').insert(itemRows)
  }

  const { data: updatedBill, error: updateError } = await supabase
    .from('invoices')
    .update({
      party_id,
      date: invoice_date,
      due_date,
      total,
      reference,
      notes,
      updated_by: userEmail,
      po_id: po_id || null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !updatedBill) {
    return NextResponse.json({ error: updateError?.message || 'Update failed' }, { status: 500 })
  }

  try {
    await createBillJournalEntry(supabase, updatedBill, items, companyId, businessType)
  } catch (e: any) {
    return NextResponse.json({ error: 'Journal entry failed after update: ' + e.message }, { status: 500 })
  }

  // Apply new supplier balance
  if (updatedBill.party_id) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', updatedBill.party_id).eq('company_id', companyId).single()
    if (supp) {
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) + total })
        .eq('id', updatedBill.party_id).eq('company_id', companyId)
    }
  }

  await logDataChange('invoices', String(id), 'UPDATE', oldBill, updatedBill)

  return NextResponse.json({ success: true, bill: updatedBill })
}

// ── DELETE ────────────────────────────────────────────────────────────
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

  // Reverse stock
  const { data: oldItems } = await supabase.from('invoice_items').select('*').eq('invoice_id', id)
  if (oldItems) {
    await applyStockChanges(supabase, companyId, oldItems, 'remove')
  }

  // Reverse JE
  const { data: entries } = await supabase.from('journal_entries')
    .select('id').eq('company_id', companyId).ilike('description', `%Purchase Bill%`)
  if (entries) {
    for (const e of entries) {
      const { data: lines } = await supabase.from('journal_lines').select('account_id, debit, credit').eq('entry_id', e.id)
      if (lines) {
        for (const l of lines) {
          const { data: acc } = await supabase.from('accounts').select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
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

  const { data: oldBill } = await supabase.from('invoices')
    .select('*').eq('id', id).eq('company_id', companyId).single()

  // Reverse supplier balance
  if (oldBill?.party_id) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', oldBill.party_id).eq('company_id', companyId).single()
    if (supp) {
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) - (oldBill.total || 0) })
        .eq('id', oldBill.party_id).eq('company_id', companyId)
    }
  }

  await supabase.from('invoice_items').delete().eq('invoice_id', id)
  const { error } = await supabase.from('invoices')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (oldBill) {
    await logDataChange('invoices', String(id), 'DELETE', oldBill, undefined)
  }

  return NextResponse.json({ success: true })
}