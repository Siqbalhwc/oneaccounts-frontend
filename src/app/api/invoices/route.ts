import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helpers ───────────────────────────────────────────────────────────
async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
}

async function createJE(
  supabase: any,
  companyId: string,
  date: string,
  description: string,
  lines: any[],
  sourceType: string = 'manual_journal',
  sourceId: number | null = null,
) {
  const { data: entry } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-INV-${Date.now()}`,
    date,
    description,
  }).select('id').single()
  if (!entry) throw new Error('Journal entry creation failed')

  const lineRows = lines.map(l => ({
    ...l,
    entry_id: entry.id,
    company_id: companyId,
    source_type: sourceType,
    source_id: sourceId,
  }))
  await supabase.from('journal_lines').insert(lineRows)

  for (const l of lines) {
    const { data: acc } = await supabase.from('accounts')
      .select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
    if (acc) {
      const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
      await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
    }
  }
}

// ── Generate unique sequential invoice number: SI/YYYYMM/0001 ──────────
async function generateInvoiceNo(supabase: any, companyId: string): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const prefix = `SI/${ym}/`
  const { data: lastInv } = await supabase
    .from("invoices")
    .select("invoice_no")
    .like("invoice_no", `${prefix}%`)
    .order("invoice_no", { ascending: false })
    .limit(1)
  let nextNum = 1
  if (lastInv && lastInv.length > 0) {
    const last = lastInv[0].invoice_no
    const match = last.match(/\/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`
}

// ── Stock validation helper ────────────────────────────────────────────
async function validateStock(supabase: any, companyId: string, items: any[]) {
  for (const item of items) {
    if (item.product_id) {
      const { data: product } = await supabase
        .from("products")
        .select("id, code, name, qty_on_hand")
        .eq("id", item.product_id)
        .eq("company_id", companyId)
        .single()
      if (product && (item.qty || 0) > (product.qty_on_hand || 0)) {
        return `Insufficient stock for "${product.name}". Available: ${product.qty_on_hand}, requested: ${item.qty}.`
      }
    }
  }
  return null
}

