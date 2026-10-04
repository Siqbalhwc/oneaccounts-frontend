import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET() {
  // Only a super admin may list payments from all companies
  const supabase = await createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: sa } = await supabaseAdmin
    .from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!sa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: payments, error } = await supabaseAdmin
    .from('payment_notifications')
    .select('*, companies(name)')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ payments })
}