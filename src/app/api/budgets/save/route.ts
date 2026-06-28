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
  const { fiscalYear, projectId, donorId, rows } = body

  try {
    // Save budgets via RPC
    const { error } = await supabaseAdmin.rpc('save_budgets', {
      p_company_id: companyId,
      p_fiscal_year: fiscalYear,
      p_rows: rows,
      p_project_id: projectId || null,
      p_donor_id: donorId || null,
    })
    if (error) throw new Error(error.message)

    // Audit log (mirrors the original page)
    await supabaseAdmin.from('data_change_logs').insert({
      table_name: 'budgets',
      record_id: `${projectId || 'all'}_${fiscalYear}`,
      action: 'UPDATE',
      old_data: null,
      new_data: rows,
      changed_by: user?.email || user?.id || null,
      changed_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}