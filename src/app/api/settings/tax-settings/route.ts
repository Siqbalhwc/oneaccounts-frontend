import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// GET company tax settings
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('company_tax_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()

  return NextResponse.json({ settings: data })
}

// POST / PUT – upsert company tax settings
export async function POST(request: Request) {
  const { companyId, default_sales_tax_code_id, default_wht_tax_code_id, prices_include_tax, tax_registration_no, tax_office } = await request.json()
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('company_tax_settings')
    .upsert({
      company_id: companyId,
      default_sales_tax_code_id: default_sales_tax_code_id || null,
      default_wht_tax_code_id: default_wht_tax_code_id || null,
      prices_include_tax: prices_include_tax || false,
      tax_registration_no: tax_registration_no || null,
      tax_office: tax_office || null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, settings: data })
}