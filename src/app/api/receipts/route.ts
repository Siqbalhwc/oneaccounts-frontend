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

// ── Generate sequential receipt number: SR/YYYYMM/0001 ──────────────────
async function generateReceiptNo(companyId: string): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const prefix = `SR/${ym}/`

  const { data } = await supabaseAdmin
    .from('receipts')
    .select('receipt_no')
    .eq('company_id', companyId)
    .like('receipt_no', `${prefix}%`)
    .order('receipt_no', { ascending: false })
    .limit(1)

  let nextNum = 1
  if (data && data.length > 0) {
    const last = data[0].receipt_no
    const match = last.match(/\/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`
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

  if (!party_id && !income_account_id) {
    return NextResponse.json({
      error: 'Customer is required when not a donation. Please select a customer or enable donation mode.'
    }, { status: 400 })
  }

  // ── Generate unique receipt number with retry ──────────────────────────
  let recNo = ''
  let receipt: any = null
  let insertErr: any = null

  for (let attempt = 0; attempt < 3; attempt++) {
    recNo = await generateReceiptNo(companyId)

    const result = await supabaseAdmin.from("receipts").insert({
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
      created_by: user?.email || null,      // ← added
      updated_by: user?.email || null,      // ← added
    }).select('*').single()

    insertErr = result.error
    receipt = result.data

    if (!insertErr) break

    if (insertErr.message?.includes('duplicate key') && attempt < 2) {
      continue
    }
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 })
  }

  if (!receipt) {
    return NextResponse.json({ error: 'Failed to create receipt after multiple attempts.' }, { status: 500 })
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

  const unallocated = unallocated_amount ?? (amount - totalAllocated)
  const advanceAmount = unallocated > 0 ? unallocated : 0

  // Update customer balance
  if (party_id) {
    const { data: cust } = await supabaseAdmin.from('customers')
      .select('balance').eq('id', party_id).eq('company_id', companyId).single()
    if (cust) {
      await supabaseAdmin.from('customers')
        .update({ balance: (cust.balance || 0) - amount })
        .eq('id', party_id).eq('company_id', companyId)
    }
  }

  // ── Determine the bank's GL account ────────────────────────────────────
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
    return NextResponse.json({ error: 'No bank GL account found. Please select a bank.' }, { status: 500 })
  }

  // ── Journal Entry ──────────────────────────────────────────────────────
  const jeLines: any[] = [
    { account_id: bankGlAccountId, debit: amount, credit: 0 }
  ]

  let description = `Receipt - ${recNo}`

  if (income_account_id) {
    jeLines.push({ account_id: income_account_id, debit: 0, credit: amount })
    description = `Donation Receipt - ${recNo}`
  } else {
    const arAcc = await getAccount(supabaseAdmin, '1100', companyId)
    if (!arAcc) {
      return NextResponse.json({ error: 'AR account (1100) not found' }, { status: 500 })
    }

    if (totalAllocated > 0) {
      jeLines.push({ account_id: arAcc.id, debit: 0, credit: totalAllocated })
    }

    if (advanceAmount > 0) {
      let advanceAcc = await getAccount(supabaseAdmin, '2010', companyId)
      if (!advanceAcc) {
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
    return NextResponse.json({ error: entryErr?.message || 'JE insert failed' }, { status: 500 })
  }

  const lineRows = jeLines.map(l => ({
    ...l,
    entry_id: entry.id,
    company_id: companyId,
    source_type: 'receipt',
    source_id: receipt.id,
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
    table_name: "receipts",
    record_id: String(receipt.id),
    action: "INSERT",
    old_data: null,
    new_data: receipt,
    changed_by: auditUser?.email || auditUser?.id || null,
    changed_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true, receipt_no: recNo, receipt })
}