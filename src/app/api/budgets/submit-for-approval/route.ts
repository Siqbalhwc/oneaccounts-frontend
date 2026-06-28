import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
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

  const body = await request.json()
  const { projectId, fiscalYear } = body

  if (!projectId || !fiscalYear) {
    return NextResponse.json({ error: 'projectId and fiscalYear are required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('project_budget_status')
    .upsert({
      company_id: companyId,
      project_id: parseInt(projectId),
      fiscal_year: fiscalYear,
      status: 'pending_approval',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'company_id,project_id,fiscal_year' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}