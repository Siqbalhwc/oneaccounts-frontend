import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ⚠️ Service‑role key bypasses RLS – safe because we verify the user & company below
const supabaseAdmin = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    cookies: {
      getAll() { return [] },
      setAll() {},
    },
  }
)

const SALARY_RATE = 0.04
const ADS_RATE    = 0.005
const FUEL_RATE   = 0.005
const PARTNER_SHARES: Record<string, number> = {
  "3101": 0.05,
  "3102": 0.05,
  "3103": 0.05,
  "3104": 0.05,
  "3106": 0.80,
}

async function companyHasFeature(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  featureCode: string
): Promise<boolean> {
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!roleData?.company_id) return false
  const companyId = roleData.company_id

  const { data: coOverride } = await supabaseAdmin
    .from('company_features')
    .select('enabled, expires_at')
    .eq('company_id', companyId)
    .eq('features.code', featureCode)
    .maybeSingle()
  if (coOverride) {
    if (coOverride.expires_at && new Date(coOverride.expires_at) < new Date()) {
      // fall through
    } else {
      return coOverride.enabled
    }
  }

  const { data: compData } = await supabaseAdmin
    .from('companies')
    .select('plan_id')
    .eq('id', companyId)
    .single()
  if (compData?.plan_id) {
    const { data: planFeature } = await supabaseAdmin
      .from('plan_features')
      .select('enabled')
      .eq('plan_id', compData.plan_id)
      .eq('features.code', featureCode)
      .maybeSingle()
    if (planFeature) return planFeature.enabled
  }

  const { data: feature } = await supabaseAdmin
    .from('features')
    .select('default_enabled')
    .eq('code', featureCode)
    .single()
  return feature?.default_enabled ?? false
}

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

  // ── Get the user's company ID (from the authenticated session) ──
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 400 })
  }
  const companyId = roleData.company_id

  const automationEnabled  = await companyHasFeature(supabase, user.id, 'invoice_automation')
  const profitAllocEnabled = await companyHasFeature(supabase, user.id, 'profit_allocation')

  const body = await request.json()
  const { invoice_no, party_id, invoice_date, due_date, items, reference, notes } = body
  if (!items || items.length === 0)
    return NextResponse.json({ error: 'No items provided' }, { status: 400 })

  try {
    const total_amount = items.reduce((s: number, i: any) => s + (i.qty * i.unit_price), 0)
    const total_cost   = items.reduce((s: number, i: any) => s + (i.qty * (i.cost_price || 0)), 0)
    const total_salary   = automationEnabled ? total_amount * SALARY_RATE : 0
    const total_ads      = automationEnabled ? total_amount * ADS_RATE : 0
    const total_fuel     = automationEnabled ? total_amount * FUEL_RATE : 0
    const total_expenses = total_salary + total_ads + total_fuel
    const net_profit     = total_amount - total_cost - total_expenses

    // Ensure unique invoice number per company (add timestamp if necessary)
    let finalInvoiceNo = invoice_no?.trim() || `INV-${Date.now().toString(36).toUpperCase()}`
    // Check uniqueness
    const { data: existing } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('company_id', companyId)
      .eq('invoice_no', finalInvoiceNo)
      .maybeSingle()
    if (existing) {
      // Append a random suffix to make it unique
      finalInvoiceNo = `${finalInvoiceNo}-${Date.now().toString(36).slice(-4).toUpperCase()}`
    }

    // 1. Create Invoice (with company_id, using service role)
    const { data: inv, error: invErr } = await supabaseAdmin.from("invoices").insert({
      company_id: companyId,
      invoice_no: finalInvoiceNo,
      type: "sale",
      party_id,
      date: invoice_date,
      due_date,
      total: total_amount,
      paid: 0,
      status: "Unpaid",
      reference,
      notes
    }).select("id").single()

    if (invErr) {
      console.error("Invoice insert error:", JSON.stringify(invErr))
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }
    if (!inv) {
      return NextResponse.json({ error: "Failed to create invoice – no row returned" }, { status: 500 })
    }
    const inv_id = inv.id

    // 2. Insert Invoice Items & Update Stock
    for (const item of items) {
      await supabaseAdmin.from("invoice_items").insert({
        company_id: companyId,
        invoice_id: inv_id,
        product_id: item.product_id,
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        total: item.qty * item.unit_price
      })

      if (item.product_id) {
        const { data: prod } = await supabaseAdmin.from("products")
          .select("qty_on_hand")
          .eq("id", item.product_id)
          .eq("company_id", companyId)
          .single()
        if (prod) {
          const new_qty = (prod.qty_on_hand || 0) - item.qty
          await supabaseAdmin.from("products")
            .update({ qty_on_hand: new_qty })
            .eq("id", item.product_id)
            .eq("company_id", companyId)
          await supabaseAdmin.from("stock_moves").insert({
            company_id: companyId,
            product_id: item.product_id,
            move_type: "sale",
            qty: -item.qty,
            unit_price: item.unit_price,
            ref: finalInvoiceNo,
            date: invoice_date
          })
        }
      }
    }

    // 3. Update Customer Balance
    const { data: cust } = await supabaseAdmin.from("customers")
      .select("balance")
      .eq("id", party_id)
      .eq("company_id", companyId)
      .single()
    if (cust) {
      await supabaseAdmin.from("customers")
        .update({ balance: (cust.balance || 0) + total_amount })
        .eq("id", party_id)
        .eq("company_id", companyId)
    }

    // ── 4. GL Entries (using service role to bypass RLS) ──
    // 4a. AR / Sales
    const { data: arAcc } = await supabaseAdmin.from("accounts")
      .select("id,balance").eq("code", "1100").eq("company_id", companyId).single()
    const { data: revAcc } = await supabaseAdmin.from("accounts")
      .select("id,balance").eq("code", "4000").eq("company_id", companyId).single()

    if (arAcc && revAcc) {
      const { data: je1 } = await supabaseAdmin.from("journal_entries").insert({
        company_id: companyId,
        entry_no: `JE-SI-${String(inv_id).padStart(4, "0")}`,
        date: invoice_date,
        description: `Sales Invoice - ${finalInvoiceNo}`
      }).select("id").single()

      if (je1) {
        await supabaseAdmin.from("journal_lines").insert([
          { company_id: companyId, entry_id: je1.id, account_id: arAcc.id, debit: total_amount, credit: 0 },
          { company_id: companyId, entry_id: je1.id, account_id: revAcc.id, debit: 0, credit: total_amount }
        ])
        await supabaseAdmin.from("accounts").update({ balance: arAcc.balance + total_amount }).eq("id", arAcc.id)
        await supabaseAdmin.from("accounts").update({ balance: revAcc.balance + total_amount }).eq("id", revAcc.id)
      }
    }

    // 4b. COGS / Inventory
    if (total_cost > 0) {
      const { data: cogsAcc } = await supabaseAdmin.from("accounts")
        .select("id,balance").eq("code", "5000").eq("company_id", companyId).single()
      const { data: invAcc } = await supabaseAdmin.from("accounts")
        .select("id,balance").eq("code", "1200").eq("company_id", companyId).single()

      if (cogsAcc && invAcc) {
        const { data: je2 } = await supabaseAdmin.from("journal_entries").insert({
          company_id: companyId,
          entry_no: `JE-COGS-${String(inv_id).padStart(4, "0")}`,
          date: invoice_date,
          description: `COGS - ${finalInvoiceNo}`
        }).select("id").single()

        if (je2) {
          await supabaseAdmin.from("journal_lines").insert([
            { company_id: companyId, entry_id: je2.id, account_id: cogsAcc.id, debit: total_cost, credit: 0 },
            { company_id: companyId, entry_id: je2.id, account_id: invAcc.id, debit: 0, credit: total_cost }
          ])
          await supabaseAdmin.from("accounts").update({ balance: cogsAcc.balance + total_cost }).eq("id", cogsAcc.id)
          await supabaseAdmin.from("accounts").update({ balance: invAcc.balance - total_cost }).eq("id", invAcc.id)
        }
      }
    }

    // 4c. Expenses
    if (automationEnabled && total_expenses > 0) {
      const salAcc  = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "5100").eq("company_id", companyId).single()
      const adsAcc  = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "5600").eq("company_id", companyId).single()
      const fuelAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "5700").eq("company_id", companyId).single()
      const apAcc   = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "2001").eq("company_id", companyId).single()

      if (salAcc.data && adsAcc.data && fuelAcc.data && apAcc.data) {
        const { data: je3 } = await supabaseAdmin.from("journal_entries").insert({
          company_id: companyId,
          entry_no: `JE-EXP-${String(inv_id).padStart(4, "0")}`,
          date: invoice_date,
          description: `Expenses - ${finalInvoiceNo}`
        }).select("id").single()

        if (je3) {
          await supabaseAdmin.from("journal_lines").insert([
            { company_id: companyId, entry_id: je3.id, account_id: salAcc.data.id, debit: total_salary, credit: 0 },
            { company_id: companyId, entry_id: je3.id, account_id: adsAcc.data.id, debit: total_ads, credit: 0 },
            { company_id: companyId, entry_id: je3.id, account_id: fuelAcc.data.id, debit: total_fuel, credit: 0 },
            { company_id: companyId, entry_id: je3.id, account_id: apAcc.data.id, debit: 0, credit: total_expenses }
          ])
        }
      }
    }

    // 4d. Profit allocation
    if (automationEnabled && profitAllocEnabled && net_profit > 0) {
      const { data: retAcc } = await supabaseAdmin.from("accounts")
        .select("id,balance").eq("code", "3100").eq("company_id", companyId).single()

      if (retAcc) {
        const { data: je4 } = await supabaseAdmin.from("journal_entries").insert({
          company_id: companyId,
          entry_no: `JE-PRF-${String(inv_id).padStart(4, "0")}`,
          date: invoice_date,
          description: `Profit Allocation - ${finalInvoiceNo}`
        }).select("id").single()

        if (je4) {
          const lines = [{ company_id: companyId, entry_id: je4.id, account_id: retAcc.id, debit: net_profit, credit: 0 }]
          for (const [code, share] of Object.entries(PARTNER_SHARES)) {
            const { data: pAcc } = await supabaseAdmin.from("accounts")
              .select("id,balance").eq("code", code).eq("company_id", companyId).single()
            if (pAcc) {
              lines.push({ company_id: companyId, entry_id: je4.id, account_id: pAcc.id, debit: 0, credit: net_profit * share })
            }
          }
          await supabaseAdmin.from("journal_lines").insert(lines)
        }
      }
    }

    const { data: createdInvoice } = await supabaseAdmin.from("invoices")
      .select("id, invoice_no, total, date").eq("id", inv_id).single()

    return NextResponse.json({ success: true, invoice_id: inv_id, invoice: createdInvoice })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}