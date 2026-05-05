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
    return NextResponse.json({ error: 'Supplier and amount are required' }, { status: 400 })
  }

  // Generate payment number
  const { data: existing } = await supabaseAdmin
    .from('payments')
    .select('payment_no')
    .eq('company_id', companyId)
    .order('payment_no', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (existing && existing.length > 0) {
    const parts = existing[0].payment_no.split('-')
    const num = parseInt(parts[parts.length - 1])
    if (!isNaN(num)) nextNum = num + 1
  }
  const payNo = `PAY-${String(nextNum).padStart(4, "0")}`

  // Insert payment
  const { data: payment, error: insertErr } = await supabaseAdmin.from("payments").insert({
    company_id: companyId,
    payment_no: payNo,
    payment_type: 'supplier_payment',
    party_type: 'supplier',
    party_id,
    payment_date: date || new Date().toISOString().split('T')[0],
    amount,
    payment_method,
    bank_account_id: bank_account_id || null,
    reference,
    notes,
  }).select('id').single()

  if (insertErr || !payment) {
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 })
  }

  // Allocations
  if (allocations && Array.isArray(allocations) && allocations.length > 0) {
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
    }
  }

  // Update supplier balance
  const { data: supp } = await supabaseAdmin.from('suppliers')
    .select('balance').eq('id', party_id).eq('company_id', companyId).single()
  if (supp) {
    await supabaseAdmin.from('suppliers')
      .update({ balance: (supp.balance || 0) - amount })
      .eq('id', party_id).eq('company_id', companyId)
  }

  // GL entries: DR AP / CR Cash (or bank if chosen)
  const apAcc = await supabaseAdmin.from('accounts')
    .select('id,balance').eq('code', '2000').eq('company_id', companyId).single()
  const cashAcc = await supabaseAdmin.from('accounts')
    .select('id,balance').eq('code', '1000').eq('company_id', companyId).single()

  if (apAcc.data && cashAcc.data) {
    const { data: entry } = await supabaseAdmin.from('journal_entries').insert({
      company_id: companyId,
      entry_no: `JE-PAY-${payNo}`,
      date: date || new Date().toISOString().split('T')[0],
      description: `Payment - ${payNo}`,
    }).select('id').single()
    if (entry) {
      await supabaseAdmin.from('journal_lines').insert([
        { company_id: companyId, entry_id: entry.id, account_id: apAcc.data.id, debit: amount, credit: 0 },
        { company_id: companyId, entry_id: entry.id, account_id: cashAcc.data.id, debit: 0, credit: amount },
      ])
      await supabaseAdmin.from('accounts').update({ balance: apAcc.data.balance - amount }).eq('id', apAcc.data.id)
      await supabaseAdmin.from('accounts').update({ balance: cashAcc.data.balance - amount }).eq('id', cashAcc.data.id)
    }
  }

  return NextResponse.json({ success: true, payment_no: payNo })
}