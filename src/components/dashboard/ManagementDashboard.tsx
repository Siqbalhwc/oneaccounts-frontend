"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
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
  const [unpaidInvoices, setUnpaidInvoices] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)

  // Monthly Spending & trend
  const [monthlySpending, setMonthlySpending] = useState(0)
  const [lastMonthSpending, setLastMonthSpending] = useState(0)
  const [spendingTrend, setSpendingTrend] = useState(0)
  // Top 3 underspent activities
  const [underspentActivities, setUnderspentActivities] = useState<any[]>([])
  // Unpaid invoices details
  const [unpaidDetails, setUnpaidDetails] = useState<any[]>([])

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
      setDonorBalances(donorData?.map((d: any) => ({
        donor_id: d.donor_id, name: d.donor_name,
        budget: d.budget, actual: d.actual_spent,
        remaining: (d.budget || 0) - (d.actual_spent || 0),
        pct: d.budget ? Math.round(((d.actual_spent || 0) / d.budget) * 100) : 0,
        overspent: (d.actual_spent || 0) > (d.budget || 0),
      })) || [])

      // Project Utilization (RPC)
      const { data: projData } = await supabase.rpc("dashboard_project_utilization", {
        p_company_id: companyId, p_fiscal_year: fiscalYear,
      })
      const projectsArr = projData?.map((p: any) => ({
        id: p.project_id, name: p.project_name,
        budget: p.budget || 0, actual: p.actual || 0,
        pct: p.budget ? Math.round(((p.actual || 0) / p.budget) * 100) : (p.actual > 0 ? 100 : 0),
      })) || []
      // Apply utilisation rule: if utilisation < 10% and we're past Q1, flag as "At Risk"
      const now = new Date()
      const pastQ1 = now.getMonth() > 2 // after March
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

      const { data: custBals } = await supabase.from("customers").select("balance").eq("company_id", companyId)
      setTotalReceivables(custBals?.reduce((s, c) => s + (c.balance || 0), 0) || 0)

      // ── Monthly Spending (current month) ──
      const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
      const currentMonthEnd = now.toISOString().split("T")[0]
      const { data: monthLines } = await supabase
        .from("journal_lines")
        .select("debit, credit")
        .eq("company_id", companyId)
        .gte("journal_entries(date)", currentMonthStart)
        .lte("journal_entries(date)", currentMonthEnd)
      const monthTotal = (monthLines || []).reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)
      setMonthlySpending(monthTotal)

      // ── Previous Month Spending (for trend) ──
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1)
      const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth()+1).padStart(2,'0')}-01`
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0]
      const { data: prevMonthLines } = await supabase
        .from("journal_lines")
        .select("debit, credit")
        .eq("company_id", companyId)
        .gte("journal_entries(date)", prevMonthStart)
        .lte("journal_entries(date)", prevMonthEnd)
      const prevMonthTotal = (prevMonthLines || []).reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)
      setLastMonthSpending(prevMonthTotal)
      // Calculate percentage change
      if (prevMonthTotal > 0) {
        setSpendingTrend(Math.round(((monthTotal - prevMonthTotal) / prevMonthTotal) * 100))
      } else if (monthTotal > 0) {
        setSpendingTrend(100)   // new spending
      } else {
        setSpendingTrend(0)
      }

      // ── Top 3 underspent activities ──
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
          activityMap[b.activity_id] = {
            name: b.activities?.name || `Activity ${b.activity_id}`,
            budget: 0,
            actual: 0,
          }
        }
        activityMap[b.activity_id].budget += b.budgeted_amount || 0
      })
      const { data: actLines } = await supabase
        .from("journal_lines")
        .select("activity_id, debit, credit")
        .eq("company_id", companyId)
        .gte("journal_entries(date)", currentMonthStart)
        .lte("journal_entries(date)", currentMonthEnd)
      actLines?.forEach((l: any) => {
        if (!l.activity_id || !activityMap[l.activity_id]) return
        activityMap[l.activity_id].actual += (l.debit || 0) - (l.credit || 0)
      })
      const underspent = Object.values(activityMap)
        .filter((a: any) => a.budget > 0)
        .map((a: any) => ({
          name: a.name,
          budget: a.budget,
          actual: a.actual,
          remaining: a.budget - a.actual,
          pct: a.budget > 0 ? Math.round(((a.budget - a.actual) / a.budget) * 100) : 0,
        }))
        .sort((a: any, b: any) => b.remaining - a.remaining)
        .slice(0, 3)
      setUnderspentActivities(underspent)

      // ── Unpaid invoice details (top 5 by amount) ──
      const { data: unpaidInvs } = await supabase
        .from("invoices")
        .select("id, invoice_no, total, party_id, customers(name)")
        .eq("company_id", companyId)
        .eq("status", "Unpaid")
        .order("total", { ascending: false })
        .limit(5)
      setUnpaidDetails(unpaidInvs || [])

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

  // animation variants
  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.45 },
    }),
  }

  const hoverScale = { whileHover: { scale: 1.02, y: -4 } }

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

        /* ── Hero / Greeting bar ── */
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

        /* ── Warning banner ── */
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

        /* ── KPI Grid ── */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: #94A3B8; letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.7rem; font-weight: 700; color: #F1F5F9; line-height: 1.2; }
        .kpi-meta { font-size: 0.8rem; color: #64748B; display: flex; align-items: center; gap: 0.3rem; }

        .underspend-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.5rem 0; border-bottom: 1px solid #1E293B;
          gap: 0.8rem;
        }
        .underspend-row:last-child { border-bottom: none; }
        .progress-bg { height: 5px; background: #334155; border-radius: 10px; flex: 1; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; background: #2DD4BF; }

        /* Responsive */
        @media (max-width: 1100px) {
          .kpi-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 800px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .hero { flex-direction: column; align-items: flex-start; }
          .hero-filters { width: 100%; }
        }
        @media (max-width: 640px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
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
          .kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        {/* ── Hero bar: greeting + filters ── */}
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

        {/* ── Warning banner ── */}
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

        {/* ── Row 1: KPI cards ── */}
        <div className="kpi-grid">
          {[
            {
              label: "Total Budget",
              value: formatPKR(filteredTotalBudget),
              meta: `${filteredProjectRows.length} projects`,
              color: "#A78BFA",
              link: "/dashboard/reports/budget-summary",
            },
            {
              label: "Total Spent",
              value: formatPKR(filteredTotalSpent),
              meta: `${spentPct}% of budget`,
              color: "#F97316",
              link: "/dashboard/reports/spending-detail",
            },
            {
              label: remainingFunds < 0 ? "Overspent" : "Remaining",
              value: formatPKR(remainingFunds),
              meta: `${Math.abs(Math.round((remainingFunds / filteredTotalBudget) * 100))}% ${remainingFunds < 0 ? "over" : "left"}`,
              color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171",
              link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null,
            },
            {
              label: "Portfolio Health",
              value: filteredOverspentCount > 0 ? "⚠️ Needs Attention" : "Healthy",
              meta: `${Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score`,
              color: filteredOverspentCount > 0 ? "#F97316" : "#2DD4BF",
              link: "/dashboard/reports/overspent",
            },
            {
              label: "📆 Monthly Spending",
              value: monthlySpending > 0 ? formatPKR(monthlySpending) : "—",
              meta: monthlySpending === 0 ? "No transactions this month" : `vs. ${formatPKR(lastMonthSpending)} last month`,
              color: monthlySpending > 0 ? "#F97316" : "#94A3B8",
              link: "/dashboard/reports/spending-detail",
            },
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
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="kpi-meta">
                {kpi.meta}
                {kpi.label === "Total Spent" && (
                  <Trend value={spentPct > 80 ? 5 : -2} positive={false} negative={spentPct > 80} />
                )}
                {kpi.label === "📆 Monthly Spending" && monthlySpending > 0 && (
                  <Trend value={spendingTrend} positive={spendingTrend < 0} negative={spendingTrend > 0} />
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Row 2: Project Utilization + Donor Balances ── */}
        <div className="kpi-grid" style={{ gridTemplateColumns: "3fr 2fr" }}>
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            onClick={() => router.push("/dashboard/settings/budgets" + detailQuery())}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>📊 Project Utilization</div>
            {filteredProjectRows.map((p, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)} style={{
                display: "flex", alignItems: "center", gap: "0.8rem",
                background: "#111827", borderRadius: "12px", padding: "0.5rem 1rem",
                border: "1px solid #1E293B", cursor: "pointer", marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.status === "Overspent" ? "#F87171" : p.status === "Review" ? "#F97316" : p.status === "At Risk" ? "#F97316" : "#2DD4BF", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: "#E2E8F0" }}>{p.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, minWidth: 60, fontSize: "0.8rem", color: "#E2E8F0" }}>{formatPKR(p.actual)}</span>
                  <span style={{ minWidth: 50, color: p.pct > 100 ? "#F87171" : p.pct > 80 ? "#F97316" : "#2DD4BF", fontSize: "0.8rem" }}>{p.pct}%</span>
                  <span style={{
                    padding: "0.1rem 0.6rem", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 700,
                    background: p.status === "Overspent" ? "#fee2e2" : p.status === "Review" ? "#fef3c7" : p.status === "At Risk" ? "#fef3c7" : "#dcfce7",
                    color: p.status === "Overspent" ? "#991b1b" : p.status === "Review" ? "#92400e" : p.status === "At Risk" ? "#92400e" : "#166534",
                  }}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            onClick={() => router.push("/dashboard/reports/donor" + detailQuery())}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)} style={{
                display: "flex", alignItems: "center", gap: "0.8rem",
                background: "#111827", borderRadius: "12px", padding: "0.5rem 1rem",
                border: "1px solid #1E293B", cursor: "pointer", marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#F87171" : "#A78BFA", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: "#E2E8F0" }}>{d.name}</span>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#E2E8F0" }}>{formatPKR(d.remaining)}</span>
                <span style={{ fontSize: "0.75rem", color: "#94A3B8", minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Row 3: Underspend + Receivables + Unpaid ── */}
        <div className="kpi-grid">
          <motion.div
            className="card"
            style={{ gridColumn: "span 3" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>💡 Top 3 Underspend Activities</div>
            {underspentActivities.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "#94A3B8" }}>No activities with remaining budget this month.</div>
            ) : (
              underspentActivities.map((act, idx) => (
                <div key={idx} className="underspend-row">
                  <span style={{ fontSize: "0.8rem", color: "#E2E8F0", fontWeight: 600, width: "25%" }}>{act.name}</span>
                  <span style={{ fontSize: "0.8rem", color: "#94A3B8", width: "18%" }}>Budget: {formatDetail(act.budget)}</span>
                  <span style={{ fontSize: "0.8rem", color: "#94A3B8", width: "18%" }}>Actual: {formatDetail(act.actual)}</span>
                  <div style={{ width: "20%", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <div className="progress-bg"><div className="progress-fill" style={{ width: `${Math.min(act.pct, 100)}%` }}></div></div>
                    <span style={{ fontSize: "0.7rem", color: "#2DD4BF", fontWeight: 600 }}>{act.pct}%</span>
                  </div>
                  <span style={{ width: "12%", textAlign: "right", fontSize: "0.8rem", fontWeight: 600, color: "#2DD4BF" }}>{formatDetail(act.remaining)}</span>
                </div>
              ))
            )}
          </motion.div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            onClick={() => router.push("/dashboard/customers" + detailQuery())}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>🧾 Receivables</div>
            <div className="kpi-value" style={{ color: totalReceivables > 0 ? "#F97316" : "#94A3B8" }}>{formatPKR(totalReceivables)}</div>
          </motion.div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            onClick={() => router.push("/dashboard/invoices" + detailQuery())}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#F1F5F9", marginBottom: "0.8rem" }}>📦 Unpaid Invoices</div>
            <div className="kpi-value" style={{ color: unpaidInvoices > 0 ? "#F87171" : "#94A3B8" }}>{unpaidInvoices}</div>
            {unpaidDetails.length > 0 && (
              <div style={{ marginTop: "0.8rem" }}>
                {unpaidDetails.map((inv, idx) => (
                  <div key={idx} className="underspend-row">
                    <span style={{ fontSize: "0.8rem", color: "#E2E8F0" }}>{inv.invoice_no}</span>
                    <span style={{ fontSize: "0.8rem", color: "#94A3B8" }}>{inv.customers?.name || "—"}</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#F87171" }}>{formatDetail(inv.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Footer summary ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          style={{
            background: "#111827", borderRadius: 12, padding: "0.6rem 1.2rem",
            border: "1px solid #1E293B", display: "flex", justifyContent: "space-between",
            flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "#94A3B8", fontWeight: 500
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