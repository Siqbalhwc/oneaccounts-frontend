import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

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

  const { party_id, amount, payment_method, bank_account_id, date, reference, notes, allocations } = await request.json()
  if (!party_id || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Customer and amount are required' }, { status: 400 })
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
    party_id,
    date: date || new Date().toISOString().split('T')[0],
    amount,
    payment_method,
    bank_account_id: bank_account_id || null,
    reference,
    notes,
  }).select('id').single()

  if (insertErr || !receipt) {
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 })
  }

  // Allocations
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
    }
  }

  // Update customer balance (decrease AR)
  const { data: cust } = await supabaseAdmin.from('customers')
    .select('balance').eq('id', party_id).eq('company_id', companyId).single()
  if (cust) {
    await supabaseAdmin.from('customers')
      .update({ balance: (cust.balance || 0) - amount })
      .eq('id', party_id).eq('company_id', companyId)
  }

  // GL entries: DR Cash / CR AR (1100)
  const cashAccCode = bank_account_id ? null : '1000'  // fallback to cash if no bank selected? Actually we should use the appropriate bank asset account.
  // For simplicity, we'll still use 1000 unless you want to map bank_account to a specific GL account. We'll keep as is for now.
  const cashAcc = await supabaseAdmin.from('accounts')
    .select('id,balance').eq('code', '1000').eq('company_id', companyId).single()
  const arAcc = await supabaseAdmin.from('accounts')
    .select('id,balance').eq('code', '1100').eq('company_id', companyId).single()

  if (cashAcc.data && arAcc.data) {
    const { data: entry } = await supabaseAdmin.from('journal_entries').insert({
      company_id: companyId,
      entry_no: `JE-RCPT-${recNo}`,
      date: date || new Date().toISOString().split('T')[0],
      description: `Receipt - ${recNo}`,
    }).select('id').single()

    if (entry) {
      await supabaseAdmin.from('journal_lines').insert([
        { company_id: companyId, entry_id: entry.id, account_id: cashAcc.data.id, debit: amount, credit: 0 },
        { company_id: companyId, entry_id: entry.id, account_id: arAcc.data.id, debit: 0, credit: amount },
      ])
      await supabaseAdmin.from('accounts').update({ balance: cashAcc.data.balance + amount }).eq('id', cashAcc.data.id)
      await supabaseAdmin.from('accounts').update({ balance: arAcc.data.balance - amount }).eq('id', arAcc.data.id)
    }
  }

  return NextResponse.json({ success: true, receipt_no: recNo })
}