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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await isSuperAdmin(user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { companyId } = await params

  const { data: features, error } = await supabaseAdmin
    .from('company_features')
    .select(`
      feature_id,
      enabled,
      features ( code )
    `)
    .eq('company_id', companyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const formatted = features.map((f: any) => ({
    code: f.features?.code,
    enabled: f.enabled,
  }))

  return NextResponse.json({ features: formatted })
}