import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/admin/users — list all users with their roles
export async function GET() {
  try {
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const userIds = users.users.map(u => u.id)
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .eq("company_id", "00000000-0000-0000-0000-000000000001")
      .in("user_id", userIds)

    const roleMap: Record<string, string> = {}
    roles?.forEach(r => { roleMap[r.user_id] = r.role })

    const enrichedUsers = users.users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      role: roleMap[u.id] || "none",
    }))

    return NextResponse.json({ users: enrichedUsers })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/admin/users — assign role to a user
export async function PUT(request: Request) {
  try {
    const { userId, role } = await request.json()
    if (!userId || !role) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: userId,
        company_id: "00000000-0000-0000-0000-000000000001",
        role,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}