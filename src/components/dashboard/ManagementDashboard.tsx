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
    <div style={{ background: "#f4f8fc", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif", color: "#1e2b3c" }}>
      <style>{`
        /* ── Global resets inside dashboard ── */
        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── New polished card design ── */
        .mgmt .card {
          background: #f5fafd; border: 1px solid #ddecf4;
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,60,80,0.04);
          transition: all 0.2s;
        }
        .mgmt .card:hover { background: #f0f7fc; border-color: #b8d5e5; }

        /* ── Filter bar (visible, theme aligned) ── */
        .mgmt .filter-row {
          display: flex; align-items: center; gap: 0.8rem;
          background: white; border-radius: 24px; padding: 0.4rem 1.2rem;
          border: 1px solid #d9e6f2; margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .mgmt .filter-label {
          font-weight: 600; color: #1e3b4a; font-size: 0.8rem;
        }
        .mgmt .filter-pill {
          background: #eaf2f7; border: 1px solid #cbdbe8;
          padding: 0.3rem 1rem; border-radius: 30px;
          font-size: 0.8rem; font-weight: 500; color: #0b2b3b;
          display: flex; align-items: center; gap: 0.3rem;
          cursor: pointer; transition: 0.15s;
        }
        .mgmt .filter-pill.active {
          background: #c6dde8; border-color: #8bb3c9; font-weight: 600;
        }

        /* ── KPI cards (light tint, unified) ── */
        .mgmt .kpi-card {
          background: #f5fafd; border: 1px solid #ddecf4;
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: 0 4px 12px rgba(0,60,80,0.04);
          display: flex; flex-direction: column; gap: 0.4rem;
          cursor: pointer; transition: all 0.2s;
        }
        .mgmt .kpi-card:hover { background: #f0f7fc; }
        .mgmt .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: #2e5b6b; letter-spacing: 0.04em; }
        .mgmt .kpi-value { font-size: 1.7rem; font-weight: 700; color: #0c2d3b; line-height: 1.2; }
        .mgmt .kpi-meta { font-size: 0.8rem; color: #3d5a6b; display: flex; align-items: center; gap: 0.3rem; }
        .mgmt .view-link { font-weight: 600; color: #1a5b6b; margin-top: 0.2rem; display: inline-flex; align-items: center; gap: 0.2rem; }

        /* ── Hero banner (compact, same light tone) ── */
        .mgmt .hero {
          background: linear-gradient(115deg, #e3f2f9 0%, #d9ecf5 40%, #c9e4f1 100%);
          padding: 1.2rem 1.8rem; border-radius: 16px;
          margin-bottom: 1rem; display: flex; align-items: center;
          justify-content: space-between; flex-wrap: wrap; gap: 1rem;
        }
        .mgmt .hero-title {
          font-size: 1.2rem; font-weight: 700; color: #0c3b4b;
          border-left: 5px solid #2c7a8c; padding-left: 1rem;
          background: rgba(255,255,255,0.5); border-radius: 0 20px 20px 0;
          padding: 0.4rem 1.2rem 0.4rem 1rem;
        }
        .mgmt .hero-badge {
          background: rgba(255,255,255,0.7); border: 1px solid #c5dce8;
          border-radius: 14px; padding: 0.8rem 1.4rem;
          text-align: center;
        }
        .mgmt .hero-badge .label { color: #2d5a6b; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.2rem; }
        .mgmt .hero-badge .value { font-size: 2rem; font-weight: 800; color: #0e3b4a; line-height: 1; }

        /* ── Donor & project tables ── */
        .mgmt .section-title { font-weight: 700; font-size: 0.95rem; color: #123b45; margin-bottom: 0.8rem; display: flex; align-items: center; gap: 0.3rem; }
        .mgmt .donor-row {
          display: flex; align-items: center; gap: 0.8rem;
          background: white; border-radius: 12px; padding: 0.5rem 1rem;
          border: 1px solid #e0edf5; cursor: pointer; margin-bottom: 0.5rem;
        }
        .mgmt .progress-bg { height: 5px; background: #dde7ef; border-radius: 10px; width: 70px; overflow: hidden; }
        .mgmt .progress-fill { height: 100%; border-radius: 10px; }
        .mgmt .badge {
          padding: 0.1rem 0.6rem; border-radius: 12px;
          font-size: 0.7rem; font-weight: 700;
        }
        .mgmt .badge-danger { background: #fef2f2; color: #b91c1c; }
        .mgmt .badge-warning { background: #fffbeb; color: #92400e; }
        .mgmt .badge-success { background: #f0fdf4; color: #166534; }

        /* ── Responsive grids ── */
        .mgmt .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
        .mgmt .two-col { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        @media (max-width: 800px) { .mgmt .two-col { grid-template-columns: 1fr; } }
        @media (max-width: 600px) {
          .mgmt .hero { flex-direction: column; align-items: flex-start; }
          .mgmt .hero-badge { width: 100%; text-align: center; }
          .mgmt .filter-row { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        {/* Greeting & compact hero */}
        <div className="hero">
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0b2f3f", marginBottom: "0.2rem" }}>
              {getGreeting()}, siqbalhwc
            </h2>
            <p style={{ color: "#1e4a5f", fontSize: "0.85rem" }}>Here's what's happening with your NGO portfolio today</p>
          </div>
          <div className="hero-title">
            Empowering Social Impact Through Smart Financial Governance
          </div>
        </div>

        {/* Filters (aligned, visible) */}
        <div className="filter-row">
          <span className="filter-label">Period:</span>
          <select className="filter-pill active" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y} ▾</option>)}
          </select>
          <span style={{ color: "#a0b8c7" }}>|</span>
          <span className="filter-label">Projects:</span>
          <select className="filter-pill active" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
            <option value="">All Projects ▾</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span style={{ color: "#a0b8c7" }}>|</span>
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
            <div className="kpi-meta">{filteredProjectRows.length} projects <span className="view-link">View →</span></div>
          </div>
          <div className="kpi-card" onClick={() => router.push("/dashboard/reports/spending-detail" + detailQuery())}>
            <div className="kpi-label">Total Spent</div>
            <div className="kpi-value">{formatPKR(filteredTotalSpent)}</div>
            <div className="kpi-meta">{spentPct}% of budget <span className="view-link">View →</span></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Remaining</div>
            <div className="kpi-value">{formatPKR(remainingFunds)}</div>
            <div className="kpi-meta">{filteredTotalBudget ? Math.round((remainingFunds / filteredTotalBudget) * 100) : 0}% unspent</div>
          </div>
          <div className="kpi-card" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
            <div className="kpi-label">Portfolio Health</div>
            <div className="kpi-value" style={{ color: filteredOverspentCount > 0 ? "#c96e2c" : "#0c2d3b" }}>
              {filteredOverspentCount > 0 ? "⚠️ Needs Attention" : "Healthy"}
            </div>
            <div className="kpi-meta">{Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100)}% health score</div>
          </div>
        </div>

        {/* Project Utilization & Donor Balances */}
        <div className="two-col">
          {/* Projects */}
          <div className="card">
            <div className="section-title">📊 Project Utilization</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "6px 0", color: "#64748b", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Project</th>
                    <th style={{ textAlign: "left", padding: "6px 0", color: "#64748b", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Budget</th>
                    <th style={{ textAlign: "left", padding: "6px 0", color: "#64748b", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Spent</th>
                    <th style={{ textAlign: "left", padding: "6px 0", color: "#64748b", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Util.</th>
                    <th style={{ textAlign: "right", padding: "6px 0", color: "#64748b", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjectRows.map((p, idx) => (
                    <tr key={idx}
                        onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}
                        style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}>
                      <td style={{ fontWeight: 600, padding: "4px 0" }}>{p.name}</td>
                      <td>{formatPKR(p.budget)}</td>
                      <td>{formatPKR(p.actual)}</td>
                      <td>
                        <div className="progress-bg">
                          <div className="progress-fill" style={{
                            width: `${Math.min(p.pct, 100)}%`,
                            background: p.pct > 100 ? "#e68b5c" : p.pct > 80 ? "#f59e0b" : "#22c55e"
                          }}></div>
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`badge ${p.pct > 100 ? "badge-danger" : p.pct > 80 ? "badge-warning" : "badge-success"}`}>
                          {p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : "On Track"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredProjectRows.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: 12, color: "#94a3b8" }}>No projects found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Donors */}
          <div className="card">
            <div className="section-title">💧 Donor Balances</div>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} className="donor-row" onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#dc2626" : "#1d4ed8", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem" }}>{d.name}</span>
                <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{formatPKR(d.remaining)}</span>
                <span style={{ fontSize: "0.75rem", color: "#64748b", minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
              </div>
            ))}
            {filteredDonorBalances.length === 0 && (
              <p style={{ color: "#94a3b8", textAlign: "center" }}>No donor data.</p>
            )}
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
          <div className="card" style={{ flex: 1, minWidth: 140, display: "flex", alignItems: "center", gap: "0.8rem" }}>
            <span style={{ fontWeight: 700, color: "#1d4b5a" }}>🧑‍🤝‍🧑 CRM</span>
            <span style={{ background: "#e0eff5", borderRadius: 20, padding: "0.2rem 0.8rem", fontSize: "0.75rem", fontWeight: 600 }}>Customers</span>
            <span style={{ background: "#e0eff5", borderRadius: 20, padding: "0.2rem 0.8rem", fontSize: "0.75rem", fontWeight: 600 }}>Suppliers</span>
            <span style={{ background: "#e0eff5", borderRadius: 20, padding: "0.2rem 0.8rem", fontSize: "0.75rem", fontWeight: 600 }}>Investors</span>
          </div>
        </div>

        {/* Footer summary */}
        <div style={{ background: "white", borderRadius: 12, padding: "0.6rem 1.2rem", border: "1px solid #d6e6f0", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "#1f4b59", fontWeight: 500 }}>
          <span>⚠️ Portfolio Health: {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Total Budget: {formatPKR(filteredTotalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {filteredProjectRows.length}</span>
        </div>
      </div>
    </div>
  )
}