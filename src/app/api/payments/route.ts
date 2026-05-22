import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ── Helpers ───────────────────────────────────────────────────────────
async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
}

// ── Generate sequential payment number: PAY/YYYYMM/0001 ───────────────
async function generatePaymentNo(companyId: string): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const prefix = `PAY/${ym}/`
  const { data } = await supabaseAdmin
    .from('payments')
    .select('payment_no')
    .eq('company_id', companyId)
    .like('payment_no', `${prefix}%`)
    .order('payment_no', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (data && data.length > 0) {
    const match = data[0].payment_no.match(/\/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`
}

// ═══════════════════ POST – Create Payment ═══════════════════
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

  const {
    party_id, amount, payment_method, bank_account_id,
    expense_account_id, date, reference, notes, allocations
  } = await request.json()

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
  }

  // ── Generate unique payment number with retry ────────────────────────
  let payNo = ''
  let payment: any = null
  let insertErr: any = null

  for (let attempt = 0; attempt < 3; attempt++) {
    payNo = await generatePaymentNo(companyId)

    const result = await supabaseAdmin.from("payments").insert({
      company_id: companyId,
      payment_no: payNo,
      payment_type: expense_account_id ? 'expense' : 'supplier_payment',
      party_type: expense_account_id ? null : 'supplier',
      party_id: expense_account_id ? null : party_id,
      payment_date: date || new Date().toISOString().split('T')[0],
      amount,
      payment_method,
      bank_account_id: bank_account_id || null,
      expense_account_id: expense_account_id || null,
      reference,
      notes,
      created_by: user?.email || null,
      updated_by: user?.email || null,
    }).select('*').single()

    insertErr = result.error
    payment = result.data

    if (!insertErr) break

    if (insertErr.message?.includes('duplicate key') && attempt < 2) {
      continue
    }
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 })
  }

  if (!payment) {
    return NextResponse.json({ error: 'Failed to create payment after multiple attempts.' }, { status: 500 })
  }

  // ── Allocations to purchase bills (only for supplier payments) ───────
  let totalAllocated = 0
  if (!expense_account_id && allocations && Array.isArray(allocations) && allocations.length > 0) {
    for (const alloc of allocations) {
      const billId = alloc.bill_id
      const allocAmount = parseFloat(alloc.amount) || 0
      if (allocAmount <= 0) continue

      const { data: bill } = await supabaseAdmin
        .from('invoices')
        .select('paid, total, status')
        .eq('id', billId)
        .eq('company_id', companyId)
        .eq('type', 'purchase')
        .single()

      if (bill) {
        const newPaid = (bill.paid || 0) + allocAmount
        const newStatus = newPaid >= bill.total ? 'Paid' : 'Partial'
        await supabaseAdmin.from('invoices')
          .update({ paid: newPaid, status: newStatus })
          .eq('id', billId)
          .eq('company_id', companyId)
      }

      await supabaseAdmin.from('payment_allocations').insert({
        payment_id: payment.id,
        bill_id: billId,
        amount: allocAmount,
        company_id: companyId,
      })
      totalAllocated += allocAmount
    }
  }

  // ── Update supplier balance ─────────────────────────────────────────
  if (party_id) {
    const { data: supp } = await supabaseAdmin.from('suppliers')
      .select('balance').eq('id', party_id).eq('company_id', companyId).single()
    if (supp) {
      await supabaseAdmin.from('suppliers')
        .update({ balance: (supp.balance || 0) - amount })
        .eq('id', party_id).eq('company_id', companyId)
    }
  }

  // ── Determine the bank's GL account ────────────────────────────────
  let bankGlAccountId: number | null = null
  if (bank_account_id) {
    const { data: bank } = await supabaseAdmin.from('bank_accounts')
      .select('account_id')
      .eq('id', bank_account_id)
      .eq('company_id', companyId)
      .single()
    if (bank) bankGlAccountId = bank.account_id
  }
  if (!bankGlAccountId) {
    const cashFallback = await getAccount(supabaseAdmin, '1000', companyId)
    if (cashFallback) bankGlAccountId = cashFallback.id
  }
  if (!bankGlAccountId) {
    return NextResponse.json({ error: 'No bank GL account found.' }, { status: 500 })
  }

  // ── Journal Entry ──────────────────────────────────────────────────
  const jeLines: any[] = []
  let description = `Payment - ${payNo}`

  if (expense_account_id) {
    // Donation / Other Expense: Debit expense, Credit bank
    jeLines.push({ account_id: expense_account_id, debit: amount, credit: 0 })
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    description = `Expense Payment - ${payNo}`
  } else {
    // Normal supplier payment: Debit AP (2000), Credit bank
    const apAcc = await getAccount(supabaseAdmin, '2000', companyId)
    if (apAcc) {
      jeLines.push({ account_id: apAcc.id, debit: amount, credit: 0 })
      jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    } else {
      // Fallback: just credit bank and let the debit be handled manually? We'll just error for safety.
      return NextResponse.json({ error: 'Accounts Payable (2000) not found' }, { status: 500 })
    }
  }

  // Insert journal entry and lines
  const { data: entry, error: entryErr } = await supabaseAdmin.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-PAY-${payNo}`,
    date: date || new Date().toISOString().split('T')[0],
    description,
  }).select('id').single()

  if (entryErr || !entry) {
    return NextResponse.json({ error: entryErr?.message || 'JE insert failed' }, { status: 500 })
  }

  const lineRows = jeLines.map(l => ({
    ...l,
    entry_id: entry.id,
    company_id: companyId,
    source_type: 'payment',
    source_id: payment.id,
  }))
  await supabaseAdmin.from('journal_lines').insert(lineRows)

  // Update account balances
  for (const l of jeLines) {
    const { data: acc } = await supabaseAdmin.from('accounts')
      .select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
    if (acc) {
      const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
      await supabaseAdmin.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
    }
  }

  // Audit log with user email
  const { data: { user: auditUser } } = await supabase.auth.getUser()
  await supabaseAdmin.from("data_change_logs").insert({
    table_name: "payments",
    record_id: String(payment.id),
    action: "INSERT",
    old_data: null,
    new_data: payment,
    changed_by: auditUser?.email || auditUser?.id || null,
    changed_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true, payment_no: payNo, payment })
}