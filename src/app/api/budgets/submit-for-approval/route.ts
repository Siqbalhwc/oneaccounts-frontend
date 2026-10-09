import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, BUDGET_EDIT_ROLES, loadProject, loadStatusRow, checkMonthlyIntegrity, monthlyMismatchMessage, logBudgetEvent } from '@/lib/budgetServer'

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
    return NextResponse.json({ error: 'You do not have permission to submit budgets' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { projectId, fiscalYear } = body || {}
  if (!projectId || !fiscalYear) {
    return NextResponse.json({ error: 'projectId and fiscalYear are required' }, { status: 400 })
  }

  try {
    const project = await loadProject(supabaseAdmin, companyId, projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const pid = Number(project.id)

    // Only a draft (or a budget never submitted) can be sent for approval.
    const status = await loadStatusRow(supabaseAdmin, companyId, pid, fiscalYear)
    const current = status?.status || 'draft'
    if (current === 'pending_approval') {
      return NextResponse.json({ error: 'This budget is already waiting for approval.' }, { status: 409 })
    }
    if (current === 'approved') {
      return NextResponse.json({ error: 'This budget is already approved.' }, { status: 409 })
    }

    // Rule: every budget line must have a complete monthly split - checked on the saved data.
    const integrity = await checkMonthlyIntegrity(supabaseAdmin, companyId, pid)
    if (integrity.lines === 0) {
      return NextResponse.json({ error: 'There is no budget to submit for this project.' }, { status: 400 })
    }
    if (integrity.mismatches.length > 0) {
      return NextResponse.json({ error: monthlyMismatchMessage(integrity.mismatches.length), mismatches: integrity.mismatches }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('project_budget_status')
      .upsert({
        company_id: companyId,
        project_id: pid,
        fiscal_year: status?.fiscal_year ?? fiscalYear,
        status: 'pending_approval',
        monthly_budget_verified: true,
        submitted_by: actor.userId,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'company_id,project_id,fiscal_year' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logBudgetEvent(supabaseAdmin, {
      companyId, userId: actor.userId, recordId: `${pid}_${status?.fiscal_year ?? fiscalYear}`,
      oldValues: { status: current }, newValues: { status: 'pending_approval', project: project.name },
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
