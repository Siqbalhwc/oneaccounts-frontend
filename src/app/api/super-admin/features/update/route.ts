import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function isSuperAdmin(user: any) {
  if (!user) return false
  const { data } = await supabaseAdmin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  return !!data
}

export async function POST(request: Request) {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await isSuperAdmin(user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { companyId, featureCode, enabled } = await request.json()
  if (!companyId || !featureCode) {
    return NextResponse.json({ error: 'Missing companyId or featureCode' }, { status: 400 })
  }

  // Find the feature UUID
  const { data: feature } = await supabaseAdmin
    .from('features')
    .select('id')
    .eq('code', featureCode)
    .single()

  if (!feature) {
    return NextResponse.json({ error: `Feature "${featureCode}" not found` }, { status: 404 })
  }

  // Upsert the company feature override
  const { error } = await supabaseAdmin
    .from('company_features')
    .upsert(
      { company_id: companyId, feature_id: feature.id, enabled },
      { onConflict: 'company_id,feature_id' }
    )

  if (error) {
    console.error('Failed to update feature:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}