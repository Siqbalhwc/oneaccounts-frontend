import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

  const { code, name, unit_price, cost_price, opening_qty, image_url } = await request.json()
  if (!code || !name) return NextResponse.json({ error: 'Code and name required' }, { status: 400 })

  const openingQty = Number(opening_qty || 0)
  const costPrice = Number(cost_price || 0)

  // Create product
  const { data: product, error: insertErr } = await supabase
    .from('products')
    .insert({
      code, name,
      unit_price: Number(unit_price || 0),
      cost_price: costPrice,
      qty_on_hand: openingQty,
      image_url: image_url || null,
    })
    .select('id')
    .single()

  if (insertErr || !product) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to create product' }, { status: 500 })
  }

  // If opening inventory has value, post GL entry
  if (openingQty > 0 && costPrice > 0) {
    const totalValue = openingQty * costPrice
    await postOpeningInventoryEntry(supabase, product.id, code, name, totalValue, 'new')
  }

  return NextResponse.json({ success: true, productId: product.id })
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

  const { id, code, name, unit_price, cost_price, opening_qty, image_url } = await request.json()
  if (!id || !code || !name) return NextResponse.json({ error: 'ID, code and name required' }, { status: 400 })

  // Fetch old product for GL reversal
  const { data: oldProduct } = await supabase
    .from('products')
    .select('cost_price, qty_on_hand')
    .eq('id', id)
    .single()

  const newOpeningQty = Number(opening_qty || 0)
  const newCostPrice = Number(cost_price || 0)

  // Update product
  const { error: updateErr } = await supabase
    .from('products')
    .update({
      code, name,
      unit_price: Number(unit_price || 0),
      cost_price: newCostPrice,
      qty_on_hand: newOpeningQty,
      image_url: image_url || null,
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Handle GL adjustments for opening inventory
  const oldValue = (oldProduct?.cost_price || 0) * (oldProduct?.qty_on_hand || 0)
  const newValue = newOpeningQty * newCostPrice

  if (oldValue !== newValue) {
    if (oldValue > 0) {
      // Reverse old entry
      await postOpeningInventoryEntry(supabase, id, code, name, oldValue, 'reverse')
    }
    if (newValue > 0) {
      // Post new entry
      await postOpeningInventoryEntry(supabase, id, code, name, newValue, 'new')
    }
  }

  return NextResponse.json({ success: true })
}

async function postOpeningInventoryEntry(
  supabase: ReturnType<typeof createServerClient>,
  productId: number,
  code: string,
  name: string,
  totalValue: number,
  mode: 'new' | 'reverse'
) {
  const invAcc = await supabase.from('accounts').select('id,balance').eq('code', '1200').single()
  const eqAcc = await supabase.from('accounts').select('id,balance').eq('code', '3000').single()
  if (!invAcc.data || !eqAcc.data) return

  const sign = mode === 'reverse' ? -1 : 1
  const debitAccount = mode === 'new' ? invAcc.data.id : eqAcc.data.id
  const creditAccount = mode === 'new' ? eqAcc.data.id : invAcc.data.id
  const debitAmount = mode === 'new' ? totalValue : totalValue
  const creditAmount = mode === 'new' ? totalValue : totalValue

  const description = mode === 'new'
    ? `Opening Inventory - ${code} ${name}`
    : `Reverse Opening Inventory - ${code} ${name}`

  const { data: entry } = await supabase.from('journal_entries').insert({
    entry_no: `OB-INV-${productId}-${mode === 'reverse' ? 'REV' : 'NEW'}-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    description,
  }).select('id').single()

  if (!entry) return

  await supabase.from('journal_lines').insert([
    { entry_id: entry.id, account_id: debitAccount, debit: debitAmount, credit: 0 },
    { entry_id: entry.id, account_id: creditAccount, debit: 0, credit: creditAmount },
  ])

  // Update balances
  await supabase.from('accounts').update({
    balance: invAcc.data.balance + (sign * totalValue)
  }).eq('id', invAcc.data.id)
  await supabase.from('accounts').update({
    balance: eqAcc.data.balance + (sign * totalValue)
  }).eq('id', eqAcc.data.id)
}