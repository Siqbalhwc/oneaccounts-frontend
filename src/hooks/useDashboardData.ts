"use client"

import { useQuery } from "@tanstack/react-query"
import { createBrowserClient } from "@supabase/ssr"
import { loadYearBudgetRows, fetchAllFromBuilder, budgetLineKey } from "@/lib/budgetPeriod"

async function fetchDashboardData(companyId: string, fiscalYear: number, allPeriods: boolean) {
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

  const [
    budgetsRes,
    lifetimeRes,
    journalLinesRes,
    donorsRes,
    projectsRes,
    activitiesRes,
    customers,
    suppliers,
    totalSpentRpc,
    monthlySpendingRpc,
    prevMonthlySpendingRpc,
    overdueInvoices,
  ] = await Promise.all([
    loadYearBudgetRows(supabase.from("budgets")
      .select("id, project_id, activity_id, account_id, donor_id, location_id, budgeted_amount, month, fiscal_year")
      .eq("company_id", companyId)
      // (no fiscal_year filter - monthly rows of the whole project; the year is sliced out by loadYearBudgetRows)
      .not("month", "is", null)
      .not("activity_id", "is", null), supabase, companyId, fiscalYear),

    // Whole-project budget (annual lump sum rows) - used for "project total" and the "All periods" view
    fetchAllFromBuilder(supabase.from("budgets")
      .select("id, project_id, activity_id, account_id, donor_id, location_id, budgeted_amount")
      .eq("company_id", companyId)
      .is("month", null)
      .is("deleted_at", null)
      .not("activity_id", "is", null)),

    fetchAllFromBuilder(supabase.from("journal_lines")
      .select("debit, credit, project_id, donor_id, activity_id, account_id, location_id, journal_entries!inner(date)")
      .or("project_id.not.is.null,donor_id.not.is.null,activity_id.not.is.null")
      .eq("company_id", companyId)
      .gte("journal_entries.date", allPeriods ? "1900-01-01" : `${fiscalYear}-01-01`)
      .lte("journal_entries.date", allPeriods ? "2999-12-31" : `${fiscalYear}-12-31`)),

    supabase.from("donors").select("id, name").eq("company_id", companyId).is("deleted_at", null),

    supabase.from("projects").select("id, name, donor_id, start_date, end_date").eq("company_id", companyId).is("deleted_at", null),

    supabase.from("activities").select("id, name").eq("company_id", companyId).is("deleted_at", null),

    supabase.from("customers").select("balance").eq("company_id", companyId),

    supabase.from("suppliers").select("balance").eq("company_id", companyId),

    supabase.rpc("get_period_spending", { cid: companyId, start_d: allPeriods ? "1900-01-01" : `${fiscalYear}-01-01`, end_d: allPeriods ? "2999-12-31" : `${fiscalYear}-12-31` }),

    supabase.rpc("get_period_spending", { cid: companyId, start_d: startOfMonthISO, end_d: todayISO }),

    supabase.rpc("get_period_spending", { cid: companyId, start_d: prevStart, end_d: prevEnd }),

    supabase.from("invoices")
      .select("id").eq("company_id", companyId).eq("type", "sale").eq("status", "Unpaid").lt("due_date", todayISO),
  ])

  // Budget for the chosen period = monthly rows inside the year (or whole-project lump sum for "All periods")
  const liveProjectIds = new Set((projectsRes.data || []).map((p: any) => String(p.id)))
  const lifetimeRows = (lifetimeRes.data || []).filter((b: any) => liveProjectIds.has(String(b.project_id)))
  const budgetRows: any[] = allPeriods ? lifetimeRows : (budgetsRes.data || [])
  // Budget lines that exist as a lump sum but have no monthly split at all
  const monthlyKeys = (budgetsRes as any).monthlyKeys as Set<string> | undefined
  const monthlyMissingLines = monthlyKeys ? lifetimeRows.filter((b: any) => !monthlyKeys.has(budgetLineKey(b))).length : 0
  const totalBudget = budgetRows.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0)
  const totalSpent = Number(totalSpentRpc.data) || 0

  // ── Donor balances ──────────────────────────────────
  const donorNameMap: Record<string, string> = {}
  donorsRes.data?.forEach((d: any) => { donorNameMap[String(d.id)] = d.name })

  const budgetByDonor: Record<string, number> = {}
  budgetRows.forEach((b: any) => {
    if (b.donor_id) {
      const key = String(b.donor_id)
      budgetByDonor[key] = (budgetByDonor[key] || 0) + (b.budgeted_amount || 0)
    }
  })

  const actualByDonor: Record<string, number> = {}
  journalLinesRes.data?.forEach((jl: any) => {
    if (jl.donor_id) {
      const key = String(jl.donor_id)
      actualByDonor[key] = (actualByDonor[key] || 0) + (jl.debit || 0) - (jl.credit || 0)
    }
  })

  const donorDates: Record<string, { start: string; end: string | null }> = {}
  projectsRes.data?.forEach((p: any) => {
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

  // ── Project utilization ────────────────────────────────────────────
  const budgetByProject: Record<string, number> = {}
  const actualByProject: Record<string, number> = {}
  budgetRows.forEach((b: any) => {
    if (b.project_id) {
      const key = String(b.project_id)
      budgetByProject[key] = (budgetByProject[key] || 0) + (b.budgeted_amount || 0)
    }
  })
  journalLinesRes.data?.forEach((jl: any) => {
    if (jl.project_id) {
      const key = String(jl.project_id)
      actualByProject[key] = (actualByProject[key] || 0) + (jl.debit || 0) - (jl.credit || 0)
    }
  })

  const projectNameMap: Record<string, string> = {}
  projectsRes.data?.forEach((p: any) => { projectNameMap[String(p.id)] = p.name })

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

  // ── Receivables / Payables ─────────────────────────────────────────
  const totalReceivables = customers.data?.reduce((s: number, c: any) => s + (c.balance || 0), 0) || 0
  const totalPayables = suppliers.data?.reduce((s: number, s2: any) => s + (s2.balance || 0), 0) || 0

  // ── Monthly spending (RPC) ─────────────────────────────────────────
  const monthlySpending = monthlySpendingRpc.data || 0
  const lastMonthSpending = prevMonthlySpendingRpc.data || 0

  let spendingTrend = 0
  if (lastMonthSpending > 0) {
    spendingTrend = Math.round(((monthlySpending - lastMonthSpending) / lastMonthSpending) * 100)
  } else if (monthlySpending > 0) {
    spendingTrend = 100
  }

  const overdueInvoicesCount = overdueInvoices.data?.length || 0

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

    // ✅ Raw arrays for filtered calculations in Management Dashboard
    allBudgets: budgetRows,
    allBudgetsLifetime: lifetimeRows,
    monthlyMissingLines,
    allJournalLines: journalLinesRes.data || [],
    allDonors: donorsRes.data || [],
    allProjects: projectsRes.data || [],
    allActivities: activitiesRes.data || [],
  }
}

export function useDashboardData(companyId: string | null, fiscalYear: number, allPeriods: boolean = false) {
  return useQuery({
    queryKey: ["dashboard", companyId, fiscalYear, allPeriods],
    queryFn: () => fetchDashboardData(companyId!, fiscalYear, allPeriods),
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}
