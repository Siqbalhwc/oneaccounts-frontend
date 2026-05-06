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

  // Get business type and validate donor requirement
  const { data: comp } = await supabaseAdmin.from("companies").select("business_type").eq("id", companyId).single()
  const businessType = comp?.business_type

  const {
    invoice_no, party_id, invoice_date, due_date,
    items, reference, notes,
    expense_account_id,   // fallback header account
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

  // 2. Insert items and increase stock (if product)
  for (const item of items) {
    await supabaseAdmin.from("invoice_items").insert({
      company_id: companyId,
      invoice_id: bill.id,
      product_id: item.product_id || null,
      description: item.description,
      qty: item.qty,
      unit_price: item.unit_price,
      total: item.qty * item.unit_price,
    })

    if (item.product_id) {
      const { data: prod } = await supabaseAdmin.from("products")
        .select("qty_on_hand").eq("id", item.product_id).eq("company_id", companyId).single()
      if (prod) {
        await supabaseAdmin.from("products")
          .update({ qty_on_hand: (prod.qty_on_hand || 0) + item.qty })
          .eq("id", item.product_id).eq("company_id", companyId)
        await supabaseAdmin.from("stock_moves").insert({
          company_id: companyId,
          product_id: item.product_id,
          move_type: "purchase",
          qty: item.qty,
          unit_price: item.unit_price,
          ref: finalInvoiceNo,
          date: invoice_date || new Date().toISOString().split('T')[0],
        })
      }
    }
  }

  // 3. Update supplier balance
  const { data: supp } = await supabaseAdmin.from("suppliers")
    .select("balance").eq("id", party_id).eq("company_id", companyId).single()
  if (supp) {
    await supabaseAdmin.from("suppliers")
      .update({ balance: (supp.balance || 0) + totalAmount })
      .eq("id", party_id).eq("company_id", companyId)
  }

  // 4. GL entries
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

  // Group items: manual vs product; use per‑item account_id if present
  for (const item of items) {
    const itemAmount = item.qty * item.unit_price
    let debitAccountId: number | null = null

    if (item.product_id) {
      // Product: debit Inventory 1200
      const invAcc = await supabaseAdmin.from("accounts")
        .select("id,balance").eq("code", "1200").eq("company_id", companyId).single()
      if (!invAcc.data) {
        return NextResponse.json({ error: "Inventory account (1200) not found" }, { status: 500 })
      }
      debitAccountId = invAcc.data.id
      // Update inventory balance
      await supabaseAdmin.from("accounts")
        .update({ balance: (invAcc.data.balance || 0) + itemAmount })
        .eq("id", invAcc.data.id)
    } else {
      // Manual: use item.account_id or fallback to header expense_account_id
      const accountId = item.account_id || expense_account_id
      if (!accountId) {
        return NextResponse.json({ error: "Missing account for manual item" }, { status: 400 })
      }
      // Verify account exists
      const { data: acc } = await supabaseAdmin.from("accounts").select("id,balance").eq("id", accountId).single()
      if (!acc) {
        return NextResponse.json({ error: `Account ${accountId} not found` }, { status: 400 })
      }
      debitAccountId = acc.id
      // Update account balance
      await supabaseAdmin.from("accounts")
        .update({ balance: (acc.balance || 0) + itemAmount })
        .eq("id", acc.id)
    }

    // Insert debit line for this item with all tags
    await supabaseAdmin.from("journal_lines").insert({
      company_id: companyId,
      entry_id: entry.id,
      account_id: debitAccountId,
      debit: itemAmount,
      credit: 0,
      project_id: project_id || null,
      location_id: location_id || null,
      activity_id: activity_id || null,
      donor_id: donor_id || null,
    })
  }

  // Credit AP for total
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
  // Update AP balance
  await supabaseAdmin.from("accounts")
    .update({ balance: (apAcc.data.balance || 0) + totalAmount })
    .eq("id", apAcc.data.id)

  return NextResponse.json({ success: true, bill_id: bill.id, bill_no: finalInvoiceNo })
}