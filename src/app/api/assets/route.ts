import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// Helper to generate asset number: AST/YYYYMM/0001
async function generateAssetNo(supabase: any, companyId: string): Promise<string> {
  const ym = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const prefix = `AST/${ym}/`
  const { data: last } = await supabase
    .from("assets")
    .select("asset_no")
    .like("asset_no", `${prefix}%`)
    .order("asset_no", { ascending: false })
    .limit(1)
  let nextNum = 1
  if (last && last.length > 0) {
    const match = last[0].asset_no.match(/\/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`
}

export async function GET(request: NextRequest) {
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

  const companyId = user.app_metadata?.company_id
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase.from('assets')
    .select('*, locations(name)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('asset_no')

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ assets: data })
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = user.app_metadata?.company_id
  const userEmail = user.email || 'system'
  const body = await request.json()

  const { name, category, purchase_date, cost_price, life_months, salvage_value,
          location_id, responsible_person_id, gl_asset_account_id,
          gl_accum_dep_account_id, gl_dep_expense_account_id, notes, source_type } = body

  if (!name || !purchase_date || !cost_price || !life_months) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const assetNo = await generateAssetNo(supabase, companyId)

  const { data: asset, error } = await supabase.from('assets').insert({
    company_id: companyId,
    asset_no: assetNo,
    name,
    category,
    purchase_date,
    cost_price,
    life_months,
    salvage_value: salvage_value || 0,
    current_location_id: location_id || null,
    responsible_person_id: responsible_person_id || null,
    gl_asset_account_id,
    gl_accum_dep_account_id,
    gl_dep_expense_account_id,
    status: 'Active',
    remaining_life_months: life_months,
    notes,
    source_type: source_type || 'manual',
    created_by: userEmail,
    updated_by: userEmail,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logDataChange('assets', String(asset.id), 'INSERT', undefined, asset)

  return NextResponse.json({ success: true, asset })
}