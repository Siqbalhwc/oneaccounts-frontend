import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// ── Service-role admin client (no cookies needed — server only) ───────────────
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ── Helper: check user is authenticated and is admin ─────────────────────────
async function requireAdmin() {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle()

  if (!roleData || roleData.role !== 'admin') {
    return { error: 'Forbidden', status: 403, user: null }
  }

  return { error: null, status: 200, user }
}

// ── GET: list all users with their roles ──────────────────────────────────────
export async function GET() {
  const { error, status } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  // Use the DB function we created — bypasses Auth Admin API entirely
  // Run this in Supabase SQL Editor first if not done yet:
  //
  // CREATE OR REPLACE FUNCTION get_auth_users()
  // RETURNS TABLE (id uuid, email text, created_at timestamptz)
  // LANGUAGE sql SECURITY DEFINER SET search_path = auth, public
  // AS $$ SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC; $$;

  const { data: authUsers, error: usersError } = await supabaseAdmin
    .rpc('get_auth_users')

  if (usersError) {
    console.error('get_auth_users error:', usersError)
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  const userIds = (authUsers || []).map((u: any) => u.id)

  // Fetch roles for all users in this company
  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('user_id, role')
    .eq('company_id', '00000000-0000-0000-0000-000000000001')
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

// ── PUT: update a user's role ─────────────────────────────────────────────────
export async function PUT(request: Request) {
  const { error, status } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  const { userId, role } = await request.json()
  if (!userId || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error: upsertError } = await supabaseAdmin
    .from('user_roles')
    .upsert({
      user_id: userId,
      company_id: '00000000-0000-0000-0000-000000000001',
      role,
    })

  if (upsertError) {
    console.error('Admin upsert error:', upsertError)
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
