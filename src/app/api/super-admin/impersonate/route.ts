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

  const { companyId } = await request.json()
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

  // Get the admin user of that company
  const { data: adminRole } = await supabaseAdmin
    .from('user_roles')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (!adminRole?.user_id) {
    return NextResponse.json({ error: 'No admin found for this company' }, { status: 404 })
  }

  // Generate a magic link / session for that user
  // We can use admin.generateLink() or directly create a session.
  // The easiest: generate a temporary access token and redirect.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: (await supabaseAdmin.auth.admin.getUserById(adminRole.user_id)).data?.user?.email || '',
  })

  if (linkError || !linkData) {
    return NextResponse.json({ error: linkError?.message || 'Link generation failed' }, { status: 500 })
  }

  // Return the URL the super admin should be redirected to
  return NextResponse.json({ redirectUrl: linkData.properties?.action_link })
}