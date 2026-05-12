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

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  // 1. Insert invoice header
  const { data: inv, error: headerError } = await supabase
    .from('invoices')
    .insert({
      invoice_no,
      type: 'sale',
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

  if (headerError || !inv) {
    return NextResponse.json({ error: headerError?.message || 'Failed to create invoice' }, { status: 500 })
  }

  // 2. Insert items
  let total = 0
  const itemRows = items.map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: inv.id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      product_id: item.product_id || null,
      cost_price: item.cost_price || 0,
      company_id: companyId,
    }
  })
  if (itemRows.length > 0) await supabase.from('invoice_items').insert(itemRows)

  // Update total
  const { data: updatedInv, error: updateError } = await supabase
    .from('invoices')
    .update({ total })
    .eq('id', inv.id)
    .select('*')
    .single()

  if (updateError || !updatedInv) {
    return NextResponse.json({ error: updateError?.message || 'Failed to update total' }, { status: 500 })
  }

  // 3. Update customer balance (add invoice total to balance)
  await supabase.rpc('increment_balance', {
    table_name: 'customers',
    record_id: party_id,
    amount: total
  }).catch(async () => {
    // fallback manual update if RPC doesn't exist
    const { data: cust } = await supabase.from('customers').select('balance').eq('id', party_id).single()
    if (cust) {
      await supabase.from('customers').update({ balance: cust.balance + total }).eq('id', party_id)
    }
  })

  // 4. Audit log
  await logDataChange('invoices', String(updatedInv.id), 'INSERT', undefined, updatedInv)

  return NextResponse.json({ success: true, invoice: updatedInv })
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

  const body = await request.json()
  const { id, invoice_no, party_id, invoice_date, due_date, items, reference, notes } = body
  if (!id) return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  // Fetch old invoice for balance reversal
  const { data: oldInv } = await supabase.from('invoices').select('total,party_id').eq('id', id).eq('company_id', companyId).single()
  if (!oldInv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Reverse old customer balance
  if (oldInv.party_id) {
    const { data: cust } = await supabase.from('customers').select('balance').eq('id', oldInv.party_id).single()
    if (cust) {
      await supabase.from('customers').update({ balance: cust.balance - oldInv.total }).eq('id', oldInv.party_id)
    }
  }

  // Delete old items and update
  await supabase.from('invoice_items').delete().eq('invoice_id', id)
  let total = 0
  const itemRows = (items || []).map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    total += lineTotal
    return {
      invoice_id: id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      product_id: item.product_id || null,
      cost_price: item.cost_price || 0,
      company_id: companyId,
    }
  })
  if (itemRows.length > 0) await supabase.from('invoice_items').insert(itemRows)

  const { data: updatedInv, error: updateError } = await supabase
    .from('invoices')
    .update({ invoice_no, party_id, date: invoice_date, due_date, total, reference, notes })
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !updatedInv) {
    return NextResponse.json({ error: updateError?.message || 'Update failed' }, { status: 500 })
  }

  // Add new customer balance
  if (party_id) {
    const { data: cust } = await supabase.from('customers').select('balance').eq('id', party_id).single()
    if (cust) {
      await supabase.from('customers').update({ balance: cust.balance + total }).eq('id', party_id)
    }
  }

  // Audit log
  await logDataChange('invoices', String(id), 'UPDATE', oldInv, updatedInv)

  return NextResponse.json({ success: true, invoice: updatedInv })
}