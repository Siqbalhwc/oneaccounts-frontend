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
    return NextResponse.json({ error: 'Receipt ID required' }, { status: 400 })
  }

  const { data: receipt, error } = await supabaseAdmin
    .from('receipts')
    .select('id, receipt_no, date, amount, reference, notes, party_id, company_id, bank_account_id')
    .eq('id', id)
    .single()

  if (error || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('name, phone, address, email')
    .eq('id', receipt.party_id)
    .single()

  let bankName = ''
  if (receipt.bank_account_id) {
    const { data: bank } = await supabaseAdmin
      .from('bank_accounts')
      .select('bank_name')
      .eq('id', receipt.bank_account_id)
      .single()
    bankName = bank?.bank_name || ''
  }

  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('business_name, logo_url, tagline, address, phone, email')
    .eq('company_id', receipt.company_id)
    .maybeSingle()

  return NextResponse.json({
    receipt: {
      ...receipt,
      customer_name: customer?.name || 'Unknown',
      customer_phone: customer?.phone || '',
      customer_address: customer?.address || '',
      bank_name: bankName,
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