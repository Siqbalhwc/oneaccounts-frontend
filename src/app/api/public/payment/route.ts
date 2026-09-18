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
    return NextResponse.json({ error: 'Payment ID required' }, { status: 400 })
  }

  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('id, payment_no, payment_date, amount, payment_method, reference, notes, party_id, party_type, company_id')
    .eq('id', id)
    .single()

  if (error || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  let supplierName = 'Unknown', supplierPhone = '', supplierAddress = ''
  if (payment.party_id && payment.party_type === 'supplier') {
    const { data: supplier } = await supabaseAdmin
      .from('suppliers')
      .select('name, phone, address')
      .eq('id', payment.party_id)
      .single()
    supplierName = supplier?.name || 'Unknown'
    supplierPhone = supplier?.phone || ''
    supplierAddress = supplier?.address || ''
  }

  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('business_name, logo_url, tagline, address, phone, email')
    .eq('company_id', payment.company_id)
    .maybeSingle()

  return NextResponse.json({
    payment: {
      ...payment,
      supplier_name: supplierName,
      supplier_phone: supplierPhone,
      supplier_address: supplierAddress,
    },
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