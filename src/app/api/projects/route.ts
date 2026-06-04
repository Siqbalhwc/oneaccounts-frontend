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

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = user.app_metadata?.company_id
  if (!companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  // Fetch projects only for the current company
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*, donors(name)")
    .eq("company_id", companyId)
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!projects || projects.length === 0) {
    return NextResponse.json([])
  }

  // Get total budget per project (annual only) – also scoped to company
  const { data: budgets } = await supabase
    .from("budgets")
    .select("project_id, budgeted_amount")
    .eq("company_id", companyId)
    .is("month", null)

  const budgetMap: Record<string, number> = {}
  if (budgets) {
    budgets.forEach((b: any) => {
      if (!budgetMap[b.project_id]) budgetMap[b.project_id] = 0
      budgetMap[b.project_id] += b.budgeted_amount || 0
    })
  }

  const enriched = projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    start_date: p.start_date,
    end_date: p.end_date,
    amount_fc: p.amount_fc,
    amount_pkr: p.amount_pkr,
    is_approved: p.is_approved,
    deleted_at: p.deleted_at,
    donors: p.donors,
    totalBudget: budgetMap[p.id] || 0,
  }))

  return NextResponse.json(enriched)
}