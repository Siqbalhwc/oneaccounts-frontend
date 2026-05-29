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

  // 1. Fetch project company_id
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const cid = project.company_id

  // 2. GL‑wise actuals (same as before)
  const { data: glRows } = await supabaseAdmin
    .from("journal_lines")
    .select("account_id, debit, credit, accounts(code, name)")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("journal_entries.deleted_at", null)

  const accountMap: Record<number, { code: string; name: string; total: number }> = {}
  if (glRows) {
    glRows.forEach((row: any) => {
      const acc = row.accounts
      if (!acc) return
      const net = (row.debit || 0) - (row.credit || 0)
      if (!accountMap[row.account_id]) {
        accountMap[row.account_id] = { code: acc.code, name: acc.name, total: 0 }
      }
      accountMap[row.account_id].total += net
    })
  }
  const accountGroups = Object.values(accountMap).map(a => ({
    code: a.code,
    name: a.name,
    amount: Math.abs(a.total),
    type: a.total >= 0 ? "Debit" : "Credit",
  }))

  // 3. Monthly budgets (from budgets table, where month is not null)
  const { data: budgetRows } = await supabaseAdmin
    .from("budgets")
    .select("month, budgeted_amount")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .not("month", "is", null)

  // 4. Monthly actuals (from journal_lines + journal_entries date)
  const { data: monthActuals } = await supabaseAdmin
    .from("journal_lines")
    .select("debit, credit, journal_entries!inner(date)")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("journal_entries.deleted_at", null)

  // Build month-wise map: month → { budget, actual }
  const monthMap: Record<string, { budget: number; actual: number }> = {}

  // Insert budgets
  if (budgetRows) {
    budgetRows.forEach((b: any) => {
      if (!b.month) return
      if (!monthMap[b.month]) monthMap[b.month] = { budget: 0, actual: 0 }
      monthMap[b.month].budget += b.budgeted_amount || 0
    })
  }

  // Insert actuals
  if (monthActuals) {
    monthActuals.forEach((row: any) => {
      const date = row.journal_entries?.date
      if (!date) return
      const month = date.substring(0, 7) // "2026-05"
      if (!monthMap[month]) monthMap[month] = { budget: 0, actual: 0 }
      const net = (row.debit || 0) - (row.credit || 0)
      monthMap[month].actual += net
    })
  }

  const monthlyTotals = Object.entries(monthMap)
    .map(([month, data]) => ({
      month,
      budget: data.budget,
      actual: Math.abs(data.actual),
      type: data.actual >= 0 ? "Debit" : "Credit",
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return NextResponse.json({ accountGroups, monthlyTotals })
}