import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// GET all tax codes for a company
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('tax_codes')
    .select('*, accounts(code)')
    .eq('company_id', companyId)
    .order('code')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []).map((tc: any) => ({
    ...tc,
    gl_account_code: tc.accounts?.code || '',
  }))
  return NextResponse.json({ taxCodes: rows })
}

// POST – create a new tax code
export async function POST(request: Request) {
  const { companyId, tax_category_code, code, name, rate, applies_to, is_default, tax_account_id, effective_from, effective_to, wht_base, is_recoverable } = await request.json()
  if (!companyId || !code || !name || !tax_account_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('tax_codes')
    .insert({
      company_id: companyId,
      tax_category_code: tax_category_code || 'sales_tax',
      code,
      name,
      rate: rate || 0,
      applies_to: applies_to || 'both',
      is_default: is_default || false,
      tax_account_id,
      effective_from: effective_from || new Date().toISOString().split('T')[0],
      effective_to: effective_to || null,
      wht_base: wht_base || null,
      is_recoverable: is_recoverable !== undefined ? is_recoverable : true,
    })
    .select('*, accounts(code)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, taxCode: { ...data, gl_account_code: data.accounts?.code || '' } })
}

// PUT – update a tax code
export async function PUT(request: Request) {
  const { id, companyId, tax_category_code, code, name, rate, applies_to, is_default, tax_account_id, effective_from, effective_to, wht_base, is_recoverable } = await request.json()
  if (!id || !companyId) return NextResponse.json({ error: 'Missing id or companyId' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('tax_codes')
    .update({
      tax_category_code,
      code,
      name,
      rate,
      applies_to,
      is_default,
      tax_account_id,
      effective_from,
      effective_to,
      wht_base,
      is_recoverable,
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*, accounts(code)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, taxCode: { ...data, gl_account_code: data.accounts?.code || '' } })
}

// DELETE – soft‑delete (lock) a tax code
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const companyId = searchParams.get('companyId')
  if (!id || !companyId) return NextResponse.json({ error: 'Missing id or companyId' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('tax_codes')
    .update({ is_locked: true })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}