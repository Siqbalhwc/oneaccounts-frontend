import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate and get company from session
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

    const companyId = (user?.app_metadata as any)?.company_id
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const body = await request.json()
    const { product_id, qty, reason, date } = body

    if (!product_id || qty == null || !reason || !date) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum === 0) {
      return NextResponse.json({ success: false, error: "Quantity must be a non‑zero number" }, { status: 400 })
    }

    // 2. Get product details (scoped to user's company)
    const { data: product } = await supabase
      .from("products")
      .select("id, code, cost_price, qty_on_hand")
      .eq("id", product_id)
      .eq("company_id", companyId)
      .single()

    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 })
    }

    const costPrice = product.cost_price || 0
    const oldQty = product.qty_on_hand || 0
    const newQty = oldQty + qtyNum

    if (newQty < 0) {
      return NextResponse.json({ success: false, error: "Insufficient stock" }, { status: 400 })
    }

    // 3. Insert stock movement with type = 'adjustment' (so it appears in the list)
    const { data: moveData, error: moveError } = await supabase
      .from("stock_moves")
      .insert({
        company_id: companyId,
        product_id: product_id,
        move_type: 'adjustment',   // ✅ always "adjustment", not stock_in/stock_out
        qty: qtyNum,
        date,
        reason,
        source_type: 'adjustment',
      })
      .select()
      .single()

    if (moveError || !moveData) {
      return NextResponse.json({ success: false, error: moveError?.message || "Failed to record movement" }, { status: 500 })
    }

    // 4. Update product quantity (scoped)
    const { error: updateError } = await supabase
      .from("products")
      .update({ qty_on_hand: newQty })
      .eq("id", product_id)
      .eq("company_id", companyId)

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    // 5. Journal entry (unchanged)
    const inventoryAccount = await getOrCreateAccount(supabase, companyId, "1200", "Inventory", "Asset")
    const equityAccount = await getOrCreateAccount(supabase, companyId, "3000", "Owner Equity", "Equity")

    if (!inventoryAccount || !equityAccount) {
      return NextResponse.json({ success: false, error: "Could not find or create required accounts" }, { status: 500 })
    }

    const amount = Math.abs(qtyNum) * costPrice
    const entryNo = `JE-ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const { data: journalEntry, error: journalError } = await supabase
      .from("journal_entries")
      .insert({
        company_id: companyId,
        entry_no: entryNo,
        date,
        reference: `INV-ADJ-${moveData.id}`,
        description: reason,
      })
      .select()
      .single()

    if (journalError || !journalEntry) {
      return NextResponse.json({ success: false, error: journalError?.message || "Failed to create journal entry" }, { status: 500 })
    }

    const lines = qtyNum > 0
      ? [
          { company_id: companyId, entry_id: journalEntry.id, account_id: inventoryAccount.id, debit: amount, credit: 0, source_type: "inventory_adjustment", source_id: moveData.id },
          { company_id: companyId, entry_id: journalEntry.id, account_id: equityAccount.id, debit: 0, credit: amount, source_type: "inventory_adjustment", source_id: moveData.id },
        ]
      : [
          { company_id: companyId, entry_id: journalEntry.id, account_id: equityAccount.id, debit: amount, credit: 0, source_type: "inventory_adjustment", source_id: moveData.id },
          { company_id: companyId, entry_id: journalEntry.id, account_id: inventoryAccount.id, debit: 0, credit: amount, source_type: "inventory_adjustment", source_id: moveData.id },
        ]

    const { error: linesError } = await supabase
      .from("journal_lines")
      .insert(lines)

    if (linesError) {
      return NextResponse.json({ success: false, error: linesError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, new_qty_on_hand: newQty, adjustment_id: moveData.id })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}

async function getOrCreateAccount(
  supabase: any,
  companyId: string,
  code: string,
  name: string,
  type: string
) {
  const { data: existing } = await supabase
    .from("accounts")
    .select("id, code, name")
    .eq("company_id", companyId)
    .eq("code", code)
    .maybeSingle()

  if (existing) return existing

  const { data: newAcc } = await supabase
    .from("accounts")
    .insert({
      company_id: companyId,
      code,
      name,
      type,
      balance: 0,
    })
    .select()
    .single()

  return newAcc
}