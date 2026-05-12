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
  const {
    invoice_no, party_id, invoice_date, due_date, items, reference, notes,
    location_id, activity_id, project_id, donor_id, expense_account_id,
  } = body

  if (!invoice_no || !party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Insert the bill header
  const { data: bill, error: headerError } = await supabase
    .from('invoices')
    .insert({
      invoice_no,
      type: 'purchase',
      party_id,
      date: invoice_date,
      due_date,
      total: 0,        // will recalc
      paid: 0,
      status: 'Unpaid',
      reference,
      notes,
      location_id,
      activity_id,
      project_id,
      donor_id,
      expense_account_id,
    })
    .select('*')
    .single()

  if (headerError || !bill) {
    return NextResponse.json({ error: headerError?.message || 'Failed to create bill' }, { status: 500 })
  }

  // Insert items and calculate total
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
      account_id: item.account_id || expense_account_id || null,
      activity_id: item.activity_id || activity_id,
      location_id: item.location_id || location_id,
      project_id: project_id,
      donor_id: donor_id,
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

  const { id, ...updateFields } = await request.json()
  if (!id) return NextResponse.json({ error: 'Bill ID required' }, { status: 400 })

  // Fetch old values for audit
  const { data: oldBill } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single()

  const { data: updatedBill, error } = await supabase
    .from('invoices')
    .update(updateFields)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !updatedBill) {
    return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 })
  }

  // Audit log
  if (oldBill) {
    await logDataChange('invoices', String(id), 'UPDATE', oldBill, updatedBill)
  }

  return NextResponse.json({ success: true, bill: updatedBill })
}

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

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Bill ID required' }, { status: 400 })

  // Fetch old values for audit
  const { data: oldBill } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('invoices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  if (oldBill) {
    await logDataChange('invoices', String(id), 'DELETE', oldBill, undefined)
  }

  return NextResponse.json({ success: true })
}