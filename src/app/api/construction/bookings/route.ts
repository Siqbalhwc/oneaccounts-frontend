import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════ POST – Create Property Booking ══════════════════════
//
// Flow (per the agreed accounting design):
//   1. One-time Sales Invoice for the FULL price (Dr AR / Cr Revenue) —
//      reuses the existing create_invoice_transaction RPC exactly as the
//      normal invoice screen does. Revenue is recognized in full at
//      booking, per your confirmation this matches your accounting
//      convention (agreement signed = income recognized).
//   2. If there's an advance amount, a Receipt is recorded against that
//      invoice immediately — reuses the existing create_receipt_transaction
//      RPC, so it behaves identically to a manual receipt entry.
//   3. property_bookings row is created, linking the booking to both.
//   4. installment_schedule rows are generated (pure tracking — no GL
//      impact). The last installment absorbs any rounding remainder so
//      the schedule always sums exactly to the balance owed.
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
  const {
    customer_id,
    project_id,        // the site/development
    product_id,         // the unit/plot being sold
    total_price,
    advance_amount,
    number_of_installments, // defaults to 60 below if not provided
    booking_date,
    bank_account_id,    // required if advance_amount > 0 — which account receives it
    reference,
    notes,
  } = body

  // ── 1. Basic validation ──
  if (!customer_id || !product_id || !total_price || total_price <= 0) {
    return NextResponse.json({ error: 'customer_id, product_id, and total_price are required' }, { status: 400 })
  }
  const advanceAmt = Number(advance_amount || 0)
  if (advanceAmt < 0 || advanceAmt > total_price) {
    return NextResponse.json({ error: 'advance_amount must be between 0 and total_price' }, { status: 400 })
  }
  if (advanceAmt > 0 && !bank_account_id) {
    return NextResponse.json({ error: 'bank_account_id is required when advance_amount > 0' }, { status: 400 })
  }
  const numInstallments = Number(number_of_installments || 60)
  if (numInstallments < 1) {
    return NextResponse.json({ error: 'number_of_installments must be at least 1' }, { status: 400 })
  }
  const bookingDate = booking_date || new Date().toISOString().split('T')[0]

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company associated with this user' }, { status: 400 })
  const userEmail = user.email || 'system'

  // ── 2. Fetch product name for the invoice line description ──
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('name, code')
    .eq('id', product_id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!product) {
    return NextResponse.json({ error: 'Product/unit not found' }, { status: 404 })
  }

  // ── 3. Create the one-time Sales Invoice for the FULL price ──
  // Uses the same RPC the normal invoice screen calls, so GL posting,
  // invoice numbering, and stock decrement all behave identically.
  const { data: invoiceResult, error: invoiceError } = await supabase.rpc('create_invoice_transaction', {
    p_company_id: companyId,
    p_party_id: customer_id,
    p_invoice_date: bookingDate,
    p_due_date: bookingDate,
    p_items: [{
      product_id: product_id,
      description: `Sale of unit — ${product.code} - ${product.name}`,
      qty: 1,
      unit_price: total_price,
      project_id: project_id || null,
      account_id: null, // defaults to Revenue (4000) inside the RPC
    }],
    p_reference: reference || `Booking - ${product.code}`,
    p_notes: notes || '',
    p_user_email: userEmail,
    p_tax_enabled: false,
    p_automation_config: {},
    p_automation_allowed: false,
    p_business_type: 'construction',
  })

  if (invoiceError || !invoiceResult?.success) {
    return NextResponse.json(
      { error: 'Failed to create sales invoice: ' + (invoiceError?.message || invoiceResult?.error || 'unknown error') },
      { status: 500 }
    )
  }

  const invoiceId = invoiceResult.invoice_id

  // ── 4. If there's an advance, record a Receipt against that invoice ──
  let receiptId: number | null = null
  if (advanceAmt > 0) {
    const { data: receiptResult, error: receiptError } = await supabase.rpc('create_receipt_transaction', {
      p_company_id: companyId,
      p_party_id: customer_id,
      p_receipt_date: bookingDate,
      p_amount: advanceAmt,
      p_bank_account_id: bank_account_id,
      p_reference: reference || `Advance - ${product.code}`,
      p_notes: notes || '',
      p_allocations: [{ invoice_id: invoiceId, amount: advanceAmt }],
      p_user_email: userEmail,
      p_is_donation: false,
      p_opening_allocation: 0,
    })

    if (receiptError || !receiptResult?.success) {
      // NOTE: the invoice already exists and is valid at this point (the
      // sale genuinely happened) — we do NOT auto-reverse it here, since
      // reversal has its own GL-cleanup logic elsewhere in the codebase.
      // We report the failure with the invoice_id so the advance receipt
      // can be entered manually via the normal Receipts screen instead.
      return NextResponse.json({
        error: 'Invoice created, but recording the advance receipt failed: ' +
          (receiptError?.message || receiptResult?.error || 'unknown error') +
          `. Invoice #${invoiceId} was created successfully — please record the advance manually via Receipts.`,
        invoice_id: invoiceId,
      }, { status: 500 })
    }

    receiptId = receiptResult.receipt_id
  }

  // ── 5. Compute the schedule numbers ──
  const balanceAmount = total_price - advanceAmt
  const rawInstallment = Math.round((balanceAmount / numInstallments) * 100) / 100

  // First installment due 1 month after booking date
  const firstInstallmentDate = new Date(bookingDate)
  firstInstallmentDate.setMonth(firstInstallmentDate.getMonth() + 1)

  // ── 6. Insert property_bookings ──
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('property_bookings')
    .insert({
      company_id: companyId,
      customer_id,
      project_id: project_id || null,
      product_id,
      total_price,
      advance_amount: advanceAmt,
      balance_amount: balanceAmount,
      number_of_installments: numInstallments,
      installment_amount: rawInstallment,
      booking_date: bookingDate,
      first_installment_date: firstInstallmentDate.toISOString().split('T')[0],
      invoice_id: invoiceId,
      advance_receipt_id: receiptId,
      status: 'active',
      created_by: userEmail,
      updated_by: userEmail,
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({
      error: 'Invoice and receipt were created, but saving the booking record failed: ' + bookingError?.message +
        `. Invoice #${invoiceId}${receiptId ? ` and Receipt #${receiptId}` : ''} exist — please contact support to link them manually.`,
      invoice_id: invoiceId,
      receipt_id: receiptId,
    }, { status: 500 })
  }

  // ── 7. Generate installment_schedule rows ──
  // Last installment absorbs the rounding remainder so the schedule
  // always sums to exactly balanceAmount, never a few cents off.
  const scheduleRows = []
  let allocated = 0
  for (let i = 1; i <= numInstallments; i++) {
    const dueDate = new Date(firstInstallmentDate)
    dueDate.setMonth(dueDate.getMonth() + (i - 1))

    const amount = i === numInstallments
      ? Math.round((balanceAmount - allocated) * 100) / 100
      : rawInstallment
    allocated += amount

    scheduleRows.push({
      booking_id: booking.id,
      company_id: companyId,
      installment_no: i,
      due_date: dueDate.toISOString().split('T')[0],
      amount,
      status: 'pending',
    })
  }

  const { error: scheduleError } = await supabaseAdmin
    .from('installment_schedule')
    .insert(scheduleRows)

  if (scheduleError) {
    return NextResponse.json({
      error: 'Booking created, but generating the installment schedule failed: ' + scheduleError.message +
        `. Booking #${booking.id} exists — please contact support to regenerate the schedule.`,
      booking_id: booking.id,
      invoice_id: invoiceId,
    }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    booking_id: booking.id,
    invoice_id: invoiceId,
    receipt_id: receiptId,
    balance_amount: balanceAmount,
    installment_amount: rawInstallment,
    number_of_installments: numInstallments,
    first_installment_date: firstInstallmentDate.toISOString().split('T')[0],
  })
}