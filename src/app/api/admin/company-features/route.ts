import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function requireAdmin() {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (!roleData || roleData.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { error: null, status: 200 }
}

export async function PUT(request: Request) {
  const { error, status } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  const { companyId, featureCode, enabled } = await request.json()
  if (!companyId || !featureCode) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: feature } = await supabaseAdmin
    .from('features').select('id').eq('code', featureCode).single()
  if (!feature) return NextResponse.json({ error: 'Feature not found' }, { status: 404 })

  const { error: upsertError } = await supabaseAdmin
    .from('company_features')
    .upsert({ company_id: companyId, feature_id: feature.id, enabled })

  if (upsertError) {
    console.error('company_features upsert error:', upsertError.message)
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}