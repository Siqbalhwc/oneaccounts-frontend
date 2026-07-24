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

// ✅ Helper to reverse an expense payment (used only for expense updates/deletions)
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
        .eq("id", alloc.invoice_id)
        .eq("company_id", companyId)
        .eq("type", "purchase")
        .single()
      if (bill) {
        const newPaid = (bill.paid || 0) - alloc.allocated_amount
        const newStatus = newPaid >= (bill.total || 0) ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'
        await supabase.from("invoices")
          .update({ paid: newPaid, status: newStatus })
          .eq("id", alloc.invoice_id)
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

  // 3. Reverse supplier balance (only if it's a supplier payment, but we call this only for expenses now)
  const { data: payment } = await supabase
    .from("payments")
    .select("party_id, amount, gross_amount")
    .eq("id", paymentId)
    .single()
  if (payment?.party_id) {
    const gross = payment.gross_amount ?? payment.amount
    const { data: supp } = await supabase
      .from("suppliers")
      .select("balance")
      .eq("id", payment.party_id)
      .eq("company_id", companyId)
      .single()
    if (supp) {
      await supabase.from("suppliers")
        .update({ balance: (supp.balance || 0) + gross })
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
    expense_account_id, date, reference, notes, allocations, opening_allocation
  } = await request.json()

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
  }

  const isExpense = !!expense_account_id

  // ── Expense Payment – keep existing logic completely unchanged ──
  if (isExpense) {
    const paymentType = 'expense'
    const partyType = 'expense'
    const targetPartyId = null

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
        gross_amount: 0,
      }).select('*').single()

      if (!result.error) {
        payment = result.data
        break
      }
      if (result.error.message?.includes('duplicate key') && attempt < 2) continue
      return NextResponse.json({ error: result.error?.message || 'Insert failed' }, { status: 500 })
    }

    if (!payment) return NextResponse.json({ error: 'Failed to create payment after multiple attempts.' }, { status: 500 })

    // Expense journal entry
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
    jeLines.push({ account_id: expense_account_id, debit: amount, credit: 0 })
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })

    const description = `Expense Payment - ${payNo}`
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

    for (const l of jeLines) {
      const { data: acc } = await supabase.from('accounts')
        .select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
      if (acc) {
        const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
        await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
      }
    }

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

  // ── Supplier Payment – call the new database function ──
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return NextResponse.json({ error: 'Allocations are required for supplier payment' }, { status: 400 })
  }

  const mappedAllocations = allocations.map((a: any) => ({
    invoice_id: a.bill_id,
    allocated_amount: a.amount,
  }))

  const { data, error: rpcError } = await supabase.rpc('create_vendor_payment', {
    p_company_id: companyId,
    p_party_id: party_id,
    p_payment_date: date || new Date().toISOString().split('T')[0],
    p_amount: amount,
    p_payment_method: payment_method,
    p_bank_account_id: bank_account_id,
    p_allocations: mappedAllocations,
    p_reference: reference || null,
    p_notes: notes || null,
    p_user_email: user?.email || 'system',
    p_opening_allocation: opening_allocation || 0
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...data })
}

// ── PUT (Update) – supplier payment uses update_vendor_payment, expense unchanged ──
export async function PUT(request: NextRequest) {
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
  const {
    party_id, amount, payment_method, bank_account_id,
    expense_account_id, date, reference, notes, allocations
  } = body

  const isExpense = !!expense_account_id

  const { data: oldPayment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single()
  if (!oldPayment) return NextResponse.json({ error: "Payment not found" }, { status: 404 })

  // ── Expense Payment update – keep original logic ──
  if (isExpense) {
    await reversePayment(supabase, Number(id), oldPayment.payment_no, companyId)

    const paymentType = 'expense'
    const partyType = 'expense'
    const targetPartyId = null

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

    // Expense journal entry (identical to create)
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
    jeLines.push({ account_id: expense_account_id, debit: amount, credit: 0 })
    jeLines.push({ account_id: bankGlAccountId, debit: 0, credit: amount })

    const description = `Expense Payment - ${oldPayment.payment_no}`
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

  // ── Supplier Payment update – call the new function ──
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return NextResponse.json({ error: 'Allocations are required' }, { status: 400 })
  }

  const mappedAllocations = allocations.map((a: any) => ({
    invoice_id: a.bill_id,
    allocated_amount: a.amount,
  }))

  const { data, error: rpcError } = await supabase.rpc('update_vendor_payment', {
    p_payment_id: parseInt(id),
    p_company_id: companyId,
    p_party_id: party_id,
    p_payment_date: date || oldPayment.payment_date,
    p_amount: amount,
    p_payment_method: payment_method,
    p_bank_account_id: bank_account_id,
    p_allocations: mappedAllocations,
    p_reference: reference || null,
    p_notes: notes || null,
    p_user_email: user?.email || 'system'
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...data })
}

// ── DELETE – supplier payment calls reverse_vendor_payment, expense unchanged ──
export async function DELETE(request: NextRequest) {
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

  // If it's an expense payment, keep the original deletion logic
  if (payment.payment_type === 'expense') {
    await reversePayment(supabase, Number(id), payment.payment_no, companyId)

    await supabase.from("payments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)

    await logDataChange('payments', id, 'DELETE', payment, null)
    return NextResponse.json({ success: true })
  }

  // Supplier payment – call reversal function
  const { error: rpcError } = await supabase.rpc('reverse_vendor_payment', {
    p_payment_id: parseInt(id),
    p_company_id: companyId
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  // Soft-delete the payment record
  await supabase.from("payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)

  await logDataChange('payments', id, 'DELETE', payment, null)
  return NextResponse.json({ success: true })
}