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

export async function GET() {
  const { error, status } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  const { data: companies, error: compError } = await supabaseAdmin
    .from('companies')
    .select('id, name, subscription_status, created_at')
    .order('created_at', { ascending: true })

  if (compError) {
    console.error('companies fetch error:', compError.message)
    return NextResponse.json({ error: compError.message }, { status: 500 })
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({ companies: [] })
  }

  const { data: plans }    = await supabaseAdmin.from('plans').select('id, code, name')
  const { data: features } = await supabaseAdmin.from('features').select('id, code, name')

  const proFeatures = ['sales_invoices','purchase_bills','journal_entries','csv_import','whatsapp_send']

  const enriched = await Promise.all(companies.map(async (c: any) => {
    const { data: cs } = await supabaseAdmin
      .from('company_settings').select('plan_id').eq('company_id', c.id).maybeSingle()

    const plan     = (plans || []).find((p: any) => p.id === cs?.plan_id)
    const planCode = plan?.code || 'basic'
    const planName = plan?.name || 'Basic'

    const { data: companyFeatures } = await supabaseAdmin
      .from('company_features')
      .select('feature_id, enabled, features(code)')
      .eq('company_id', c.id)

    const overrides: Record<string, boolean> = {}
    companyFeatures?.forEach((f: any) => {
      const code = f.features?.code
      if (code) overrides[code] = f.enabled
    })

    return {
      id: c.id,
      name: c.name,
      status: c.subscription_status || 'active',
      plan_code: planCode,
      plan_name: planName,
      features: (features || []).map((feat: any) => {
        const isOverridden = overrides[feat.code] !== undefined
        const defaultEnabled = planCode === 'enterprise' || (planCode === 'pro' && proFeatures.includes(feat.code))
        return { code: feat.code, name: feat.name, enabled: isOverridden ? overrides[feat.code] : defaultEnabled, overridden: isOverridden }
      }),
    }
  }))

  return NextResponse.json({ companies: enriched })
}