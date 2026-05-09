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

  // KPIs
  const [totalBudget, setTotalBudget] = useState(0)
  const [totalSpent, setTotalSpent] = useState(0)
  const [overspentCount, setOverspentCount] = useState(0)
  const [projectRows, setProjectRows] = useState<any[]>([])
  const [donorBalances, setDonorBalances] = useState<any[]>([])

  // Get company ID on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Fetch all dashboard data once we have a company ID
  useEffect(() => {
    if (!companyId) return
    const fiscalYear = new Date().getFullYear()
    const startDate = `${fiscalYear}-01-01`
    const endDate   = `${fiscalYear}-12-31`

    const fetchData = async () => {
      setLoading(true)

      // ---- Expense account IDs ----
      const { data: expenseAccs } = await supabase
        .from("accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("type", "Expense")
      const expenseAccIds = expenseAccs?.map(a => a.id) || []

      // ---- TOTAL BUDGET ----
      const { data: budgets } = await supabase
        .from("budgets")
        .select("budgeted_amount")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
        .not("activity_id", "is", null)
      const totalBudgetVal = budgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0
      setTotalBudget(totalBudgetVal)

      // ---- TOTAL SPENT (all expense accounts) ----
      let totalSpentVal = 0
      if (expenseAccIds.length > 0) {
        const { data: actuals } = await supabase
          .from("journal_lines")
          .select("debit, credit")
          .eq("company_id", companyId)
          .gte("journal_entries.date", startDate)
          .lte("journal_entries.date", endDate)
          .in("account_id", expenseAccIds)
        totalSpentVal = actuals?.reduce((s, a) => s + ((a.debit || 0) - (a.credit || 0)), 0) || 0
      }
      setTotalSpent(totalSpentVal)

      // ---- PROJECT UTILIZATION ----
      const { data: projBudgets } = await supabase
        .from("budgets")
        .select("project_id, budgeted_amount")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
        .not("activity_id", "is", null)

      const { data: projActuals } = await supabase
        .from("journal_lines")
        .select("project_id, debit, credit")
        .eq("company_id", companyId)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)

      const budgetMap: Record<string, number> = {}
      projBudgets?.forEach(b => {
        budgetMap[b.project_id] = (budgetMap[b.project_id] || 0) + b.budgeted_amount
      })
      const actualMap: Record<string, number> = {}
      projActuals?.forEach(a => {
        if (a.project_id) actualMap[a.project_id] = (actualMap[a.project_id] || 0) + ((a.debit || 0) - (a.credit || 0))
      })

      const projectsData: any[] = []
      let overspent = 0
      for (const pid of Object.keys(budgetMap)) {
        const bud = budgetMap[pid]
        const act = actualMap[pid] || 0
        if (act > bud) overspent++
        const { data: proj } = await supabase.from("projects").select("name").eq("id", pid).maybeSingle()
        projectsData.push({
          id: pid,
          name: proj?.name || pid,
          budget: bud,
          actual: act,
          pct: bud ? Math.round((act / bud) * 100) : 0,
        })
      }
      setOverspentCount(overspent)
      setProjectRows(projectsData.sort((a, b) => b.pct - a.pct))

      // ---- DONOR BALANCES ----
      const { data: donorBudgets } = await supabase
        .from("budgets")
        .select("donor_id, budgeted_amount")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
        .not("activity_id", "is", null)

      const { data: donorActuals } = await supabase
        .from("journal_lines")
        .select("donor_id, debit, credit")
        .eq("company_id", companyId)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)

      const donorBudgetMap: Record<string, number> = {}
      donorBudgets?.forEach(b => {
        if (b.donor_id) donorBudgetMap[b.donor_id] = (donorBudgetMap[b.donor_id] || 0) + b.budgeted_amount
      })
      const donorActualMap: Record<string, number> = {}
      donorActuals?.forEach(a => {
        if (a.donor_id) donorActualMap[a.donor_id] = (donorActualMap[a.donor_id] || 0) + ((a.debit || 0) - (a.credit || 0))
      })

      const donorRows: any[] = []
      for (const did of Object.keys(donorBudgetMap)) {
        const bud = donorBudgetMap[did]
        const act = donorActualMap[did] || 0
        const remaining = bud - act
        const { data: donor } = await supabase.from("donors").select("name").eq("id", did).maybeSingle()
        donorRows.push({
          name: donor?.name || did,
          remaining,
          pct: bud ? Math.round((act / bud) * 100) : 0,
          overspent: remaining < 0,
        })
      }
      setDonorBalances(donorRows)

      // ---- DEBUG: see exactly what donor data was loaded ----
      console.log("Donor balances loaded:", donorRows)

      setLoading(false)
    }

    fetchData()
  }, [companyId])

  const remainingFunds = totalBudget - totalSpent
  const spentPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "#f0f4f8", minHeight: "100vh" }}>
        Loading management dashboard…
      </div>
    )
  }

  return (
    <div style={{ background: "#f0f4f8", minHeight: "100vh", fontFamily: "Segoe UI, system-ui, sans-serif", padding: "20px 24px" }}>
      <style>{`
        .kpi-card { background: white; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); position: relative; overflow: hidden; }
        .kpi-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; border-radius: 12px 12px 0 0; }
        .blue::before { background: #1d4ed8; }
        .green::before { background: #16a34a; }
        .amber::before { background: #d97706; }
        .red::before { background: #dc2626; }
        .progress-bar { height: 6px; border-radius: 3px; background: #f1f5f9; overflow: hidden; }
        .progress-fill { height: 6px; border-radius: 3px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
        .badge-danger { background: #fef2f2; color: #991b1b; }
        .badge-warning { background: #fffbeb; color: #92400e; }
        .badge-success { background: #f0fdf4; color: #166534; }
        .responsive-grid { display: grid; gap: 16px; }
        .kpi-grid { grid-template-columns: repeat(4, 1fr); }
        .row-grid { grid-template-columns: 1.5fr 1fr; }
        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .row-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 500px) {
          .kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>Management Dashboard</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Project & Budget Overview — Fiscal Year {new Date().getFullYear()}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "#1d4ed8", color: "white" }}>
            Q2 {new Date().getFullYear()}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="responsive-grid kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card blue">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Total Budget</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(totalBudget / 1_000_000).toFixed(1)}M</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Across {projectRows.length} active projects</div>
        </div>
        <div className="kpi-card green">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Total Spent</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(totalSpent / 1_000_000).toFixed(1)}M</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{spentPct}% of approved budget</div>
        </div>
        <div className="kpi-card amber">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Remaining Funds</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>PKR {(remainingFunds / 1_000_000).toFixed(1)}M</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{totalBudget ? Math.round((remainingFunds / totalBudget) * 100) : 0}% unspent</div>
        </div>
        <div className="kpi-card red">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 6 }}>Overspent Projects</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#dc2626" }}>{overspentCount}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Require immediate review</div>
        </div>
      </div>

      {/* Project Utilization & Donor Balances */}
      <div className="responsive-grid row-grid" style={{ marginBottom: 24 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Project Budget Utilization</h3>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Sorted by utilization rate</p>
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
              {projectRows.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }}
                    onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}>
                  <td style={{ padding: "8px 0" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                  </td>
                  <td style={{ padding: "8px 0", fontSize: 12 }}>{(p.budget / 1_000_000).toFixed(1)}M</td>
                  <td style={{ padding: "8px 0", fontSize: 12, fontWeight: 700 }}>{(p.actual / 1_000_000).toFixed(1)}M</td>
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
              {projectRows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>No project budgets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Donor Fund Balances</h3>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Remaining unspent per donor source</p>
          {donorBalances.map((d, idx) => (
            <div key={idx} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.overspent ? "#dc2626" : "#1d4ed8" }}></div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>PKR {(d.remaining / 1_000_000).toFixed(1)}M</span>
                <span style={{ fontSize: 11, color: "#64748b", minWidth: 35, textAlign: "right" }}>
                  {d.pct === 0 ? "No spending" : d.overspent ? "Overspent" : `${d.pct}%`}
                </span>
              </div>
            </div>
          ))}
          {donorBalances.length === 0 && <p style={{ color: "#94a3b8", textAlign: "center" }}>No donor data available.</p>}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: "white", borderRadius: 12, padding: "12px 20px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#64748b", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,0.2)" }}></div>
          <span>Portfolio Health: <strong style={{ color: "#0f172a" }}>{overspentCount > 0 ? "Needs Attention" : "Healthy"}</strong></span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span>Total Budget: <strong>PKR {(totalBudget / 1_000_000).toFixed(1)}M</strong></span>
          <span>Spent: <strong>PKR {(totalSpent / 1_000_000).toFixed(1)}M ({spentPct}%)</strong></span>
          <span>Overspent Projects: <strong style={{ color: "#dc2626" }}>{overspentCount}</strong></span>
          <span>Period: <strong>Q2 {new Date().getFullYear()}</strong></span>
        </div>
      </div>
    </div>
  )
}