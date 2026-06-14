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

  // 1. Find the admin user for this company
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

  // 2. Fetch the admin's email
  const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(adminRole.user_id)
  if (userError || !authUser?.user?.email) {
    return NextResponse.json({ error: 'Could not retrieve admin email' }, { status: 500 })
  }

  // 3. Generate a magic link for the admin (this will also send an email, but the link works for us)
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  })

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: linkError?.message || 'Link generation failed' }, { status: 500 })
  }

  // 4. Return the magic link URL
  return NextResponse.json({ redirectUrl: linkData.properties.action_link })
}