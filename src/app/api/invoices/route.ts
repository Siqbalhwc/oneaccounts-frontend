import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Service‑role admin client (no cookies needed)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
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

  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Get the user's active company
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 400 })
  }
  const companyId = roleData.company_id

  // 3. Feature checks (using service‑role, scoped to the user's company)
  const getFeature = async (code: string) => {
    const { data: co } = await supabaseAdmin.from('company_features')
      .select('enabled').eq('company_id', companyId).eq('features.code', code).maybeSingle()
    if (co) return co.enabled
    const { data: plan } = await supabaseAdmin.from('companies')
      .select('plan_id').eq('id', companyId).single()
    if (plan?.plan_id) {
      const { data: pf } = await supabaseAdmin.from('plan_features')
        .select('enabled').eq('plan_id', plan.plan_id).eq('features.code', code).maybeSingle()
      if (pf) return pf.enabled
    }
    const { data: feat } = await supabaseAdmin.from('features')
      .select('default_enabled').eq('code', code).single()
    return feat?.default_enabled ?? false
  }

  const automationEnabled  = await getFeature('invoice_automation')
  const profitAllocEnabled = await getFeature('profit_allocation')

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

    // 4. Unique invoice number per company
    let finalInvoiceNo = invoice_no?.trim() || `INV-${Date.now().toString(36).toUpperCase()}`
    let tries = 0
    while (tries < 3) {
      const { data: existing } = await supabaseAdmin
        .from('invoices')
        .select('id')
        .eq('company_id', companyId)
        .eq('invoice_no', finalInvoiceNo)
        .maybeSingle()
      if (!existing) break
      finalInvoiceNo = `${finalInvoiceNo}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      tries++
    }

    // 5. Insert invoice
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
    if (!inv) return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 })
    const inv_id = inv.id

    // 6. Items & stock (all scoped to companyId)
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
          .select("qty_on_hand").eq("id", item.product_id).eq("company_id", companyId).single()
        if (prod) {
          await supabaseAdmin.from("products")
            .update({ qty_on_hand: (prod.qty_on_hand || 0) - item.qty })
            .eq("id", item.product_id).eq("company_id", companyId)
          await supabaseAdmin.from("stock_moves").insert({
            company_id: companyId,
            product_id: item.product_id, move_type: "sale",
            qty: -item.qty, unit_price: item.unit_price,
            ref: finalInvoiceNo, date: invoice_date
          })
        }
      }
    }

    // 7. Customer balance
    const { data: cust } = await supabaseAdmin.from("customers")
      .select("balance").eq("id", party_id).eq("company_id", companyId).single()
    if (cust) {
      await supabaseAdmin.from("customers")
        .update({ balance: (cust.balance || 0) + total_amount })
        .eq("id", party_id).eq("company_id", companyId)
    }

    // 8. GL Entries (all with company_id)
    const postGL = async (entryNo: string, description: string, lines: any[]) => {
      const { data: entry } = await supabaseAdmin.from("journal_entries").insert({
        company_id: companyId,
        entry_no: entryNo,
        date: invoice_date,
        description,
      }).select("id").single()
      if (entry) {
        await supabaseAdmin.from("journal_lines").insert(
          lines.map(l => ({ ...l, company_id: companyId, entry_id: entry.id }))
        )
      }
    }

    // AR / Sales
    const arAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "1100").eq("company_id", companyId).single()
    const revAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "4000").eq("company_id", companyId).single()
    if (arAcc.data && revAcc.data) {
      await postGL(`JE-SI-${String(inv_id).padStart(4, "0")}`, `Sales Invoice - ${finalInvoiceNo}`, [
        { account_id: arAcc.data.id, debit: total_amount, credit: 0 },
        { account_id: revAcc.data.id, debit: 0, credit: total_amount },
      ])
      await supabaseAdmin.from("accounts").update({ balance: arAcc.data.balance + total_amount }).eq("id", arAcc.data.id)
      await supabaseAdmin.from("accounts").update({ balance: revAcc.data.balance + total_amount }).eq("id", revAcc.data.id)
    }

    // COGS
    if (total_cost > 0) {
      const cogsAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "5000").eq("company_id", companyId).single()
      const invAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "1200").eq("company_id", companyId).single()
      if (cogsAcc.data && invAcc.data) {
        await postGL(`JE-COGS-${String(inv_id).padStart(4, "0")}`, `COGS - ${finalInvoiceNo}`, [
          { account_id: cogsAcc.data.id, debit: total_cost, credit: 0 },
          { account_id: invAcc.data.id, debit: 0, credit: total_cost },
        ])
        await supabaseAdmin.from("accounts").update({ balance: cogsAcc.data.balance + total_cost }).eq("id", cogsAcc.data.id)
        await supabaseAdmin.from("accounts").update({ balance: invAcc.data.balance - total_cost }).eq("id", invAcc.data.id)
      }
    }

    // Expenses (only if automation enabled)
    if (automationEnabled && total_expenses > 0) {
      const salAcc  = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "5100").eq("company_id", companyId).single()
      const adsAcc  = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "5600").eq("company_id", companyId).single()
      const fuelAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "5700").eq("company_id", companyId).single()
      const apAcc   = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "2001").eq("company_id", companyId).single()
      if (salAcc.data && adsAcc.data && fuelAcc.data && apAcc.data) {
        await postGL(`JE-EXP-${String(inv_id).padStart(4, "0")}`, `Expenses - ${finalInvoiceNo}`, [
          { account_id: salAcc.data.id, debit: total_salary, credit: 0 },
          { account_id: adsAcc.data.id, debit: total_ads, credit: 0 },
          { account_id: fuelAcc.data.id, debit: total_fuel, credit: 0 },
          { account_id: apAcc.data.id, debit: 0, credit: total_expenses },
        ])
      }
    }

    // Profit allocation
    if (automationEnabled && profitAllocEnabled && net_profit > 0) {
      const retAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", "3100").eq("company_id", companyId).single()
      if (retAcc.data) {
        const lines = [{ account_id: retAcc.data.id, debit: net_profit, credit: 0 }]
        for (const [code, share] of Object.entries(PARTNER_SHARES)) {
          const pAcc = await supabaseAdmin.from("accounts").select("id,balance").eq("code", code).eq("company_id", companyId).single()
          if (pAcc.data) lines.push({ account_id: pAcc.data.id, debit: 0, credit: net_profit * share })
        }
        await postGL(`JE-PRF-${String(inv_id).padStart(4, "0")}`, `Profit Allocation - ${finalInvoiceNo}`, lines)
      }
    }

    const { data: createdInvoice } = await supabaseAdmin.from("invoices")
      .select("id, invoice_no, total, date").eq("id", inv_id).single()

    return NextResponse.json({ success: true, invoice_id: inv_id, invoice: createdInvoice })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}