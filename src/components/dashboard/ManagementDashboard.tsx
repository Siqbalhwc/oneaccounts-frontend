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

  // ── Fetch company ID and master data ────────────────
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

  // ── Fetch dashboard data ─────────────────────────────
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
      const totalBudgetVal = budgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0
      setTotalBudget(totalBudgetVal)

      // Total Spent (RPC)
      const { data: spentData } = await supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear })
      const totalSpentVal = spentData?.[0]?.total || 0
      setTotalSpent(totalSpentVal)

      // Donor Balances (RPC)
      const { data: donorData } = await supabase.rpc("dashboard_donor_balances", { cid: companyId, fy: fiscalYear })
      const donorRows = donorData?.map((d: any) => ({
        donor_id: d.donor_id,
        name: d.donor_name,
        budget: d.budget,
        actual: d.actual_spent,
        remaining: (d.budget || 0) - (d.actual_spent || 0),
        pct: d.budget ? Math.round(((d.actual_spent || 0) / d.budget) * 100) : 0,
        overspent: (d.actual_spent || 0) > (d.budget || 0),
      })) || []
      setDonorBalances(donorRows)

      // Project Utilization (RPC – FIXED PARAMETER NAMES)
      const { data: projData } = await supabase.rpc("dashboard_project_utilization", {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
      })
      const projectsArr = projData?.map((p: any) => ({
        id: p.project_id,
        name: p.project_name,
        budget: p.budget || 0,
        actual: p.actual || 0,
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

  // ── Filtered data ─────────────────────────────────────
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

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", background: "#f0f4f8", minHeight: "100vh" }}>Loading dashboard…</div>
  }

  return (
    <div style={{ background: "#f0f4f8", minHeight: "100vh", fontFamily: "Segoe UI, system-ui, sans-serif", padding: "20px 24px" }}>
      <style>{`
        .kpi-card { background: white; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); position: relative; overflow: hidden; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
        .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .kpi-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; border-radius: 12px 12px 0 0; }
        .blue::before { background: #1d4ed8; }
        .green::before { background: #16a34a; }
        .amber::before { background: #d97706; }
        .red::before { background: #dc2626; }
        .teal::before { background: #0d9488; }
        .progress-bar { height: 6px; border-radius: 3px; background: #f1f5f9; overflow: hidden; }
        .progress-fill { height: 6px; border-radius: 3px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
        .badge-danger { background: #fef2f2; color: #991b1b; }
        .badge-warning { background: #fffbeb; color: #92400e; }
        .badge-success { background: #f0fdf4; color: #166534; }
        .filter-select { padding: 8px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px; background: white; }
        .responsive-grid { display: grid; gap: 16px; }
        .kpi-grid { grid-template-columns: repeat(4, 1fr); }
        .stats-grid { grid-template-columns: repeat(3, 1fr); }
        .row-grid { grid-template-columns: 1.5fr 1fr; }
        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .row-grid { grid-template-columns: 1fr; }
          .filter-bar { flex-direction: column; }
        }
        @media (max-width: 500px) {
          .kpi-grid { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header & Filters */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>Management Dashboard</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Project & Budget Overview</p>
        </div>
        <div className="filter-bar" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter-select" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="filter-select" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
            <option value="">All Donors</option>
            {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="responsive-grid kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card blue" onClick={() => router.push("/dashboard/settings/budgets")}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Total Budget</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(filteredTotalBudget / 1_000_000).toFixed(1)}M</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{filteredProjectRows.length} project{filteredProjectRows.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="kpi-card green" onClick={() => router.push("/dashboard/reports/project-pl")}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Total Spent</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(filteredTotalSpent / 1_000_000).toFixed(1)}M</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{spentPct}% of budget</div>
        </div>
        <div className="kpi-card amber">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Remaining</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(remainingFunds / 1_000_000).toFixed(1)}M</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{filteredTotalBudget ? Math.round((remainingFunds / filteredTotalBudget) * 100) : 0}% unspent</div>
        </div>
        <div className="kpi-card red" onClick={() => router.push("/dashboard/reports/budget-vs-actual")}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Overspent</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#dc2626" }}>{filteredOverspentCount}</div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="responsive-grid stats-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card teal" onClick={() => router.push("/dashboard/invoices")}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Unpaid Invoices</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{unpaidInvoices}</div>
        </div>
        <div className="kpi-card teal" onClick={() => router.push("/dashboard/customers")}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Total Receivables</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(totalReceivables / 1_000_000).toFixed(1)}M</div>
        </div>
        <div className="kpi-card teal" onClick={() => router.push("/dashboard/suppliers")}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Total Payables</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(totalPayables / 1_000_000).toFixed(1)}M</div>
        </div>
      </div>

      {/* Project Utilization & Donor Balances */}
      <div className="responsive-grid row-grid" style={{ marginBottom: 24 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Project Utilization</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>
                <th style={{ textAlign: "left", paddingBottom: 8 }}>Project</th>
                <th style={{ textAlign: "left", paddingBottom: 8 }}>Budget</th>
                <th style={{ textAlign: "left", paddingBottom: 8 }}>Spent</th>
                <th style={{ textAlign: "left", paddingBottom: 8 }}>Utilization</th>
                <th style={{ textAlign: "left", paddingBottom: 8 }}>%</th>
                <th style={{ textAlign: "right", paddingBottom: 8 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjectRows.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }} onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}>
                  <td style={{ padding: "8px 0", fontWeight: 700 }}>{p.name}</td>
                  <td style={{ padding: "8px 0" }}>{(p.budget / 1_000_000).toFixed(1)}M</td>
                  <td style={{ padding: "8px 0", fontWeight: 700 }}>{(p.actual / 1_000_000).toFixed(1)}M</td>
                  <td style={{ padding: "8px 0" }}>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.min(p.pct, 100)}%`, background: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#d97706" : "#16a34a" }}></div>
                    </div>
                  </td>
                  <td style={{ padding: "8px 0", fontWeight: 700, color: p.pct > 100 ? "#dc2626" : p.pct > 80 ? "#d97706" : "#16a34a" }}>{p.pct}%</td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}>
                    <span className={`badge ${p.pct > 100 ? "badge-danger" : p.pct > 80 ? "badge-warning" : "badge-success"}`}>
                      {p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : "On Track"}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredProjectRows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>No projects found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Donor Balances</h3>
          {filteredDonorBalances.map((d, idx) => (
            <div key={idx} style={{ marginBottom: 12, cursor: "pointer" }} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.overspent ? "#dc2626" : "#1d4ed8" }}></div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  PKR {(d.remaining / 1_000_000).toFixed(1)}M
                </span>
                <span style={{ fontSize: 11, color: "#64748b", minWidth: 35, textAlign: "right" }}>
                  {d.pct}%
                </span>
              </div>
            </div>
          ))}
          {filteredDonorBalances.length === 0 && (
            <p style={{ color: "#94a3b8", textAlign: "center" }}>No donor data available.</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: "white", borderRadius: 12, padding: "12px 20px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#64748b", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,0.2)" }}></div>
          <span>Portfolio Health: <strong style={{ color: "#0f172a" }}>{filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}</strong></span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span>Total Budget: <strong>PKR {(filteredTotalBudget / 1_000_000).toFixed(1)}M</strong></span>
          <span>Spent: <strong>PKR {(filteredTotalSpent / 1_000_000).toFixed(1)}M ({spentPct}%)</strong></span>
          <span>Overspent Projects: <strong style={{ color: "#dc2626" }}>{filteredOverspentCount}</strong></span>
          <span>Period: <strong>FY {fiscalYear}</strong></span>
        </div>
      </div>
    </div>
  )
}