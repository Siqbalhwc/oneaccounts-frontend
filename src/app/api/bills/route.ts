import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helpers ───────────────────────────────────────────────────────────
async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
}

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

async function isTaxFeatureEnabled(supabase: any, companyId: string): Promise<boolean> {
  const { data: featureRow } = await supabase
    .from("features")
    .select("id")
    .eq("code", "tax_management")
    .single()
  if (!featureRow) return false
  const { data: companyFeature } = await supabase
    .from("company_features")
    .select("enabled")
    .eq("company_id", companyId)
    .eq("feature_id", featureRow.id)
    .maybeSingle()
  return companyFeature?.enabled || false
}

async function getDefaultWHTTaxCodeId(supabase: any, companyId: string, supplierId?: number) {
  // First check vendor default
  if (supplierId) {
    const { data: vendor } = await supabase
      .from("suppliers")
      .select("default_wht_tax_code_id")
      .eq("id", supplierId)
      .single()
    if (vendor?.default_wht_tax_code_id) return vendor.default_wht_tax_code_id
  }
  // Fallback to company default
  const { data: settings } = await supabase
    .from("company_tax_settings")
    .select("default_wht_tax_code_id")
    .eq("company_id", companyId)
    .single()
  return settings?.default_wht_tax_code_id || null
}

// ── Record product‑line stock movements into stock_moves ────────
async function recordStockMoves(
  supabase: any,
  companyId: string,
  items: any[],
  sourceType: string,
  sourceId: number,
  direction: 'in' | 'out'
) {
  const moves = items
    .filter((item: any) => item.product_id)
    .map((item: any) => ({
      company_id: companyId,
      product_id: item.product_id,
      move_type: sourceType === 'purchase' ? 'purchase' : 'sale',
      qty: direction === 'in' ? item.qty : -item.qty,
      date: new Date().toISOString(),
      ref: sourceType === 'purchase' ? `PB-${sourceId}` : `SI-${sourceId}`,
      reason: `${sourceType} invoice`,
      source_type: 'invoice',
      source_id: sourceId,
    }))

  if (moves.length > 0) {
    const { error } = await supabase.from('stock_moves').insert(moves)
    if (error) console.error('Failed to insert stock_moves:', error)
  }
}

