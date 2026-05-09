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

  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")

  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])

  const [donorBalances, setDonorBalances] = useState<any[]>([])
  const [projectRows, setProjectRows] = useState<any[]>([])
  const [totalBudget, setTotalBudget] = useState(0)
  const [totalSpent, setTotalSpent] = useState(0)
  const [overspentCount, setOverspentCount] = useState(0)

  const [unpaidInvoices, setUnpaidInvoices] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)

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

  useEffect(() => {
    if (!companyId) return
    const fetchData = async () => {
      setLoading(true)
      const { data: budgets } = await supabase.from("budgets").select("budgeted_amount")
        .eq("company_id", companyId).eq("fiscal_year", fiscalYear).is("month", null).not("activity_id", "is", null)
      setTotalBudget(budgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0)

      const { data: spentData } = await supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear })
      setTotalSpent(spentData?.[0]?.total || 0)

      const { data: donorData } = await supabase.rpc("dashboard_donor_balances", { cid: companyId, fy: fiscalYear })
      setDonorBalances(donorData?.map((d: any) => ({
        donor_id: d.donor_id, name: d.donor_name,
        budget: d.budget, actual: d.actual_spent,
        remaining: (d.budget || 0) - (d.actual_spent || 0),
        pct: d.budget ? Math.round(((d.actual_spent || 0) / d.budget) * 100) : 0,
        overspent: (d.actual_spent || 0) > (d.budget || 0),
      })) || [])

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

  const filteredDonorBalances = donorBalances.filter(d => !selectedDonorId || d.donor_id == selectedDonorId)
  const filteredProjectRows = projectRows.filter(p => !selectedProjectId || p.id == selectedProjectId)
  const filteredTotalBudget = selectedProjectId ? filteredProjectRows.reduce((s, p) => s + p.budget, 0) : totalBudget
  const filteredTotalSpent = selectedProjectId ? filteredProjectRows.reduce((s, p) => s + p.actual, 0) : totalSpent
  const filteredOverspentCount = selectedProjectId ? filteredProjectRows.filter(p => p.actual > p.budget).length : overspentCount
  const remainingFunds = filteredTotalBudget - filteredTotalSpent
  const spentPct = filteredTotalBudget ? Math.round((filteredTotalSpent / filteredTotalBudget) * 100) : 0

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const formatPKR = (v: number) => {
    if (v >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `PKR ${(v / 1_000).toFixed(0)}K`
    return `PKR ${v.toLocaleString()}`
  }

  const detailQuery = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ fy: String(fiscalYear) })
    if (selectedProjectId) params.set("project", selectedProjectId)
    if (selectedDonorId) params.set("donor", selectedDonorId)
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return "?" + params.toString()
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", background: "#f0f4f8", minHeight: "100vh" }}>Loading…</div>
  }

  return (
    <div style={{ background: "#f0f4f8", minHeight: "100vh", fontFamily: "Segoe UI, system-ui, sans-serif" }}>
      <style>{`
        /* Compact reset */
        .kpi-card { background: white; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); position: relative; overflow: hidden; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
        .kpi-card:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .kpi-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 12px 12px 0 0; }
        .blue::before { background: linear-gradient(to right, #3b82f6, #06b6d4); }
        .green::before { background: linear-gradient(to right, #22c55e, #10b981); }
        .amber::before { background: linear-gradient(to right, #f97316, #f59e0b); }
        .red::before { background: linear-gradient(to right, #ef4444, #ec4899); }
        .progress-bar { height: 5px; border-radius: 3px; background: #f1f5f9; overflow: hidden; }
        .progress-fill { height: 5px; border-radius: 3px; }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 700; }
        .badge-danger { background: #fef2f2; color: #991b1b; }
        .badge-warning { background: #fffbeb; color: #92400e; }
        .badge-success { background: #f0fdf4; color: #166534; }
        .filter-select { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; background: white; box-sizing: border-box; }
        .hero-card { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #06b6d4 100%); border-radius: 16px; padding: 18px 24px; position: relative; overflow: hidden; margin-bottom: 16px; }
        .hero-card h2 { color: white; font-size: 20px; font-weight: 800; margin: 0 0 6px 0; }
        .hero-card p { color: rgba(255,255,255,0.85); font-size: 13px; margin: 0; max-width: 550px; }
        .hero-badge { background: rgba(255,255,255,0.15); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 12px 20px; text-align: center; }
        .hero-badge .label { color: rgba(255,255,255,0.7); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .hero-badge .value { color: white; font-size: 32px; font-weight: 800; line-height: 1; }
        .responsive-grid { display: grid; gap: 12px; }
        .kpi-grid { grid-template-columns: repeat(4, 1fr); }
        .row-grid { grid-template-columns: 1.5fr 1fr; }
        .dashboard-header {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #06b6d4 100%);
          border-radius: 16px;
          padding: 12px 20px;
          color: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin: 8px 16px 16px;
        }
        .dashboard-header .welcome { display: flex; align-items: center; gap: 10px; }
        .dashboard-header .welcome img { width: 36px; height: 36px; border-radius: 8px; object-fit: contain; }
        .dashboard-header .welcome h2 { font-size: 18px; font-weight: 700; margin: 0; }
        .dashboard-header .welcome p { font-size: 12px; color: rgba(255,255,255,0.7); margin: 2px 0 0 0; }
        .dashboard-header .stats { display: flex; gap: 8px; flex-wrap: wrap; }
        .dashboard-header .stat-card {
          background: rgba(255,255,255,0.1); backdrop-filter: blur(4px);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 10px; padding: 8px 14px;
          min-width: 80px; text-align: center;
          cursor: pointer; transition: 0.2s;
        }
        .dashboard-header .stat-card:hover { background: rgba(255,255,255,0.2); }
        .dashboard-header .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.65); margin-bottom: 3px; }
        .dashboard-header .stat-value { font-size: 16px; font-weight: 700; color: white; }
        @media (max-width: 900px) {
          .dashboard-header { flex-direction: column; align-items: flex-start; }
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .row-grid { grid-template-columns: 1fr; }
          .filter-bar { flex-direction: column; }
        }
        @media (max-width: 500px) {
          .kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="dashboard-header">
        <div className="welcome">
          <img src="/logo.png" alt="OneAccounts" />
          <div>
            <h2>{getGreeting()}, siqbalhwc</h2>
            <p>Here's what's happening with your NGO portfolio today</p>
          </div>
        </div>
        <div className="stats">
          <div className="stat-card" onClick={() => router.push("/dashboard/invoices")}>
            <div className="stat-label">Unpaid Invoices</div>
            <div className="stat-value">{unpaidInvoices}</div>
          </div>
          <div className="stat-card" onClick={() => router.push("/dashboard/customers")}>
            <div className="stat-label">Receivables</div>
            <div className="stat-value">{formatPKR(totalReceivables)}</div>
          </div>
          <div className="stat-card" onClick={() => router.push("/dashboard/suppliers")}>
            <div className="stat-label">Payables</div>
            <div className="stat-value">{formatPKR(totalPayables)}</div>
          </div>
          <div className="stat-card" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
            <div className="stat-label">Overspent</div>
            <div className="stat-value" style={{ color: filteredOverspentCount > 0 ? '#fecaca' : 'white' }}>
              {filteredOverspentCount} {filteredOverspentCount === 1 ? "proj" : "projs"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }} className="filter-bar">
          <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y}</option>)}
          </select>
          <select className="filter-select" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} style={{ marginLeft: 6 }}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="filter-select" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)} style={{ marginLeft: 6 }}>
            <option value="">All Donors</option>
            {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div className="hero-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h2>Empowering Social Impact Through Smart Financial Governance</h2>
              <p>Monitor donor utilization, project burn rates, receivables, payables and organizational performance from one centralized NGO management platform.</p>
            </div>
            <div className="hero-badge">
              <div className="label">Portfolio Health</div>
              <div className="value">{filteredTotalBudget ? Math.round((1 - filteredOverspentCount / Math.max(filteredProjectRows.length, 1)) * 100) : 100}%</div>
            </div>
          </div>
        </div>

        <div className="responsive-grid kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi-card blue" onClick={() => router.push("/dashboard/reports/budget-summary" + detailQuery())}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 4 }}>Total Budget</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPKR(filteredTotalBudget)}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{filteredProjectRows.length} projects</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", position: "absolute", bottom: 14, right: 20 }}>View →</span>
          </div>
          <div className="kpi-card green" onClick={() => router.push("/dashboard/reports/spending-detail" + detailQuery())}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 4 }}>Total Spent</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPKR(filteredTotalSpent)}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{spentPct}% of budget</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", position: "absolute", bottom: 14, right: 20 }}>View →</span>
          </div>
          <div className="kpi-card amber">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 4 }}>Remaining</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPKR(remainingFunds)}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{filteredTotalBudget ? Math.round((remainingFunds / filteredTotalBudget) * 100) : 0}% unspent</div>
          </div>
          <div className="kpi-card red" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 4 }}>Overspent</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#dc2626" }}>{filteredOverspentCount}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{filteredOverspentCount === 1 ? "project" : "projects"}</div>
          </div>
        </div>

        <div className="responsive-grid row-grid" style={{ marginBottom: 12 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px 0" }}>Project Utilization</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ textAlign: "left", paddingBottom: 6 }}>Project</th>
                  <th style={{ textAlign: "left", paddingBottom: 6 }}>Budget</th>
                  <th style={{ textAlign: "left", paddingBottom: 6 }}>Spent</th>
                  <th style={{ textAlign: "left", paddingBottom: 6 }}>Utilization</th>
                  <th style={{ textAlign: "left", paddingBottom: 6 }}>%</th>
                  <th style={{ textAlign: "right", paddingBottom: 6 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjectRows.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }} onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}>
                    <td style={{ padding: "4px 0", fontWeight: 700, fontSize: 12 }}>{p.name}</td>
                    <td style={{ padding: "4px 0", fontSize: 11 }}>{formatPKR(p.budget)}</td>
                    <td style={{ padding: "4px 0", fontSize: 11, fontWeight: 700 }}>{formatPKR(p.actual)}</td>
                    <td style={{ padding: "4px 0" }}>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${Math.min(p.pct, 100)}%`, background: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#d97706" : "#16a34a" }}></div>
                      </div>
                    </td>
                    <td style={{ padding: "4px 0", fontSize: 11, fontWeight: 700, color: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#d97706" : "#16a34a" }}>{p.pct}%</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>
                      <span className={`badge ${p.pct > 100 ? "badge-danger" : p.pct > 80 ? "badge-warning" : "badge-success"}`}>
                        {p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : "On Track"}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredProjectRows.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 12, color: "#94a3b8" }}>No projects found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px 0" }}>Donor Balances</h3>
            {filteredDonorBalances.map((d, idx) => (
              <div key={idx} style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#dc2626" : "#1d4ed8" }}></div>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{d.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{formatPKR(d.remaining)}</span>
                  <span style={{ fontSize: 10, color: "#64748b", minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
                </div>
              </div>
            ))}
            {filteredDonorBalances.length === 0 && (
              <p style={{ color: "#94a3b8", textAlign: "center" }}>No donor data available.</p>
            )}
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 10, padding: "8px 20px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#64748b", flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,0.15)" }}></div>
            <span>Portfolio Health: <strong style={{ color: "#0f172a" }}>{filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</strong></span>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <span>Total Budget: <strong>{formatPKR(filteredTotalBudget)}</strong></span>
            <span>Utilized: <strong>{spentPct}%</strong></span>
            <span>Projects: <strong>{filteredProjectRows.length}</strong></span>
          </div>
        </div>
      </div>
    </div>
  )
}