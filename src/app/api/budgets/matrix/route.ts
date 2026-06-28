import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

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

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const fiscalYear = parseInt(searchParams.get('fiscalYear') || '2026')
  const projectId = searchParams.get('projectId') || undefined
  const donorId = searchParams.get('donorId') || undefined
  const locationId = searchParams.get('locationId') || undefined
  const view = searchParams.get('view') || 'gl'
  const duration = parseInt(searchParams.get('duration') || '12')

  try {
    let data
    if (view === 'month') {
      const { data: rows, error } = await supabaseAdmin.rpc('get_budget_matrix_monthly', {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
        p_project_id: projectId ? parseInt(projectId) : null,
        p_donor_id: donorId ? parseInt(donorId) : null,
        p_location_id: locationId ? parseInt(locationId) : null,
        p_project_duration: duration,
      })
      if (error) throw new Error(error.message)
      data = rows
    } else {
      const { data: rows, error } = await supabaseAdmin.rpc('get_budget_matrix_gl', {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
        p_project_id: projectId ? parseInt(projectId) : null,
        p_donor_id: donorId ? parseInt(donorId) : null,
        p_location_id: locationId ? parseInt(locationId) : null,
      })
      if (error) throw new Error(error.message)
      data = rows
    }
    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}