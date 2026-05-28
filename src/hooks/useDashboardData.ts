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

  const [
    budgetsRes,
    spentRes,
    donorRes,
    projRes,
    custBalsRes,
    suppBalsRes,
    expenseAccountsRes,
    fixedAssetsRes,
    overdueInvoicesRes,
  ] = await Promise.all([
    supabase.from("budgets").select("budgeted_amount").eq("company_id", companyId).eq("fiscal_year", fiscalYear).is("month", null).not("activity_id", "is", null),
    supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear }),
    supabase.rpc("dashboard_donor_balances", { cid: companyId, fy: fiscalYear }),
    supabase.rpc("dashboard_project_utilization", { p_company_id: companyId, p_fiscal_year: fiscalYear }),
    supabase.from("customers").select("balance").eq("company_id", companyId),
    supabase.from("suppliers").select("balance").eq("company_id", companyId),
    supabase.from("accounts").select("id").eq("company_id", companyId).eq("type", "Expense"),
    supabase.from("accounts").select("id").eq("company_id", companyId).eq("type", "Asset").gte("code", "1400").lte("code", "1499"),
    supabase.from("invoices").select("id").eq("company_id", companyId).eq("type", "sale").eq("status", "Unpaid").lt("due_date", todayISO),
  ])

  const totalBudget = budgetsRes.data?.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0) || 0
  const totalSpent = spentRes.data?.[0]?.total || 0

  const donorBalances = donorRes.data?.map((d: any) => {
    const percentSpent = d.budget ? (d.actual_spent / d.budget) * 100 : 0
    const monthsPassed = now.getMonth() + 1
    const monthsTotal = 12
    const timePercent = (monthsPassed / monthsTotal) * 100
    const health = percentSpent > timePercent * 0.8 ? "on track" : percentSpent < timePercent * 0.4 ? "slow" : "ok"
    return {
      donor_id: d.donor_id, name: d.donor_name,
      budget: d.budget, actual: d.actual_spent,
      remaining: (d.budget || 0) - (d.actual_spent || 0),
      pct: Math.round(percentSpent),
      overspent: (d.actual_spent || 0) > (d.budget || 0),
      monthsPassed, monthsTotal, health,
    }
  }) || []

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

  const accountIds = [...(expenseAccountsRes.data?.map((a: any) => a.id) || []), ...(fixedAssetsRes.data?.map((a: any) => a.id) || [])]
  let monthlySpending = 0, lastMonthSpending = 0, spendingTrend = 0

  if (accountIds.length > 0) {
    const [monthLinesRes, prevMonthLinesRes] = await Promise.all([
      supabase.from("journal_lines").select("debit, credit").eq("company_id", companyId).in("account_id", accountIds).gte("date", startOfMonthISO).lte("date", todayISO),
      (async () => {
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear
        const prevStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1)).toISOString().split("T")[0]
        const prevEnd = new Date(Date.UTC(prevYear, prevMonth, 0)).toISOString().split("T")[0]
        return supabase.from("journal_lines").select("debit, credit").eq("company_id", companyId).in("account_id", accountIds).gte("date", prevStart).lte("date", prevEnd)
      })(),
    ])

    monthlySpending = (monthLinesRes.data || []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0)
    lastMonthSpending = (prevMonthLinesRes.data || []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0)

    if (lastMonthSpending > 0) {
      spendingTrend = Math.round(((monthlySpending - lastMonthSpending) / lastMonthSpending) * 100)
    } else if (monthlySpending > 0) {
      spendingTrend = 100
    }
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