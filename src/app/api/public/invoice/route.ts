import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const invoiceNo = searchParams.get('invoice_no')

  if (!invoiceNo) {
    return NextResponse.json({ error: 'Invoice number required' }, { status: 400 })
  }

  // Fetch invoice (no RLS – service role)
  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_no, date, due_date, total, paid, status, reference, notes, party_id, company_id')
    .eq('invoice_no', invoiceNo)
    .eq('type', 'sale')
    .single()

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Fetch customer name
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('name, code, phone, address, email')
    .eq('id', invoice.party_id)
    .single()

  // Fetch items (without cost prices)
  const { data: items } = await supabaseAdmin
    .from('invoice_items')
    .select('id, description, qty, unit_price, total, product_id')
    .eq('invoice_id', invoice.id)

  // Fetch product names
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

  // Fetch company logo
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('business_name, logo_url, tagline, address, phone, email')
    .eq('company_id', invoice.company_id)
    .maybeSingle()

  return NextResponse.json({
    invoice: {
      ...invoice,
      customer_name: customer?.name || 'Unknown',
      customer_code: customer?.code || '',
      customer_phone: customer?.phone || '',
      customer_address: customer?.address || '',
      customer_email: customer?.email || '',
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