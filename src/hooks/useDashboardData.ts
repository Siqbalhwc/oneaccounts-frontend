"use client"

import { useQuery } from "@tanstack/react-query"
import { createBrowserClient } from "@supabase/ssr"

async function fetchDashboardData(companyId: string, fiscalYear: number) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const startOfMonthISO = new Date(Date.UTC(currentYear, currentMonth - 1, 1)).toISOString().split("T")[0]
  const todayISO = now.toISOString().split("T")[0]

  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear
  const prevStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1)).toISOString().split("T")[0]
  const prevEnd = new Date(Date.UTC(prevYear, prevMonth, 0)).toISOString().split("T")[0]

  // ── 1. Fetch all necessary data in parallel ──────────────────────
  const [
    budgetsAll,
    journalLinesAll,
    donorsAll,
    projectsAll,
    customers,
    suppliers,
    invoicesUnpaid,
    monthlySpendingData,
    prevMonthlySpendingData,
  ] = await Promise.all([
    // All budgets for the fiscal year (annual)
    supabase.from("budgets")
      .select("id, project_id, activity_id, account_id, donor_id, location_id, budgeted_amount")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .not("activity_id", "is", null),

    // All journal lines within the fiscal year
    supabase.from("journal_lines")
      .select("debit, credit, project_id, donor_id, activity_id, account_id, location_id, journal_entries!inner(date)")
      .eq("company_id", companyId)
      .gte("journal_entries.date", `${fiscalYear}-01-01`)
      .lte("journal_entries.date", `${fiscalYear}-12-31`),

    // Donors list
    supabase.from("donors").select("id, name").eq("company_id", companyId),

    // Projects list (with start/end dates)
    supabase.from("projects").select("id, name, donor_id, start_date, end_date").eq("company_id", companyId),

    // Customer balances
    supabase.from("customers").select("balance").eq("company_id", companyId),

    // Supplier balances
    supabase.from("suppliers").select("balance").eq("company_id", companyId),

    // Overdue invoices
    supabase.from("invoices")
      .select("id").eq("company_id", companyId).eq("type", "sale").eq("status", "Unpaid").lt("due_date", todayISO),

    // Current month spending
    supabase.from("journal_lines")
      .select("debit, credit, journal_entries!inner(date)")
      .eq("company_id", companyId)
      .gte("journal_entries.date", startOfMonthISO)
      .lte("journal_entries.date", todayISO),

    // Previous month spending
    supabase.from("journal_lines")
      .select("debit, credit, journal_entries!inner(date)")
      .eq("company_id", companyId)
      .gte("journal_entries.date", prevStart)
      .lte("journal_entries.date", prevEnd),
  ])

  // ── Helper to sum net amount ──────────────────────────────────────
  const sumNet = (rows: any[]) => rows.reduce((s: number, r: any) => s + (r.debit || 0) - (r.credit || 0), 0)

  // ── 2. Compute total budget ───────────────────────────────────────
  const totalBudget = budgetsAll.data?.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0) || 0

  // ── 3. Compute total spent ────────────────────────────────────────
  const totalSpent = sumNet(journalLinesAll.data || [])

  // ── 4. Donor balances (from budgets and journal_lines) ────────────
  const donorNameMap: Record<string, string> = {}
  donorsAll.data?.forEach((d: any) => { donorNameMap[String(d.id)] = d.name })

  const budgetByDonor: Record<string, number> = {}
  budgetsAll.data?.forEach((b: any) => {
    if (b.donor_id) {
      const key = String(b.donor_id)
      budgetByDonor[key] = (budgetByDonor[key] || 0) + (b.budgeted_amount || 0)
    }
  })

  const actualByDonor: Record<string, number> = {}
  journalLinesAll.data?.forEach((jl: any) => {
    if (jl.donor_id) {
      const key = String(jl.donor_id)
      actualByDonor[key] = (actualByDonor[key] || 0) + (jl.debit || 0) - (jl.credit || 0)
    }
  })

  // Project start/end dates per donor
  const donorDates: Record<string, { start: string; end: string | null }> = {}
  projectsAll.data?.forEach((p: any) => {
    if (p.donor_id) {
      const key = String(p.donor_id)
      if (!donorDates[key]) {
        donorDates[key] = { start: p.start_date, end: p.end_date }
      } else {
        if (p.start_date && p.start_date < donorDates[key].start) donorDates[key].start = p.start_date
        if (p.end_date && (!donorDates[key].end || p.end_date > donorDates[key].end)) donorDates[key].end = p.end_date
      }
    }
  })

  const donorBalances = Object.keys(budgetByDonor).map((donorId) => {
    const budget = budgetByDonor[donorId] || 0
    const actual = actualByDonor[donorId] || 0
    const percentSpent = budget ? (actual / budget) * 100 : 0

    const dates = donorDates[donorId]
    let monthsPassed = currentMonth
    let monthsTotal = 12
    if (dates && dates.start) {
      const start = new Date(dates.start)
      const end = dates.end ? new Date(dates.end) : new Date(fiscalYear, 11, 31)
      const diffTotal = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      if (diffTotal > 0) monthsTotal = diffTotal
      const today = new Date()
      const diffPassed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1
      monthsPassed = Math.max(0, Math.min(diffPassed, monthsTotal))
    }

    const timePercent = (monthsPassed / monthsTotal) * 100
    const health = percentSpent > timePercent * 0.8 ? "on track" : percentSpent < timePercent * 0.4 ? "slow" : "ok"

    return {
      donor_id: donorId,
      name: donorNameMap[donorId] || "Unknown",
      budget,
      actual,
      remaining: budget - actual,
      pct: Math.round(percentSpent),
      overspent: actual > budget,
      monthsPassed,
      monthsTotal,
      health,
    }
  }).sort((a, b) => b.remaining - a.remaining)

  // ── 5. Project utilization ────────────────────────────────────────
  const budgetByProject: Record<string, number> = {}
  const actualByProject: Record<string, number> = {}

  budgetsAll.data?.forEach((b: any) => {
    if (b.project_id) {
      const key = String(b.project_id)
      budgetByProject[key] = (budgetByProject[key] || 0) + (b.budgeted_amount || 0)
    }
  })

  journalLinesAll.data?.forEach((jl: any) => {
    if (jl.project_id) {
      const key = String(jl.project_id)
      actualByProject[key] = (actualByProject[key] || 0) + (jl.debit || 0) - (jl.credit || 0)
    }
  })

  const projectNameMap: Record<string, string> = {}
  projectsAll.data?.forEach((p: any) => { projectNameMap[String(p.id)] = p.name })

  const projectsArr = Object.keys(budgetByProject).map((pid) => {
    const budget = budgetByProject[pid] || 0
    const actual = actualByProject[pid] || 0
    const pct = budget ? Math.round((actual / budget) * 100) : (actual > 0 ? 100 : 0)
    return { id: pid, name: projectNameMap[pid] || "Unknown", budget, actual, pct }
  })

  const pastQ1 = now.getMonth() > 2
  const projectRows = projectsArr.map((p) => ({
    ...p,
    status: p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : (pastQ1 && p.pct < 10) ? "At Risk" : "On Track",
  })).sort((a, b) => b.pct - a.pct)

  const overspentCount = projectRows.filter((p) => p.actual > p.budget).length

  // ── 6. Underspent activities (top 5 with lowest spent %) ──────────
  const budgetByActivity: Record<string, { budget: number; name: string }> = {}
  budgetsAll.data?.forEach((b: any) => {
    const key = `${b.activity_id}_${b.location_id || "none"}_${b.account_id}`
    if (!budgetByActivity[key]) {
      budgetByActivity[key] = { budget: 0, name: b.activity_name || `Activity ${b.activity_id}` }
    }
    budgetByActivity[key].budget += b.budgeted_amount || 0
  })

  const actualByActivityKey: Record<string, number> = {}
  journalLinesAll.data?.forEach((jl: any) => {
    const key = `${jl.activity_id}_${jl.location_id || "none"}_${jl.account_id}`
    actualByActivityKey[key] = (actualByActivityKey[key] || 0) + (jl.debit || 0) - (jl.credit || 0)
  })

  // We also need activity names – fetch activities separately
  const { data: activities } = await supabase.from("activities").select("id, name").eq("company_id", companyId)
  const activityNameMap: Record<string, string> = {}
  activities?.forEach((a: any) => { activityNameMap[String(a.id)] = a.name })

  const underspentActivities = Object.keys(budgetByActivity)
    .map((key) => {
      const budget = budgetByActivity[key].budget
      const actual = actualByActivityKey[key] || 0
      const pct = budget ? Math.round((actual / budget) * 100) : 100
      const activityId = key.split("_")[0]
      return {
        key,
        name: activityNameMap[activityId] || `Activity ${activityId}`,
        budget,
        actual,
        pct,
      }
    })
    .filter((a) => a.budget > 0 && a.pct < 100)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5)

  // ── 7. Receivables / Payables ─────────────────────────────────────
  const totalReceivables = customers.data?.reduce((s: number, c: any) => s + (c.balance || 0), 0) || 0
  const totalPayables = suppliers.data?.reduce((s: number, s2: any) => s + (s2.balance || 0), 0) || 0

  // ── 8. Monthly spending ──────────────────────────────────────────
  const monthlySpending = sumNet(monthlySpendingData.data || [])
  const lastMonthSpending = sumNet(prevMonthlySpendingData.data || [])
  let spendingTrend = 0
  if (lastMonthSpending > 0) {
    spendingTrend = Math.round(((monthlySpending - lastMonthSpending) / lastMonthSpending) * 100)
  } else if (monthlySpending > 0) {
    spendingTrend = 100
  }

  const overdueInvoicesCount = invoicesUnpaid.data?.length || 0

  return {
    totalBudget,
    totalSpent,
    donorBalances,
    projectRows,
    overspentCount,
    totalReceivables,
    totalPayables,
    monthlySpending,
    lastMonthSpending,
    spendingTrend,
    overdueInvoicesCount,
    underspentActivities,       // ✅ now provided
    lastUpdated: new Date().toLocaleTimeString(),
  }
}

export function useDashboardData(companyId: string | null, fiscalYear: number) {
  return useQuery({
    queryKey: ["dashboard", companyId, fiscalYear],
    queryFn: () => fetchDashboardData(companyId!, fiscalYear),
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}