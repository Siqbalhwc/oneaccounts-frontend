import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helpers ───────────────────────────────────────────────────────────
async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
}

// ── Generate sequential payment number: PAY/YYYYMM/0001 ───────────────
async function generatePaymentNo(supabase: any, companyId: string): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const prefix = `PAY/${ym}/`
  const { data } = await supabase
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

// ✅ Helper to reverse a single payment (used by PUT and DELETE)
async function reversePayment(supabase: any, paymentId: number, paymentNo: string, companyId: string) {
  // 1. Reverse bill allocations
  const { data: allocations } = await supabase
    .from("payment_allocations")
    .select("*")
    .eq("payment_id", paymentId)

  if (allocations) {
    for (const alloc of allocations) {
      const { data: bill } = await supabase
        .from("invoices")
        .select("paid, total")
        .eq("id", alloc.bill_id)
        .eq("company_id", companyId)
        .eq("type", "purchase")
        .single()
      if (bill) {
        const newPaid = (bill.paid || 0) - alloc.amount
        const newStatus = newPaid >= (bill.total || 0) ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'
        await supabase.from("invoices")
          .update({ paid: newPaid, status: newStatus })
          .eq("id", alloc.bill_id)
          .eq("company_id", companyId)
      }
    }
    await supabase.from("payment_allocations").delete().eq("payment_id", paymentId)
  }

  // 2. Reverse journal entries – ONLY the ones for this payment
  const descriptions = [
    `Payment - ${paymentNo}`,
    `Expense Payment - ${paymentNo}`,
  ]

  for (const desc of descriptions) {
    const { data: oldJE } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("description", desc)

    if (oldJE) {
      for (const je of oldJE) {
        const { data: lines } = await supabase
          .from("journal_lines")
          .select("account_id, debit, credit")
          .eq("entry_id", je.id)
        if (lines) {
          for (const l of lines) {
            const { data: acc } = await supabase
              .from("accounts")
              .select("balance")
              .eq("id", l.account_id)
              .eq("company_id", companyId)
              .single()
            if (acc) {
              const newBal = acc.balance - (l.debit || 0) + (l.credit || 0)
              await supabase.from("accounts")
                .update({ balance: newBal })
                .eq("id", l.account_id)
                .eq("company_id", companyId)
            }
          }
        }
        await supabase.from("journal_lines").delete().eq("entry_id", je.id)
        await supabase.from("journal_entries").delete().eq("id", je.id)
      }
    }
  }

  // 3. Reverse supplier balance
  const { data: payment } = await supabase
    .from("payments")
    .select("party_id, amount")
    .eq("id", paymentId)
    .single()
  if (payment?.party_id) {
    const { data: supp } = await supabase
      .from("suppliers")
      .select("balance")
      .eq("id", payment.party_id)
      .eq("company_id", companyId)
      .single()
    if (supp) {
      await supabase.from("suppliers")
        .update({ balance: (supp.balance || 0) + payment.amount })
        .eq("id", payment.party_id)
        .eq("company_id", companyId)
    }
  }
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

  // Determine payment type
  const isExpense = !!expense_account_id
  const paymentType = isExpense ? 'expense' : 'supplier_payment'
  const partyType = isExpense ? 'expense' : 'supplier'
  const targetPartyId = isExpense ? null : party_id

  // ── Generate unique payment number with retry ────────────────────────
  let payNo = ''
  let payment: any = null

  for (let attempt = 0; attempt < 3; attempt++) {
    payNo = await generatePaymentNo(supabase, companyId)

    const result = await supabase.from("payments").insert({
      company_id: companyId,
      payment_no: payNo,
      payment_type: paymentType,
      party_type: partyType,
      party_id: targetPartyId,
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

    if (!result.error) {
      payment = result.data
      break
    }

    if (result.error.message?.includes('duplicate key') && attempt < 2) {
      continue
    }
    return NextResponse.json({ error: result.error?.message || 'Insert failed' }, { status: 500 })
  }

  if (!payment) {
    return NextResponse.json({ error: 'Failed to create payment after multiple attempts.' }, { status: 500 })
  }

  // ── Allocations to purchase bills (only for supplier payments) ───────
  let totalAllocated = 0
  if (!isExpense && allocations && Array.isArray(allocations) && allocations.length > 0) {
    for (const alloc of allocations) {
      const billId = alloc.bill_id
      const allocAmount = parseFloat(alloc.amount) || 0
      if (allocAmount <= 0) continue

      const { data: bill } = await supabase
        .from('invoices')
        .select('paid, total, status')
        .eq('id', billId)
        .eq('company_id', companyId)
        .eq('type', 'purchase')
        .single()

      if (bill) {
        const newPaid = (bill.paid || 0) + allocAmount
        const newStatus = newPaid >= bill.total ? 'Paid' : 'Partial'
        await supabase.from('invoices')
          .update({ paid: newPaid, status: newStatus })
          .eq('id', billId)
          .eq('company_id', companyId)
      }

      await supabase.from('payment_allocations').insert({
        payment_id: payment.id,
        bill_id: billId,
        amount: allocAmount,
        company_id: companyId,
      })
      totalAllocated += allocAmount
    }
  }

  // ── Update supplier balance ─────────────────────────────────────────
  if (targetPartyId) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', targetPartyId).eq('company_id', companyId).single()
    if (supp) {
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) - amount })
        .eq('id', targetPartyId).eq('company_id', companyId)
    }
  }

  // ── Determine the bank's GL account ────────────────────────────────
  let bankGlAccountId: number | null = null
  if (bank_account_id) {
    const { data: bank } = await supabase.from('bank_accounts')
      .select('account_id')
      .eq('id', bank_account_id)
      .eq('company_id', companyId)
      .single()
    if (bank) bankGlAccountId = bank.account_id
  }
  if (!bankGlAccountId) {
    const cashFallback = await getAccount(supabase, '1000', companyId)
    if (cashFallback) bankGlAccountId = cashFallback.id
  }
  if (!bankGlAccountId) {
    return NextResponse.json({ error: 'No bank GL account found.' }, { status: 500 })
  }

  // ── Journal Entry ──────────────────────────────────────────────────
  const jeLines: any[] = []
  let description = `Payment - ${payNo}`

  if (isExpense) {
    // Expense payment: Debit expense account, Credit bank
    jeLines.push({ account_id: expense_account_id, debit: amount, credit: 0 })
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    description = `Expense Payment - ${payNo}`
  } else {
    // Supplier payment: Debit AP (2000), Credit bank
    const apAcc = await getAccount(supabase, '2000', companyId)
    if (apAcc) {
      jeLines.push({ account_id: apAcc.id, debit: amount, credit: 0 })
      jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    } else {
      return NextResponse.json({ error: 'Accounts Payable (2000) not found' }, { status: 500 })
    }
  }

  // Insert journal entry and lines
  const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
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
  await supabase.from('journal_lines').insert(lineRows)

  // Update account balances
  for (const l of jeLines) {
    const { data: acc } = await supabase.from('accounts')
      .select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
    if (acc) {
      const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
      await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
    }
  }

  // Audit log with user email
  await supabase.from("data_change_logs").insert({
    table_name: "payments",
    record_id: String(payment.id),
    action: "INSERT",
    old_data: null,
    new_data: payment,
    changed_by: user?.email || user?.id || null,
    changed_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true, payment_no: payNo, payment })
}

