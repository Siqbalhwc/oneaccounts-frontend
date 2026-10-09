import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveBudgetActor, loadProject, loadStatusRow, logBudgetEvent } from '@/lib/budgetServer'

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

  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can reject a budget' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { projectId, fiscalYear, reason } = body || {}
  if (!projectId || !fiscalYear) {
    return NextResponse.json({ error: 'projectId and fiscalYear are required' }, { status: 400 })
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 })
  }

  try {
    const project = await loadProject(supabaseAdmin, companyId, projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const pid = Number(project.id)

    const status = await loadStatusRow(supabaseAdmin, companyId, pid, fiscalYear)
    if (!status || status.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Only a budget that is waiting for approval can be rejected.' }, { status: 409 })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('project_budget_status')
      .update({
        status: 'draft',
        rejection_reason: reason.trim(),
        rejected_by: actor.userId,
        rejected_at: new Date().toISOString(),
        monthly_budget_verified: false,
      })
      .eq('company_id', companyId)
      .eq('project_id', pid)
      .eq('fiscal_year', status.fiscal_year)
      .eq('status', 'pending_approval')
      .select('project_id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'The budget status changed - please refresh and try again.' }, { status: 409 })
    }

    await logBudgetEvent(supabaseAdmin, {
      companyId, userId: actor.userId, recordId: `${pid}_${status.fiscal_year}`,
      oldValues: { status: 'pending_approval' }, newValues: { status: 'draft', rejected: true, reason: reason.trim(), project: project.name },
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
