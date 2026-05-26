import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
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

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const { data, error } = await supabase
    .from('company_settings')
    .select('business_name, address, phone, email, tagline, logo_url, business_type')
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    name:          data?.business_name || '',
    address:       data?.address       || '',
    phone:         data?.phone         || '',
    email:         data?.email         || '',
    tagline:       data?.tagline       || '',
    logo_url:      data?.logo_url      || null,
    business_type: data?.business_type || '',
  })
}