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
  if (!user) return { error: 'Unauthorized', status: 401, user: null }

  // Get the active company from the JWT
  const companyId = (user.app_metadata as any)?.company_id
  if (!companyId) return { error: 'No active company', status: 400, user: null }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!roleData || roleData.role !== 'admin') {
    return { error: 'Forbidden', status: 403, user: null }
  }

  return { error: null, status: 200, user, companyId }
}

// ─── GET ──────────────────────────────────────────────────
export async function GET() {
  const { error, status, companyId } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  const { data: authUsers, error: usersError } = await supabaseAdmin
    .rpc('get_auth_users')

  if (usersError) {
    console.error('get_auth_users error:', usersError)
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  const userIds = (authUsers || []).map((u: any) => u.id)

  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('user_id', userIds)

  const roleMap: Record<string, string> = {}
  roles?.forEach(r => { roleMap[r.user_id] = r.role })

  const enriched = (authUsers || []).map((u: any) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    role: roleMap[u.id] || 'none',
  }))

  return NextResponse.json({ users: enriched })
}

// ─── PUT (update role) ────────────────────────────────────
export async function PUT(request: Request) {
  const { error, status, companyId } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  const { userId, role } = await request.json()
  if (!userId || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error: upsertError } = await supabaseAdmin
    .from('user_roles')
    .upsert({
      user_id: userId,
      company_id: companyId,
      role,
    })

  if (upsertError) {
    console.error('Admin upsert error:', upsertError)
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ─── POST (invite user) ───────────────────────────────────
export async function POST(request: Request) {
  const { error, status, companyId } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  const { email, role = 'viewer' } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  // Invite via Supabase Auth Admin
  const { data: inviteData, error: inviteError } = await supabaseAdmin
    .auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    })

  if (inviteError) {
    console.error('Invite error:', inviteError)
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  if (inviteData.user) {
    await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: inviteData.user.id,
        company_id: companyId,
        role,
      })
  }

  return NextResponse.json({
    success: true,
    message: `Invitation sent to ${email}. They will appear after signing up.`
  })
}