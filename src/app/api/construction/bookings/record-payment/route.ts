import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════ POST – Record an Installment Payment ═══════════════
//
// Takes ONE payment amount for a booking (could be a normal monthly
// amount, or a lump sum covering several months at once — e.g. a
// quarterly payment) and:
//   1. Creates a single Receipt via the existing create_receipt_transaction
//      RPC, allocated against the booking's one Sales Invoice — exactly
//      how a normal receipt reduces AR.
//   2. Applies that amount across installment_schedule rows, oldest
//      unpaid first (FIFO), marking each 'partially_paid' or 'paid' as
//      it's filled, until the payment is exhausted.
//
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { booking_id, amount, payment_date, bank_account_id, reference, notes } = body

  if (!booking_id || !amount || amount <= 0) {
    return NextResponse.json({ error: 'booking_id and a positive amount are required' }, { status: 400 })
  }
  if (!bank_account_id) {
    return NextResponse.json({ error: 'bank_account_id is required' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company associated with this user' }, { status: 400 })
  const userEmail = user.email || 'system'
  const paymentDate = payment_date || new Date().toISOString().split('T')[0]

  // ── 1. Fetch the booking ──
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('property_bookings')
    .select('id, company_id, customer_id, invoice_id, balance_amount, status')
    .eq('id', booking_id)
    .eq('company_id', companyId)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return NextResponse.json({ error: `This booking is already ${booking.status}` }, { status: 400 })
  }

  // ── 2. Create the Receipt (same engine as any normal receipt) ──
  const { data: receiptResult, error: receiptError } = await supabase.rpc('create_receipt_transaction', {
    p_company_id: companyId,
    p_party_id: booking.customer_id,
    p_receipt_date: paymentDate,
    p_amount: amount,
    p_bank_account_id: bank_account_id,
    p_reference: reference || `Installment payment - Booking #${booking.id}`,
    p_notes: notes || '',
    p_allocations: [{ invoice_id: booking.invoice_id, amount }],
    p_user_email: userEmail,
    p_is_donation: false,
    p_opening_allocation: 0,
  })

  if (receiptError || !receiptResult?.success) {
    return NextResponse.json(
      { error: 'Failed to record receipt: ' + (receiptError?.message || receiptResult?.error || 'unknown error') },
      { status: 500 }
    )
  }

  const receiptId = receiptResult.receipt_id

  // ── 3. Apply the payment FIFO across unpaid installments ──
  const { data: installments, error: installmentsError } = await supabaseAdmin
    .from('installment_schedule')
    .select('id, amount, amount_paid, status')
    .eq('booking_id', booking.id)
    .neq('status', 'paid')
    .order('installment_no', { ascending: true })

  if (installmentsError) {
    return NextResponse.json({
      error: 'Receipt was recorded, but reading the installment schedule failed: ' + installmentsError.message +
        `. Receipt #${receiptId} exists — please contact support to apply it manually.`,
      receipt_id: receiptId,
    }, { status: 500 })
  }

  let remaining = amount
  const updatedRows: { id: number; amount_paid: number; status: string }[] = []

  for (const inst of installments || []) {
    if (remaining <= 0) break
    const outstanding = inst.amount - inst.amount_paid
    const applied = Math.min(remaining, outstanding)
    const newAmountPaid = Math.round((inst.amount_paid + applied) * 100) / 100
    const newStatus = newAmountPaid >= inst.amount ? 'paid' : 'partially_paid'
    remaining = Math.round((remaining - applied) * 100) / 100
    updatedRows.push({ id: inst.id, amount_paid: newAmountPaid, status: newStatus })
  }

  for (const row of updatedRows) {
    const { error: updateError } = await supabaseAdmin
      .from('installment_schedule')
      .update({ amount_paid: row.amount_paid, status: row.status, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (updateError) {
      console.error('Failed to update installment', row.id, updateError)
      // Not a hard failure — the receipt/GL side is already correct and
      // is the source of truth; the schedule is a tracking convenience.
    }
  }

  // ── 4. If every installment is now paid, mark the booking completed ──
  const { data: remainingUnpaid } = await supabaseAdmin
    .from('installment_schedule')
    .select('id')
    .eq('booking_id', booking.id)
    .neq('status', 'paid')
    .limit(1)

  if (!remainingUnpaid || remainingUnpaid.length === 0) {
    await supabaseAdmin
      .from('property_bookings')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', booking.id)
  }

  return NextResponse.json({
    success: true,
    receipt_id: receiptId,
    installments_updated: updatedRows.length,
    unapplied_amount: remaining, // >0 only if payment exceeded total remaining balance
    booking_completed: !remainingUnpaid || remainingUnpaid.length === 0,
  })
}