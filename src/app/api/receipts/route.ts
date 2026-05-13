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

async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
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

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  const {
    party_id, amount, payment_method, bank_account_id,
    income_account_id, unallocated_amount, date, reference, notes, allocations
  } = await request.json()
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
  }

  // Generate receipt number
  const { data: existing } = await supabaseAdmin
    .from('receipts')
    .select('receipt_no')
    .eq('company_id', companyId)
    .order('receipt_no', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (existing && existing.length > 0) {
    const last = existing[0].receipt_no
    const parts = last.split('-')
    const num = parseInt(parts[parts.length - 1])
    if (!isNaN(num)) nextNum = num + 1
  }
  const recNo = `RCPT-${String(nextNum).padStart(4, "0")}`

  // Insert receipt
  const { data: receipt, error: insertErr } = await supabaseAdmin.from("receipts").insert({
    company_id: companyId,
    receipt_no: recNo,
    party_id: party_id || null,
    date: date || new Date().toISOString().split('T')[0],
    amount,
    payment_method,
    bank_account_id: bank_account_id || null,
    income_account_id: income_account_id || null,
    reference,
    notes,
  }).select('*').single()

  if (insertErr || !receipt) {
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 })
  }

  // Allocated portion
  let totalAllocated = 0
  if (allocations && Array.isArray(allocations) && allocations.length > 0) {
    for (const alloc of allocations) {
      const invoiceId = alloc.invoice_id
      const allocAmount = parseFloat(alloc.amount) || 0
      if (allocAmount <= 0) continue

      const { data: inv } = await supabaseAdmin
        .from('invoices')
        .select('paid, total, status')
        .eq('id', invoiceId)
        .eq('company_id', companyId)
        .eq('type', 'sale')
        .single()

      if (inv) {
        const newPaid = (inv.paid || 0) + allocAmount
        const newStatus = newPaid >= inv.total ? 'Paid' : 'Partial'
        await supabaseAdmin.from('invoices')
          .update({ paid: newPaid, status: newStatus })
          .eq('id', invoiceId)
          .eq('company_id', companyId)
      }

      await supabaseAdmin.from('receipt_allocations').insert({
        receipt_id: receipt.id,
        invoice_id: invoiceId,
        amount: allocAmount,
        company_id: companyId,
      })
      totalAllocated += allocAmount
    }
  }

  // Unallocated = total received - allocated
  const unallocated = unallocated_amount ?? (amount - totalAllocated)
  const advanceAmount = unallocated > 0 ? unallocated : 0

  // Update customer balance (reduce by total amount)
  if (party_id) {
    const { data: cust } = await supabaseAdmin.from('customers')
      .select('balance').eq('id', party_id).eq('company_id', companyId).single()
    if (cust) {
      await supabaseAdmin.from('customers')
        .update({ balance: (cust.balance || 0) - amount })
        .eq('id', party_id).eq('company_id', companyId)
    }
  }

  // ── Journal Entry ──────────────────────────────────────────────────────
  const cashAcc = await getAccount(supabaseAdmin, '1000', companyId)
  if (!cashAcc) {
    return NextResponse.json({ error: 'Cash account (1000) not found' }, { status: 500 })
  }

  const jeLines: any[] = [
    { account_id: cashAcc.id, debit: amount, credit: 0 }   // Debit bank
  ]

  let description = `Receipt - ${recNo}`

  if (income_account_id) {
    // Donation mode: entire amount credits the selected income account
    jeLines.push({ account_id: income_account_id, debit: 0, credit: amount })
    description = `Donation Receipt - ${recNo}`
  } else {
    // Normal receipt: allocate to AR and optionally to advance
    const arAcc = await getAccount(supabaseAdmin, '1100', companyId)
    if (!arAcc) {
      return NextResponse.json({ error: 'AR account (1100) not found' }, { status: 500 })
    }

    // Credit AR for the allocated amount
    if (totalAllocated > 0) {
      jeLines.push({ account_id: arAcc.id, debit: 0, credit: totalAllocated })
    }

    // Credit a separate advance account for the excess
    if (advanceAmount > 0) {
      // Look for a liability account code 2010 or create one
      let advanceAcc = await getAccount(supabaseAdmin, '2010', companyId)
      if (!advanceAcc) {
        // Create the account
        const { data: newAcc } = await supabaseAdmin.from('accounts').insert({
          code: '2010', name: 'Customer Advances', type: 'Liability', company_id: companyId
        }).select('id,balance').single()
        advanceAcc = newAcc
      }
      if (advanceAcc) {
        jeLines.push({ account_id: advanceAcc.id, debit: 0, credit: advanceAmount })
      }
    }
  }

  // Insert journal entry and lines
  const { data: entry, error: entryErr } = await supabaseAdmin.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-RCPT-${recNo}`,
    date: date || new Date().toISOString().split('T')[0],
    description,
  }).select('id').single()

  if (entryErr || !entry) {
    // Rollback receipt? Not critical, but log error
    return NextResponse.json({ error: entryErr?.message || 'JE insert failed' }, { status: 500 })
  }

  const lineRows = jeLines.map(l => ({ ...l, entry_id: entry.id, company_id: companyId }))
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

  // Audit log
  await logDataChange('receipts', String(receipt.id), 'INSERT', undefined, receipt)

  return NextResponse.json({ success: true, receipt_no: recNo, receipt })
}