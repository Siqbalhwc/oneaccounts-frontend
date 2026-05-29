import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET() {
  // 1. Get all projects with donor name
  const { data: projects, error } = await supabaseAdmin
    .from("projects")
    .select("*, donors(name)")
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!projects || projects.length === 0) {
    return NextResponse.json([])
  }

  // 2. Get total budget per project (annual only)
  const { data: budgets } = await supabaseAdmin
    .from("budgets")
    .select("project_id, budgeted_amount")
    .is("month", null)   // only annual budgets

  // 3. Build a map of project_id → total budget
  const budgetMap: Record<string, number> = {}
  if (budgets) {
    budgets.forEach((b: any) => {
      if (!budgetMap[b.project_id]) budgetMap[b.project_id] = 0
      budgetMap[b.project_id] += b.budgeted_amount || 0
    })
  }

  // 4. Enrich projects with totalBudget
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