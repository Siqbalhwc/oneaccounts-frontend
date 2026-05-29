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

  // 1. Fetch project company_id for RLS bypass
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const cid = project.company_id

  // 2. GL‑wise: group by account (name + code) where project_id = projectId
  const { data: glRows } = await supabaseAdmin
    .from("journal_lines")
    .select("account_id, debit, credit, accounts(code, name)")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("journal_entries.deleted_at", null)

  // Aggregate by account
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

  // 3. Month‑wise: group by month (YYYY‑MM) using journal_entries.date
  const { data: monthRows } = await supabaseAdmin
    .from("journal_lines")
    .select("debit, credit, journal_entries!inner(date)")
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("journal_entries.deleted_at", null)

  const monthMap: Record<string, number> = {}
  if (monthRows) {
    monthRows.forEach((row: any) => {
      const date = row.journal_entries?.date
      if (!date) return
      const month = date.substring(0, 7) // "2026-05"
      const net = (row.debit || 0) - (row.credit || 0)
      monthMap[month] = (monthMap[month] || 0) + net
    })
  }
  const monthlyTotals = Object.entries(monthMap)
    .map(([month, amount]) => ({ month, amount: Math.abs(amount), type: amount >= 0 ? "Debit" : "Credit" }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return NextResponse.json({ accountGroups, monthlyTotals })
}