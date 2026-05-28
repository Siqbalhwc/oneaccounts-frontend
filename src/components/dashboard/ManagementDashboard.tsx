"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle } from "lucide-react"
import { motion } from "framer-motion"
import { useTheme } from "@/contexts/ThemeContext"
import { useDashboardData } from "@/hooks/useDashboardData"

export default function ManagementDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark"

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyError, setCompanyError] = useState(false)

  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")

  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])

  // ── React Query cached dashboard data ─────────────────────────────
  const { data: dashData, isLoading, isError } = useDashboardData(companyId, fiscalYear)

  // Extract cached values with safe defaults
  const donorBalances = dashData?.donorBalances || []
  const projectRows = dashData?.projectRows || []
  const totalBudget = dashData?.totalBudget || 0
  const totalSpent = dashData?.totalSpent || 0
  const overspentCount = dashData?.overspentCount || 0
  const totalReceivables = dashData?.totalReceivables || 0
  const totalPayables = dashData?.totalPayables || 0
  const monthlySpending = dashData?.monthlySpending || 0
  const lastMonthSpending = dashData?.lastMonthSpending || 0
  const spendingTrend = dashData?.spendingTrend || 0
  const overdueInvoicesCount = dashData?.overdueInvoicesCount || 0
  const lastUpdated = dashData?.lastUpdated || ""

  // ── Underspent activities & activity health (unchanged) ─────────────
  const [underspentActivities, setUnderspentActivities] = useState<any[]>([])
  const [activityHealth, setActivityHealth] = useState<Record<string, { lowCount: number; threshold: number; message: string }>>({})

  // ── Top‑5 projects for the card ──
  const topFiveProjects = projectRows.slice(0, 5)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        setCompanyError(true)
        return
      }
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
      else setCompanyError(true)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase.from("projects").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setProjects(r.data))
    supabase.from("donors").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setDonors(r.data))
  }, [companyId])

  // ── Filtered data ─────────────────────────────────────────────────
  const filteredDonorBalances = donorBalances.filter((d: any) => !selectedDonorId || d.donor_id == selectedDonorId)
  const filteredProjectRows = projectRows.filter((p: any) => !selectedProjectId || p.id == selectedProjectId)
  const filteredTotalBudget = selectedProjectId ? filteredProjectRows.reduce((s: number, p: any) => s + p.budget, 0) : totalBudget
  const filteredTotalSpent = selectedProjectId ? filteredProjectRows.reduce((s: number, p: any) => s + p.actual, 0) : totalSpent
  const filteredOverspentCount = selectedProjectId ? filteredProjectRows.filter((p: any) => p.actual > p.budget).length : overspentCount
  const remainingFunds = filteredTotalBudget - filteredTotalSpent
  const spentPct = filteredTotalBudget ? Math.round((filteredTotalSpent / filteredTotalBudget) * 100) : 0

  const projectsSorted = [...filteredProjectRows].sort((a, b) => b.pct - a.pct)
  const highestProject = projectsSorted[0] || null
  const lowestProject = projectsSorted[projectsSorted.length - 1] || null

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
    if (value > 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: positive ? "#2DD4BF" : "#F97316", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingUp size={14} /> {Math.abs(value)}%
    </span>
    if (value < 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: negative ? "#F97316" : "#2DD4BF", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingDown size={14} /> {Math.abs(value)}%
    </span>
    return null
  }

  if (companyError) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "1.2rem", marginBottom: 8, color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem" }}>Your account may not be linked to a company. Please contact your administrator.</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--border)", borderTop: "3px solid #A78BFA" }}
        />
        <div style={{ fontSize: "0.9rem" }}>Loading your dashboard…</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "1.2rem", marginBottom: 8, color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem" }}>Please try refreshing the page.</div>
      </div>
    )
  }

  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.45 },
    }),
  }

  const hoverScale = {
    whileHover: {
      scale: 1.03,
      y: -6,
      boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.12)",
      transition: { duration: 0.25 },
    },
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", flex: 1, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: "var(--text)", transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }

        .mgmt .card {
          background: ${isDark ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.7)"};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"};
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: ${isDark ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.06)"};
          transition: all 0.3s ease;
          cursor: pointer;
          overflow: hidden;
          position: relative;
        }
        .mgmt .card:hover {
          background: ${isDark ? "rgba(30,41,59,0.8)" : "rgba(255,255,255,0.9)"};
          border-color: ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"};
        }

        .mgmt .hero {
          background: ${isDark ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.7)"};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: 16px; padding: 1rem 1.5rem;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 0.8rem;
        }

        .mgmt .hero-greeting h2 {
          font-size: 1.3rem; font-weight: 700; color: var(--text); margin-bottom: 0.15rem; white-space: nowrap;
        }
        .mgmt .hero-greeting p {
          color: var(--text-muted); font-size: 0.85rem; margin: 0; white-space: nowrap;
        }
        .mgmt .hero-filters {
          display: flex; align-items: center; gap: 0.5rem;
          flex-wrap: wrap;
        }
        .mgmt .filter-label {
          font-weight: 600; color: var(--text-muted); font-size: 0.75rem; margin-right: 0.1rem;
        }
        .mgmt .filter-pill {
          background: var(--card); border: 1px solid var(--border);
          padding: 0.2rem 0.6rem; border-radius: 20px;
          font-size: 0.78rem; font-weight: 500; color: var(--text);
          cursor: pointer; transition: 0.15s;
          -webkit-appearance: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          padding-right: 1.8rem;
          font-family: inherit;
        }
        .mgmt .filter-pill:focus { outline: none; border-color: var(--border-strong); }

        .mgmt .warning-banner {
          background: var(--warn-bg, #FEF3C7);
          border: 1px solid var(--warn-border, #FDE68A);
          border-left: 6px solid #EF4444;
          border-radius: 10px; padding: 8px 16px;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
          font-size: 0.9rem; color: var(--warn-text, #92400E);
          font-weight: 500;
        }
        .mgmt .warning-btn {
          background: #374151;
          color: white; border: none;
          border-radius: 6px; padding: 6px 14px;
          font-weight: 600; cursor: pointer; font-size: 0.8rem;
          white-space: nowrap; font-family: inherit;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.7rem; font-weight: 700; color: var(--text); line-height: 1.2; }
        .kpi-meta { font-size: 0.8rem; color: var(--text-soft); display: flex; align-items: center; gap: 0.3rem; }

        .underspend-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.5rem 0; border-bottom: 1px solid var(--border);
          gap: 0.8rem;
        }
        .underspend-row:last-child { border-bottom: none; }
        .progress-bg { height: 5px; background: var(--border); border-radius: 10px; flex: 1; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; background: #2DD4BF; }

        .clickable { color: #93C5FD; text-decoration: underline; cursor: pointer; }

        .overdue-banner {
          background: var(--card); border: 1px solid var(--border); border-left: 4px solid #EF4444;
          border-radius: 8px; padding: 0.5rem 1rem; margin-bottom: 1rem;
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; font-size: 0.85rem; color: var(--text); font-weight: 500;
          flex-wrap: nowrap;
        }
        .overdue-banner strong { color: #EF4444; white-space: nowrap; }
        .overdue-btn {
          background: #EF4444; color: white; border: none;
          border-radius: 6px; padding: 5px 12px;
          font-weight: 600; cursor: pointer; font-size: 0.78rem;
          white-space: nowrap; font-family: inherit;
        }

        @media (max-width: 1100px) {
          .dashboard-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 800px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .hero { flex-direction: column; align-items: flex-start; }
          .hero-filters { width: 100%; }
        }
        @media (max-width: 640px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
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
        }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        <motion.div
          className="hero"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
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
        </motion.div>

        {/* Overdue invoices banner */}
        {overdueInvoicesCount > 0 && (
          <motion.div
            className="overdue-banner"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0, boxShadow: ["0 0 0 rgba(239,68,68,0)", "0 0 20px rgba(239,68,68,0.3)", "0 0 0 rgba(239,68,68,0)"] }}
            transition={{ boxShadow: { repeat: Infinity, duration: 2.5 } }}
          >
            <span>⚠️ <strong>{overdueInvoicesCount} overdue {overdueInvoicesCount === 1 ? "invoice" : "invoices"}</strong></span>
            <button className="overdue-btn" onClick={() => router.push("/dashboard/invoices?status=Unpaid&overdue=true")}>
              View overdue invoices →
            </button>
          </motion.div>
        )}

        {/* Overspent warning banner */}
        {filteredOverspentCount > 0 && (
          <motion.div
            className="warning-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <span>
              ⚠️ Portfolio overspent by {formatPKR(filteredTotalSpent - filteredTotalBudget)}. {filteredOverspentCount} {filteredOverspentCount === 1 ? "project" : "projects"} need review.
            </span>
            <button className="warning-btn" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
              View overspent projects →
            </button>
          </motion.div>
        )}

        {/* KPI cards */}
        <div className="dashboard-grid">
          {[
            { label: "Total Budget", value: formatPKR(filteredTotalBudget), meta: `${filteredProjectRows.length} projects`, color: "#A78BFA", link: "/dashboard/reports/budget-summary" },
            { label: "Total Spent", value: formatPKR(filteredTotalSpent), meta: `${spentPct}% of budget`, color: "#F97316", link: "/dashboard/reports/spending-detail" },
            { label: remainingFunds < 0 ? "Overspent" : "Remaining", value: formatPKR(remainingFunds), meta: `${Math.abs(Math.round((remainingFunds / filteredTotalBudget) * 100))}% ${remainingFunds < 0 ? "over" : "left"}`, color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171", link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null },
            { label: "Portfolio Health", value: filteredOverspentCount > 0 ? "⚠️ Needs Attention" : "Healthy", meta: `${Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score`, color: filteredOverspentCount > 0 ? "#F97316" : "#2DD4BF", link: "/dashboard/reports/overspent" },
            { label: "📆 Monthly Spending", value: monthlySpending > 0 ? formatPKR(monthlySpending) : "—", meta: monthlySpending === 0 ? "No transactions this month" : `vs. ${formatPKR(lastMonthSpending)} last month`, color: monthlySpending > 0 ? "#F97316" : "#94A3B8", link: "/dashboard/reports/spending-detail" },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              className="card"
              custom={i}
              initial="hidden"
              animate="visible"
              variants={cardVariant}
              {...hoverScale}
              onClick={() => kpi.link && router.push(kpi.link + detailQuery())}
            >
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>
                {kpi.value}
              </div>
              <div className="kpi-meta">
                {kpi.meta}
                {kpi.label === "Total Spent" && <Trend value={spentPct > 80 ? 5 : -2} positive={false} negative={spentPct > 80} />}
                {kpi.label === "📆 Monthly Spending" && monthlySpending > 0 && <Trend value={spendingTrend} positive={spendingTrend < 0} negative={spendingTrend > 0} />}
              </div>
              {kpi.label === "Total Spent" && highestProject && lowestProject && highestProject.id !== lowestProject.id && (
                <div style={{ fontSize: "0.65rem", color: "#93C5FD", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  🔺 {highestProject.name} {highestProject.pct}% · 🔻 {lowestProject.name} {lowestProject.pct}%
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Project Utilization + Donor Balances */}
        <div className="dashboard-grid" style={{ gridTemplateColumns: "3fr 2fr" }}>
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>📊 Top 5 Project Utilization</div>
            {topFiveProjects.map((p, idx) => {
              const health = activityHealth[p.id]
              return (
                <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}&fy=${fiscalYear}`)} style={{
                  display: "flex", alignItems: "center", gap: "0.8rem",
                  background: "var(--card)", borderRadius: "12px", padding: "0.5rem 1rem",
                  border: "1px solid var(--border)", cursor: "pointer", marginBottom: "0.5rem",
                  flexWrap: "wrap",
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.status === "Overspent" ? "#F87171" : p.status === "Review" ? "#F97316" : p.status === "At Risk" ? "#F97316" : "#2DD4BF", flexShrink: 0 }}></div>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{p.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, minWidth: 60, fontSize: "0.8rem", color: "var(--text)" }}>{formatPKR(p.actual)}</span>
                    <span style={{ minWidth: 50, color: p.pct > 100 ? "#F87171" : p.pct > 80 ? "#F97316" : "#2DD4BF", fontSize: "0.8rem" }}>{p.pct}%</span>
                    <span style={{
                      padding: "0.1rem 0.6rem", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 700,
                      background: p.status === "Overspent" ? "#fee2e2" : p.status === "Review" ? "#fef3c7" : p.status === "At Risk" ? "#fef3c7" : "#dcfce7",
                      color: p.status === "Overspent" ? "#991b1b" : p.status === "Review" ? "#92400e" : p.status === "At Risk" ? "#92400e" : "#166534",
                    }}>
                      {p.status}
                    </span>
                    {health && (
                      <span style={{ fontSize: "0.65rem", color: "#F97316", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis" }}>{health.message}</span>
                    )}
                  </div>
                </div>
              )
            })}
            {projectRows.length > 5 && (
              <div style={{ textAlign: "right", marginTop: "0.5rem" }}>
                <button className="warning-btn" style={{ background: "transparent", color: "#93C5FD", border: "1px solid #334155", padding: "4px 12px" }}
                  onClick={() => router.push("/dashboard/settings/budgets" + detailQuery())}>
                  View All Projects →
                </button>
              </div>
            )}
          </motion.div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}&fy=${fiscalYear}`)} style={{
                display: "flex", alignItems: "center", gap: "0.8rem",
                background: "var(--card)", borderRadius: "12px", padding: "0.5rem 1rem",
                border: "1px solid var(--border)", cursor: "pointer", marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#F87171" : "#A78BFA", flexShrink: 0 }}></div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{d.name}</span>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                    {d.monthsPassed}/{d.monthsTotal} months · {d.health === "slow" ? <span style={{ color: "#F87171", fontWeight: 600 }}>Slow: only {d.pct}% spent</span> : d.health === "ok" ? <span style={{ color: "#F97316", fontWeight: 600 }}>OK</span> : <span style={{ color: "#2DD4BF", fontWeight: 600 }}>On Track</span>}
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)" }}>{formatPKR(d.remaining)}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Underspend + Receivables vs Payables (unchanged) */}
        <div className="dashboard-grid">
          <motion.div
            className="card"
            style={{ gridColumn: "span 3" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>💡 Top 5 Underspend Activities</div>
            {underspentActivities.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No activities with remaining budget this month.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", gap: 8, fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                  <span>Activity</span><span>Budget</span><span>Actual</span><span>Unspent</span>
                </div>
                {underspentActivities.map((act, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
                    <span className="clickable" onClick={(e) => { e.stopPropagation(); router.push(act.projectId ? `/dashboard/settings/budgets?project=${act.projectId}&activity=${act.id}` : `/dashboard/reports/spending-detail?activity=${act.id}&fy=${fiscalYear}`) }}>
                      {act.name}
                    </span>
                    <span style={{ color: "var(--text)" }}>{formatPKR(act.budget)}</span>
                    <span style={{ color: "var(--text)" }}>{formatPKR(act.actual)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div className="progress-bg">
                        <div className="progress-fill" style={{ width: `${Math.min(act.pct, 100)}%` }}></div>
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "#2DD4BF", fontWeight: 600, whiteSpace: "nowrap" }}>{act.pct}%</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </motion.div>

          <motion.div
            className="card"
            style={{ gridColumn: "span 2" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "1rem" }}>⚖️ Receivables vs Payables</div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginBottom: "0.8rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>Receivables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalReceivables)}</div>
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-soft)" }}>VS</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>Payables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalPayables)}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.75rem", fontWeight: 600 }}>
              {totalReceivables > totalPayables ? (
                <>
                  <CheckCircle size={16} style={{ color: "#2DD4BF" }} />
                  <span style={{ color: "#2DD4BF" }}>Healthy — Receivables exceed Payables by {formatPKR(totalReceivables - totalPayables)}</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} style={{ color: "#F87171" }} />
                  <span style={{ color: "#F87171" }}>Unhealthy — Payables exceed Receivables by {formatPKR(totalPayables - totalReceivables)}</span>
                </>
              )}
            </div>
          </motion.div>
        </div>

        {/* Footer summary (unchanged) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          style={{
            background: "var(--card)", borderRadius: 12, padding: "0.6rem 1.2rem",
            border: "1px solid var(--border)", display: "flex", justifyContent: "space-between",
            flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500
          }}
        >
          <span>⚠️ Portfolio Health: {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Total Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
          <span style={{ marginLeft: "auto" }}>Last updated: {lastUpdated}</span>
        </motion.div>
      </div>
    </div>
  )
}