// ── Create the journal entry for a purchase bill (with optional WHT) ──
async function createBillJournalEntry(
  supabase: any,
  bill: any,
  items: any[],
  companyId: string,
  businessType: string,
  whtAmount: number = 0,
  whtAccountId?: number | null
) {
  const debitLines: any[] = []
  let totalDebit = 0
  const isNGO = businessType === 'ngo'

  for (const item of items) {
    const amount = (item.qty || 0) * (item.unit_price || 0)
    if (amount <= 0) continue

    let accountId = item.account_id || null
    if (!accountId && item.product_id) {
      // fallback to inventory or expense
      const defaultCode = businessType === 'trading' ? '1200' : '5000'
      const { data: acc } = await supabase.from('accounts')
        .select('id').eq('code', defaultCode)
        .eq('company_id', companyId).maybeSingle()
      if (acc) accountId = acc.id
    }
    if (!accountId) {
      throw new Error(`No expense account found for item "${item.description}".`)
    }

    totalDebit += amount
    const line: any = {
      account_id: accountId,
      debit: amount,
      credit: 0,
      location_id: item.location_id || null,
      activity_id: item.activity_id || null,
      project_id: null,
      donor_id: null,
    }

    // NGO‑only: project & donor from activity / budget
    if (isNGO && item.activity_id) {
      const { data: actData } = await supabase.from('activities')
        .select('project_id')
        .eq('id', item.activity_id)
        .single()
      line.project_id = actData?.project_id || null

      const { data: donorRow } = await supabase.from('budgets')
        .select('donor_id')
        .eq('company_id', companyId)
        .eq('activity_id', item.activity_id)
        .eq('account_id', accountId)
        .eq('location_id', item.location_id || null)
        .eq('fiscal_year', new Date().getFullYear())
        .is('month', null)
        .limit(1)
        .maybeSingle()
      line.donor_id = donorRow?.donor_id || null
    }

    debitLines.push(line)
  }

  if (debitLines.length === 0) {
    throw new Error('No valid journal lines could be created from the bill items.')
  }

  const payableAccount = await getPayableAccount(supabase, companyId)

  // Credit AP for (totalDebit - WHT) and credit WHT if applicable
  if (whtAmount > 0 && whtAccountId) {
    debitLines.push({
      account_id: whtAccountId,
      debit: 0,
      credit: whtAmount,
      location_id: null,
      activity_id: null,
      project_id: null,
      donor_id: null,
    })
    const apCredit = totalDebit - whtAmount
    debitLines.push({
      account_id: payableAccount.id,
      debit: 0,
      credit: apCredit,
      location_id: null,
      activity_id: null,
      project_id: null,
      donor_id: null,
    })
  } else {
    debitLines.push({
      account_id: payableAccount.id,
      debit: 0,
      credit: totalDebit,
      location_id: null,
      activity_id: null,
      project_id: null,
      donor_id: null,
    })
  }

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

  // ⚡ Batch update account balances
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
    try {
      await supabase.rpc('bulk_update_account_balances', { data: accountUpdates })
    } catch {}
  }

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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { party_id, invoice_date, due_date, items, reference, notes, po_id, wht_tax_code_id, wht_rate, wht_amount } = body
  if (!party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const userEmail = user.email || 'system'

  const taxEnabled = await isTaxFeatureEnabled(supabase, companyId)

  // Determine actual WHT values
  let actualWhtAmount = 0
  let actualWhtTaxCodeId: string | null = null
  let actualWhtRate = 0

  if (taxEnabled && wht_tax_code_id) {
    actualWhtTaxCodeId = wht_tax_code_id
    actualWhtRate = parseFloat(wht_rate) || 0
    actualWhtAmount = parseFloat(wht_amount) || 0
  } else if (taxEnabled) {
    // auto‑resolve default WHT for this company / vendor
    const defaultId = await getDefaultWHTTaxCodeId(supabase, companyId, party_id)
    if (defaultId) {
      const { data: tc } = await supabase
        .from('tax_codes')
        .select('rate')
        .eq('id', defaultId)
        .single()
      if (tc) {
        actualWhtTaxCodeId = defaultId
        actualWhtRate = tc.rate
        // amount will be calculated after items total is known
      }
    }
  }

  const { data: company } = await supabase.from('companies')
    .select('business_type').eq('id', companyId).single()
  const businessType = company?.business_type || ''

  // ── NGO budget validation (same as before) ──────────────────────
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

  // Insert items
  const itemRows = items.map((item: any) => {
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

  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows)
    if (itemsError) {
      await supabase.from('invoices').delete().eq('id', bill.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  await recordStockMoves(supabase, companyId, items, 'purchase', bill.id, 'in')

  // Calculate WHT amount if not provided but a default code is set
  if (taxEnabled && actualWhtTaxCodeId && actualWhtAmount === 0) {
    actualWhtAmount = total * (actualWhtRate / 100)
  }

  // Update bill total (gross)
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

  // ── Insert WHT record if applicable ──
  if (taxEnabled && actualWhtAmount > 0 && actualWhtTaxCodeId) {
    await supabase.from('bill_withholding').insert({
      company_id: companyId,
      bill_id: bill.id,
      wht_tax_code_id: actualWhtTaxCodeId,
      wht_rate: actualWhtRate,
      wht_amount: actualWhtAmount,
    })
  }

  try {
    const whtAccountId = taxEnabled && actualWhtTaxCodeId
      ? (await supabase.from('tax_codes')
          .select('tax_account_id')
          .eq('id', actualWhtTaxCodeId)
          .single()
        ).data?.tax_account_id
      : null

    await createBillJournalEntry(
      supabase,
      updatedBill,
      items,
      companyId,
      businessType,
      actualWhtAmount,
      whtAccountId
    )
  } catch (e: any) {
    await supabase.from('invoice_items').delete().eq('invoice_id', bill.id)
    await supabase.from('invoices').delete().eq('id', bill.id)
    if (taxEnabled) await supabase.from('bill_withholding').delete().eq('bill_id', bill.id)
    return NextResponse.json({ error: 'Journal entry failed: ' + e.message }, { status: 500 })
  }

  // Update supplier balance (full gross amount)
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, party_id, invoice_date, due_date, items, reference, notes, po_id, wht_tax_code_id, wht_rate, wht_amount } = body
  if (!id) return NextResponse.json({ error: 'Bill ID required' }, { status: 400 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const userEmail = user.email || 'system'

  const taxEnabled = await isTaxFeatureEnabled(supabase, companyId)

  const { data: company } = await supabase.from('companies')
    .select('business_type').eq('id', companyId).single()
  const businessType = company?.business_type || ''

  // ── NGO budget validation (repeat as in POST) ──────────────
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

  // Fetch old bill
  const { data: oldBill } = await supabase.from('invoices')
    .select('*').eq('id', id).eq('company_id', companyId).single()
  if (!oldBill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  // Reverse old journal entry
  const oldDescription = `Purchase Bill ${oldBill.invoice_no}`
  const { data: oldEntries } = await supabase.from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('description', oldDescription)

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

  // Delete old items and WHT record
  await supabase.from('invoice_items').delete().eq('invoice_id', id)
  if (taxEnabled) {
    await supabase.from('bill_withholding').delete().eq('bill_id', id)
  }

  // Determine new WHT values
  let actualWhtAmount = 0
  let actualWhtTaxCodeId: string | null = null
  let actualWhtRate = 0

  if (taxEnabled && wht_tax_code_id) {
    actualWhtTaxCodeId = wht_tax_code_id
    actualWhtRate = parseFloat(wht_rate) || 0
    actualWhtAmount = parseFloat(wht_amount) || 0
  } else if (taxEnabled) {
    const defaultId = await getDefaultWHTTaxCodeId(supabase, companyId, party_id)
    if (defaultId) {
      const { data: tc } = await supabase
        .from('tax_codes')
        .select('rate')
        .eq('id', defaultId)
        .single()
      if (tc) {
        actualWhtTaxCodeId = defaultId
        actualWhtRate = tc.rate
      }
    }
  }

  // Insert new items and compute total
  let total = 0
  const itemRows = items.map((item: any) => {
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

  await recordStockMoves(supabase, companyId, items, 'purchase', id, 'in')

  // Calculate WHT amount if not provided but a default code is set
  if (taxEnabled && actualWhtTaxCodeId && actualWhtAmount === 0) {
    actualWhtAmount = total * (actualWhtRate / 100)
  }

  // Update bill header
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

  // Insert new WHT record
  if (taxEnabled && actualWhtAmount > 0 && actualWhtTaxCodeId) {
    await supabase.from('bill_withholding').insert({
      company_id: companyId,
      bill_id: id,
      wht_tax_code_id: actualWhtTaxCodeId,
      wht_rate: actualWhtRate,
      wht_amount: actualWhtAmount,
    })
  }

  // Rebuild journal entry
  try {
    const whtAccountId = taxEnabled && actualWhtTaxCodeId
      ? (await supabase.from('tax_codes')
          .select('tax_account_id')
          .eq('id', actualWhtTaxCodeId)
          .single()
        ).data?.tax_account_id
      : null

    await createBillJournalEntry(
      supabase,
      updatedBill,
      items,
      companyId,
      businessType,
      actualWhtAmount,
      whtAccountId
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'Journal entry failed after update: ' + e.message }, { status: 500 })
  }

  // Update supplier balance
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

  const { data: oldBill } = await supabase.from('invoices')
    .select('*').eq('id', id).eq('company_id', companyId).single()

  if (!oldBill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  // Reverse JE
  const oldDescription = `Purchase Bill ${oldBill.invoice_no}`
  const { data: entries } = await supabase.from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('description', oldDescription)

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

  // Reverse supplier balance
  if (oldBill.party_id) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', oldBill.party_id).eq('company_id', companyId).single()
    if (supp) {
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) - (oldBill.total || 0) })
        .eq('id', oldBill.party_id).eq('company_id', companyId)
    }
  }

  // Delete WHT record if exists
  await supabase.from('bill_withholding').delete().eq('bill_id', id)

  await supabase.from('invoice_items').delete().eq('invoice_id', id)
  const { error } = await supabase.from('invoices')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (oldBill) {
    await logDataChange('invoices', String(id), 'DELETE', oldBill, undefined)
  }

  return NextResponse.json({ success: true })
}