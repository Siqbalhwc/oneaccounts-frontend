import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRow, error: roleErr } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (roleErr || !roleRow?.company_id) {
    return NextResponse.json({ error: 'No active company found for this user' }, { status: 400 })
  }
  const companyId = roleRow.company_id as string

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('get_trial_balance', {
    cid: companyId,
    start_d: startDate,
    end_d: endDate,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data || [])
}
