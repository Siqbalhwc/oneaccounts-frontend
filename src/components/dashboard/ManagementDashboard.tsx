"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Sun, Moon } from "lucide-react"

export default function ManagementDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  // ── Theme state ──
  const [darkMode, setDarkMode] = useState(true)

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

  // Monthly Spending
  const [monthlySpending, setMonthlySpending] = useState(0)
  // Top 3 underspent activities
  const [underspentActivities, setUnderspentActivities] = useState<any[]>([])
  // Unpaid invoices details
  const [unpaidDetails, setUnpaidDetails] = useState<any[]>([])

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
      setProjectRows(projectsArr.sort((a: any, b: any) => b.pct - a.pct))
      setOverspentCount(projectsArr.filter((p: any) => p.actual > p.budget).length)

      // Quick stats
      const { count: unpaidCount } = await supabase.from("invoices")
        .select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "Unpaid")
      setUnpaidInvoices(unpaidCount || 0)

      const { data: custBals } = await supabase.from("customers").select("balance").eq("company_id", companyId)
      setTotalReceivables(custBals?.reduce((s, c) => s + (c.balance || 0), 0) || 0)

      // ── Monthly Spending (current month) ──
      const now = new Date()
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
      const endOfMonth = now.toISOString().split("T")[0]
      const { data: monthLines } = await supabase
        .from("journal_lines")
        .select("debit, credit")
        .eq("company_id", companyId)
        .gte("journal_entries(date)", startOfMonth)
        .lte("journal_entries(date)", endOfMonth)
      const monthTotal = (monthLines || []).reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)
      setMonthlySpending(monthTotal)

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
        .gte("journal_entries(date)", startOfMonth)
        .lte("journal_entries(date)", endOfMonth)
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

  // ── Theme colors ──
  const theme = {
    bg: darkMode ? "#0B1120" : "#F8FAFC",
    cardBg: darkMode ? "#111827" : "#FFFFFF",
    cardBorder: darkMode ? "#1E293B" : "#E2E8F0",
    text: darkMode ? "#E2E8F0" : "#1E293B",
    muted: darkMode ? "#94A3B8" : "#64748B",
    subtle: darkMode ? "#64748B" : "#94A3B8",
    heroBg: darkMode ? "#111827" : "#FFFFFF",
    inputBg: darkMode ? "#1E293B" : "#F8FAFC",
    inputBorder: darkMode ? "#334155" : "#E2E8F0",
    inputText: darkMode ? "#F1F5F9" : "#1E293B",
    warningBg: darkMode ? "#1E293B" : "#FEF2F2",
    warningBorder: darkMode ? "#1E293B" : "#FECACA",
    warningText: darkMode ? "#FCA5A5" : "#B91C1C",
    footerBg: darkMode ? "#0F172A" : "#FFFFFF",
    footerBorder: darkMode ? "#1E293B" : "#E2E8F0",
    pillBg: darkMode ? "#1E293B" : "#F1F5F9",
    pillBorder: darkMode ? "#334155" : "#E2E8F0",
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", background: theme.bg, minHeight: "100vh", color: theme.muted }}>Loading…</div>
  }

  return (
    <div style={{ background: theme.bg, minHeight: "100%", flex: 1, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: theme.text }}>
      <style>{`
        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }

        .mgmt .card {
          background: var(--card-bg); border: 1px solid var(--card-border);
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          transition: all 0.2s;
        }
        .mgmt .card:hover { background: var(--card-hover); border-color: #334155; }

        /* ── Hero / Greeting bar ── */
        .mgmt .hero {
          background: var(--hero-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px; padding: 1rem 1.5rem;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 0.8rem;
        }
        .mgmt .hero-greeting h2 {
          font-size: 1.3rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.15rem; white-space: nowrap;
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
          background: var(--input-bg); border: 1px solid var(--input-border);
          padding: 0.2rem 0.6rem; border-radius: 20px;
          font-size: 0.78rem; font-weight: 500; color: var(--input-text);
          cursor: pointer; transition: 0.15s;
          -webkit-appearance: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          padding-right: 1.8rem;
        }
        .mgmt .filter-pill:focus { outline: none; border-color: #2563EB; }

        /* ── Warning banner ── */
        .mgmt .warning-banner {
          background: var(--warning-bg);
          border: 1px solid var(--warning-border);
          border-left: 6px solid #1E3A8A;
          border-radius: 10px; padding: 8px 16px;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
          font-size: 0.9rem; color: var(--warning-text);
          font-weight: 500;
        }
        .mgmt .warning-btn {
          background: #1E3A8A; color: white; border: none;
          border-radius: 6px; padding: 6px 14px;
          font-weight: 600; cursor: pointer; font-size: 0.8rem;
          white-space: nowrap;
        }

        /* ── Unified 5‑column grid ── */
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        /* Underspend / detail rows */
        .underspend-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.5rem 0; border-bottom: 1px solid var(--card-border);
          gap: 0.8rem;
        }
        .underspend-row:last-child { border-bottom: none; }
        .progress-bg { height: 5px; background: #334155; border-radius: 10px; flex: 1; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; background: #10B981; }

        .theme-btn {
          background: var(--input-bg); border: 1px solid var(--input-border);
          border-radius: 8px; padding: 6px 12px; cursor: pointer;
          color: var(--input-text); font-size: 0.85rem;
          display: flex; align-items: center; gap: 6px;
        }

        /* Responsive: collapse to 3 columns, then 2, then stack */
        @media (max-width: 1100px) {
          .dashboard-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .span-3 { grid-column: span 2 !important; }
          .span-2 { grid-column: span 1 !important; }
          .span-1 { grid-column: span 1 !important; }
        }
        @media (max-width: 800px) {
          .dashboard-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .span-3, .span-2, .span-1 { grid-column: span 1 !important; }
          .hero { flex-direction: column; align-items: flex-start; }
          .hero-filters { width: 100%; }
        }
        @media (max-width: 640px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
          .span-3, .span-2, .span-1 { grid-column: span 1 !important; }
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

      {/* Inject CSS variables based on theme */}
      <style>{`
        .mgmt {
          --card-bg: ${theme.cardBg};
          --card-border: ${theme.cardBorder};
          --card-hover: ${darkMode ? "#1E293B" : "#F8FAFC"};
          --hero-bg: ${theme.heroBg};
          --text-primary: ${theme.text};
          --text-muted: ${theme.muted};
          --input-bg: ${theme.inputBg};
          --input-border: ${theme.inputBorder};
          --input-text: ${theme.inputText};
          --warning-bg: ${theme.warningBg};
          --warning-border: ${theme.warningBorder};
          --warning-text: ${theme.warningText};
          --footer-bg: ${theme.footerBg};
          --footer-border: ${theme.footerBorder};
        }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        {/* ── Hero bar: greeting + filters + theme toggle ── */}
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
            <button className="theme-btn" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </div>

        {/* ── Warning banner ── */}
        {filteredOverspentCount > 0 && (
          <div className="warning-banner">
            <span>
              ⚠️ Portfolio overspent by {formatPKR(filteredTotalSpent - filteredTotalBudget)}. {filteredOverspentCount} {filteredOverspentCount === 1 ? "project" : "projects"} need review.
            </span>
            <button
              className="warning-btn"
              onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}
            >
              View overspent projects →
            </button>
          </div>
        )}

        {/* ── KPI Row (5 columns) ── */}
        <div className="dashboard-grid">
          <div className="card kpi-card span-1" onClick={() => router.push("/dashboard/reports/budget-summary" + detailQuery())}>
            <div className="kpi-label" style={{ textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 700, color: theme.muted, letterSpacing: "0.04em" }}>Total Budget</div>
            <div className="kpi-value" style={{ fontSize: "1.7rem", fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{formatPKR(filteredTotalBudget)}</div>
            <div className="kpi-meta" style={{ fontSize: "0.8rem", color: theme.subtle }}>{filteredProjectRows.length} projects</div>
          </div>
          <div className="card kpi-card span-1" onClick={() => router.push("/dashboard/reports/spending-detail" + detailQuery())}>
            <div className="kpi-label" style={{ textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 700, color: theme.muted, letterSpacing: "0.04em" }}>Total Spent</div>
            <div className="kpi-value" style={{ fontSize: "1.7rem", fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{formatPKR(filteredTotalSpent)}</div>
            <div className="kpi-meta" style={{ fontSize: "0.8rem", color: theme.subtle }}>{spentPct}% of budget</div>
          </div>
          <div className="card kpi-card span-1"
            style={{ cursor: remainingFunds < 0 ? "pointer" : "default" }}
            onClick={() => { if (remainingFunds < 0) router.push("/dashboard/reports/overspent" + detailQuery()) }}>
            <div className="kpi-label" style={{ textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 700, color: theme.muted, letterSpacing: "0.04em" }}>{remainingFunds < 0 ? "Overspent" : "Remaining"}</div>
            <div className="kpi-value" style={{ fontSize: "1.7rem", fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{formatPKR(remainingFunds)}</div>
            <div className="kpi-meta" style={{ fontSize: "0.8rem", color: theme.subtle }}>
              {remainingFunds < 0
                ? `${Math.abs(Math.round((remainingFunds / filteredTotalBudget) * 100))}% over budget`
                : `${Math.round((remainingFunds / filteredTotalBudget) * 100)}% unspent`
              }
            </div>
          </div>
          <div className="card kpi-card span-1" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
            <div className="kpi-label" style={{ textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 700, color: theme.muted, letterSpacing: "0.04em" }}>Portfolio Health</div>
            <div className="kpi-value" style={{ fontSize: "1.7rem", fontWeight: 700, color: filteredOverspentCount > 0 ? "#F59E0B" : theme.text, lineHeight: 1.2 }}>
              {filteredOverspentCount > 0 ? "⚠️ Needs Attention" : "Healthy"}
            </div>
            <div className="kpi-meta" style={{ fontSize: "0.8rem", color: theme.subtle }}>{Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score</div>
          </div>
          <div className="card kpi-card span-1">
            <div className="kpi-label" style={{ textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 700, color: theme.muted, letterSpacing: "0.04em" }}>📆 Monthly Spending</div>
            <div className="kpi-value" style={{ fontSize: "1.7rem", fontWeight: 700, color: "#EF4444", lineHeight: 1.2 }}>{formatPKR(monthlySpending)}</div>
            <div className="kpi-meta" style={{ fontSize: "0.8rem", color: theme.subtle }}>{new Date().toLocaleString('default', { month: 'long' })}</div>
          </div>
        </div>

        {/* ── Project Utilization (3 cols) + Donor Balances (2 cols) ── */}
        <div className="dashboard-grid">
          <div className="card span-3" style={{ padding: "1.2rem 1.3rem" }}>
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>📊 Project Utilization</div>
            {filteredProjectRows.map((p, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)} style={{
                display: "flex", alignItems: "center", gap: "0.8rem",
                background: theme.cardBg, borderRadius: "12px", padding: "0.5rem 1rem",
                border: `1px solid ${theme.cardBorder}`, cursor: "pointer", marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#f59e0b" : "#16a34a", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: theme.text }}>{p.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, minWidth: 60, fontSize: "0.8rem", color: theme.text }}>{formatPKR(p.actual)}</span>
                  <span style={{ minWidth: 50, color: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#d97706" : "#16a34a", fontSize: "0.8rem" }}>{p.pct}%</span>
                  <span style={{
                    padding: "0.1rem 0.6rem", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 700,
                    background: p.pct > 100 ? "#fee2e2" : p.pct > 80 ? "#fef3c7" : "#dcfce7",
                    color: p.pct > 100 ? "#991b1b" : p.pct > 80 ? "#92400e" : "#166534",
                  }}>
                    {p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : "On Track"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="card span-2" style={{ padding: "1.2rem 1.3rem" }}>
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)} style={{
                display: "flex", alignItems: "center", gap: "0.8rem",
                background: theme.cardBg, borderRadius: "12px", padding: "0.5rem 1rem",
                border: `1px solid ${theme.cardBorder}`, cursor: "pointer", marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#dc2626" : "#1e3a8a", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: theme.text }}>{d.name}</span>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: theme.text }}>{formatPKR(d.remaining)}</span>
                <span style={{ fontSize: "0.75rem", color: theme.muted, minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Underspend (3 cols) + Receivables (1) + Unpaid (1) ── */}
        <div className="dashboard-grid">
          <div className="card span-3" style={{ padding: "1.2rem 1.3rem" }}>
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>💡 Top 3 Underspend Activities</div>
            {underspentActivities.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: theme.muted }}>No activities with remaining budget this month.</div>
            ) : (
              underspentActivities.map((act, idx) => (
                <div key={idx} className="underspend-row">
                  <span style={{ fontSize: "0.8rem", color: theme.text, fontWeight: 600, width: "30%" }}>{act.name}</span>
                  <span style={{ fontSize: "0.8rem", color: theme.muted, width: "20%" }}>Budget: {formatDetail(act.budget)}</span>
                  <span style={{ fontSize: "0.8rem", color: theme.muted, width: "20%" }}>Actual: {formatDetail(act.actual)}</span>
                  <div style={{ width: "20%", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <div className="progress-bg"><div className="progress-fill" style={{ width: `${Math.min(act.pct, 100)}%` }}></div></div>
                    <span style={{ fontSize: "0.7rem", color: "#10B981", fontWeight: 600 }}>{act.pct}%</span>
                  </div>
                  <span style={{ width: "10%", textAlign: "right", fontSize: "0.8rem", fontWeight: 600, color: "#10B981" }}>{formatDetail(act.remaining)}</span>
                </div>
              ))
            )}
          </div>
          <div className="card span-1" style={{ padding: "1.2rem 1.3rem" }}>
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>🧾 Receivables</div>
            <div className="kpi-value" style={{ fontSize: "1.7rem", fontWeight: 700, color: theme.text }}>{formatPKR(totalReceivables)}</div>
          </div>
          <div className="card span-1" style={{ padding: "1.2rem 1.3rem" }}>
            <div className="kpi-label" style={{ fontWeight: 700, fontSize: "0.95rem", color: theme.text, marginBottom: "0.8rem" }}>📦 Unpaid Invoices</div>
            <div className="kpi-value" style={{ fontSize: "1.7rem", fontWeight: 700, color: theme.text }}>{unpaidInvoices}</div>
            {unpaidDetails.length > 0 && (
              <div style={{ marginTop: "0.8rem" }}>
                {unpaidDetails.map((inv, idx) => (
                  <div key={idx} className="underspend-row">
                    <span style={{ fontSize: "0.8rem", color: theme.text }}>{inv.invoice_no}</span>
                    <span style={{ fontSize: "0.8rem", color: theme.muted }}>{inv.customers?.name || "—"}</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#FCA5A5" }}>{formatDetail(inv.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer summary ── */}
        <div style={{
          background: theme.footerBg, borderTop: `1px solid ${theme.footerBorder}`,
          padding: "0.6rem 1.2rem", borderRadius: 12, display: "flex",
          justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem",
          fontSize: "0.8rem", color: theme.muted, fontWeight: 500
        }}>
          <span>⚠️ Portfolio Health: {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Total Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
        </div>
      </div>
    </div>
  )
}