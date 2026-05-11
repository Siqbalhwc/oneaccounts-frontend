"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"

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
  const [totalPayables, setTotalPayables] = useState(0)

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

      const { data: suppBals } = await supabase.from("suppliers").select("balance").eq("company_id", companyId)
      setTotalPayables(suppBals?.reduce((s, s2) => s + (s2.balance || 0), 0) || 0)

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

  // ── Professional greeting ──
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  // ── Formatting ──
  const formatPKR = (v: number) => {
    if (v >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `PKR ${(v / 1_000).toFixed(0)}K`
    return `PKR ${v.toLocaleString()}`
  }

  // ── Build query string for detail pages ──
  const detailQuery = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ fy: String(fiscalYear) })
    if (selectedProjectId) params.set("project", selectedProjectId)
    if (selectedDonorId) params.set("donor", selectedDonorId)
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return "?" + params.toString()
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", background: "#f4f8fc", minHeight: "100vh" }}>Loading…</div>
  }

  return (
    <div style={{ background: "#f4f8fc", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif", color: "#1a2636" }}>
      <style>{`
        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }

        .mgmt .card {
          background: #f8fafd; border: 1px solid #d6e0eb;
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,25,45,0.04);
          transition: all 0.2s;
        }
        .mgmt .card:hover { background: #f0f4fb; border-color: #b3c5da; }

        .mgmt .filter-row {
          display: flex; align-items: center; gap: 0.8rem;
          background: white; border-radius: 24px; padding: 0.4rem 1.2rem;
          border: 1px solid #d6e0eb; margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .mgmt .filter-label {
          font-weight: 600; color: #1a3a5c; font-size: 0.8rem;
        }
        .mgmt .filter-pill {
          background: #eef3fa; border: 1px solid #c2d2e8;
          padding: 0.3rem 1rem; border-radius: 30px;
          font-size: 0.8rem; font-weight: 500; color: #0b2b3b;
          display: flex; align-items: center; gap: 0.3rem;
          cursor: pointer; transition: 0.15s;
        }
        .mgmt .filter-pill.active {
          background: #d3e0f2; border-color: #8faac9; font-weight: 600;
        }

        .mgmt .kpi-card {
          background: #f8fafd; border: 1px solid #d6e0eb;
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,25,45,0.04);
          display: flex; flex-direction: column; gap: 0.4rem;
          cursor: pointer; transition: all 0.2s;
          position: relative;
        }
        .mgmt .kpi-card:hover { background: #f0f4fb; }
        .mgmt .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: #2c5778; letter-spacing: 0.04em; }
        .mgmt .kpi-value { font-size: 1.7rem; font-weight: 700; color: #0a2940; line-height: 1.2; }
        .mgmt .kpi-meta { font-size: 0.8rem; color: #3d546b; display: flex; align-items: center; gap: 0.3rem; }

        .mgmt .warning-banner {
          background: #fff3cd; border: 1px solid #ffc107;
          border-left: 6px solid #d97706;
          border-radius: 10px; padding: 12px 16px;
          margin-bottom: 1rem; display: flex; align-items: center;
          justify-content: space-between; flex-wrap: wrap; gap: 10px;
          font-size: 0.9rem; color: #92400e; font-weight: 500;
        }

        .mgmt .hero {
          background: linear-gradient(115deg, #e6eef8 0%, #dae5f2 40%, #cddcee 100%);
          padding: 1rem 1.5rem; border-radius: 16px;
          margin-bottom: 1rem; display: flex; align-items: center;
          justify-content: space-between; flex-wrap: wrap; gap: 1rem;
        }

        .mgmt .section-title { font-weight: 700; font-size: 0.95rem; color: #0c2e4a; margin-bottom: 0.8rem; display: flex; align-items: center; gap: 0.3rem; }
        .mgmt .donor-row, .mgmt .project-row {
          display: flex; align-items: center; gap: 0.8rem;
          background: white; border-radius: 12px; padding: 0.5rem 1rem;
          border: 1px solid #d6e0eb; cursor: pointer; margin-bottom: 0.5rem;
          flex-wrap: wrap;
        }
        .mgmt .progress-bg { height: 5px; background: #e0e8f2; border-radius: 10px; width: 70px; overflow: hidden; }
        .mgmt .progress-fill { height: 100%; border-radius: 10px; }
        .mgmt .badge {
          padding: 0.1rem 0.6rem; border-radius: 12px;
          font-size: 0.7rem; font-weight: 700;
        }
        .mgmt .badge-danger { background: #fee2e2; color: #991b1b; }
        .mgmt .badge-warning { background: #fef3c7; color: #92400e; }
        .mgmt .badge-success { background: #dcfce7; color: #166534; }

        .mgmt .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
        .mgmt .two-col { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        @media (max-width: 800px) { .mgmt .two-col { grid-template-columns: 1fr; } }
        @media (max-width: 600px) {
          .mgmt .hero { flex-direction: column; align-items: flex-start; }
          .mgmt .filter-row { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        {/* ── Warning banner (if overspent) ── */}
        {filteredOverspentCount > 0 && (
          <div className="warning-banner">
            <span>
              ⚠️ Portfolio overspent by PKR {formatPKR(filteredTotalSpent - filteredTotalBudget)}. {filteredOverspentCount} {filteredOverspentCount === 1 ? "project" : "projects"} need immediate review.
            </span>
            <button
              onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}
              style={{ background: "#1e3a8a", color: "white", border: "none", borderRadius: 6, padding: "6px 14px", fontWeight: 600, cursor: "pointer" }}
            >
              View overspent projects →
            </button>
          </div>
        )}

        {/* Greeting */}
        <div className="hero">
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0a2940", marginBottom: "0.2rem" }}>
              {getGreeting()}, siqbalhwc
            </h2>
            <p style={{ color: "#1a3a5c", fontSize: "0.85rem" }}>Here's what's happening with your NGO portfolio today</p>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-row">
          <span className="filter-label">Period:</span>
          <select className="filter-pill active" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y} ▾</option>)}
          </select>
          <span style={{ color: "#8b9bb5" }}>|</span>
          <span className="filter-label">Projects:</span>
          <select className="filter-pill active" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
            <option value="">All Projects ▾</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span style={{ color: "#8b9bb5" }}>|</span>
          <span className="filter-label">Donors:</span>
          <select className="filter-pill active" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
            <option value="">All Donors ▾</option>
            {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* KPI row */}
        <div className="kpi-grid">
          <div className="kpi-card" onClick={() => router.push("/dashboard/reports/budget-summary" + detailQuery())}>
            <div className="kpi-label">Total Budget</div>
            <div className="kpi-value">{formatPKR(filteredTotalBudget)}</div>
            <div className="kpi-meta">{filteredProjectRows.length} projects</div>
            <span className="kpi-arrow" style={{ position: "absolute", bottom: 12, right: 16, color: "#8ba0b8" }}>→</span>
          </div>
          <div className="kpi-card" onClick={() => router.push("/dashboard/reports/spending-detail" + detailQuery())}>
            <div className="kpi-label">Total Spent</div>
            <div className="kpi-value">{formatPKR(filteredTotalSpent)}</div>
            <div className="kpi-meta">{spentPct}% of budget</div>
            <span className="kpi-arrow" style={{ position: "absolute", bottom: 12, right: 16, color: "#8ba0b8" }}>→</span>
          </div>
          <div className="kpi-card" style={{ cursor: "default" }}>
            <div className="kpi-label">Remaining</div>
            <div className="kpi-value">{formatPKR(remainingFunds)}</div>
            <div className="kpi-meta">{filteredTotalBudget ? Math.round((remainingFunds / filteredTotalBudget) * 100) : 0}% unspent</div>
          </div>
          <div className="kpi-card" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
            <div className="kpi-label">Portfolio Health</div>
            <div className="kpi-value" style={{ color: filteredOverspentCount > 0 ? "#b45309" : "#0a2940" }}>
              {filteredOverspentCount > 0 ? "⚠️ Needs Attention" : "Healthy"}
            </div>
            <div className="kpi-meta">{Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score</div>
            <span className="kpi-arrow" style={{ position: "absolute", bottom: 12, right: 16, color: "#8ba0b8" }}>→</span>
          </div>
        </div>

        {/* Project Utilization & Donor Balances */}
        <div className="two-col">
          <div className="card">
            <div className="section-title">📊 Project Utilization</div>
            {filteredProjectRows.map((p, idx) => (
              <div key={idx} className="project-row" onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#f59e0b" : "#16a34a", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem" }}>{p.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, minWidth: 60, fontSize: "0.8rem" }}>{formatPKR(p.actual)}</span>
                  <span style={{ minWidth: 50, color: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#d97706" : "#16a34a", fontSize: "0.8rem" }}>{p.pct}%</span>
                  <span className={`badge ${p.pct > 100 ? "badge-danger" : p.pct > 80 ? "badge-warning" : "badge-success"}`}>
                    {p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : "On Track"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="section-title">💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} className="donor-row" onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#dc2626" : "#1e3a8a", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem" }}>{d.name}</span>
                <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{formatPKR(d.remaining)}</span>
                <span style={{ fontSize: "0.75rem", color: "#2c5778", minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick stats + CRM */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div className="card" style={{ flex: 1, minWidth: 140 }}>
            <div className="kpi-label">📋 Payables</div>
            <div className="kpi-value">{formatPKR(totalPayables)}</div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 140 }}>
            <div className="kpi-label">🧾 Receivables</div>
            <div className="kpi-value">{formatPKR(totalReceivables)}</div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 140 }}>
            <div className="kpi-label">📦 Unpaid Invoices</div>
            <div className="kpi-value">{unpaidInvoices}</div>
          </div>
          <div className="card" style={{ flex: 2, minWidth: 220, display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: "#0a2940", whiteSpace: "nowrap" }}>🧑‍🤝‍🧑 CRM</span>
            <span style={{ background: "#e0eaf7", borderRadius: 20, padding: "0.2rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, color: "#0a2940", whiteSpace: "nowrap" }}>Customers</span>
            <span style={{ background: "#e0eaf7", borderRadius: 20, padding: "0.2rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, color: "#0a2940", whiteSpace: "nowrap" }}>Investors</span>
            <span style={{ background: "#e0eaf7", borderRadius: 20, padding: "0.2rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, color: "#0a2940", whiteSpace: "nowrap" }}>Suppliers</span>
          </div>
        </div>

        {/* Footer summary */}
        <div style={{ background: "white", borderRadius: 12, padding: "0.6rem 1.2rem", border: "1px solid #d6e0eb", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "#2c5778", fontWeight: 500 }}>
          <span>⚠️ Portfolio Health: {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Total Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
        </div>
      </div>
    </div>
  )
}