import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

export async function POST(request: NextRequest) {
  const { error, status } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status })

  const { companyId } = await request.json()
  if (!companyId) {
    return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
  }

  // Soft‑delete the company (sets deleted_at) – RLS will block access immediately
  const { error: deleteError } = await supabaseAdmin
    .from('companies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', companyId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}