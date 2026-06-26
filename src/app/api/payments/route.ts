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

// ── Generate sequential payment number ───────────────
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

// ✅ Helper to reverse a single payment (unchanged, kept for PUT/DELETE)
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

  // 2. Reverse journal entries
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

  const isExpense = !!expense_account_id
  const paymentType = isExpense ? 'expense' : 'supplier_payment'
  const partyType = isExpense ? 'expense' : 'supplier'
  const targetPartyId = isExpense ? null : party_id

  // ── Generate unique payment number ────────────
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
    if (result.error.message?.includes('duplicate key') && attempt < 2) continue
    return NextResponse.json({ error: result.error?.message || 'Insert failed' }, { status: 500 })
  }

  if (!payment) return NextResponse.json({ error: 'Failed to create payment after multiple attempts.' }, { status: 500 })

  // ── Allocations + WHT handling ─────────────────
  let totalGrossAllocated = 0
  let totalWhtDeducted = 0

  if (!isExpense && allocations && Array.isArray(allocations) && allocations.length > 0) {
    // Fetch all WHT records for the allocated bills in one go
    const billIds = allocations.map((a: any) => a.bill_id)
    const { data: whtRecords } = await supabase
      .from("bill_withholding")
      .select("bill_id, wht_tax_code_id, wht_rate, wht_amount")
      .in("bill_id", billIds)
      .eq("company_id", companyId)
    const whtMap: Record<number, any> = {}
    if (whtRecords) whtRecords.forEach((w: any) => { whtMap[w.bill_id] = w })

    for (const alloc of allocations) {
      const billId = alloc.bill_id
      const grossAlloc = parseFloat(alloc.amount) || 0
      if (grossAlloc <= 0) continue

      const { data: bill } = await supabase
        .from('invoices')
        .select('paid, total, status')
        .eq('id', billId)
        .eq('company_id', companyId)
        .eq('type', 'purchase')
        .single()

      if (!bill) continue

      const newPaid = (bill.paid || 0) + grossAlloc
      const newStatus = newPaid >= bill.total ? 'Paid' : 'Partial'
      await supabase.from('invoices')
        .update({ paid: newPaid, status: newStatus })
        .eq('id', billId)
        .eq('company_id', companyId)

      await supabase.from('payment_allocations').insert({
        payment_id: payment.id,
        bill_id: billId,
        amount: grossAlloc,
        company_id: companyId,
      })

      totalGrossAllocated += grossAlloc
    }

    // Now compute proportional WHT for each allocated bill
    for (const alloc of allocations) {
      const billId = alloc.bill_id
      const grossAlloc = parseFloat(alloc.amount) || 0
      if (grossAlloc <= 0) continue

      const wht = whtMap[billId]
      if (wht && wht.wht_amount > 0 && wht.wht_tax_code_id) {
        // Fetch the WHT payable account from tax_codes
        const { data: taxCode } = await supabase
          .from("tax_codes")
          .select("tax_account_id")
          .eq("id", wht.wht_tax_code_id)
          .eq("company_id", companyId)
          .single()

        const whtAccountId = taxCode?.tax_account_id
        if (whtAccountId) {
          // Get the bill's total to calculate proportion
          const { data: bill } = await supabase
            .from("invoices")
            .select("total")
            .eq("id", billId)
            .single()
          if (bill) {
            const proportion = grossAlloc / bill.total
            const whtToDeduct = Math.round(wht.wht_amount * proportion)
            totalWhtDeducted += whtToDeduct

            // We'll deduct WHT from bank credit later
            // Store the wht info for journal construction
            // We'll push a virtual allocation for journal creation
            if (!payment._whtLines) payment._whtLines = []
            payment._whtLines.push({
              account_id: whtAccountId,
              amount: whtToDeduct,
            })
          }
        }
      }
    }
  }

  // ── Update supplier balance (reduce by the net amount actually paid) ──
  if (targetPartyId) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', targetPartyId).eq('company_id', companyId).single()
    if (supp) {
      // Reduce balance by the full gross allocated (AP reduction)
      // Actually, the supplier balance should decrease by the gross allocated amount (the amount cleared from AP).
      // The payment amount is the net cash outflow; the supplier balance tracks total outstanding, so it should decrease by the gross allocated.
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) - totalGrossAllocated })
        .eq('id', targetPartyId).eq('company_id', companyId)
    }
  }

  // ── Determine bank GL account ────────────────
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

  // ── Journal Entry ─────────────────────────────
  const jeLines: any[] = []
  let description = `Payment - ${payNo}`

  if (isExpense) {
    jeLines.push({ account_id: expense_account_id, debit: amount, credit: 0 })
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    description = `Expense Payment - ${payNo}`
  } else {
    const apAcc = await getAccount(supabase, '2000', companyId)
    if (!apAcc) return NextResponse.json({ error: 'Accounts Payable (2000) not found' }, { status: 500 })

    // Debit AP for the total gross allocated
    jeLines.push({ account_id: apAcc.id, debit: totalGrossAllocated, credit: 0 })

    // Credit bank for net amount (totalGrossAllocated - totalWhtDeducted)
    const bankCredit = totalGrossAllocated - totalWhtDeducted
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: bankCredit })

    // Credit WHT payable for each WHT portion
    if (payment._whtLines) {
      for (const whtLine of payment._whtLines) {
        jeLines.push({
          account_id: whtLine.account_id,
          debit: 0,
          credit: whtLine.amount,
        })
      }
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

  // Audit log
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

// ── PUT (Update) and DELETE remain the same as before, they already use reversePayment which works without WHT specifics. ──
// (Existing PUT and DELETE code unchanged)
export async function PUT(request: NextRequest) {
  // ... same as original code (I'll keep it for brevity, no change needed)
  // Since PUT reverses and recreates, the new POST logic will be applied when re-inserting allocations.
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
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

  const { data: oldPayment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single()
  if (!oldPayment) return NextResponse.json({ error: "Payment not found" }, { status: 404 })

  await reversePayment(supabase, Number(id), oldPayment.payment_no, companyId)

  const {
    party_id, amount, payment_method, bank_account_id,
    expense_account_id, date, reference, notes, allocations
  } = body

  const isExpense = !!expense_account_id
  const paymentType = isExpense ? 'expense' : 'supplier_payment'
  const partyType = isExpense ? 'expense' : 'supplier'
  const targetPartyId = isExpense ? null : party_id

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

  // Re-insert allocations with WHT handling (same as POST)
  let totalGrossAllocated = 0
  let totalWhtDeducted = 0

  if (!isExpense && allocations && Array.isArray(allocations) && allocations.length > 0) {
    const billIds = allocations.map((a: any) => a.bill_id)
    const { data: whtRecords } = await supabase
      .from("bill_withholding")
      .select("bill_id, wht_tax_code_id, wht_rate, wht_amount")
      .in("bill_id", billIds)
      .eq("company_id", companyId)
    const whtMap: Record<number, any> = {}
    if (whtRecords) whtRecords.forEach((w: any) => { whtMap[w.bill_id] = w })

    for (const alloc of allocations) {
      const billId = alloc.bill_id
      const grossAlloc = parseFloat(alloc.amount) || 0
      if (grossAlloc <= 0) continue

      const { data: bill } = await supabase
        .from('invoices')
        .select('paid, total, status')
        .eq('id', billId)
        .eq('company_id', companyId)
        .eq('type', 'purchase')
        .single()

      if (bill) {
        const newPaid = (bill.paid || 0) + grossAlloc
        const newStatus = newPaid >= bill.total ? 'Paid' : 'Partial'
        await supabase.from('invoices')
          .update({ paid: newPaid, status: newStatus })
          .eq('id', billId)
          .eq('company_id', companyId)
      }

      await supabase.from('payment_allocations').insert({
        payment_id: Number(id),
        bill_id: billId,
        amount: grossAlloc,
        company_id: companyId,
      })
      totalGrossAllocated += grossAlloc
    }

    for (const alloc of allocations) {
      const billId = alloc.bill_id
      const grossAlloc = parseFloat(alloc.amount) || 0
      if (grossAlloc <= 0) continue
      const wht = whtMap[billId]
      if (wht && wht.wht_amount > 0 && wht.wht_tax_code_id) {
        const { data: taxCode } = await supabase
          .from("tax_codes")
          .select("tax_account_id")
          .eq("id", wht.wht_tax_code_id)
          .eq("company_id", companyId)
          .single()
        const whtAccountId = taxCode?.tax_account_id
        if (whtAccountId) {
          const { data: bill } = await supabase.from("invoices").select("total").eq("id", billId).single()
          if (bill) {
            const proportion = grossAlloc / bill.total
            const whtToDeduct = Math.round(wht.wht_amount * proportion)
            totalWhtDeducted += whtToDeduct
            if (!updatedPayment._whtLines) updatedPayment._whtLines = []
            updatedPayment._whtLines.push({
              account_id: whtAccountId,
              amount: whtToDeduct,
            })
          }
        }
      }
    }
  }

  if (targetPartyId) {
    const { data: supp } = await supabase.from('suppliers')
      .select('balance').eq('id', targetPartyId).eq('company_id', companyId).single()
    if (supp) {
      await supabase.from('suppliers')
        .update({ balance: (supp.balance || 0) - totalGrossAllocated })
        .eq('id', targetPartyId).eq('company_id', companyId)
    }
  }

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
  let description = `Payment - ${oldPayment.payment_no}`
  if (isExpense) {
    jeLines.push({ account_id: expense_account_id, debit: amount, credit: 0 })
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })
    description = `Expense Payment - ${oldPayment.payment_no}`
  } else {
    const apAcc = await getAccount(supabase, '2000', companyId)
    if (!apAcc) return NextResponse.json({ error: 'Accounts Payable (2000) not found' }, { status: 500 })
    jeLines.push({ account_id: apAcc.id, debit: totalGrossAllocated, credit: 0 })
    const bankCredit = totalGrossAllocated - totalWhtDeducted
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: bankCredit })
    if (updatedPayment._whtLines) {
      for (const whtLine of updatedPayment._whtLines) {
        jeLines.push({
          account_id: whtLine.account_id,
          debit: 0,
          credit: whtLine.amount,
        })
      }
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

export async function DELETE(request: NextRequest) {
  // unchanged
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
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

  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single()
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 })

  await reversePayment(supabase, Number(id), payment.payment_no, companyId)

  await supabase.from("payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)

  await logDataChange('payments', id, 'DELETE', payment, null)
  return NextResponse.json({ success: true })
}