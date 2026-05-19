"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus, Sun, Moon } from "lucide-react"
import { motion } from "framer-motion"

export default function ManagementDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  // Theme
  const [darkMode, setDarkMode] = useState(true)

  // Company
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyError, setCompanyError] = useState(false)
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
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)
  const [monthlySpending, setMonthlySpending] = useState(0)
  const [lastMonthSpending, setLastMonthSpending] = useState(0)
  const [spendingTrend, setSpendingTrend] = useState(0)
  const [underspentActivities, setUnderspentActivities] = useState<any[]>([])
  const [activityHealth, setActivityHealth] = useState<Record<string, any>>({})
  const [lastUpdated, setLastUpdated] = useState("")

  // Theme tokens
  const theme = {
    bg: darkMode ? "#0A0A0A" : "#F8FAFC",
    card: darkMode ? "#111827" : "#FFFFFF",
    cardBorder: darkMode ? "#1E293B" : "#E2E8F0",
    cardHover: darkMode ? "#1E293B" : "#F1F5F9",
    text: darkMode ? "#E2E8F0" : "#1E293B",
    textMuted: darkMode ? "#94A3B8" : "#64748B",
    textHint: darkMode ? "#64748B" : "#94A3B8",
    heroBg: darkMode ? "#111827" : "#FFFFFF",
    heroBorder: darkMode ? "#1E293B" : "#E2E8F0",
    warnBg: darkMode ? "#1E293B" : "#FEF3C7",
    warnBorder: darkMode ? "#334155" : "#FDE68A",
    warnText: darkMode ? "#FCA5A5" : "#92400E",
    rowBg: darkMode ? "#111827" : "#F8FAFC",
    rowBorder: darkMode ? "#1E293B" : "#E2E8F0",
    statusFooterBg: darkMode ? "#111827" : "#FFFFFF",
    inputBg: darkMode ? "#1E293B" : "#F1F5F9",
    inputBorder: darkMode ? "#334155" : "#CBD5E1",
    inputText: darkMode ? "#F1F5F9" : "#1E293B",
  }

  // Fetch company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        setCompanyError(true)
        setLoading(false)
        return
      }
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
      } else {
        setCompanyError(true)
        setLoading(false)
      }
    })
  }, [])

  // Fetch master lists
  useEffect(() => {
    if (!companyId) return
    supabase.from("projects").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setProjects(r.data))
    supabase.from("donors").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setDonors(r.data))
  }, [companyId])

  // Fetch dashboard data
  useEffect(() => {
    if (!companyId) return

    const fetchData = async () => {
      setLoading(true)
      try {
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
          .eq("company_id", companyId).in("account_id", accountIds.length > 0 ? accountIds : ["__none__"])
          .gte("journal_entries.date", startOfMonthISO).lte("journal_entries.date", todayISO)
        actLines?.forEach((l: any) => { if (!l.activity_id || !activityMap[l.activity_id]) return; activityMap[l.activity_id].actual += (l.debit || 0) - (l.credit || 0) })
        const underspent = Object.entries(activityMap)
          .filter(([_, a]) => a.budget > 0)
          .map(([id, a]) => ({ id: Number(id), name: a.name, budget: a.budget, actual: a.actual, remaining: a.budget - a.actual, pct: Math.round(((a.budget - a.actual) / a.budget) * 100), projectId: a.projectId }))
          .sort((a, b) => b.remaining - a.remaining).slice(0, 5)
        setUnderspentActivities(underspent)

        setLastUpdated(new Date().toLocaleTimeString())
      } catch (err) {
        console.error("Dashboard fetch error:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [companyId, fiscalYear])

  // Filtered data
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

  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.45 } }),
  }

  if (companyError) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: theme.bg, minHeight: "100vh", color: theme.textMuted }}>
        <div style={{ fontSize: "1.2rem", marginBottom: 8, color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem" }}>Your account may not be linked to a company. Please contact your administrator.</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: theme.bg, minHeight: "100vh", color: theme.textMuted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #1E293B", borderTop: "3px solid #A78BFA" }}
        />
        <div style={{ fontSize: "0.9rem" }}>Loading your dashboard…</div>
      </div>
    )
  }

  return (
    <div style={{ background: theme.bg, minHeight: "100%", flex: 1, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: theme.text, transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }
        .mgmt .card {
          background: ${theme.card}; border: 1px solid ${theme.cardBorder};
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: ${darkMode ? "0 4px 12px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.06)"}; transition: all 0.2s; cursor: pointer;
        }
        .mgmt .card:hover { background: ${theme.cardHover}; border-color: ${darkMode ? "#334155" : "#CBD5E1"}; }
        .mgmt .filter-pill {
          background: ${theme.inputBg}; border: 1px solid ${theme.inputBorder};
          padding: 0.25rem 1.8rem 0.25rem 0.6rem; border-radius: 20px;
          font-size: 0.78rem; font-weight: 500; color: ${theme.inputText}; cursor: pointer;
          -webkit-appearance: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 0.5rem center;
          font-family: inherit;
        }
        .dashboard-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin-bottom: 1rem; }
        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: ${theme.textMuted}; letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.7rem; font-weight: 700; color: ${theme.text}; line-height: 1.2; }
        .kpi-meta { font-size: 0.8rem; color: ${theme.textHint}; display: flex; align-items: center; gap: 0.3rem; }
        @media (max-width: 1100px) { .dashboard-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 800px) { .dashboard-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .dashboard-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>

        {/* Hero bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          style={{ background: theme.heroBg, border: `1px solid ${theme.heroBorder}`, borderRadius: 16, padding: "1rem 1.5rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem" }}
        >
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: theme.text }}>{getGreeting()}</h2>
            <p style={{ color: theme.textMuted, fontSize: "0.85rem" }}>NGO portfolio overview</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: theme.textMuted, fontSize: "0.75rem" }}>Period:</span>
            <select className="filter-pill" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>FY {y}</option>)}
            </select>
            <span style={{ fontWeight: 600, color: theme.textMuted, fontSize: "0.75rem" }}>Project:</span>
            <select className="filter-pill" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
              <option value="">All</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span style={{ fontWeight: 600, color: theme.textMuted, fontSize: "0.75rem" }}>Donor:</span>
            <select className="filter-pill" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
              <option value="">All</option>
              {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button
              onClick={() => setDarkMode(d => !d)}
              style={{ background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, borderRadius: 20, padding: "0.25rem 0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: theme.inputText, fontSize: "0.78rem", fontWeight: 500, fontFamily: "inherit", transition: "all 0.2s" }}
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </motion.div>

        {/* Warning banner */}
        {filteredOverspentCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            style={{ background: theme.warnBg, border: `1px solid ${theme.warnBorder}`, borderLeft: `6px solid #EF4444`, borderRadius: 10, padding: "8px 16px", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: "0.9rem", color: theme.warnText, fontWeight: 500 }}
          >
            <span>⚠️ Portfolio overspent by {formatPKR(filteredTotalSpent - filteredTotalBudget)}. {filteredOverspentCount} project(s) need review.</span>
            <button
              onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}
              style={{ background: "#374151", color: "white", border: "none", borderRadius: 6, padding: "6px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}
            >
              View overspent →
            </button>
          </motion.div>
        )}

        {/* KPI cards */}
        <div className="dashboard-grid">
          {[
            { label: "Total Budget", value: formatPKR(filteredTotalBudget), meta: `${filteredProjectRows.length} projects`, color: "#A78BFA", link: "/dashboard/reports/budget-summary" },
            { label: "Total Spent", value: formatPKR(filteredTotalSpent), meta: `${spentPct}% of budget`, color: "#F97316", link: "/dashboard/reports/spending-detail", extra: projectsAbove70.length > 0 ? `>70%: ${projectsAbove70.slice(0, 2).join(", ")}${projectsAbove70.length > 2 ? "…" : ""}` : null },
            { label: remainingFunds < 0 ? "Overspent" : "Remaining", value: formatPKR(remainingFunds), meta: `${Math.abs(Math.round((remainingFunds / (filteredTotalBudget || 1)) * 100))}% ${remainingFunds < 0 ? "over" : "left"}`, color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171", link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null },
            { label: "Portfolio Health", value: filteredOverspentCount > 0 ? "⚠️ Attention" : "✅ Healthy", meta: `${Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score`, color: filteredOverspentCount > 0 ? "#F97316" : "#2DD4BF", link: "/dashboard/reports/overspent" },
            { label: "Monthly Spending", value: monthlySpending > 0 ? formatPKR(monthlySpending) : "—", meta: monthlySpending === 0 ? "No transactions this month" : `vs. ${formatPKR(lastMonthSpending)} last month`, color: monthlySpending > 0 ? "#F97316" : theme.textMuted, link: "/dashboard/reports/spending-detail" },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label} className="card" custom={i} initial="hidden" animate="visible" variants={cardVariant}
              whileHover={{ scale: 1.02, y: -4 }}
              onClick={() => kpi.link && router.push(kpi.link + detailQuery())}
            >
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="kpi-meta">{kpi.meta}</div>
              {kpi.extra && <div style={{ fontSize: "0.65rem", color: "#93C5FD", marginTop: 4 }}>{kpi.extra}</div>}
            </motion.div>
          ))}
        </div>

        {/* Project Utilization + Donor Balances */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "1rem", marginBottom: "1rem" }}>
          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>📊 Project Utilization</div>
            {filteredProjectRows.length === 0 && <div style={{ color: theme.textMuted, fontSize: "0.85rem" }}>No projects found for this period.</div>}
            {filteredProjectRows.map((p, idx) => (
              <div key={idx}
                onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}
                style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: theme.rowBg, borderRadius: 12, padding: "0.5rem 1rem", border: `1px solid ${theme.rowBorder}`, cursor: "pointer", marginBottom: "0.5rem", flexWrap: "wrap" }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.status === "Overspent" ? "#F87171" : p.status === "Review" ? "#F97316" : p.status === "At Risk" ? "#FBBF24" : "#2DD4BF", flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: theme.text, minWidth: 80 }}>{p.name}</span>
                <span style={{ fontWeight: 600, color: theme.text }}>{formatPKR(p.actual)}</span>
                <span style={{ color: p.pct > 100 ? "#F87171" : "#2DD4BF" }}>{p.pct}%</span>
                <span style={{ padding: "0.1rem 0.6rem", borderRadius: 12, fontSize: "0.7rem", fontWeight: 700, background: p.status === "Overspent" ? "#fee2e2" : p.status === "Review" ? "#fef3c7" : p.status === "At Risk" ? "#fef3c7" : "#dcfce7", color: p.status === "Overspent" ? "#991b1b" : p.status === "On Track" ? "#166534" : "#92400e" }}>{p.status}</span>
              </div>
            ))}
          </motion.div>

          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {filteredDonorBalances.length === 0 && <div style={{ color: theme.textMuted, fontSize: "0.85rem" }}>No donor data available.</div>}
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx}
                onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)}
                style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: theme.rowBg, borderRadius: 12, padding: "0.5rem 1rem", border: `1px solid ${theme.rowBorder}`, cursor: "pointer", marginBottom: "0.5rem" }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#F87171" : "#A78BFA", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: theme.text }}>{d.name}</div>
                  <div style={{ fontSize: "0.65rem", color: theme.textMuted }}>{d.monthsPassed}/{d.monthsTotal} months · {d.health === "slow" ? <span style={{ color: "#F87171" }}>Slow</span> : d.health === "on track" ? <span style={{ color: "#2DD4BF" }}>On Track</span> : <span style={{ color: "#F97316" }}>OK</span>}</div>
                </div>
                <span style={{ fontWeight: 700, color: theme.text }}>{formatPKR(d.remaining)}</span>
                <span style={{ color: theme.textMuted }}>{d.pct}%</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Underspend + Receivables/Payables */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "1rem", marginBottom: "1rem" }}>
          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>💡 Top 5 Underspend Activities</div>
            {underspentActivities.length === 0
              ? <div style={{ color: theme.textMuted }}>No activities this month.</div>
              : underspentActivities.map(act => (
                <div key={act.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${theme.rowBorder}`, fontSize: "0.8rem" }}>
                  <span style={{ color: "#93C5FD", cursor: "pointer" }} onClick={() => router.push(`/dashboard/reports/spending-detail?activity=${act.id}&fy=${fiscalYear}`)}>{act.name}</span>
                  <span style={{ color: theme.textMuted }}>{formatPKR(act.remaining)} left ({act.pct}%)</span>
                </div>
              ))
            }
          </motion.div>

          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "1rem" }}>⚖️ Receivables vs Payables</div>
            <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginBottom: "0.8rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: theme.textMuted, fontSize: "0.7rem" }}>Receivables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalReceivables)}</div>
              </div>
              <div style={{ fontWeight: 700, color: theme.textHint, alignSelf: "center" }}>VS</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: theme.textMuted, fontSize: "0.7rem" }}>Payables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalPayables)}</div>
              </div>
            </div>
            <div style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 600 }}>
              {totalReceivables > totalPayables
                ? <span style={{ color: "#2DD4BF" }}>✅ Healthy — Receivables exceed by {formatPKR(totalReceivables - totalPayables)}</span>
                : <span style={{ color: "#F87171" }}>⚠️ Unhealthy — Payables exceed by {formatPKR(totalPayables - totalReceivables)}</span>
              }
            </div>
          </motion.div>
        </div>

        {/* Status footer */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          style={{ background: theme.statusFooterBg, borderRadius: 12, padding: "0.6rem 1.2rem", border: `1px solid ${theme.cardBorder}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: theme.textMuted, fontWeight: 500 }}
        >
          <span>⚠️ Health: {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
          <span>Updated: {lastUpdated}</span>
        </motion.div>
      </div>
    </div>
  )
}