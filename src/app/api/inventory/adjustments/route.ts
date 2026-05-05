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

  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Get the user's active company
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 400 })
  }
  const companyId = roleData.company_id

  // 3. Parse the request body
  const { product_id, qty, reason, date } = await request.json()
  if (!product_id || !qty || !reason) {
    return NextResponse.json({ error: 'Product, quantity, and reason are required' }, { status: 400 })
  }

  const qtyNum = Number(qty)
  if (isNaN(qtyNum) || qtyNum === 0) {
    return NextResponse.json({ error: 'Quantity must be a non‑zero number' }, { status: 400 })
  }

  // 4. Fetch current stock (scoped to the user's company)
  const { data: product } = await supabase
    .from('products')
    .select('qty_on_hand')
    .eq('id', product_id)
    .eq('company_id', companyId)
    .single()

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const newQty = (product.qty_on_hand || 0) + qtyNum

  // 5. Update product stock
  const { error: updateErr } = await supabase
    .from('products')
    .update({ qty_on_hand: newQty })
    .eq('id', product_id)
    .eq('company_id', companyId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 6. Insert a stock move record (with company_id)
  const { error: insertErr } = await supabase.from('stock_moves').insert({
    company_id: companyId,        // ⭐ REQUIRED
    product_id,
    qty: qtyNum,
    move_type: 'adjustment',
    reason,
    date: date || new Date().toISOString().split('T')[0],
  })

  if (insertErr) {
    // Attempt to rollback the stock change
    await supabase.from('products')
      .update({ qty_on_hand: product.qty_on_hand })
      .eq('id', product_id)
      .eq('company_id', companyId)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Adjustment recorded', new_qty_on_hand: newQty })
}