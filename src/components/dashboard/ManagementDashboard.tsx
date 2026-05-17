"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

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
  const [unpaidInvoices, setUnpaidInvoices] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [topReceivables, setTopReceivables] = useState<any[]>([])   // top 3 customers by balance

  // Monthly Spending & trend
  const [monthlySpending, setMonthlySpending] = useState(0)
  const [lastMonthSpending, setLastMonthSpending] = useState(0)
  const [spendingTrend, setSpendingTrend] = useState(0)
  // Top 3 underspent activities
  const [underspentActivities, setUnderspentActivities] = useState<any[]>([])
  // Unpaid invoices details (top 3)
  const [unpaidDetails, setUnpaidDetails] = useState<any[]>([])

  // Activity health per project (for project utilisation card)
  const [activityHealth, setActivityHealth] = useState<Record<string, { total: number; withinRange: number; message: string }>>({})

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

      // Donor Balances (RPC)
      const { data: donorData } = await supabase.rpc("dashboard_donor_balances", { cid: companyId, fy: fiscalYear })
      setDonorBalances(donorData?.map((d: any) => {
        const percentSpent = d.budget ? (d.actual_spent / d.budget) * 100 : 0
        const monthsPassed = new Date().getMonth() + 1   // 1‑12
        const monthsTotal = 12
        const timePercent = (monthsPassed / monthsTotal) * 100
        return {
          donor_id: d.donor_id, name: d.donor_name,
          budget: d.budget, actual: d.actual_spent,
          remaining: (d.budget || 0) - (d.actual_spent || 0),
          pct: Math.round(percentSpent),
          overspent: (d.actual_spent || 0) > (d.budget || 0),
          monthsPassed,
          monthsTotal,
          timePercent: Math.round(timePercent),
          health: percentSpent > timePercent * 0.8 ? "on track" : percentSpent < timePercent * 0.4 ? "slow" : "ok",
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
      const now = new Date()
      const pastQ1 = now.getMonth() > 2
      const enrichedProjects = projectsArr.map((p: any) => ({
        ...p,
        status: p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : (pastQ1 && p.pct < 10) ? "At Risk" : "On Track",
      }))
      setProjectRows(enrichedProjects.sort((a: any, b: any) => b.pct - a.pct))
      setOverspentCount(enrichedProjects.filter((p: any) => p.actual > p.budget).length)

      // Quick stats
      const { count: unpaidCount } = await supabase.from("invoices")
        .select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "Unpaid")
      setUnpaidInvoices(unpaidCount || 0)

      const { data: custBals } = await supabase.from("customers").select("id,name,balance").eq("company_id", companyId).order("balance", { ascending: false }).limit(3)
      setTopReceivables(custBals || [])
      setTotalReceivables(custBals?.reduce((s, c) => s + (c.balance || 0), 0) || 0)

      // ── Monthly Spending (current month) ── (FIXED: use !inner join)
      const currentMonth = now.getMonth() + 1
      const currentMonthStart = `${fiscalYear}-${String(currentMonth).padStart(2, '0')}-01`
      const currentMonthEnd = `${fiscalYear}-${String(currentMonth).padStart(2, '0')}-${new Date(fiscalYear, currentMonth, 0).getDate()}`
      const { data: monthLines } = await supabase
        .from("journal_lines")
        .select("debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .gte("journal_entries.date", currentMonthStart)
        .lte("journal_entries.date", currentMonthEnd)
      const monthTotal = (monthLines || []).reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)
      setMonthlySpending(monthTotal)

      // ── Previous Month Spending (for trend) ──
      const prevMonthDate = new Date(fiscalYear, currentMonth - 2, 1)
      const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth()+1).padStart(2,'0')}-01`
      const prevMonthEnd = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth()+1, 0).toISOString().split("T")[0]
      const { data: prevMonthLines } = await supabase
        .from("journal_lines")
        .select("debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .gte("journal_entries.date", prevMonthStart)
        .lte("journal_entries.date", prevMonthEnd)
      const prevMonthTotal = (prevMonthLines || []).reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)
      setLastMonthSpending(prevMonthTotal)
      if (prevMonthTotal > 0) {
        setSpendingTrend(Math.round(((monthTotal - prevMonthTotal) / prevMonthTotal) * 100))
      } else if (monthTotal > 0) {
        setSpendingTrend(100)
      } else {
        setSpendingTrend(0)
      }

      // ── Top 3 underspent activities (this month) ──
      const { data: actBudgets } = await supabase
        .from("budgets")
        .select("activity_id, activities(name), budgeted_amount")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
      const activityMap: Record<number, { name: string; budget: number; actual: number }> = {}
      actBudgets?.forEach((b: any) => {
        if (!b.activity_id) return
        if (!activityMap[b.activity_id]) {
          activityMap[b.activity_id] = { name: b.activities?.name || `Activity ${b.activity_id}`, budget: 0, actual: 0 }
        }
        activityMap[b.activity_id].budget += b.budgeted_amount || 0
      })
      const { data: actLines } = await supabase
        .from("journal_lines")
        .select("activity_id, debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .gte("journal_entries.date", currentMonthStart)
        .lte("journal_entries.date", currentMonthEnd)
      actLines?.forEach((l: any) => {
        if (!l.activity_id || !activityMap[l.activity_id]) return
        activityMap[l.activity_id].actual += (l.debit || 0) - (l.credit || 0)
      })
      const underspent = Object.values(activityMap)
        .filter((a: any) => a.budget > 0)
        .map((a: any) => ({
          id: Object.keys(activityMap).find(k => activityMap[Number(k)] === a),  // hack to get id
          name: a.name,
          budget: a.budget,
          actual: a.actual,
          remaining: a.budget - a.actual,
          pct: a.budget > 0 ? Math.round(((a.budget - a.actual) / a.budget) * 100) : 0,
        }))
        .sort((a: any, b: any) => b.remaining - a.remaining)
        .slice(0, 3)
      // Add proper ID for clickability
      const underspentFinal = []
      for (const item of underspent) {
        const actId = Object.keys(activityMap).find(k => activityMap[Number(k)]?.name === item.name)
        underspentFinal.push({ ...item, id: actId ? Number(actId) : null })
      }
      setUnderspentActivities(underspentFinal)

      // ── Unpaid invoice details (top 3) ──
      const { data: unpaidInvs } = await supabase
        .from("invoices")
        .select("id, invoice_no, total, party_id, customers(name)")
        .eq("company_id", companyId)
        .eq("status", "Unpaid")
        .order("total", { ascending: false })
        .limit(3)
      setUnpaidDetails(unpaidInvs || [])

      // ── Activity health per project (for project utilisation card) ──
      if (enrichedProjects.length > 0) {
        const projectIds = enrichedProjects.map(p => p.id)
        const { data: actBudgetsAll } = await supabase
          .from("budgets")
          .select("project_id, activity_id, budgeted_amount")
          .eq("company_id", companyId)
          .eq("fiscal_year", fiscalYear)
          .in("project_id", projectIds)
          .is("month", null)
        // Group budget per activity per project
        const actBudgetMap: Record<string, Record<string, number>> = {}
        actBudgetsAll?.forEach(b => {
          const pId = String(b.project_id)
          const aId = String(b.activity_id)
          if (!actBudgetMap[pId]) actBudgetMap[pId] = {}
          actBudgetMap[pId][aId] = (actBudgetMap[pId][aId] || 0) + (b.budgeted_amount || 0)
        })
        // Fetch actuals for those activities
        const allActIds = Array.from(new Set(actBudgetsAll?.map(b => b.activity_id) || []))
        const { data: actActuals } = await supabase
          .from("journal_lines")
          .select("activity_id, debit, credit")
          .eq("company_id", companyId)
          .in("activity_id", allActIds)
          .gte("journal_entries.date", `${fiscalYear}-01-01`)
          .lte("journal_entries.date", `${fiscalYear}-12-31`)
        const actActualMap: Record<string, number> = {}
        actActuals?.forEach(l => {
          const aId = String(l.activity_id)
          actActualMap[aId] = (actActualMap[aId] || 0) + (l.debit || 0) - (l.credit || 0)
        })
        // Calculate per-activity % and compare with project %
        const healthData: Record<string, { total: number; withinRange: number; message: string }> = {}
        enrichedProjects.forEach(proj => {
          const pId = String(proj.id)
          const projPct = proj.pct
          const activities = actBudgetMap[pId] || {}
          let total = 0, within = 0
          Object.keys(activities).forEach(aId => {
            const budget = activities[aId] || 0
            if (budget <= 0) return
            total++
            const actual = actActualMap[aId] || 0
            const actPct = budget ? (actual / budget) * 100 : 0
            if (Math.abs(actPct - projPct) <= 10) within++
          })
          const msg = total > 0 ? `${within} of ${total} activities within ±10%` : "No activity data"
          healthData[pId] = { total, withinRange: within, message: msg }
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
  const projectsAbove70 = filteredProjectRows.filter(p => p.pct > 70).length

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

  const formatDetail = (v: number) => {
    const sign = v < 0 ? "-" : ""
    return `${sign}PKR ${Math.abs(v).toLocaleString()}`
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

  return (
    <div style={{ background: "#0B1120", minHeight: "100%", flex: 1, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .ngo-dash * { box-sizing: border-box; margin: 0; padding: 0; }
        .ngo-dash .card {
          background: #111827; border: 1px solid #1E293B;
          border-radius: 14px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: all 0.2s;
          cursor: pointer;
        }
        .ngo-dash .card:hover { background: #1E293B; border-color: #334155; }
        .ngo-dash .kpi-label { text-transform: uppercase; font-size: 0.75rem; font-weight: 700; color: #94A3B8; letter-spacing: 0.04em; }
        .ngo-dash .kpi-value { font-size: 1.8rem; font-weight: 700; color: #F1F5F9; line-height: 1.2; margin: 4px 0; }
        .ngo-dash .kpi-meta { font-size: 0.8rem; color: #64748B; display: flex; align-items: center; gap: 0.3rem; }
        .ngo-dash .hero {
          background: #111827; border: 1px solid #1E293B;
          border-radius: 14px; padding: 1rem 1.5rem;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 0.8rem;
        }
        .ngo-dash .hero-greeting h2 {
          font-size: 1.3rem; font-weight: 700; color: #F1F5F9; margin-bottom: 0.15rem;
        }
        .ngo-dash .hero-greeting p {
          color: #94A3B8; font-size: 0.85rem; margin: 0;
        }
        .ngo-dash .hero-filters {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
        }
        .ngo-dash .filter-label {
          font-weight: 600; color: #94A3B8; font-size: 0.75rem; margin-right: 0.1rem;
        }
        .ngo-dash .filter-pill {
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
        .ngo-dash .warning-banner {
          background: #1E1A2E; border: 1px solid #2D2438;
          border-left: 4px solid #EF4444; border-radius: 10px;
          padding: 10px 18px; margin-bottom: 1rem;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
          font-size: 0.9rem; color: #FCA5A5; font-weight: 500;
        }
        .ngo-dash .warning-btn {
          background: #374151; color: white; border: none;
          border-radius: 6px; padding: 6px 14px;
          font-weight: 600; cursor: pointer; font-size: 0.8rem;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem; margin-bottom: 1rem;
        }
        .span-1 { grid-column: span 1; }
        .span-2 { grid-column: span 2; }
        .span-3 { grid-column: span 3; }
        .span-4 { grid-column: span 4; }
        .project-item {
          display: flex; flex-direction: column; gap: 6px;
          padding: 0.5rem 0; border-bottom: 1px solid #1E293B;
        }
        .project-item:last-child { border-bottom: none; }
        .project-header {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 0.85rem;
        }
        .progress-bg { height: 6px; background: #1E293B; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; background: linear-gradient(90deg, #2563EB, #7C3AED); }
        .donor-list-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.65rem 0; border-bottom: 1px solid #1E293B;
        }
        .donor-list-item:last-child { border-bottom: none; }
        .health-slow { color: #EF4444; font-weight: 600; }
        .health-ok { color: #F97316; font-weight: 600; }
        .health-on-track { color: #10B981; font-weight: 600; }
        .clickable-text { color: #93C5FD; cursor: pointer; text-decoration: underline; }
        @media (max-width: 1100px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .span-1, .span-2, .span-3, .span-4 { grid-column: span 1 !important; }
        }
        @media (max-width: 640px) {
          .dashboard-grid { grid-template-columns: 1fr; }
          .span-1, .span-2, .span-3, .span-4 { grid-column: span 1 !important; }
          .hero { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      <div className="ngo-dash" style={{ padding: "0.8rem 1.2rem" }}>
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
              <option value="">All</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="filter-label">Donors:</span>
            <select className="filter-pill" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
              <option value="">All</option>
              {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Overspent warning ── */}
        {filteredOverspentCount > 0 && (
          <div className="warning-banner">
            <span>⚠️ Portfolio overspent by {formatPKR(filteredTotalSpent - filteredTotalBudget)}. {filteredOverspentCount} {filteredOverspentCount === 1 ? "project" : "projects"} need review.</span>
            <button className="warning-btn" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
              Review overspent →
            </button>
          </div>
        )}

        {/* ── KPI cards row ── */}
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
              {projectsAbove70 > 0 && <span style={{ marginLeft: 4, fontSize: "0.7rem", color: "#10B981" }}>({projectsAbove70} of {filteredProjectRows.length} projects &gt; 70%)</span>}
            </div>
          </div>
          <div className="card span-1"
            onClick={() => { if (remainingFunds < 0) router.push("/dashboard/reports/overspent" + detailQuery()) }}>
            <div className="kpi-label">{remainingFunds < 0 ? "Overspent" : "Remaining"}</div>
            <div className="kpi-value" style={{ color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171" }}>
              {formatPKR(remainingFunds)}
            </div>
            <div className="kpi-meta">
              {Math.round(Math.abs(remainingFunds / filteredTotalBudget) * 100)}% {remainingFunds < 0 ? "over" : "left"}
            </div>
          </div>
          <div className="card span-1" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
            <div className="kpi-label">Portfolio Health</div>
            <div className="kpi-value" style={{ color: filteredOverspentCount > 0 ? "#F97316" : "#2DD4BF", fontSize: "1.4rem" }}>
              {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}
            </div>
            <div className="kpi-meta">{Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score</div>
          </div>
        </div>

        {/* ── Project Utilization + Donor Balances ── */}
        <div className="dashboard-grid">
          <div className="card span-2" onClick={() => router.push("/dashboard/settings/budgets" + detailQuery())}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "1rem" }}>📊 Project Utilization</div>
            {filteredProjectRows.map((p, idx) => {
              const health = activityHealth[p.id]
              return (
                <div key={idx} className="project-item">
                  <div className="project-header">
                    <span style={{ fontWeight: 600, color: "#E2E8F0" }}>{p.name}</span>
                    <span style={{ color: "#94A3B8" }}>{formatPKR(p.actual)} / {formatPKR(p.budget)}</span>
                  </div>
                  <div className="progress-bg">
                    <div className="progress-fill" style={{ width: `${Math.min(p.pct, 100)}%` }}></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "#64748B" }}>
                    <span>{p.pct}%</span>
                    <span style={{ color: p.status === "Overspent" ? "#F87171" : p.status === "Review" ? "#F97316" : "#2DD4BF" }}>{p.status}</span>
                  </div>
                  {health && (
                    <div style={{ fontSize: "0.65rem", color: "#94A3B8", marginTop: 2, fontStyle: "italic" }}>
                      {health.message}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="card span-2" onClick={() => router.push("/dashboard/reports/donor" + detailQuery())}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "1rem" }}>💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} className="donor-list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: "#E2E8F0" }}>{d.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "#94A3B8" }}>
                    {d.monthsPassed} of {d.monthsTotal} months elapsed
                    {d.health === "slow" && <span className="health-slow"> · Slow: only {d.pct}% spent</span>}
                    {d.health === "ok" && <span className="health-ok"> · OK</span>}
                    {d.health === "on track" && <span className="health-on-track"> · On Track</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 600, color: d.overspent ? "#F87171" : "#2DD4BF" }}>{formatPKR(d.remaining)}</div>
                  <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{d.pct}% used</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Underspent Activities + Receivables + Unpaid Invoices ── */}
        <div className="dashboard-grid">
          <div className="card span-2">
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "1rem" }}>💡 Top Underspend Activities (This Month)</div>
            {underspentActivities.length === 0 ? (
              <div style={{ color: "#94A3B8", fontSize: "0.85rem" }}>No data for this month.</div>
            ) : (
              underspentActivities.map((act, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #1E293B", fontSize: "0.85rem" }}>
                  <span
                    className="clickable-text"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/dashboard/reports/spending-detail?activity=${act.id}&fy=${fiscalYear}`)
                    }}
                  >{act.name}</span>
                  <span style={{ color: "#2DD4BF", fontWeight: 600 }}>{formatDetail(act.remaining)} left ({act.pct}% unspent)</span>
                </div>
              ))
            )}
          </div>
          <div className="card span-1">
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>🧾 Receivables</div>
            <div className="kpi-value" style={{ color: totalReceivables > 0 ? "#F97316" : "#94A3B8" }}>{formatPKR(totalReceivables)}</div>
            {topReceivables.length > 0 && (
              <div style={{ marginTop: 8, fontSize: "0.75rem" }}>
                {topReceivables.map((cust, i) => (
                  <div key={cust.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#E2E8F0" }}>
                    <span>{cust.name}</span>
                    <span>{formatPKR(cust.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card span-1">
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>📦 Unpaid Invoices</div>
            <div className="kpi-value" style={{ color: unpaidInvoices > 0 ? "#F87171" : "#94A3B8" }}>{unpaidInvoices}</div>
            {unpaidDetails.length > 0 && (
              <div style={{ marginTop: 8, fontSize: "0.75rem" }}>
                {unpaidDetails.map((inv, i) => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#E2E8F0" }}>
                    <span>{inv.invoice_no}</span>
                    <span style={{ color: "#F87171" }}>{formatPKR(inv.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom summary bar ── */}
        <div style={{
          background: "#111827", borderRadius: 12, padding: "0.6rem 1.2rem",
          border: "1px solid #1E293B", display: "flex", justifyContent: "space-between",
          flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "#94A3B8", fontWeight: 500
        }}>
          <span>📅 Last updated: {lastUpdated}</span>
          <span>📊 Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>💸 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
        </div>
      </div>
    </div>
  )
}