import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Bill ID required' }, { status: 400 })
  }

  const { data: bill, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_no, date, due_date, total, paid, status, reference, notes, party_id, company_id')
    .eq('id', id)
    .eq('type', 'purchase')
    .single()

  if (error || !bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  const { data: supplier } = await supabaseAdmin
    .from('suppliers')
    .select('name, code, phone, address, email')
    .eq('id', bill.party_id)
    .single()

  const { data: items } = await supabaseAdmin
    .from('invoice_items')
    .select('id, description, qty, unit_price, total, product_id')
    .eq('invoice_id', bill.id)
    .order('id')

  let itemsWithNames = items || []
  if (items && items.length > 0) {
    const productIds = items.map((i: any) => i.product_id).filter(Boolean)
    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, name, code')
        .in('id', productIds)
      const prodMap: Record<number, any> = {}
      if (products) products.forEach((p: any) => { prodMap[p.id] = p })
      itemsWithNames = items.map((item: any) => ({
        ...item,
        product_name: prodMap[item.product_id]?.name || '',
        product_code: prodMap[item.product_id]?.code || '',
      }))
    }
  }

  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('business_name, logo_url, tagline, address, phone, email')
    .eq('company_id', bill.company_id)
    .maybeSingle()

  return NextResponse.json({
    bill: {
      ...bill,
      supplier_name: supplier?.name || 'Unknown',
      supplier_code: supplier?.code || '',
      supplier_phone: supplier?.phone || '',
      supplier_address: supplier?.address || '',
      supplier_email: supplier?.email || '',
    },
    items: itemsWithNames,
    company: {
      name: settings?.business_name || 'OneAccounts',
      logo: settings?.logo_url || null,
      tagline: settings?.tagline || '',
      address: settings?.address || '',
      phone: settings?.phone || '',
      email: settings?.email || '',
    },
  })
}