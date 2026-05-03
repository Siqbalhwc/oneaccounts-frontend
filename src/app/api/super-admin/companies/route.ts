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

export async function GET() {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all companies with plan name and subscription status
  const { data: companies, error } = await supabaseAdmin
    .from('companies')
    .select(`
      id, name, plan_id, trial_ends_at, is_trial,
      plans(name),
      user_roles(count)
    `)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with subscription info (latest)
  const enriched = await Promise.all(companies.map(async (c: any) => {
    const { data: latestSub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('company_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Find admin email
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('company_id', c.id)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()
    let adminEmail = ''
    if (adminRole?.user_id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(adminRole.user_id)
      adminEmail = authUser?.user?.email || ''
    }

    return {
      id: c.id,
      name: c.name,
      plan: c.plans?.name || 'Basic',
      is_trial: c.is_trial,
      trial_ends_at: c.trial_ends_at,
      user_count: c.user_roles?.[0]?.count || 0,
      admin_email: adminEmail,
      subscription: latestSub || null,
    }
  }))

  return NextResponse.json({ companies: enriched })
}