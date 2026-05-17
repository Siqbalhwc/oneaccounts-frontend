"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle } from "lucide-react"

export default function ManagementDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  // Filters
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")

  // Master data
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])

  // Dashboard data
  const [donorBalances, setDonorBalances] = useState<any[]>([])
  const [projectRows, setProjectRows] = useState<any[]>([])
  const [totalBudget, setTotalBudget] = useState(0)
  const [totalSpent, setTotalSpent] = useState(0)
  const [overspentCount, setOverspentCount] = useState(0)

  // Quick stats
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)

  // Monthly Spending & trend
  const [monthlySpending, setMonthlySpending] = useState(0)
  const [lastMonthSpending, setLastMonthSpending] = useState(0)
  const [spendingTrend, setSpendingTrend] = useState(0)
  // Top 5 underspent activities (now includes projectId)
  const [underspentActivities, setUnderspentActivities] = useState<any[]>([])

  // Activity health per project (activities >20% below project's own spending %)
  const [activityHealth, setActivityHealth] = useState<Record<string, { lowCount: number; threshold: number; message: string }>>({})

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState("")

  // ── Fetch company ID and master data ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase.from("projects").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setProjects(r.data))
    supabase.from("donors").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setDonors(r.data))
  }, [companyId])

  // ── Fetch dashboard data ──
  useEffect(() => {
    if (!companyId) return

    const fetchData = async () => {
      setLoading(true)

      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()
      const startOfMonthISO = new Date(Date.UTC(currentYear, currentMonth - 1, 1)).toISOString().split("T")[0]
      const todayISO = now.toISOString().split("T")[0]

      // Total Budget
      const { data: budgets } = await supabase
        .from("budgets")
        .select("budgeted_amount")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
        .not("activity_id", "is", null)
      setTotalBudget(budgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0)

      // Total Spent (RPC)
      const { data: spentData } = await supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear })
      setTotalSpent(spentData?.[0]?.total || 0)

      // Donor Balances (RPC) – with months & health
      const { data: donorData } = await supabase.rpc("dashboard_donor_balances", { cid: companyId, fy: fiscalYear })
      setDonorBalances(donorData?.map((d: any) => {
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
          monthsPassed,
          monthsTotal,
          health,
        }
      }) || [])

      // Project Utilization (RPC)
      const { data: projData } = await supabase.rpc("dashboard_project_utilization", {
        p_company_id: companyId, p_fiscal_year: fiscalYear,
      })
      const projectsArr = projData?.map((p: any) => ({
        id: p.project_id, name: p.project_name,
        budget: p.budget || 0, actual: p.actual || 0,
        pct: p.budget ? Math.round(((p.actual || 0) / p.budget) * 100) : (p.actual > 0 ? 100 : 0),
      })) || []
      const pastQ1 = now.getMonth() > 2
      const enrichedProjects = projectsArr.map((p: any) => ({
        ...p,
        status: p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : (pastQ1 && p.pct < 10) ? "At Risk" : "On Track",
      }))
      setProjectRows(enrichedProjects.sort((a: any, b: any) => b.pct - a.pct))
      setOverspentCount(enrichedProjects.filter((p: any) => p.actual > p.budget).length)

      // Quick stats: Receivables & Payables
      const { data: custBals } = await supabase.from("customers").select("balance").eq("company_id", companyId)
      setTotalReceivables(custBals?.reduce((s, c) => s + (c.balance || 0), 0) || 0)

      const { data: suppBals } = await supabase.from("suppliers").select("balance").eq("company_id", companyId)
      setTotalPayables(suppBals?.reduce((s, s2) => s + (s2.balance || 0), 0) || 0)

      // ── Monthly Spending (Expense + Fixed Asset accounts) ──
      const { data: expenseAccounts } = await supabase.from("accounts")
        .select("id").eq("company_id", companyId).eq("type", "Expense")
      const { data: fixedAssets } = await supabase.from("accounts")
        .select("id").eq("company_id", companyId).eq("type", "Asset")
        .gte("code", "1400").lte("code", "1499")

      const accountIds = [
        ...(expenseAccounts?.map(a => a.id) || []),
        ...(fixedAssets?.map(a => a.id) || [])
      ]

      if (accountIds.length > 0) {
        const { data: monthLines } = await supabase
          .from("journal_lines")
          .select("debit, credit, journal_entries!inner(date)")
          .eq("company_id", companyId)
          .in("account_id", accountIds)
          .gte("journal_entries.date", startOfMonthISO)
          .lte("journal_entries.date", todayISO)

        const monthTotal = (monthLines || []).reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)
        setMonthlySpending(monthTotal)

        // Previous month (last full month)
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear
        const prevStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1)).toISOString().split("T")[0]
        const prevEnd = new Date(Date.UTC(prevYear, prevMonth, 0)).toISOString().split("T")[0]

        const { data: prevMonthLines } = await supabase
          .from("journal_lines")
          .select("debit, credit, journal_entries!inner(date)")
          .eq("company_id", companyId)
          .in("account_id", accountIds)
          .gte("journal_entries.date", prevStart)
          .lte("journal_entries.date", prevEnd)

        const prevMonthTotal = (prevMonthLines || []).reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)
        setLastMonthSpending(prevMonthTotal)

        if (prevMonthTotal > 0) {
          setSpendingTrend(Math.round(((monthTotal - prevMonthTotal) / prevMonthTotal) * 100))
        } else if (monthTotal > 0) {
          setSpendingTrend(100)
        } else {
          setSpendingTrend(0)
        }
      } else {
        setMonthlySpending(0)
        setLastMonthSpending(0)
        setSpendingTrend(0)
      }

      // ── Top 5 underspent activities (this month, expense accounts) ──
      const { data: actBudgets } = await supabase
        .from("budgets")
        .select("activity_id, activities(name), budgeted_amount, project_id")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
      const activityMap: Record<number, { name: string; budget: number; actual: number; projectId: number | null }> = {}
      actBudgets?.forEach((b: any) => {
        if (!b.activity_id) return
        if (!activityMap[b.activity_id]) {
          activityMap[b.activity_id] = {
            name: b.activities?.name || `Activity ${b.activity_id}`,
            budget: 0,
            actual: 0,
            projectId: b.project_id || null,
          }
        }
        activityMap[b.activity_id].budget += b.budgeted_amount || 0
      })
      // Get actuals from expense accounts for the current month
      const { data: actLines } = await supabase
        .from("journal_lines")
        .select("activity_id, debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .in("account_id", accountIds)
        .gte("journal_entries.date", startOfMonthISO)
        .lte("journal_entries.date", todayISO)
      actLines?.forEach((l: any) => {
        if (!l.activity_id || !activityMap[l.activity_id]) return
        activityMap[l.activity_id].actual += (l.debit || 0) - (l.credit || 0)
      })
      const underspent = Object.entries(activityMap)
        .filter(([_, a]) => a.budget > 0)
        .map(([id, a]) => ({
          id: Number(id),
          name: a.name,
          budget: a.budget,
          actual: a.actual,
          remaining: a.budget - a.actual,
          pct: Math.round(((a.budget - a.actual) / a.budget) * 100),
          projectId: a.projectId,
        }))
        .sort((a, b) => b.remaining - a.remaining)
        .slice(0, 5)
      setUnderspentActivities(underspent)

      // ── Activity health per project ──
      if (enrichedProjects.length > 0) {
        const projectIds = enrichedProjects.map((p: any) => p.id)
        const { data: actBudgetsAll } = await supabase
          .from("budgets")
          .select("project_id, activity_id, budgeted_amount")
          .eq("company_id", companyId)
          .eq("fiscal_year", fiscalYear)
          .in("project_id", projectIds)
          .is("month", null)
        const projActBudget: Record<string, Record<string, number>> = {}
        actBudgetsAll?.forEach((b: any) => {
          const pid = String(b.project_id)
          const aid = String(b.activity_id)
          if (!projActBudget[pid]) projActBudget[pid] = {}
          projActBudget[pid][aid] = (projActBudget[pid][aid] || 0) + (b.budgeted_amount || 0)
        })
        const allActIds = Array.from(new Set(actBudgetsAll?.map((b: any) => b.activity_id) || []))
        const { data: actActuals } = await supabase
          .from("journal_lines")
          .select("activity_id, debit, credit")
          .eq("company_id", companyId)
          .in("activity_id", allActIds)
          .gte("journal_entries.date", `${fiscalYear}-01-01`)
          .lte("journal_entries.date", `${fiscalYear}-12-31`)
        const actActualMap: Record<string, number> = {}
        actActuals?.forEach((l: any) => {
          const aid = String(l.activity_id)
          actActualMap[aid] = (actActualMap[aid] || 0) + (l.debit || 0) - (l.credit || 0)
        })

        const healthData: Record<string, { lowCount: number; threshold: number; message: string }> = {}
        enrichedProjects.forEach((proj: any) => {
          const pid = String(proj.id)
          const projPct = proj.pct
          const activities = projActBudget[pid] || {}
          let lowCount = 0
          const threshold = Math.max(0, projPct - 20)
          if (projPct > 0) {
            Object.entries(activities).forEach(([aid, budget]) => {
              const actual = actActualMap[aid] || 0
              const actPct = budget > 0 ? (actual / budget) * 100 : 0
              if (actPct < threshold) lowCount++
            })
          }
          if (lowCount > 0) {
            healthData[pid] = { lowCount, threshold, message: `⚠️ ${lowCount} act. below ${threshold}%` }
          }
        })
        setActivityHealth(healthData)
      }

      setLastUpdated(new Date().toLocaleTimeString())
      setLoading(false)
    }

    fetchData()
  }, [companyId, fiscalYear])

  // ── Filtered data ──
  const filteredDonorBalances = donorBalances.filter(d => {
    if (selectedDonorId && d.donor_id != selectedDonorId) return false
    return true
  })

  const filteredProjectRows = projectRows.filter(p => {
    if (selectedProjectId && p.id != selectedProjectId) return false
    return true
  })

  const filteredTotalBudget = selectedProjectId
    ? filteredProjectRows.reduce((s, p) => s + p.budget, 0)
    : totalBudget

  const filteredTotalSpent = selectedProjectId
    ? filteredProjectRows.reduce((s, p) => s + p.actual, 0)
    : totalSpent

  const filteredOverspentCount = selectedProjectId
    ? filteredProjectRows.filter(p => p.actual > p.budget).length
    : overspentCount

  const remainingFunds = filteredTotalBudget - filteredTotalSpent
  const spentPct = filteredTotalBudget ? Math.round((filteredTotalSpent / filteredTotalBudget) * 100) : 0

  const projectsAbove70 = filteredProjectRows.filter(p => p.pct > 70).map(p => p.name)

  // ── Greeting ──
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  // ── Formatting ──
  const formatPKR = (v: number) => {
    const sign = v < 0 ? "-" : ""
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
    return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
  }

  const detailQuery = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ fy: String(fiscalYear) })
    if (selectedProjectId) params.set("project", selectedProjectId)
    if (selectedDonorId) params.set("donor", selectedDonorId)
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return "?" + params.toString()
  }

  // ── Trend indicator component ──
  const Trend = ({ value, positive = false, negative = false }: { value: number; positive?: boolean; negative?: boolean }) => {
    if (value === 0) return <Minus size={14} style={{ color: "#94A3B8" }} />
    if (value > 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: positive ? "#2DD4BF" : "#F97316", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingUp size={14} /> {Math.abs(value)}%
    </span>
    if (value < 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: negative ? "#F97316" : "#2DD4BF", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingDown size={14} /> {Math.abs(value)}%
    </span>
    return null
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", background: "#0A0A0A", minHeight: "100vh", color: "#94A3B8" }}>Loading…</div>
  }

  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100%", flex: 1, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }

        .mgmt .card {
          background: #111827; border: 1px solid #1E293B;
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: all 0.2s;
          cursor: pointer;
        }
        .mgmt .card:hover { background: #1E293B; border-color: #334155; }

        .mgmt .hero {
          background: #111827;
          border: 1px solid #1E293B;
          border-radius: 16px; padding: 1rem 1.5rem;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 0.8rem;
        }
        .mgmt .hero-greeting h2 {
          font-size: 1.3rem; font-weight: 700; color: #F1F5F9; margin-bottom: 0.15rem; white-space: nowrap;
        }
        .mgmt .hero-greeting p {
          color: #94A3B8; font-size: 0.85rem; margin: 0; white-space: nowrap;
        }
        .mgmt .hero-filters {
          display: flex; align-items: center; gap: 0.5rem;
          flex-wrap: wrap;
        }
        .mgmt .filter-label {
          font-weight: 600; color: #94A3B8; font-size: 0.75rem; margin-right: 0.1rem;
        }
        .mgmt .filter-pill {
          background: #1E293B; border: 1px solid #334155;
          padding: 0.2rem 0.6rem; border-radius: 20px;
          font-size: 0.78rem; font-weight: 500; color: #F1F5F9;
          cursor: pointer; transition: 0.15s;
          -webkit-appearance: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          padding-right: 1.8rem;
        }
        .mgmt .filter-pill:focus { outline: none; border-color: #64748B; }

        .mgmt .warning-banner {
          background: #1E293B;
          border: 1px solid #1E293B;
          border-left: 6px solid #334155;
          border-radius: 10px; padding: 8px 16px;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
          font-size: 0.9rem; color: #FCA5A5;
          font-weight: 500;
        }
        .mgmt .warning-btn {
          background: #374151;
          color: white; border: none;
          border-radius: 6px; padding: 6px 14px;
          font-weight: 600; cursor: pointer; font-size: 0.8rem;
          white-space: nowrap;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .span-1 { grid-column: span 1; }
        .span-2 { grid-column: span 2; }
        .span-3 { grid-column: span 3; }

        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: #94A3B8; letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.7rem; font-weight: 700; color: #F1F5F9; line-height: 1.2; }
        .kpi-meta { font-size: 0.8rem; color: #64748B; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
        .kpi-extra {
          font-size: 0.65rem; color: #93C5FD; margin-top: 4px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 200px;
        }

        .clickable { color: #93C5FD; text-decoration: underline; cursor: pointer; }

        /* Project row layout */
        .project-row {
          display: flex; align-items: center; gap: 0.8rem;
          background: #111827; border-radius: 12px; padding: 0.5rem 1rem;
          border: 1px solid #1E293B; cursor: pointer; margin-bottom: 0.5rem;
        }
        .project-metrics {
          display: grid;
          grid-template-columns: 80px 50px 90px 120px;
          gap: 0.5rem; align-items: center;
          margin-left: auto;
        }
        .project-metric { font-size: 0.8rem; white-space: nowrap; }

        /* Underspend table style */
        .underspend-header {
          display: grid;
          grid-template-columns: 1fr 80px 80px 100px;
          gap: 8px; font-size: 0.65rem; font-weight: 700; color: #94A3B8;
          text-transform: uppercase; padding-bottom: 6px; border-bottom: 1px solid #1E293B;
          margin-bottom: 6px;
        }
        .underspend-row-grid {
          display: grid;
          grid-template-columns: 1fr 80px 80px 100px;
          gap: 8px; align-items: center; padding: 5px 0;
          border-bottom: 1px solid #1E293B; font-size: 0.8rem;
        }
        .underspend-row-grid:last-child { border-bottom: none; }

        .health-positive { color: #6EE7B7; }
        .health-negative { color: #FCA5A5; }

        @media (max-width: 1100px) {
          .dashboard-grid { grid-template-columns: repeat(3, 1fr); }
          .span-3 { grid-column: span 2 !important; }
          .span-2 { grid-column: span 1 !important; }
          .span-1 { grid-column: span 1 !important; }
        }
        @media (max-width: 800px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .span-3, .span-2, .span-1 { grid-column: span 1 !important; }
          .hero { flex-direction: column; align-items: flex-start; }
          .hero-filters { width: 100%; }
        }
        @media (max-width: 640px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .span-3, .span-2, .span-1 { grid-column: span 2 !important; }
          .hero { padding: 1rem; }
          .hero-greeting h2 { font-size: 1.1rem; white-space: normal; }
          .hero-greeting p { font-size: 0.8rem; white-space: normal; }
          .hero-filters { width: 100%; justify-content: space-between; gap: 0.4rem; }
          .filter-label { font-size: 0.7rem; }
          .filter-pill { font-size: 0.7rem; padding: 0.2rem 0.5rem; padding-right: 1.5rem; background-position: right 0.3rem center; }
          .card { padding: 1rem; }
          .kpi-value { font-size: 1.4rem; }
        }
        @media (max-width: 380px) {
          .dashboard-grid { grid-template-columns: 1fr; }
          .span-3, .span-2, .span-1 { grid-column: span 1 !important; }
        }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        {/* ── Hero bar ── */}
        <div className="hero">
          <div className="hero-greeting">
            <h2>{getGreeting()}, siqbalhwc</h2>
            <p>Here's what's happening with your NGO portfolio today</p>
          </div>
          <div className="hero-filters">
            <span className="filter-label">Period:</span>
            <select className="filter-pill" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y}</option>)}
            </select>
            <span className="filter-label">Projects:</span>
            <select className="filter-pill" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="filter-label">Donors:</span>
            <select className="filter-pill" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
              <option value="">All Donors</option>
              {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Warning banner ── */}
        {filteredOverspentCount > 0 && (
          <div className="warning-banner">
            <span>
              ⚠️ Portfolio overspent by {formatPKR(filteredTotalSpent - filteredTotalBudget)}. {filteredOverspentCount} {filteredOverspentCount === 1 ? "project" : "projects"} need review.
            </span>
            <button className="warning-btn" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
              View overspent projects →
            </button>
          </div>
        )}

        {/* ── Row 1: KPI cards ── */}
        <div className="dashboard-grid">
          <div className="card span-1" onClick={() => router.push("/dashboard/reports/budget-summary" + detailQuery())}>
            <div className="kpi-label">Total Budget</div>
            <div className="kpi-value" style={{ color: "#A78BFA" }}>{formatPKR(filteredTotalBudget)}</div>
            <div className="kpi-meta">{filteredProjectRows.length} projects</div>
          </div>
          <div className="card span-1" onClick={() => router.push("/dashboard/reports/spending-detail" + detailQuery())}>
            <div className="kpi-label">Total Spent</div>
            <div className="kpi-value" style={{ color: "#F97316" }}>{formatPKR(filteredTotalSpent)}</div>
            <div className="kpi-meta">
              {spentPct}% of budget
            </div>
            {projectsAbove70.length > 0 && (
              <div className="kpi-extra" title={projectsAbove70.join(", ")}>
                Projects &gt; 70%: {projectsAbove70.join(", ")}
              </div>
            )}
          </div>
          <div className="card span-1"
            style={{ cursor: remainingFunds < 0 ? "pointer" : "default" }}
            onClick={() => { if (remainingFunds < 0) router.push("/dashboard/reports/overspent" + detailQuery()) }}>
            <div className="kpi-label">{remainingFunds < 0 ? "Overspent" : "Remaining"}</div>
            <div className="kpi-value" style={{ color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171" }}>
              {formatPKR(remainingFunds)}
            </div>
            <div className="kpi-meta">
              {Math.abs(Math.round((remainingFunds / filteredTotalBudget) * 100))}% {remainingFunds < 0 ? "over" : "left"}
            </div>
          </div>
          <div className="card span-1" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
            <div className="kpi-label">Portfolio Health</div>
            <div className="kpi-value" style={{ color: filteredOverspentCount > 0 ? "#F97316" : "#2DD4BF" }}>
              {filteredOverspentCount > 0 ? "⚠️ Needs Attention" : "Healthy"}
            </div>
            <div className="kpi-meta">
              {Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score
            </div>
          </div>
          {/* Monthly Spending */}
          <div className="card span-1"
               onClick={() => router.push(`/dashboard/reports/spending-detail?fy=${fiscalYear}&month=${currentMonth}&year=${currentYear}`)}>
            <div className="kpi-label">📆 Monthly Spending</div>
            <div className="kpi-value" style={{ color: monthlySpending > 0 ? "#F97316" : "#94A3B8" }}>
              {monthlySpending > 0 ? formatPKR(monthlySpending) : "—"}
            </div>
            <div className="kpi-meta">
              {monthlySpending === 0 ? (
                <span style={{ color: "#64748B", fontStyle: "italic" }}>No transactions this month</span>
              ) : (
                <>
                  vs. {formatPKR(lastMonthSpending)} last month
                  <Trend value={spendingTrend} positive={spendingTrend < 0} negative={spendingTrend > 0} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Project Utilization + Donor Balances ── */}
        <div className="dashboard-grid">
          <div className="card span-3">
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>📊 Project Utilization</div>
            {filteredProjectRows.map((p, idx) => {
              const health = activityHealth[p.id]
              return (
                <div key={idx} className="project-row" onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.status === "Overspent" ? "#F87171" : p.status === "Review" ? "#F97316" : p.status === "At Risk" ? "#F97316" : "#2DD4BF", flexShrink: 0 }}></div>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#E2E8F0" }}>{p.name}</span>
                  <div className="project-metrics">
                    <span className="project-metric" style={{ fontWeight: 600, color: "#E2E8F0" }}>{formatPKR(p.actual)}</span>
                    <span className="project-metric" style={{ color: p.pct > 100 ? "#F87171" : p.pct > 80 ? "#F97316" : "#2DD4BF" }}>{p.pct}%</span>
                    <span style={{
                      padding: "0.1rem 0.6rem", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 700,
                      background: p.status === "Overspent" ? "#fee2e2" : p.status === "Review" ? "#fef3c7" : p.status === "At Risk" ? "#fef3c7" : "#dcfce7",
                      color: p.status === "Overspent" ? "#991b1b" : p.status === "Review" ? "#92400e" : p.status === "At Risk" ? "#92400e" : "#166534",
                      whiteSpace: "nowrap", textAlign: "center"
                    }}>
                      {p.status}
                    </span>
                    {health ? (
                      <span className="project-metric" style={{ fontSize: "0.65rem", color: "#F97316", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis" }}>{health.message}</span>
                    ) : (
                      <span></span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="card span-2">
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)} style={{
                display: "flex", alignItems: "center", gap: "0.8rem",
                background: "#111827", borderRadius: "12px", padding: "0.5rem 1rem",
                border: "1px solid #1E293B", cursor: "pointer", marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#F87171" : "#A78BFA", flexShrink: 0 }}></div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#E2E8F0" }}>{d.name}</span>
                  <div style={{ fontSize: "0.65rem", color: "#94A3B8" }}>
                    {d.monthsPassed}/{d.monthsTotal} months · {d.health === "slow" ? <span style={{ color: "#F87171", fontWeight: 600 }}>Slow: only {d.pct}% spent</span> : d.health === "ok" ? <span style={{ color: "#F97316", fontWeight: 600 }}>OK</span> : <span style={{ color: "#2DD4BF", fontWeight: 600 }}>On Track</span>}
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#E2E8F0" }}>{formatPKR(d.remaining)}</span>
                <span style={{ fontSize: "0.75rem", color: "#94A3B8", minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 3: Underspend + Receivables vs Payables ── */}
        <div className="dashboard-grid">
          <div className="card span-3">
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>💡 Top 5 Underspend Activities</div>
            {underspentActivities.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "#94A3B8" }}>No activities with remaining budget this month.</div>
            ) : (
              <>
                <div className="underspend-header">
                  <span>Activity</span>
                  <span>Budget</span>
                  <span>Actual</span>
                  <span>Unspent</span>
                </div>
                {underspentActivities.map((act, idx) => (
                  <div key={idx} className="underspend-row-grid">
                    <span
                      className="clickable"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (act.projectId) {
                          router.push(`/dashboard/settings/budgets?project=${act.projectId}&activity=${act.id}`)
                        } else {
                          router.push(`/dashboard/reports/spending-detail?activity=${act.id}&fy=${fiscalYear}`)
                        }
                      }}
                    >
                      {act.name}
                    </span>
                    <span style={{ color: "#E2E8F0" }}>{formatPKR(act.budget)}</span>
                    <span style={{ color: "#E2E8F0" }}>{formatPKR(act.actual)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ flex: 1, height: 5, background: "#334155", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(act.pct, 100)}%`, height: "100%", background: "#2DD4BF", borderRadius: 10 }}></div>
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "#2DD4BF", fontWeight: 600, whiteSpace: "nowrap" }}>{act.pct}%</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Combined Receivables vs Payables card */}
          <div className="card span-2">
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "1rem" }}>⚖️ Receivables vs Payables</div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginBottom: "0.8rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "#94A3B8", marginBottom: 2 }}>Receivables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalReceivables)}</div>
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#64748B" }}>VS</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "#94A3B8", marginBottom: 2 }}>Payables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalPayables)}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.75rem", fontWeight: 600 }}>
              {totalReceivables > totalPayables ? (
                <>
                  <CheckCircle size={16} className="health-positive" />
                  <span className="health-positive">Healthy — Receivables exceed Payables by {formatPKR(totalReceivables - totalPayables)}</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} className="health-negative" />
                  <span className="health-negative">Unhealthy — Payables exceed Receivables by {formatPKR(totalPayables - totalReceivables)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer summary ── */}
        <div style={{
          background: "#111827", borderRadius: 12, padding: "0.6rem 1.2rem",
          border: "1px solid #1E293B", display: "flex", justifyContent: "space-between",
          flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "#94A3B8", fontWeight: 500
        }}>
          <span>⚠️ Portfolio Health: {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Total Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
          <span style={{ marginLeft: "auto" }}>Last updated: {lastUpdated}</span>
        </div>
      </div>
    </div>
  )
}