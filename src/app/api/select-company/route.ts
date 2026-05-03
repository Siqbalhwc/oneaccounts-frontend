import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service‑role admin client (bypasses RLS, can update any user)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: Request) {
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

  const { companyId } = await request.json()
  if (!companyId) return NextResponse.json({ error: 'Missing company ID' }, { status: 400 })

  // Verify the user belongs to this company
  const { data: role } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!role) {
    return NextResponse.json({ error: 'You do not belong to this company' }, { status: 403 })
  }

  // Update the user's active company in app_metadata
  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    { app_metadata: { company_id: companyId } }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}