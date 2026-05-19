"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle } from "lucide-react"
import { motion } from "framer-motion"

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
  // Top 5 underspent activities
  const [underspentActivities, setUnderspentActivities] = useState<any[]>([])

  // Activity health per project
  const [activityHealth, setActivityHealth] = useState<Record<string, { lowCount: number; threshold: number; message: string }>>({})

  // Last updated
  const [lastUpdated, setLastUpdated] = useState("")

  // ── Fetch company ID ──
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

      // Total Spent
      const { data: spentData } = await supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear })
      setTotalSpent(spentData?.[0]?.total || 0)

      // Donor Balances
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
          monthsPassed, monthsTotal, health,
        }
      }) || [])

      // Project Utilization
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

      // Quick stats
      const { data: custBals } = await supabase.from("customers").select("balance").eq("company_id", companyId)
      setTotalReceivables(custBals?.reduce((s, c) => s + (c.balance || 0), 0) || 0)

      const { data: suppBals } = await supabase.from("suppliers").select("balance").eq("company_id", companyId)
      setTotalPayables(suppBals?.reduce((s, s2) => s + (s2.balance || 0), 0) || 0)

      // Monthly Spending
      const { data: expenseAccounts } = await supabase.from("accounts")
        .select("id").eq("company_id", companyId).eq("type", "Expense")
      const { data: fixedAssets } = await supabase.from("accounts")
        .select("id").eq("company_id", companyId).eq("type", "Asset")
        .gte("code", "1400").lte("code", "1499")

      const accountIds = [...(expenseAccounts?.map(a => a.id) || []), ...(fixedAssets?.map(a => a.id) || [])]

      if (accountIds.length > 0) {
        const { data: monthLines } = await supabase
          .from("journal_lines")
          .select("debit, credit, journal_entries!inner(date)")
          .eq("company_id", companyId)
          .in("account_id", accountIds)
          .gte("journal_entries.date", startOfMonthISO)
          .lte("journal_entries.date", todayISO)
        const monthTotal = (monthLines || []).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
        setMonthlySpending(monthTotal)

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
        const prevMonthTotal = (prevMonthLines || []).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
        setLastMonthSpending(prevMonthTotal)
        if (prevMonthTotal > 0) setSpendingTrend(Math.round(((monthTotal - prevMonthTotal) / prevMonthTotal) * 100))
        else if (monthTotal > 0) setSpendingTrend(100)
        else setSpendingTrend(0)
      }

      // Top 5 underspent activities
      const { data: actBudgets } = await supabase
        .from("budgets")
        .select("activity_id, activities(name), budgeted_amount, project_id")
        .eq("company_id", companyId).eq("fiscal_year", fiscalYear).is("month", null)
      const activityMap: Record<number, { name: string; budget: number; actual: number; projectId: number | null }> = {}
      actBudgets?.forEach((b: any) => {
        if (!b.activity_id) return
        if (!activityMap[b.activity_id]) activityMap[b.activity_id] = { name: b.activities?.name || `Activity ${b.activity_id}`, budget: 0, actual: 0, projectId: b.project_id || null }
        activityMap[b.activity_id].budget += b.budgeted_amount || 0
      })
      const { data: actLines } = await supabase
        .from("journal_lines")
        .select("activity_id, debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId).in("account_id", accountIds)
        .gte("journal_entries.date", startOfMonthISO).lte("journal_entries.date", todayISO)
      actLines?.forEach((l: any) => { if (!l.activity_id || !activityMap[l.activity_id]) return; activityMap[l.activity_id].actual += (l.debit || 0) - (l.credit || 0) })
      const underspent = Object.entries(activityMap)
        .filter(([_, a]) => a.budget > 0)
        .map(([id, a]) => ({ id: Number(id), name: a.name, budget: a.budget, actual: a.actual, remaining: a.budget - a.actual, pct: Math.round(((a.budget - a.actual) / a.budget) * 100), projectId: a.projectId }))
        .sort((a, b) => b.remaining - a.remaining).slice(0, 5)
      setUnderspentActivities(underspent)

      // Activity health
      if (enrichedProjects.length > 0) {
        const projectIds = enrichedProjects.map((p: any) => p.id)
        const { data: actBudgetsAll } = await supabase.from("budgets").select("project_id, activity_id, budgeted_amount").eq("company_id", companyId).eq("fiscal_year", fiscalYear).in("project_id", projectIds).is("month", null)
        const projActBudget: Record<string, Record<string, number>> = {}
        actBudgetsAll?.forEach((b: any) => { const pid = String(b.project_id); const aid = String(b.activity_id); if (!projActBudget[pid]) projActBudget[pid] = {}; projActBudget[pid][aid] = (projActBudget[pid][aid] || 0) + (b.budgeted_amount || 0) })
        const allActIds = Array.from(new Set(actBudgetsAll?.map((b: any) => b.activity_id) || []))
        const { data: actActuals } = await supabase.from("journal_lines").select("activity_id, debit, credit").eq("company_id", companyId).in("activity_id", allActIds).gte("journal_entries.date", `${fiscalYear}-01-01`).lte("journal_entries.date", `${fiscalYear}-12-31`)
        const actActualMap: Record<string, number> = {}
        actActuals?.forEach((l: any) => { const aid = String(l.activity_id); actActualMap[aid] = (actActualMap[aid] || 0) + (l.debit || 0) - (l.credit || 0) })
        const healthData: Record<string, { lowCount: number; threshold: number; message: string }> = {}
        enrichedProjects.forEach((proj: any) => {
          const pid = String(proj.id); const projPct = proj.pct; const activities = projActBudget[pid] || {}; let lowCount = 0; const threshold = Math.max(0, projPct - 20)
          if (projPct > 0) Object.entries(activities).forEach(([aid, budget]) => { const actual = actActualMap[aid] || 0; if ((actual / (budget || 1)) * 100 < threshold) lowCount++ })
          if (lowCount > 0) healthData[pid] = { lowCount, threshold, message: `⚠️ ${lowCount} act. below ${threshold}%` }
        })
        setActivityHealth(healthData)
      }

      setLastUpdated(new Date().toLocaleTimeString())
      setLoading(false)
    }

    fetchData()
  }, [companyId, fiscalYear])

  // ── Filtered data ──
  const filteredDonorBalances = donorBalances.filter(d => !selectedDonorId || d.donor_id == selectedDonorId)
  const filteredProjectRows = projectRows.filter(p => !selectedProjectId || p.id == selectedProjectId)
  const filteredTotalBudget = selectedProjectId ? filteredProjectRows.reduce((s, p) => s + p.budget, 0) : totalBudget
  const filteredTotalSpent = selectedProjectId ? filteredProjectRows.reduce((s, p) => s + p.actual, 0) : totalSpent
  const filteredOverspentCount = selectedProjectId ? filteredProjectRows.filter(p => p.actual > p.budget).length : overspentCount
  const remainingFunds = filteredTotalBudget - filteredTotalSpent
  const spentPct = filteredTotalBudget ? Math.round((filteredTotalSpent / filteredTotalBudget) * 100) : 0
  const projectsAbove70 = filteredProjectRows.filter(p => p.pct > 70).map(p => p.name)

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const formatPKR = (v: number) => {
    const sign = v < 0 ? "-" : ""
    const abs = Math.abs(v)
    return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
  }

  const detailQuery = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ fy: String(fiscalYear) })
    if (selectedProjectId) params.set("project", selectedProjectId)
    if (selectedDonorId) params.set("donor", selectedDonorId)
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return "?" + params.toString()
  }

  const Trend = ({ value, positive = false, negative = false }: { value: number; positive?: boolean; negative?: boolean }) => {
    if (value === 0) return <Minus size={14} style={{ color: "#94A3B8" }} />
    if (value > 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: positive ? "#2DD4BF" : "#F97316", fontSize: "0.75rem", fontWeight: 600 }}><TrendingUp size={14} /> {Math.abs(value)}%</span>
    if (value < 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: negative ? "#F97316" : "#2DD4BF", fontSize: "0.75rem", fontWeight: 600 }}><TrendingDown size={14} /> {Math.abs(value)}%</span>
    return null
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", background: "#0A0A0A", minHeight: "100vh", color: "#94A3B8" }}>Loading…</div>
  }

  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.45 } }),
  }

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100%", flex: 1, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }
        .mgmt .card {
          background: #111827; border: 1px solid #1E293B;
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.2s; cursor: pointer;
        }
        .mgmt .card:hover { background: #1E293B; border-color: #334155; }
        .mgmt .hero {
          background: #111827; border: 1px solid #1E293B;
          border-radius: 16px; padding: 1rem 1.5rem; margin-bottom: 1rem;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.8rem;
        }
        .mgmt .hero-greeting h2 { font-size: 1.3rem; font-weight: 700; color: #F1F5F9; }
        .mgmt .hero-greeting p { color: #94A3B8; font-size: 0.85rem; }
        .mgmt .hero-filters { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .mgmt .filter-label { font-weight: 600; color: #94A3B8; font-size: 0.75rem; }
        .mgmt .filter-pill {
          background: #1E293B; border: 1px solid #334155; padding: 0.2rem 0.6rem; border-radius: 20px;
          font-size: 0.78rem; font-weight: 500; color: #F1F5F9; cursor: pointer;
          -webkit-appearance: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 0.5rem center; padding-right: 1.8rem;
        }
        .mgmt .warning-banner {
          background: #1E293B; border: 1px solid #1E293B; border-left: 6px solid #334155;
          border-radius: 10px; padding: 8px 16px; margin-bottom: 1rem;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
          font-size: 0.9rem; color: #FCA5A5; font-weight: 500;
        }
        .mgmt .warning-btn { background: #374151; color: white; border: none; border-radius: 6px; padding: 6px 14px; font-weight: 600; cursor: pointer; font-size: 0.8rem; }
        .dashboard-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin-bottom: 1rem; }
        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: #94A3B8; letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.7rem; font-weight: 700; color: #F1F5F9; line-height: 1.2; }
        .kpi-meta { font-size: 0.8rem; color: #64748B; display: flex; align-items: center; gap: 0.3rem; }
        @media (max-width: 1100px) { .dashboard-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 800px) { .dashboard-grid { grid-template-columns: repeat(2, 1fr); } .hero { flex-direction: column; align-items: flex-start; } }
        @media (max-width: 640px) { .dashboard-grid { grid-template-columns: repeat(2, 1fr); } .card { padding: 1rem; } .kpi-value { font-size: 1.4rem; } }
        @media (max-width: 380px) { .dashboard-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        <motion.div className="hero" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="hero-greeting"><h2>{getGreeting()}, siqbalhwc</h2><p>Here's what's happening with your NGO portfolio today</p></div>
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
        </motion.div>

        {filteredOverspentCount > 0 && (
          <motion.div className="warning-banner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
            <span>⚠️ Portfolio overspent by {formatPKR(filteredTotalSpent - filteredTotalBudget)}. {filteredOverspentCount} project(s) need review.</span>
            <button className="warning-btn" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>View overspent →</button>
          </motion.div>
        )}

        <div className="dashboard-grid">
          {[
            { label: "Total Budget", value: formatPKR(filteredTotalBudget), meta: `${filteredProjectRows.length} projects`, color: "#A78BFA", link: "/dashboard/reports/budget-summary" },
            { label: "Total Spent", value: formatPKR(filteredTotalSpent), meta: `${spentPct}% of budget`, color: "#F97316", link: "/dashboard/reports/spending-detail", extra: projectsAbove70.length > 0 ? `Projects > 70%: ${projectsAbove70.join(", ")}` : null },
            { label: remainingFunds < 0 ? "Overspent" : "Remaining", value: formatPKR(remainingFunds), meta: `${Math.abs(Math.round((remainingFunds / filteredTotalBudget) * 100))}% ${remainingFunds < 0 ? "over" : "left"}`, color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171", link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null },
            { label: "Portfolio Health", value: filteredOverspentCount > 0 ? "⚠️ Needs Attention" : "Healthy", meta: `${Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score`, color: filteredOverspentCount > 0 ? "#F97316" : "#2DD4BF", link: "/dashboard/reports/overspent" },
            { label: "📆 Monthly Spending", value: monthlySpending > 0 ? formatPKR(monthlySpending) : "—", meta: monthlySpending === 0 ? "No transactions this month" : `vs. ${formatPKR(lastMonthSpending)} last month`, color: monthlySpending > 0 ? "#F97316" : "#94A3B8", link: "/dashboard/reports/spending-detail" },
          ].map((kpi, i) => (
            <motion.div key={kpi.label} className="card" custom={i} initial="hidden" animate="visible" variants={cardVariant}
              whileHover={{ scale: 1.02, y: -4 }} onClick={() => kpi.link && router.push(kpi.link + detailQuery())}>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="kpi-meta">{kpi.meta}</div>
              {kpi.extra && <div style={{ fontSize: "0.65rem", color: "#93C5FD", marginTop: 4 }}>{kpi.extra}</div>}
            </motion.div>
          ))}
        </div>

        {/* Project Utilization + Donor Balances (same layout as before) */}
        <div className="dashboard-grid" style={{ gridTemplateColumns: "3fr 2fr" }}>
          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} onClick={() => router.push("/dashboard/settings/budgets" + detailQuery())}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>📊 Project Utilization</div>
            {filteredProjectRows.map((p, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}
                style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: "#111827", borderRadius: "12px", padding: "0.5rem 1rem", border: "1px solid #1E293B", cursor: "pointer", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.status === "Overspent" ? "#F87171" : p.status === "Review" ? "#F97316" : p.status === "At Risk" ? "#F97316" : "#2DD4BF" }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: "#E2E8F0" }}>{p.name}</span>
                <span style={{ fontWeight: 600, color: "#E2E8F0" }}>{formatPKR(p.actual)}</span>
                <span style={{ color: p.pct > 100 ? "#F87171" : "#2DD4BF" }}>{p.pct}%</span>
                <span style={{ padding: "0.1rem 0.6rem", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 700, background: p.status === "Overspent" ? "#fee2e2" : "#dcfce7", color: p.status === "Overspent" ? "#991b1b" : "#166534" }}>{p.status}</span>
              </div>
            ))}
          </motion.div>

          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)}
                style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: "#111827", borderRadius: "12px", padding: "0.5rem 1rem", border: "1px solid #1E293B", cursor: "pointer", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#F87171" : "#A78BFA" }}></div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#E2E8F0" }}>{d.name}</span>
                  <div style={{ fontSize: "0.65rem", color: "#94A3B8" }}>{d.monthsPassed}/{d.monthsTotal} months · {d.health === "slow" ? <span style={{ color: "#F87171" }}>Slow</span> : d.health === "on track" ? <span style={{ color: "#2DD4BF" }}>On Track</span> : <span style={{ color: "#F97316" }}>OK</span>}</div>
                </div>
                <span style={{ fontWeight: 700, color: "#E2E8F0" }}>{formatPKR(d.remaining)}</span>
                <span style={{ color: "#94A3B8" }}>{d.pct}%</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Underspend + Receivables vs Payables (same as before) */}
        <div className="dashboard-grid">
          <motion.div className="card" style={{ gridColumn: "span 3" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>💡 Top 5 Underspend Activities</div>
            {underspentActivities.length === 0 ? <div style={{ color: "#94A3B8" }}>No activities this month.</div> : (
              underspentActivities.map(act => (
                <div key={act.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1E293B", fontSize: "0.8rem" }}>
                  <span style={{ color: "#93C5FD", cursor: "pointer" }} onClick={() => router.push(`/dashboard/reports/spending-detail?activity=${act.id}&fy=${fiscalYear}`)}>{act.name}</span>
                  <span>{formatPKR(act.remaining)} left ({act.pct}%)</span>
                </div>
              ))
            )}
          </motion.div>

          <motion.div className="card" style={{ gridColumn: "span 2" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "1rem" }}>⚖️ Receivables vs Payables</div>
            <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "0.8rem" }}>
              <div style={{ textAlign: "center" }}><div style={{ color: "#94A3B8", fontSize: "0.7rem" }}>Receivables</div><div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalReceivables)}</div></div>
              <div style={{ fontWeight: 700, color: "#64748B", alignSelf: "center" }}>VS</div>
              <div style={{ textAlign: "center" }}><div style={{ color: "#94A3B8", fontSize: "0.7rem" }}>Payables</div><div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalPayables)}</div></div>
            </div>
            <div style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 600 }}>
              {totalReceivables > totalPayables ? (
                <span style={{ color: "#2DD4BF" }}>✅ Healthy — Receivables exceed by {formatPKR(totalReceivables - totalPayables)}</span>
              ) : (
                <span style={{ color: "#F87171" }}>⚠️ Unhealthy — Payables exceed by {formatPKR(totalPayables - totalReceivables)}</span>
              )}
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          style={{ background: "#111827", borderRadius: 12, padding: "0.6rem 1.2rem", border: "1px solid #1E293B", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "#94A3B8", fontWeight: 500 }}>
          <span>⚠️ Portfolio Health: {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Total Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
          <span>Last updated: {lastUpdated}</span>
        </motion.div>
      </div>
    </div>
  )
}