// ── POST ──────────────────────────────────────────────────────────────
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
  const { party_id, invoice_date, due_date, items, reference, notes } = body
  if (!party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const userEmail = user.email || 'system'

  // Stock validation
  const stockErr = await validateStock(supabase, companyId, items)
  if (stockErr) {
    return NextResponse.json({ error: stockErr }, { status: 400 })
  }

  // Business type & automation
  const { data: company } = await supabase.from('companies')
    .select('business_type').eq('id', companyId).single()
  const businessType = company?.business_type || ''

  const { data: settings } = await supabase.from('company_settings')
    .select('invoice_automation_config')
    .eq('company_id', companyId).maybeSingle()
  const automationConfig = settings?.invoice_automation_config || {}
  const expenseEnabled = automationConfig.expenseEnabled ?? false
  const profitEnabled = automationConfig.profitEnabled ?? false
  const expenseRules = automationConfig.expenseRules || []
  const partners = automationConfig.partners || []

  // Generate unique invoice number (with retry on duplicate key)
  let invoice: any = null
  let invoiceNo = ''
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    invoiceNo = await generateInvoiceNo(supabase, companyId)
    const { data: inv, error: headerError } = await supabase
      .from('invoices')
      .insert({
        invoice_no: invoiceNo,
        type: 'sale',
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
      })
      .select('*')
      .single()
    if (!headerError) { invoice = inv; break }
    if (headerError.code === '23505' || headerError.message?.includes('duplicate key')) continue
    return NextResponse.json({ error: headerError.message }, { status: 500 })
  }
  if (!invoice) return NextResponse.json({ error: 'Could not generate unique invoice number' }, { status: 500 })

  // Insert items
  const itemRows = items.map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    return {
      invoice_id: invoice.id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      product_id: item.product_id || null,
      company_id: companyId,
    }
  })
  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows)
    if (itemsError) {
      await supabase.from('invoices').delete().eq('id', invoice.id)
      return NextResponse.json({ error: 'Failed to save items: ' + itemsError.message }, { status: 500 })
    }
  }

  const totalSalesAmount = itemRows.reduce((s: number, i: any) => s + (i.total || 0), 0)
  const { data: updatedInv } = await supabase
    .from('invoices')
    .update({ total: totalSalesAmount })
    .eq('id', invoice.id)
    .select('*')
    .single()

  // Update customer balance
  const { data: custBal } = await supabase.from('customers').select('balance').eq('id', party_id).single()
  if (custBal) {
    await supabase.from('customers').update({ balance: custBal.balance + totalSalesAmount }).eq('id', party_id)
  }

  try {
    const arAccount = await getAccount(supabase, '1100', companyId)
    const revenueAccount = await getAccount(supabase, '4000', companyId)
    if (!arAccount || !revenueAccount) throw new Error('AR or Revenue account not found')

    const jeLines: any[] = []

    // First pass: AR / Revenue for each item
    for (const item of items) {
      const lineTotal = Number(item.qty || 0) * Number(item.unit_price || 0)
      if (lineTotal <= 0) continue
      jeLines.push({ account_id: arAccount.id, debit: lineTotal, credit: 0 })
      jeLines.push({ account_id: revenueAccount.id, debit: 0, credit: lineTotal })
    }

    // COGS for trading companies (if product and cost_price present)
    if (businessType === 'trading') {
      for (const item of items) {
        if (item.product_id && Number(item.qty || 0) > 0 && (item.cost_price || 0) > 0) {
          const qty = Number(item.qty)
          const cost = qty * item.cost_price
          const cogsAccount = await getAccount(supabase, '5000', companyId)
          const inventoryAccount = await getAccount(supabase, '1200', companyId)
          if (cogsAccount && inventoryAccount) {
            jeLines.push({ account_id: cogsAccount.id, debit: cost, credit: 0 })
            jeLines.push({ account_id: inventoryAccount.id, debit: 0, credit: cost })
          }
        }
      }
    }

    // Automation expenses
    let totalAutomationExpense = 0
    if (expenseEnabled && expenseRules.length > 0) {
      for (const rule of expenseRules) {
        const amount = (totalSalesAmount * rule.rate) / 100
        if (amount <= 0 || !rule.account_id) continue
        totalAutomationExpense += amount
        jeLines.push({ account_id: rule.account_id, debit: amount, credit: 0 })
      }
      if (totalAutomationExpense > 0) {
        const payableExpAccount = await getAccount(supabase, '2001', companyId)
        if (payableExpAccount) jeLines.push({ account_id: payableExpAccount.id, debit: 0, credit: totalAutomationExpense })
      }
    }

    // Profit allocation
    if (profitEnabled && partners.length > 0) {
      let netProfit = totalSalesAmount - totalAutomationExpense
      // For trading, also deduct COGS from net profit for allocation
      if (businessType === 'trading') {
        const totalCogs = items.reduce((s: number, i: any) => s + (Number(i.qty || 0) * (i.cost_price || 0)), 0)
        netProfit -= totalCogs
      }
      if (netProfit > 0) {
        const retainedEarnings = await getAccount(supabase, '3000', companyId)
        if (retainedEarnings) {
          jeLines.push({ account_id: retainedEarnings.id, debit: netProfit, credit: 0 })
          for (const partner of partners) {
            if (!partner.account_id || partner.percentage <= 0) continue
            const partnerAmount = (netProfit * partner.percentage) / 100
            jeLines.push({ account_id: partner.account_id, debit: 0, credit: partnerAmount })
          }
        }
      }
    }

    await createJE(supabase, companyId, invoice_date, `Sales Invoice ${invoiceNo}`, jeLines, 'sale_invoice', updatedInv.id)

    // Update product stock (outflow)
    for (const item of items) {
      if (!item.product_id) continue
      const qty = Number(item.qty || 0)
      if (qty <= 0) continue
      const { data: product } = await supabase
        .from('products')
        .select('qty_on_hand, total_outflow')
        .eq('id', item.product_id)
        .eq('company_id', companyId)
        .single()
      if (product) {
        const newQtyOnHand = (product.qty_on_hand || 0) - qty
        const newTotalOutflow = (product.total_outflow || 0) + qty
        await supabase
          .from('products')
          .update({ qty_on_hand: newQtyOnHand, total_outflow: newTotalOutflow })
          .eq('id', item.product_id)
          .eq('company_id', companyId)
      }
    }

  } catch (e: any) {
    await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id)
    await supabase.from('invoices').delete().eq('id', invoice.id)
    if (custBal) {
      await supabase.from('customers').update({ balance: custBal.balance - totalSalesAmount }).eq('id', party_id)
    }
    return NextResponse.json({ error: 'Journal entry failed: ' + e.message }, { status: 500 })
  }

  await logDataChange('invoices', String(updatedInv.id), 'INSERT', undefined, updatedInv)

  return NextResponse.json({ success: true, invoice: updatedInv })
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
  const { id, party_id, invoice_date, due_date, items, reference, notes } = body
  if (!id) return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const userEmail = user.email || 'system'

  // Stock validation for new items
  const stockErr = await validateStock(supabase, companyId, items)
  if (stockErr) {
    return NextResponse.json({ error: stockErr }, { status: 400 })
  }

  const { data: oldInv } = await supabase.from('invoices')
    .select('*').eq('id', id).eq('company_id', companyId).single()
  if (!oldInv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Reverse old stock outflow
  const { data: oldItems } = await supabase.from('invoice_items').select('*').eq('invoice_id', id)
  if (oldItems) {
    for (const item of oldItems) {
      if (!item.product_id) continue
      const qty = Number(item.qty || 0)
      if (qty <= 0) continue
      const { data: product } = await supabase
        .from('products')
        .select('qty_on_hand, total_outflow')
        .eq('id', item.product_id)
        .eq('company_id', companyId)
        .single()
      if (product) {
        const newQtyOnHand = (product.qty_on_hand || 0) + qty
        const newTotalOutflow = (product.total_outflow || 0) - qty
        await supabase
          .from('products')
          .update({ qty_on_hand: newQtyOnHand, total_outflow: newTotalOutflow })
          .eq('id', item.product_id)
          .eq('company_id', companyId)
      }
    }
  }

  // Reverse old JE
  const { data: oldEntries } = await supabase.from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .like('description', `%${oldInv.invoice_no}%`)
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

  // Reverse old customer balance
  if (oldInv.party_id) {
    const { data: cust } = await supabase.from('customers').select('balance').eq('id', oldInv.party_id).single()
    if (cust) {
      await supabase.from('customers').update({ balance: cust.balance - oldInv.total }).eq('id', oldInv.party_id)
    }
  }

  // Delete old items, insert new
  await supabase.from('invoice_items').delete().eq('invoice_id', id)
  const itemRows = (items || []).map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    return {
      invoice_id: id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      product_id: item.product_id || null,
      company_id: companyId,
    }
  })
  if (itemRows.length > 0) await supabase.from('invoice_items').insert(itemRows)

  const totalSalesAmount = itemRows.reduce((s: number, i: any) => s + (i.total || 0), 0)

  const { data: updatedInv } = await supabase
    .from('invoices')
    .update({
      party_id,
      date: invoice_date,
      due_date,
      total: totalSalesAmount,
      reference,
      notes,
      updated_by: userEmail,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (!updatedInv) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  if (party_id) {
    const { data: cust } = await supabase.from('customers').select('balance').eq('id', party_id).single()
    if (cust) {
      await supabase.from('customers').update({ balance: cust.balance + totalSalesAmount }).eq('id', party_id)
    }
  }

  // Apply new stock outflow
  for (const item of items) {
    if (!item.product_id) continue
    const qty = Number(item.qty || 0)
    if (qty <= 0) continue
    const { data: product } = await supabase
      .from('products')
      .select('qty_on_hand, total_outflow')
      .eq('id', item.product_id)
      .eq('company_id', companyId)
      .single()
    if (product) {
      const newQtyOnHand = (product.qty_on_hand || 0) - qty
      const newTotalOutflow = (product.total_outflow || 0) + qty
      await supabase
        .from('products')
        .update({ qty_on_hand: newQtyOnHand, total_outflow: newTotalOutflow })
        .eq('id', item.product_id)
        .eq('company_id', companyId)
    }
  }

  await logDataChange('invoices', String(id), 'UPDATE', oldInv, updatedInv)

  return NextResponse.json({ success: true, invoice: updatedInv })
}