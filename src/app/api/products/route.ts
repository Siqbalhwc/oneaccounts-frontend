import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helper: extract user + company_id (same as your other routes) ──────
async function getCompanyId(supabase: ReturnType<typeof createServerClient>): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Try app_metadata first
  const companyId = (user.app_metadata as any)?.company_id
  if (companyId) return companyId

  // Fallback: active company from user_roles
  const { data: role } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (role?.company_id) return role.company_id

  throw new Error('No company found')
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

  // Authenticate and get company
  let companyId: string
  try {
    companyId = await getCompanyId(supabase)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unauthorized' }, { status: 401 })
  }

  const { code, name, sale_price, cost_price, opening_qty, image_url } = await request.json()
  if (!name) return NextResponse.json({ error: 'Product name is required' }, { status: 400 })

  const salePrice = Number(sale_price || 0)
  const costPrice = Number(cost_price || 0)
  const openingQty = Number(opening_qty || 0)

  let productCode = code?.trim() || ""
  if (!productCode) {
    // ✅ Scoped to company
    const { data: existing } = await supabase
      .from('products')
      .select('code')
      .eq('company_id', companyId)          // ← company filter
      .like('code', 'PROD-%')
      .order('code', { ascending: false })
      .limit(1)

    let maxNum = 0
    if (existing && existing.length > 0) {
      const parts = existing[0].code.split('-')
      if (parts.length === 2) {
        const n = parseInt(parts[1])
        if (!isNaN(n)) maxNum = n
      }
    }
    productCode = `PROD-${String(maxNum + 1).padStart(3, '0')}`
  }

  // Create product – ✅ includes company_id
  const { data: product, error: insertErr } = await supabase
    .from('products')
    .insert({
      company_id: companyId,               // ← company stamp
      code: productCode,
      name,
      sale_price: salePrice,
      cost_price: costPrice,
      qty_on_hand: openingQty,
      image_url: image_url || null,
    })
    .select('id')
    .single()

  if (insertErr || !product) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to create product' }, { status: 500 })
  }

  await logDataChange('products', String(product.id), 'INSERT', undefined, {
    code: productCode, name, sale_price: salePrice,
    cost_price: costPrice, qty_on_hand: openingQty,
    company_id: companyId,
  })

  // Opening inventory GL entry – also pass company_id
  if (openingQty > 0 && costPrice > 0) {
    const totalValue = openingQty * costPrice
    await postOpeningInventoryEntry(supabase, product.id, productCode, name, totalValue, 'new', companyId)
  }

  return NextResponse.json({ success: true, productId: product.id, code: productCode })
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

  let companyId: string
  try {
    companyId = await getCompanyId(supabase)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unauthorized' }, { status: 401 })
  }

  const { id, code, name, sale_price, cost_price, opening_qty, image_url } = await request.json()
  if (!id || !code || !name) return NextResponse.json({ error: 'ID, code and name required' }, { status: 400 })

  // ✅ Fetch old product scoped to company
  const { data: oldProduct } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)           // ← company filter
    .single()

  if (!oldProduct) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const newOpeningQty = Number(opening_qty || 0)
  const newCostPrice = Number(cost_price || 0)
  const newSalePrice = Number(sale_price || 0)

  // ✅ Update scoped to company
  const { error: updateErr } = await supabase
    .from('products')
    .update({
      code, name,
      sale_price: newSalePrice,
      cost_price: newCostPrice,
      qty_on_hand: newOpeningQty,
      image_url: image_url || null,
    })
    .eq('id', id)
    .eq('company_id', companyId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  if (oldProduct) {
    await logDataChange('products', String(id), 'UPDATE', oldProduct, {
      code, name, sale_price: newSalePrice,
      cost_price: newCostPrice, qty_on_hand: newOpeningQty,
      company_id: companyId,
    })
  }

  const oldValue = (oldProduct?.cost_price || 0) * (oldProduct?.qty_on_hand || 0)
  const newValue = newOpeningQty * newCostPrice

  if (oldValue !== newValue) {
    if (oldValue > 0) {
      await postOpeningInventoryEntry(supabase, id, code, name, oldValue, 'reverse', companyId)
    }
    if (newValue > 0) {
      await postOpeningInventoryEntry(supabase, id, code, name, newValue, 'new', companyId)
    }
  }

  return NextResponse.json({ success: true })
}

// ✅ Updated helper to accept company_id and stamp journal entries/lines
async function postOpeningInventoryEntry(
  supabase: ReturnType<typeof createServerClient>,
  productId: number,
  code: string,
  name: string,
  totalValue: number,
  mode: 'new' | 'reverse',
  companyId: string
) {
  const invAcc = await supabase.from('accounts')
    .select('id,balance')
    .eq('code', '1200')
    .eq('company_id', companyId)
    .single()
  const eqAcc = await supabase.from('accounts')
    .select('id,balance')
    .eq('code', '3000')
    .eq('company_id', companyId)
    .single()
  if (!invAcc.data || !eqAcc.data) return

  const sign = mode === 'reverse' ? -1 : 1
  const debitAccount = mode === 'new' ? invAcc.data.id : eqAcc.data.id
  const creditAccount = mode === 'new' ? eqAcc.data.id : invAcc.data.id
  const debitAmount = totalValue
  const creditAmount = totalValue

  const description = mode === 'new'
    ? `Opening Inventory - ${code} ${name}`
    : `Reverse Opening Inventory - ${code} ${name}`

  // ✅ journal_entries with company_id
  const { data: entry } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `OB-INV-${productId}-${mode === 'reverse' ? 'REV' : 'NEW'}-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    description,
  }).select('id').single()

  if (!entry) return

  // ✅ journal_lines with company_id
  await supabase.from('journal_lines').insert([
    { company_id: companyId, entry_id: entry.id, account_id: debitAccount, debit: debitAmount, credit: 0 },
    { company_id: companyId, entry_id: entry.id, account_id: creditAccount, debit: 0, credit: creditAmount },
  ])

  // ✅ Update account balances
  await supabase.from('accounts')
    .update({ balance: invAcc.data.balance + (sign * totalValue) })
    .eq('id', invAcc.data.id)
    .eq('company_id', companyId)

  await supabase.from('accounts')
    .update({ balance: eqAcc.data.balance + (sign * totalValue) })
    .eq('id', eqAcc.data.id)
    .eq('company_id', companyId)
}