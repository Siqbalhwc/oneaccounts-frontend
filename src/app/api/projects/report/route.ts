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

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const cid = project.company_id

  // 1. Annual budgets with activity, location, and account details
  const { data: budgets } = await supabaseAdmin
    .from("budgets")
    .select(`
      budgeted_amount,
      activities ( id, name ),
      locations ( id, name ),
      accounts ( code, name )
    `)
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("month", null)

  const totalAnnualBudget = budgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0

  // Group by activity → list of locations and accounts
  const activityMap: Record<string, any> = {}
  budgets?.forEach((b: any) => {
    const act = b.activities
    const loc = b.locations
    const acc = b.accounts
    if (!act) return

    const key = act.id || act.name
    if (!activityMap[key]) {
      activityMap[key] = {
        activity: act.name || key,
        locations: [],
        accounts: [],
        budget: 0,
      }
    }
    if (loc && !activityMap[key].locations.find((l: any) => l.id === loc.id)) {
      activityMap[key].locations.push({ id: loc.id, name: loc.name || loc.id })
    }
    if (acc && !activityMap[key].accounts.find((a: any) => a.code === acc.code)) {
      activityMap[key].accounts.push({ code: acc.code, name: acc.name })
    }
    activityMap[key].budget += b.budgeted_amount || 0
  })

  const activityBreakdown = Object.values(activityMap).map((a: any) => ({
    activity: a.activity,
    locations: a.locations.map((l: any) => l.name).join(", "),
    accounts: a.accounts.map((a: any) => `${a.code} - ${a.name}`).join("; "),
    budget: a.budget,
  }))

  // 2. Month‑wise budget (optional)
  const { data: monthlyBudgets } = await supabaseAdmin
    .from("budgets")
    .select("month, budgeted_amount")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .not("month", "is", null)
    .order("month", { ascending: true })

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