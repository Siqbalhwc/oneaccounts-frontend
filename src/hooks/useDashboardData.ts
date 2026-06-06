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

  // Previous month boundaries
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear
  const prevStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1)).toISOString().split("T")[0]
  const prevEnd = new Date(Date.UTC(prevYear, prevMonth, 0)).toISOString().split("T")[0]

  const [
    budgetsRes,
    spentRes,
    // donorRes is no longer needed – we'll compute donors manually
    donorBudgetsRes,
    donorActualsRes,
    donorProjectsRes,
    projRes,
    custBalsRes,
    suppBalsRes,
    currentMonthSpendingRes,
    prevMonthSpendingRes,
    overdueInvoicesRes,
  ] = await Promise.all([
    supabase.from("budgets").select("budgeted_amount").eq("company_id", companyId).eq("fiscal_year", fiscalYear).is("month", null).not("activity_id", "is", null),
    supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear }),

    // Fetch budgets grouped by donor
    supabase
      .from("budgets")
      .select("donor_id, budgeted_amount")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .not("donor_id", "is", null),

    // Fetch actual spending grouped by donor (using journal_lines with donor_id)
    supabase.rpc("donor_actual_spending", { cid: companyId, fy: fiscalYear }),

    // Fetch projects linked to donors (only those with start_date)
    supabase
      .from("projects")
      .select("id, name, donor_id, start_date, end_date")
      .eq("company_id", companyId)
      .not("donor_id", "is", null)
      .not("start_date", "is", null),

    supabase.rpc("dashboard_project_utilization", { p_company_id: companyId, p_fiscal_year: fiscalYear }),
    supabase.from("customers").select("balance").eq("company_id", companyId),
    supabase.from("suppliers").select("balance").eq("company_id", companyId),
    supabase.rpc("get_period_spending", { cid: companyId, start_d: startOfMonthISO, end_d: todayISO }),
    supabase.rpc("get_period_spending", { cid: companyId, start_d: prevStart, end_d: prevEnd }),
    supabase.from("invoices").select("id").eq("company_id", companyId).eq("type", "sale").eq("status", "Unpaid").lt("due_date", todayISO),
  ])

  const totalBudget = budgetsRes.data?.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0) || 0
  const totalSpent = spentRes.data?.[0]?.total || 0

  // ── Build donor balances using real project start dates ────────────────
  const budgetByDonor: Record<string, number> = {}
  donorBudgetsRes.data?.forEach((b: any) => {
    const key = String(b.donor_id)
    budgetByDonor[key] = (budgetByDonor[key] || 0) + (b.budgeted_amount || 0)
  })

  const actualByDonor: Record<string, number> = {}
  donorActualsRes.data?.forEach((a: any) => {
    const key = String(a.donor_id)
    actualByDonor[key] = (actualByDonor[key] || 0) + (a.amount || 0)
  })

  // Map donor_id → earliest project start date and latest end date
  const donorDates: Record<string, { start: string; end: string | null }> = {}
  donorProjectsRes.data?.forEach((p: any) => {
    const key = String(p.donor_id)
    if (!donorDates[key]) {
      donorDates[key] = { start: p.start_date, end: p.end_date }
    } else {
      if (p.start_date < donorDates[key].start) donorDates[key].start = p.start_date
      if (p.end_date && (!donorDates[key].end || p.end_date > donorDates[key].end)) donorDates[key].end = p.end_date
    }
  })

  // Fetch donor names (we already have a list, but we can get them from budget rows or from a separate query)
  // Since we need donor name, we can fetch all donors for the company.
  const { data: allDonors } = await supabase
    .from("donors")
    .select("id, name")
    .eq("company_id", companyId)

  const donorNameMap: Record<string, string> = {}
  allDonors?.forEach((d: any) => { donorNameMap[String(d.id)] = d.name })

  const donorBalances = Object.keys(budgetByDonor).map((donorId) => {
    const budget = budgetByDonor[donorId] || 0
    const actual = actualByDonor[donorId] || 0
    const percentSpent = budget ? (actual / budget) * 100 : 0

    // Determine start date (earliest project start for this donor)
    const dates = donorDates[donorId]
    let monthsPassed = currentMonth   // fallback to calendar month if no dates
    let monthsTotal = 12               // fallback to 12 months if no end date

    if (dates) {
      const start = new Date(dates.start)
      const end = dates.end ? new Date(dates.end) : new Date(fiscalYear, 11, 31) // default to end of fiscal year
      // Total months from start to end (inclusive)
      const diffTotal = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      if (diffTotal > 0) monthsTotal = diffTotal
      // Months passed from start to now (cap at monthsTotal)
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
  }) || []

  // ── Rest of the code stays exactly the same ──
  const projectsArr = projRes.data?.map((p: any) => ({
    id: p.project_id, name: p.project_name,
    budget: p.budget || 0, actual: p.actual || 0,
    pct: p.budget ? Math.round(((p.actual || 0) / p.budget) * 100) : (p.actual > 0 ? 100 : 0),
  })) || []
  const pastQ1 = now.getMonth() > 2
  const projectRows = projectsArr.map((p: any) => ({
    ...p,
    status: p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : (pastQ1 && p.pct < 10) ? "At Risk" : "On Track",
  })).sort((a: any, b: any) => b.pct - a.pct)

  const overspentCount = projectRows.filter((p: any) => p.actual > p.budget).length
  const totalReceivables = custBalsRes.data?.reduce((s: number, c: any) => s + (c.balance || 0), 0) || 0
  const totalPayables = suppBalsRes.data?.reduce((s: number, s2: any) => s + (s2.balance || 0), 0) || 0

  // Monthly spending from the new RPC functions (safe, no long URLs)
  const monthlySpending = currentMonthSpendingRes.data || 0
  const lastMonthSpending = prevMonthSpendingRes.data || 0

  let spendingTrend = 0
  if (lastMonthSpending > 0) {
    spendingTrend = Math.round(((monthlySpending - lastMonthSpending) / lastMonthSpending) * 100)
  } else if (monthlySpending > 0) {
    spendingTrend = 100
  }

  const overdueInvoicesCount = overdueInvoicesRes.data?.length || 0

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