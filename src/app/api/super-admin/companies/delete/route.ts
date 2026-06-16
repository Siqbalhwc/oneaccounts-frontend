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

  // Soft‑delete only – NO hard delete, NO foreign‑key conflict
  const { error } = await supabaseAdmin
    .from('companies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', companyId)

  if (error) {
    console.error('Failed to soft‑delete company:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}