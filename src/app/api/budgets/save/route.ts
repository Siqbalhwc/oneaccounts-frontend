import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, BUDGET_EDIT_ROLES, validateBudgetRefs, projectsTouched, approvedProjectIds, loadProject } from '@/lib/budgetServer'

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

  const { actor, response } = await resolveBudgetActor(user, supabaseAdmin)
  if (!actor) return response!
  const companyId = actor.companyId

  if (!BUDGET_EDIT_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'You do not have permission to edit budgets' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { fiscalYear, projectId, donorId, rows } = body || {}
  if (!fiscalYear || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'fiscalYear and rows are required' }, { status: 400 })
  }
  if (!projectId && !donorId) {
    return NextResponse.json({ error: 'Select a project or a donor first' }, { status: 400 })
  }

  try {
    if (projectId && !(await loadProject(supabaseAdmin, companyId, projectId))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const refError = await validateBudgetRefs(supabaseAdmin, companyId, rows, donorId)
    if (refError) return NextResponse.json({ error: refError }, { status: 400 })

    // An approved budget can only be changed by an admin - checked here, not only on the screen.
    if (actor.role !== 'admin') {
      const touched = await projectsTouched(supabaseAdmin, companyId, projectId, rows)
      const locked = await approvedProjectIds(supabaseAdmin, companyId, touched)
      if (locked.length > 0) {
        return NextResponse.json({ error: 'This budget is approved. Only an admin can edit it.' }, { status: 403 })
      }
    }

    // Save budgets via RPC
    const { error } = await supabaseAdmin.rpc('save_budgets', {
      p_company_id: companyId,
      p_fiscal_year: fiscalYear,
      p_rows: rows,
      p_project_id: projectId || null,
      p_donor_id: donorId || null,
    })
    if (error) throw new Error(error.message)

    // Audit log
    const { error: auditError } = await supabaseAdmin.from('data_change_logs').insert({
      table_name: 'budgets',
      record_id: `${projectId || 'all'}_${fiscalYear}`,
      action: 'UPDATE',
      old_values: null,
      new_values: rows,
      changed_by: actor.userId,
      company_id: companyId,
      changed_at: new Date().toISOString(),
    })
    if (auditError) {
      console.error('Failed to write budget audit log:', auditError.message)
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
