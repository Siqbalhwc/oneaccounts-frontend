import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helpers ────────────────────────────────────────────────────────────────
async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
}

async function createJE(supabase: any, companyId: string, date: string, description: string, lines: any[]) {
  const { data: entry } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-INV-${Date.now()}`,
    date,
    description,
  }).select('id').single()
  if (!entry) return
  const lineRows = lines.map(l => ({ ...l, entry_id: entry.id, company_id: companyId }))
  await supabase.from('journal_lines').insert(lineRows)
  // Update account balances
  for (const l of lines) {
    const { data: acc } = await supabase.from('accounts').select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
    if (acc) {
      const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
      await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
    }
  }
}

// ═══════════════════ POST ═══════════════════
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
  const { invoice_no, party_id, invoice_date, due_date, items, reference, notes, enable_automation, enable_profit_allocation } = body

  if (!invoice_no || !party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  // 1. Insert invoice header
  const { data: inv, error: headerError } = await supabase
    .from('invoices')
    .insert({
      invoice_no,
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
    })
    .select('*')
    .single()

  if (headerError || !inv) {
    return NextResponse.json({ error: headerError?.message || 'Failed to create invoice' }, { status: 500 })
  }

  // 2. Insert items
  let total = 0
  const itemRows = items.map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: inv.id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      product_id: item.product_id || null,
      cost_price: item.cost_price || 0,
      company_id: companyId,
    }
  })
  if (itemRows.length > 0) await supabase.from('invoice_items').insert(itemRows)

  // Update total
  const { data: updatedInv } = await supabase
    .from('invoices')
    .update({ total })
    .eq('id', inv.id)
    .select('*')
    .single()

  if (!updatedInv) {
    return NextResponse.json({ error: 'Failed to update total' }, { status: 500 })
  }

  // 3. Journal entries
  try {
    const arAccount = await getAccount(supabase, '1100', companyId)   // Accounts Receivable
    const revenueAccount = await getAccount(supabase, '4000', companyId) // default Revenue

    if (!arAccount || !revenueAccount) throw new Error('AR or Revenue account missing')

    const jeLines: any[] = [
      { account_id: arAccount.id, debit: total, credit: 0 },
      { account_id: revenueAccount.id, debit: 0, credit: total },
    ]

    // Automation: load config from company_settings
    if (enable_automation) {
      const { data: settings } = await supabase.from('company_settings')
        .select('invoice_automation_config')
        .eq('company_id', companyId).maybeSingle()
      let expenseRules: any[] = []
      if (settings?.invoice_automation_config?.expenseRules) {
        expenseRules = settings.invoice_automation_config.expenseRules
      } else {
        // fallback to old hardcoded rates
        expenseRules = [
          { name: 'Salaries', rate: 4, account_id: null },
          { name: 'Advertising', rate: 0.5, account_id: null },
          { name: 'Fuel', rate: 0.5, account_id: null },
        ]
      }
      for (const rule of expenseRules) {
        const amount = (total * rule.rate) / 100
        if (amount <= 0) continue
        const accId = rule.account_id || (await getAccount(supabase, '5000', companyId))?.id
        if (accId) {
          jeLines.push({ account_id: accId, debit: amount, credit: 0 })
          jeLines[1].credit += amount   // reduce the revenue credit by the expense amount (or you can add a separate line for expense)
        }
      }
    }

    // Profit allocation (simplified – just notes for now; real allocation would split net profit to partner accounts)
    // We'll just add a note or can be extended later

    await createJE(supabase, companyId, invoice_date, `Sales Invoice ${invoice_no}`, jeLines)
  } catch (e: any) {
    // JE failed – rollback
    await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)
    await supabase.from('invoices').delete().eq('id', inv.id)
    return NextResponse.json({ error: 'Journal entry failed: ' + e.message }, { status: 500 })
  }

  // 4. Audit log
  await logDataChange('invoices', String(updatedInv.id), 'INSERT', undefined, updatedInv)

  return NextResponse.json({ success: true, invoice: updatedInv })
}