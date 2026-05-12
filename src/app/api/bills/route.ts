import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

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

  const body = await request.json()
  const { invoice_no, party_id, invoice_date, due_date, items, reference, notes } = body

  if (!invoice_no || !party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Insert the bill header – ONLY columns that exist
  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const { data: bill, error: headerError } = await supabase
    .from('invoices')
    .insert({
      invoice_no,
      type: 'purchase',
      party_id,
      date: invoice_date,
      due_date,
      total: 0,
      paid: 0,
      status: 'Unpaid',
      reference,
      notes,
      company_id: companyId,
    })
    .select('*')
    .single()

  if (headerError || !bill) {
    return NextResponse.json({ error: headerError?.message || 'Failed to create bill' }, { status: 500 })
  }

  // Insert items – only columns that exist
  let total = 0
  const itemRows = items.map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: bill.id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      company_id: companyId,
    }
  })

  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows)
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  // Update header total
  const { data: updatedBill, error: updateError } = await supabase
    .from('invoices')
    .update({ total })
    .eq('id', bill.id)
    .select('*')
    .single()

  if (updateError || !updatedBill) {
    return NextResponse.json({ error: updateError?.message || 'Failed to update total' }, { status: 500 })
  }

  // Audit log
  await logDataChange('invoices', String(updatedBill.id), 'INSERT', undefined, updatedBill)

  return NextResponse.json({ success: true, bill: updatedBill })
}

// PUT and DELETE unchanged (they work with existing columns)
export async function PUT(request: NextRequest) { /* keep as before */ }
export async function DELETE(request: NextRequest) { /* keep as before */ }