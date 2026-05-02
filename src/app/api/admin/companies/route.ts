import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
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

  // Admin check – fallback if no role found
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

  // Fetch all companies
  const { data: companies, error: compError } = await supabase
    .from('companies')
    .select('id, name, subscription_status, created_at')

  if (compError) return NextResponse.json({ error: compError.message }, { status: 500 })

  // Fetch all plans and features
  const { data: plans } = await supabase.from('plans').select('id, code, name')
  const { data: features } = await supabase.from('features').select('id, code, name')

  // Helper to get plan info
  const getPlanInfo = (planId: string | null) => {
    const plan = plans?.find(p => p.id === planId)
    return { code: plan?.code || 'basic', name: plan?.name || 'Basic' }
  }

  // Enrich companies
  const enriched = await Promise.all((companies || []).map(async (c: any) => {
    const { data: cs } = await supabase
      .from('company_settings')
      .select('plan_id')
      .eq('id', 1)
      .maybeSingle()

    const plan = getPlanInfo(cs?.plan_id || null)

    // Company-level overrides
    const { data: companyFeatures } = await supabase
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
      status: c.subscription_status || 'active',   // ← correct column name
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