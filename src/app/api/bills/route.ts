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

  // Get active company ID
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  const { invoice_no, party_id, invoice_date, due_date, items, reference, notes } = await request.json()
  if (!party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Supplier and at least one item are required' }, { status: 400 })
  }

  // Generate bill number (same logic as invoices)
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

  // 1. Insert the bill into invoices (type = purchase)
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

  // 2. Insert items and increase stock
  for (const item of items) {
    await supabaseAdmin.from("invoice_items").insert({
      company_id: companyId,
      invoice_id: bill.id,
      product_id: item.product_id,
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

  // 3. Update supplier balance (increase AP)
  const { data: supp } = await supabaseAdmin.from("suppliers")
    .select("balance").eq("id", party_id).eq("company_id", companyId).single()
  if (supp) {
    await supabaseAdmin.from("suppliers")
      .update({ balance: (supp.balance || 0) + totalAmount })
      .eq("id", party_id).eq("company_id", companyId)
  }

  // 4. GL entries: DR Inventory (1200) / CR AP (2000)
  const invAcc = await supabaseAdmin.from("accounts")
    .select("id,balance").eq("code", "1200").eq("company_id", companyId).single()
  const apAcc = await supabaseAdmin.from("accounts")
    .select("id,balance").eq("code", "2000").eq("company_id", companyId).single()

  if (invAcc.data && apAcc.data) {
    const { data: entry } = await supabaseAdmin.from("journal_entries").insert({
      company_id: companyId,
      entry_no: `JE-BILL-${String(bill.id).padStart(4, "0")}`,
      date: invoice_date || new Date().toISOString().split('T')[0],
      description: `Purchase Bill - ${finalInvoiceNo}`,
    }).select("id").single()

    if (entry) {
      await supabaseAdmin.from("journal_lines").insert([
        { company_id: companyId, entry_id: entry.id, account_id: invAcc.data.id, debit: totalAmount, credit: 0 },
        { company_id: companyId, entry_id: entry.id, account_id: apAcc.data.id, debit: 0, credit: totalAmount },
      ])
      await supabaseAdmin.from("accounts").update({ balance: (invAcc.data.balance || 0) + totalAmount }).eq("id", invAcc.data.id)
      await supabaseAdmin.from("accounts").update({ balance: (apAcc.data.balance || 0) + totalAmount }).eq("id", apAcc.data.id)
    }
  }

  return NextResponse.json({ success: true, bill_id: bill.id, bill_no: finalInvoiceNo })
}