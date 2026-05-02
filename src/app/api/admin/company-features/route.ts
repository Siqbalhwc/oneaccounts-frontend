import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Admin client — uses service‑role key, no cookies needed
const getAdminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

export async function PUT(request: Request) {
  const cookieStore = await cookies()

  // Standard client for auth check
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

  // Authenticate
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin role check
  let role = 'viewer'
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (roleData?.role) role = roleData.role

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Admin client for data mutations
  const supabaseAdmin = getAdminClient()

  const { companyId, featureCode, enabled } = await request.json()
  if (!companyId || !featureCode) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Look up feature ID
  const { data: feature } = await supabaseAdmin
    .from('features')
    .select('id')
    .eq('code', featureCode)
    .single()

  if (!feature) {
    return NextResponse.json({ error: 'Feature not found' }, { status: 404 })
  }

  // Upsert company override
  const { error } = await supabaseAdmin
    .from('company_features')
    .upsert({
      company_id: companyId,
      feature_id: feature.id,
      enabled: enabled,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}