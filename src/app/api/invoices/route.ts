import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const SALARY_RATE = 0.04
const ADS_RATE = 0.005
const FUEL_RATE = 0.005
const PARTNER_SHARES: Record<string, number> = {
  "3101": 0.05,
  "3102": 0.05,
  "3103": 0.05,
  "3104": 0.05,
  "3106": 0.80,
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { invoice_no, party_id, invoice_date, due_date, items, reference, notes } = body

  if (!items || items.length === 0) return NextResponse.json({ error: 'No items provided' }, { status: 400 })

  try {
    // Calculate totals
    const total_amount = items.reduce((s: number, i: any) => s + (i.qty * i.unit_price), 0)
    const total_cost = items.reduce((s: number, i: any) => s + (i.qty * (i.cost_price || 0)), 0)
    const total_salary = total_amount * SALARY_RATE
    const total_ads = total_amount * ADS_RATE
    const total_fuel = total_amount * FUEL_RATE
    const total_expenses = total_salary + total_ads + total_fuel
    const net_profit = total_amount - total_cost - total_expenses

    // 1. Create Invoice
    const { data: inv } = await supabase.from("invoices").insert({
      invoice_no, type: "sale", party_id,
      date: invoice_date, due_date, total: total_amount, paid: 0,
      status: "Unpaid", reference, notes
    }).select("id").single()
    if (!inv) throw new Error("Failed to create invoice")
    const inv_id = inv.id

    // 2. Insert Invoice Items & Update Stock
    for (const item of items) {
      await supabase.from("invoice_items").insert({
        invoice_id: inv_id, product_id: item.product_id,
        description: item.description, qty: item.qty,
        unit_price: item.unit_price, total: item.qty * item.unit_price
      })

      if (item.product_id) {
        const { data: prod } = await supabase.from("products").select("qty_on_hand").eq("id", item.product_id).single()
        if (prod) {
          const new_qty = (prod.qty_on_hand || 0) - item.qty
          await supabase.from("products").update({ qty_on_hand: new_qty }).eq("id", item.product_id)
          await supabase.from("stock_moves").insert({
            product_id: item.product_id, move_type: "sale",
            qty: -item.qty, unit_price: item.unit_price,
            ref: invoice_no, date: invoice_date
          })
        }
      }
    }

    // 3. Update Customer Balance
    const { data: cust } = await supabase.from("customers").select("balance").eq("id", party_id).single()
    const new_balance = (cust?.balance || 0) + total_amount
    await supabase.from("customers").update({ balance: new_balance }).eq("id", party_id)

    // 4. GL Entries
    const { data: arAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1100").single()
    const { data: revAcc } = await supabase.from("accounts").select("id,balance").eq("code", "4000").single()
    if (arAcc && revAcc) {
      const { data: je1 } = await supabase.from("journal_entries").insert({
        entry_no: `JE-SI-${String(inv_id).padStart(4, "0")}`,
        date: invoice_date,
        description: `Sales Invoice - ${invoice_no}`
      }).select("id").single()
      if (je1) {
        await supabase.from("journal_lines").insert([
          { entry_id: je1.id, account_id: arAcc.id, debit: total_amount, credit: 0 },
          { entry_id: je1.id, account_id: revAcc.id, debit: 0, credit: total_amount }
        ])
        await supabase.from("accounts").update({ balance: arAcc.balance + total_amount }).eq("id", arAcc.id)
        await supabase.from("accounts").update({ balance: revAcc.balance + total_amount }).eq("id", revAcc.id)
      }
    }

    if (total_cost > 0) {
      const { data: cogsAcc } = await supabase.from("accounts").select("id,balance").eq("code", "5000").single()
      const { data: invAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1200").single()
      if (cogsAcc && invAcc) {
        const { data: je2 } = await supabase.from("journal_entries").insert({
          entry_no: `JE-COGS-${String(inv_id).padStart(4, "0")}`,
          date: invoice_date,
          description: `COGS - ${invoice_no}`
        }).select("id").single()
        if (je2) {
          await supabase.from("journal_lines").insert([
            { entry_id: je2.id, account_id: cogsAcc.id, debit: total_cost, credit: 0 },
            { entry_id: je2.id, account_id: invAcc.id, debit: 0, credit: total_cost }
          ])
          await supabase.from("accounts").update({ balance: cogsAcc.balance + total_cost }).eq("id", cogsAcc.id)
          await supabase.from("accounts").update({ balance: invAcc.balance - total_cost }).eq("id", invAcc.id)
        }
      }
    }

    if (total_expenses > 0) {
      const salAcc = await supabase.from("accounts").select("id,balance").eq("code", "5100").single()
      const adsAcc = await supabase.from("accounts").select("id,balance").eq("code", "5600").single()
      const fuelAcc = await supabase.from("accounts").select("id,balance").eq("code", "5700").single()
      const apAcc = await supabase.from("accounts").select("id,balance").eq("code", "2001").single()
      if (salAcc.data && adsAcc.data && fuelAcc.data && apAcc.data) {
        const { data: je3 } = await supabase.from("journal_entries").insert({
          entry_no: `JE-EXP-${String(inv_id).padStart(4, "0")}`,
          date: invoice_date,
          description: `Expenses - ${invoice_no}`
        }).select("id").single()
        if (je3) {
          await supabase.from("journal_lines").insert([
            { entry_id: je3.id, account_id: salAcc.data.id, debit: total_salary, credit: 0 },
            { entry_id: je3.id, account_id: adsAcc.data.id, debit: total_ads, credit: 0 },
            { entry_id: je3.id, account_id: fuelAcc.data.id, debit: total_fuel, credit: 0 },
            { entry_id: je3.id, account_id: apAcc.data.id, debit: 0, credit: total_expenses }
          ])
        }
      }
    }

    if (net_profit > 0) {
      const { data: retAcc } = await supabase.from("accounts").select("id,balance").eq("code", "3100").single()
      if (retAcc) {
        const { data: je4 } = await supabase.from("journal_entries").insert({
          entry_no: `JE-PRF-${String(inv_id).padStart(4, "0")}`,
          date: invoice_date,
          description: `Profit Allocation - ${invoice_no}`
        }).select("id").single()
        if (je4) {
          const lines = [{ entry_id: je4.id, account_id: retAcc.id, debit: net_profit, credit: 0 }]
          for (const [code, share] of Object.entries(PARTNER_SHARES)) {
            const { data: pAcc } = await supabase.from("accounts").select("id,balance").eq("code", code).single()
            if (pAcc) {
              lines.push({ entry_id: je4.id, account_id: pAcc.id, debit: 0, credit: net_profit * share })
            }
          }
          await supabase.from("journal_lines").insert(lines)
        }
      }
    }

    // Fetch the created invoice with customer data
    const { data: createdInvoice } = await supabase.from("invoices").select("id, invoice_no, total, date").eq("id", inv_id).single()

    return NextResponse.json({ success: true, invoice_id: inv_id, invoice: createdInvoice })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}