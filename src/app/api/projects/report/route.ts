import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 })

  // Fetch project info
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const cid = project.company_id

  // 1. Annual budgets (month IS NULL) – used for total approved budget
  const { data: annualBudgets } = await supabaseAdmin
    .from("budgets")
    .select("budgeted_amount")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("month", null)

  const totalAnnualBudget = annualBudgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0

  // 2. Activity‑wise budget – annual budgets linked to activities
  const { data: activityBudgets } = await supabaseAdmin
    .from("budgets")
    .select("budgeted_amount, activities(id, name)")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("month", null)
    .not("activity_id", "is", null)

  // Group by activity
  const activityMap: Record<string, { name: string; budget: number }> = {}
  activityBudgets?.forEach((b: any) => {
    const act = b.activities
    if (!act) return
    const key = act.name || act.id
    if (!activityMap[key]) activityMap[key] = { name: act.name || key, budget: 0 }
    activityMap[key].budget += b.budgeted_amount || 0
  })
  const activityBreakdown = Object.values(activityMap).map(a => ({
    activity: a.name,
    budget: a.budget,
  }))

  // 3. Month‑wise budget (month IS NOT NULL)
  const { data: monthlyBudgets } = await supabaseAdmin
    .from("budgets")
    .select("month, budgeted_amount")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .not("month", "is", null)
    .order("month", { ascending: true })

  // Group by month
  const monthMap: Record<string, number> = {}
  monthlyBudgets?.forEach((b: any) => {
    monthMap[b.month] = (monthMap[b.month] || 0) + (b.budgeted_amount || 0)
  })
  const monthlyBreakdown = Object.entries(monthMap)
    .map(([month, budget]) => ({ month, budget }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return NextResponse.json({
    totalAnnualBudget,
    activityBreakdown,
    monthlyBreakdown,
  })
}