// ═══════════════════ PUT – Update Payment ═══════════════════
export async function PUT(request: NextRequest) {
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

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Payment ID required' }, { status: 400 })

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  const body = await request.json()

  // Fetch old payment
  const { data: oldPayment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single()
  if (!oldPayment) return NextResponse.json({ error: "Payment not found" }, { status: 404 })

  // ✅ Reverse old effects using exact payment number
  await reversePayment(supabase, Number(id), oldPayment.payment_no, companyId)

  const {
    party_id, amount, payment_method, bank_account_id,
    expense_account_id, date, reference, notes, allocations
  } = body

  // Determine payment type
  const isExpense = !!expense_account_id
  const paymentType = isExpense ? 'expense' : 'supplier_payment'
  const partyType = isExpense ? 'expense' : 'supplier'
  const targetPartyId = isExpense ? null : party_id

  // Update payment header
  const { data: updatedPayment, error: updateErr } = await supabase
    .from("payments")
    .update({
      party_id: targetPartyId,
      payment_date: date || oldPayment.payment_date,
      amount,
      payment_method,
      bank_account_id: bank_account_id || null,
      expense_account_id: expense_account_id || null,
      reference,
      notes,
      payment_type: paymentType,
      party_type: partyType,
      updated_by: user?.email || null,
    })
    .eq("id", id)
    .select("*")
    .single()

  if (updateErr || !updatedPayment) {
    return NextResponse.json({ error: updateErr?.message || 'Update failed' }, { status: 500 })
  }

  // ── Allocations to purchase bills (only for supplier payments) ───────
  if (!isExpense && allocations && Array.isArray(allocations) && allocations.length > 0) {
    for (const alloc of allocations) {
      const billId = alloc.bill_id
      const allocAmount = parseFloat(alloc.amount) || 0
      if (allocAmount <= 0) continue

      const { data: bill } = await supabase
        .from('invoices')
        .select('paid, total, status')
        .eq('id', billId)
        .eq('company_id', companyId)
        .eq('type', 'purchase')
        .single()

      if (bill) {
        const newPaid = (bill.paid || 0) + allocAmount
        const newStatus = newPaid >= bill.total ? 'Paid' : 'Partial'
        await supabase.from('invoices')
          .update({ paid: newPaid, status: newStatus })
          .eq('id', billId)
          .eq('company_id', companyId)
      }

      await supabase.from('payment_allocations').insert({
        payment_id: Number(id),
        bill_id: billId,
        amount: allocAmount,
        company_id: companyId,
      })
    }
  }

  // ── Update supplier balance ─────────────────────────────────────────
  if (targetPartyId) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', targetPartyId).eq('company_id', companyId).single()
    if (supp) {
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) - amount })
        .eq('id', targetPartyId).eq('company_id', companyId)
    }
  }

  // ── Journal Entry (new) ─────────────────────────────────────────────
  let bankGlAccountId: number | null = null
  if (bank_account_id) {
    const { data: bank } = await supabase.from('bank_accounts')
      .select('account_id')
      .eq('id', bank_account_id)
      .eq('company_id', companyId)
      .single()
    if (bank) bankGlAccountId = bank.account_id
  }
  if (!bankGlAccountId) {
    const cashFallback = await getAccount(supabase, '1000', companyId)
    if (cashFallback) bankGlAccountId = cashFallback.id
  }
  if (!bankGlAccountId) {
    return NextResponse.json({ error: 'No bank GL account found.' }, { status: 500 })
  }

  const jeLines: any[] = []
  let description = `Payment - ${oldPayment.payment_no}`   // reuse original number

  if (isExpense) {
    jeLines.push({ account_id: expense_account_id, debit: amount, credit: 0 })
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    description = `Expense Payment - ${oldPayment.payment_no}`
  } else {
    const apAcc = await getAccount(supabase, '2000', companyId)
    if (apAcc) {
      jeLines.push({ account_id: apAcc.id, debit: amount, credit: 0 })
      jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    } else {
      return NextResponse.json({ error: 'Accounts Payable (2000) not found' }, { status: 500 })
    }
  }

  const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-PAY-${Date.now()}-${id}`,
    date: date || oldPayment.payment_date,
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
    source_id: Number(id),
  }))
  await supabase.from('journal_lines').insert(lineRows)

  for (const l of jeLines) {
    const { data: acc } = await supabase.from('accounts')
      .select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
    if (acc) {
      const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
      await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
    }
  }

  await logDataChange('payments', id, 'UPDATE', oldPayment, updatedPayment)
  return NextResponse.json({ success: true, payment: updatedPayment })
}

// ═══════════════════ DELETE – Delete Payment ═══════════════════
export async function DELETE(request: NextRequest) {
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

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Payment ID required' }, { status: 400 })

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  // Fetch payment to get payment_no for reversal
  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single()
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 })

  // Reverse all effects
  await reversePayment(supabase, Number(id), payment.payment_no, companyId)

  // Soft‑delete the payment
  await supabase.from("payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)

  await logDataChange('payments', id, 'DELETE', payment, null)
  return NextResponse.json({ success: true })
}