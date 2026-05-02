import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Admin client — uses service‑role key, no cookie handling needed
const getAdminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

export async function GET() {
  const cookieStore = await cookies()

  // Standard client for auth check (respects RLS)
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

  // Admin client for data queries (bypasses RLS)
  const supabaseAdmin = getAdminClient()

  // Fetch all companies
  const { data: companies, error: compError } = await supabaseAdmin
    .from('companies')
    .select('id, name, status, created_at')

  if (compError) return NextResponse.json({ error: compError.message }, { status: 500 })

  // Fetch plans and features
  const { data: plans } = await supabaseAdmin.from('plans').select('id, code, name')
  const { data: features } = await supabaseAdmin.from('features').select('id, code, name')

  // Helper: look up plan info for a given company
  const getPlanInfo = async (companyId: string) => {
    const { data: cs } = await supabaseAdmin
      .from('company_settings')
      .select('plan_id')
      .eq('company_id', companyId)           // ← Bug 2 fixed: per‑company lookup
      .maybeSingle()

    const plan = plans?.find(p => p.id === cs?.plan_id)
    return { code: plan?.code || 'basic', name: plan?.name || 'Basic' }
  }

  // Enrich companies
  const enriched = await Promise.all((companies || []).map(async (c: any) => {
    const plan = await getPlanInfo(c.id)

    // Company‑level feature overrides
    const { data: companyFeatures } = await supabaseAdmin
      .from('company_features')
      .select('features!inner(code), enabled')
      .eq('company_id', c.id)

    const overrides: Record<string, boolean> = {}
    companyFeatures?.forEach((f: any) => {
      if (f.features?.code) overrides[f.features.code] = f.enabled
    })

    return {
      id: c.id,
      name: c.name,
      status: c.status || 'active',          // ← Bug 1 fixed: uses 'status' column
      plan_code: plan.code,
      plan_name: plan.name,
      features: (features || []).map((feat: any) => {
        const isOverridden = overrides[feat.code] !== undefined
        const enabled = isOverridden
          ? overrides[feat.code]
          : plan.code === 'pro' && ['sales_invoices','purchase_bills','journal_entries','csv_import','whatsapp_send'].includes(feat.code)
            || plan.code === 'enterprise'
        return { code: feat.code, name: feat.name, enabled, overridden: isOverridden }
      }),
    }
  }))

  return NextResponse.json({ companies: enriched })
}