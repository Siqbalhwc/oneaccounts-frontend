import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

type LineItem = {
  date: string
  productId: number | null
  customerId: number | null
  income: number
  cogs: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function parseIds(raw: string | null): number[] {
  if (!raw) return []
  return raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
}

export async function GET(request: NextRequest) {
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRow, error: roleErr } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (roleErr || !roleRow?.company_id) {
    return NextResponse.json({ error: 'No active company found for this user' }, { status: 400 })
  }
  const companyId = roleRow.company_id as string

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const groupBy = searchParams.get('groupBy') || 'day'
  const productIds = parseIds(searchParams.get('productIds'))
  const customerIds = parseIds(searchParams.get('customerIds'))
  const isFiltered = productIds.length > 0 || customerIds.length > 0

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 })
  }
  if (!['day', 'product', 'customer'].includes(groupBy)) {
    return NextResponse.json({ error: 'Invalid groupBy — must be day, product or customer' }, { status: 400 })
  }

  const lineItems: LineItem[] = []

  // ── 1. Sales Invoices + Sales Returns ───────────────────────────────────
  let invQuery = supabase
    .from('invoice_items')
    .select('product_id, qty, unit_price, cost_snapshot, invoices!inner(id, date, type, party_id, deleted_at)')
    .eq('company_id', companyId)
    .in('invoices.type', ['sale', 'sale_return'])
    .is('invoices.deleted_at', null)
    .gte('invoices.date', startDate)
    .lte('invoices.date', endDate)

  if (productIds.length) invQuery = invQuery.in('product_id', productIds)
  if (customerIds.length) invQuery = invQuery.in('invoices.party_id', customerIds)

  const { data: invItems, error: invErr } = await invQuery
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  ;(invItems || []).forEach((row: any) => {
    const inv = row.invoices
    const qty = Number(row.qty) || 0
    const unitPrice = Number(row.unit_price) || 0
    const cost = Number(row.cost_snapshot) || 0
    const sign = inv.type === 'sale_return' ? -1 : 1
    lineItems.push({
      date: inv.date,
      productId: row.product_id,
      customerId: inv.party_id,
      income: sign * qty * unitPrice,
      cogs: sign * qty * cost,
    })
  })

  // ── 2. Cash Sales — original sale, dated at sale date ───────────────────
  let csOrigQuery = supabase
    .from('cash_sale_items')
    .select('product_id, qty, unit_price, cost_price, cash_sales!inner(id, date, party_id, status, returned_at)')
    .eq('company_id', companyId)
    .gte('cash_sales.date', startDate)
    .lte('cash_sales.date', endDate)

  if (productIds.length) csOrigQuery = csOrigQuery.in('product_id', productIds)
  if (customerIds.length) csOrigQuery = csOrigQuery.in('cash_sales.party_id', customerIds)

  const { data: csOriginal, error: csOrigErr } = await csOrigQuery
  if (csOrigErr) return NextResponse.json({ error: csOrigErr.message }, { status: 500 })

  ;(csOriginal || []).forEach((row: any) => {
    const cs = row.cash_sales
    const qty = Number(row.qty) || 0
    const unitPrice = Number(row.unit_price) || 0
    const cost = Number(row.cost_price) || 0
    lineItems.push({
      date: cs.date,
      productId: row.product_id,
      customerId: cs.party_id,
      income: qty * unitPrice,
      cogs: qty * cost,
    })
  })

  // ── 3. Cash Sale Returns — reconstructed negative, dated at returned_at ─
  let csRetQuery = supabase
    .from('cash_sale_items')
    .select('product_id, qty, unit_price, cost_price, cash_sales!inner(id, date, party_id, status, returned_at)')
    .eq('company_id', companyId)
    .eq('cash_sales.status', 'returned')
    .gte('cash_sales.returned_at', startDate)
    .lte('cash_sales.returned_at', endDate)

  if (productIds.length) csRetQuery = csRetQuery.in('product_id', productIds)
  if (customerIds.length) csRetQuery = csRetQuery.in('cash_sales.party_id', customerIds)

  const { data: csReturned, error: csRetErr } = await csRetQuery
  if (csRetErr) return NextResponse.json({ error: csRetErr.message }, { status: 500 })

  ;(csReturned || []).forEach((row: any) => {
    const cs = row.cash_sales
    const qty = Number(row.qty) || 0
    const unitPrice = Number(row.unit_price) || 0
    const cost = Number(row.cost_price) || 0
    lineItems.push({
      date: cs.returned_at,
      productId: row.product_id,
      customerId: cs.party_id,
      income: -1 * qty * unitPrice,
      cogs: -1 * qty * cost,
    })
  })

  // ── 4. Administrative & Selling Expenses — only meaningful when unfiltered ─
  const expenseByDate: Record<string, number> = {}
  let totalExpense = 0

  if (!isFiltered) {
    const { data: expLines, error: expErr } = await supabase
      .from('journal_lines')
      .select('debit, credit, journal_entries!inner(date, deleted_at), accounts!inner(type, code)')
      .eq('company_id', companyId)
      .eq('accounts.type', 'Expense')
      .neq('accounts.code', '5000')
      .is('journal_entries.deleted_at', null)
      .gte('journal_entries.date', startDate)
      .lte('journal_entries.date', endDate)

    if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 })

    ;(expLines || []).forEach((row: any) => {
      const net = (Number(row.debit) || 0) - (Number(row.credit) || 0)
      totalExpense += net
      const d = row.journal_entries.date
      expenseByDate[d] = (expenseByDate[d] || 0) + net
    })
  }

  // ── 5. Names for grouping ────────────────────────────────────────────────
  const allProductIds = Array.from(new Set(lineItems.map(l => l.productId).filter((v): v is number => v != null)))
  const allCustomerIds = Array.from(new Set(lineItems.map(l => l.customerId).filter((v): v is number => v != null)))

  const [{ data: products }, { data: customers }] = await Promise.all([
    allProductIds.length
      ? supabase.from('products').select('id, name').eq('company_id', companyId).in('id', allProductIds)
      : Promise.resolve({ data: [] as any[] }),
    allCustomerIds.length
      ? supabase.from('customers').select('id, name').eq('company_id', companyId).in('id', allCustomerIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const productName: Record<number, string> = {}
  ;(products || []).forEach((p: any) => { productName[p.id] = p.name })
  const customerName: Record<number, string> = {}
  ;(customers || []).forEach((c: any) => { customerName[c.id] = c.name })

  // ── 6. Aggregate ─────────────────────────────────────────────────────────
  if (groupBy === 'day') {
    const days: string[] = []
    const cursor = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    while (cursor <= end) {
      days.push(cursor.toISOString().slice(0, 10))
      cursor.setDate(cursor.getDate() + 1)
    }

    const incomeByDay: Record<string, number> = {}
    const cogsByDay: Record<string, number> = {}
    lineItems.forEach(l => {
      incomeByDay[l.date] = (incomeByDay[l.date] || 0) + l.income
      cogsByDay[l.date] = (cogsByDay[l.date] || 0) + l.cogs
    })

    const income = days.map(d => round2(incomeByDay[d] || 0))
    const cogs = days.map(d => round2(cogsByDay[d] || 0))
    const grossProfit = income.map((v, i) => round2(v - cogs[i]))
    const sum = (arr: number[]) => round2(arr.reduce((a, b) => a + b, 0))

    const rows = [
      { label: 'Sales', values: income, total: sum(income) },
      { label: 'Less: Cost of Sales', values: cogs, total: sum(cogs) },
      { label: 'Gross Profit', values: grossProfit, total: sum(grossProfit), bold: true },
    ]

    if (!isFiltered) {
      const expenses = days.map(d => round2(expenseByDate[d] || 0))
      const netProfit = grossProfit.map((v, i) => round2(v - expenses[i]))
      rows.push({ label: 'Less: Administrative & Selling Expenses', values: expenses, total: sum(expenses) } as any)
      rows.push({ label: 'Net Profit', values: netProfit, total: sum(netProfit), bold: true } as any)
    }

    return NextResponse.json({
      groupBy: 'day',
      filtered: isFiltered,
      columns: days.map(d => Number(d.slice(8, 10))),
      dates: days,
      rows,
    })
  }

  const key = groupBy === 'product' ? 'productId' : 'customerId'
  const nameMap = groupBy === 'product' ? productName : customerName
  const fallbackLabel = groupBy === 'product' ? 'Non-Product / Service Items' : 'Walk-in / No Customer'

  const grouped: Record<string, { income: number; cogs: number }> = {}
  lineItems.forEach(l => {
    const idVal = (l as any)[key]
    const k = idVal == null ? '__none__' : String(idVal)
    if (!grouped[k]) grouped[k] = { income: 0, cogs: 0 }
    grouped[k].income += l.income
    grouped[k].cogs += l.cogs
  })

  const rows = Object.entries(grouped)
    .map(([k, v]) => ({
      id: k === '__none__' ? null : Number(k),
      name: k === '__none__' ? fallbackLabel : (nameMap[Number(k)] || `#${k}`),
      income: round2(v.income),
      cogs: round2(v.cogs),
      grossProfit: round2(v.income - v.cogs),
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit)

  const totalIncome = round2(rows.reduce((a, r) => a + r.income, 0))
  const totalCogs = round2(rows.reduce((a, r) => a + r.cogs, 0))
  const totalGrossProfit = round2(totalIncome - totalCogs)

  return NextResponse.json({
    groupBy,
    filtered: isFiltered,
    rows,
    unallocatedExpenses: isFiltered ? null : round2(totalExpense),
    totals: {
      income: totalIncome,
      cogs: totalCogs,
      grossProfit: totalGrossProfit,
      netProfit: isFiltered ? null : round2(totalGrossProfit - totalExpense),
    },
  })
}