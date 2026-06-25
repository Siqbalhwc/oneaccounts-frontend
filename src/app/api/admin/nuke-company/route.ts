import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: Request) {
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { targetCompanyId: reqCompanyId } = await request.json()

  // Check if user is a super admin
  const { data: superAdmin } = await supabaseAdmin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let targetCompanyId: string | null = null

  if (superAdmin && reqCompanyId) {
    // Super admin can nuke any company
    targetCompanyId = reqCompanyId
  } else {
    // Normal flow: user's active admin company
    const { data: activeRole } = await supabaseAdmin
      .from('user_roles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (activeRole?.role === 'admin') {
      targetCompanyId = activeRole.company_id
    } else {
      const { data: anyAdmin } = await supabaseAdmin
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle()
      if (anyAdmin) targetCompanyId = anyAdmin.company_id
    }
  }

  if (!targetCompanyId) {
    return NextResponse.json({ error: 'No admin company found' }, { status: 403 })
  }

  try {
    const { error } = await supabaseAdmin.rpc('nuke_company_data', {
      target_company_id: targetCompanyId,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, message: 'Company wiped completely.' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}