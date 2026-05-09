import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

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

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  const { data: comp } = await supabaseAdmin.from("companies").select("business_type").eq("id", companyId).single()
  const businessType = comp?.business_type

  const {
    invoice_no, party_id, invoice_date, due_date,
    items, reference, notes,
    expense_account_id,    // header default
    project_id, location_id, activity_id, donor_id
  } = await request.json()

  if (!party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Supplier and at least one item are required' }, { status: 400 })
  }
  if (businessType === "ngo" && !donor_id) {
    return NextResponse.json({ error: 'Donor is required for NGO bills' }, { status: 400 })
  }

  // Generate bill number
  let finalInvoiceNo = invoice_no?.trim() || `BILL-${Date.now().toString(36).toUpperCase()}`
  let tries = 0
  while (tries < 5) {
    const { data: existing } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('company_id', companyId)
      .eq('invoice_no', finalInvoiceNo)
      .eq('type', 'purchase')
      .maybeSingle()
    if (!existing) break
    finalInvoiceNo = `${finalInvoiceNo}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    tries++
  }

  const totalAmount = items.reduce((s: number, i: any) => s + (i.qty * i.unit_price), 0)

  // 1. Insert the bill
  const { data: bill, error: billErr } = await supabaseAdmin.from("invoices").insert({
    company_id: companyId,
    invoice_no: finalInvoiceNo,
    type: "purchase",
    party_id,
    date: invoice_date || new Date().toISOString().split('T')[0],
    due_date: due_date,
    total: totalAmount,
    paid: 0,
    status: "Unpaid",
    reference,
    notes,
  }).select("id").single()

  if (billErr || !bill) {
    return NextResponse.json({ error: billErr?.message || "Failed to create bill" }, { status: 500 })
  }

  // 2. Insert items, stock, and journal lines per item
  const fiscalYear = new Date().getFullYear()
  const startDate = `${fiscalYear}-01-01`
  const endDate   = `${fiscalYear}-12-31`

  for (const item of items) {
    const itemAmount = item.qty * item.unit_price
    const lineActivityId = item.activity_id || activity_id
    const lineAccountId  = item.account_id  || expense_account_id

    // Budget enforcement for this line
    if (lineActivityId && lineAccountId) {
      // Check budget remaining for this specific activity+account+location+project+donor
      const { data: budgetRow } = await supabaseAdmin
        .from("budgets")
        .select("budgeted_amount")
        .eq("company_id", companyId)
        .eq("project_id", project_id)
        .eq("activity_id", lineActivityId)
        .eq("location_id", location_id)
        .eq("account_id", lineAccountId)
        .eq("fiscal_year", fiscalYear)
        .eq("donor_id", donor_id || null)
        .is("month", null)
        .maybeSingle()

      const budget = budgetRow?.budgeted_amount || 0

      // Get actuals YTD for this line
      const { data: actualRows } = await supabaseAdmin
        .from("journal_lines")
        .select("debit, credit")
        .eq("company_id", companyId)
        .eq("project_id", project_id)
        .eq("activity_id", lineActivityId)
        .eq("location_id", location_id)
        .eq("account_id", lineAccountId)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)

      const actualSpent = actualRows?.reduce((s, row) => s + ((row.debit || 0) - (row.credit || 0)), 0) || 0
      const remaining = budget - actualSpent

      if (itemAmount > remaining) {
        return NextResponse.json({
          error: `Budget exceeded for this item! Remaining: PKR ${remaining.toLocaleString()}, Requested: PKR ${itemAmount.toLocaleString()}`
        }, { status: 400 })
      }
    }

    // Save invoice item
    await supabaseAdmin.from("invoice_items").insert({
      company_id: companyId,
      invoice_id: bill.id,
      description: item.description,
      qty: item.qty,
      unit_price: item.unit_price,
      total: itemAmount,
    })

    // Update stock (if product, but here all items are manual; no product_id)
    // No product stock update needed

    // Post journal line
    if (!lineAccountId) {
      return NextResponse.json({ error: "Missing account for line" }, { status: 400 })
    }

    // Debit the expense account
    await supabaseAdmin.from("journal_lines").insert({
      company_id: companyId,
      entry_id: null,  // will update after entry is created
      account_id: lineAccountId,
      debit: itemAmount,
      credit: 0,
      project_id: project_id,
      location_id: location_id,
      activity_id: lineActivityId,
      donor_id: donor_id || null,
    })
  }

  // Update supplier balance
  const { data: supp } = await supabaseAdmin.from("suppliers")
    .select("balance").eq("id", party_id).eq("company_id", companyId).single()
  if (supp) {
    await supabaseAdmin.from("suppliers")
      .update({ balance: (supp.balance || 0) + totalAmount })
      .eq("id", party_id).eq("company_id", companyId)
  }

  // Create journal entry and link the lines
  const apAcc = await supabaseAdmin.from("accounts")
    .select("id,balance").eq("code", "2000").eq("company_id", companyId).single()

  if (!apAcc.data) {
    return NextResponse.json({ error: "AP account (2000) not found" }, { status: 500 })
  }

  const { data: entry } = await supabaseAdmin.from("journal_entries").insert({
    company_id: companyId,
    entry_no: `JE-BILL-${String(bill.id).padStart(4, "0")}`,
    date: invoice_date || new Date().toISOString().split('T')[0],
    description: `Purchase Bill - ${finalInvoiceNo}`,
  }).select("id").single()

  if (!entry) {
    return NextResponse.json({ error: "Failed to create journal entry" }, { status: 500 })
  }

  // Update all journal lines of this bill with the entry ID
  await supabaseAdmin.from("journal_lines")
    .update({ entry_id: entry.id })
    .is("entry_id", null)  // update only the lines we just inserted
    .eq("company_id", companyId)

  // Credit AP
  await supabaseAdmin.from("journal_lines").insert({
    company_id: companyId,
    entry_id: entry.id,
    account_id: apAcc.data.id,
    debit: 0,
    credit: totalAmount,
    project_id: project_id || null,
    location_id: location_id || null,
    activity_id: activity_id || null,
    donor_id: donor_id || null,
  })

  // Update AP balance (optional, kept for compatibility)
  await supabaseAdmin.from("accounts")
    .update({ balance: (apAcc.data.balance || 0) + totalAmount })
    .eq("id", apAcc.data.id)

  return NextResponse.json({ success: true, bill_id: bill.id, bill_no: finalInvoiceNo })
}