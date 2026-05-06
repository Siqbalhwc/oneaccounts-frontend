"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export default function BudgetsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])

  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [selectedProject, setSelectedProject] = useState<string>("")
  const [selectedLocation, setSelectedLocation] = useState<string>("")
  const [selectedActivity, setSelectedActivity] = useState<string>("")

  // Budget grid: key = accountId, value = array of 12 monthly amounts
  const [budgetGrid, setBudgetGrid] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")

  // ── Get company ID and lookup data ───────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Fetch expense accounts only (budget typically for expenses)
      supabase.from("accounts")
        .select("id, code, name")
        .eq("company_id", cid)
        .eq("type", "Expense")
        .order("code")
        .then(r => r.data && setAccounts(r.data))

      supabase.from("projects").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
      supabase.from("activities").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setActivities(r.data))
    })
  }, [])

  // ── Load existing budgets for the selected year ─────────
  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    let query = supabase.from("budgets").select("*")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)   // fetch annual budgets only (month=NULL)
    // We'll display annual budget; you can later add monthly breakdown

    if (selectedAccount) query = query.eq("account_id", selectedAccount)
    if (selectedProject) query = query.eq("project_id", selectedProject)
    if (selectedLocation) query = query.eq("location_id", selectedLocation)
    if (selectedActivity) query = query.eq("activity_id", selectedActivity)

    query.then(({ data }) => {
      const grid: Record<string, number[]> = {}
      data?.forEach((b: any) => {
        if (!grid[b.account_id]) grid[b.account_id] = Array(12).fill(0)
        // For annual, set the total budget in the first month (you can distribute equally later)
        grid[b.account_id][0] = b.budgeted_amount || 0
      })
      setBudgetGrid(grid)
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedAccount, selectedProject, selectedLocation, selectedActivity])

  // ── Update cell value ───────────────────────────────────
  const updateCell = (accountId: string, monthIdx: number, value: number) => {
    setBudgetGrid(prev => {
      const updated = { ...prev }
      if (!updated[accountId]) updated[accountId] = Array(12).fill(0)
      updated[accountId][monthIdx] = value
      return updated
    })
  }

  // ── Save all budgets ────────────────────────────────────
  const handleSave = async () => {
    if (!companyId || !canEdit) return
    setSaving(true)
    setFlash("")

    for (const accountId of Object.keys(budgetGrid)) {
      const monthly = budgetGrid[accountId]
      // Upsert a single annual budget row (month = NULL)
      const totalAnnual = monthly.reduce((sum, v) => sum + (v || 0), 0)
      if (totalAnnual > 0) {
        await supabase.from("budgets").upsert({
          company_id: companyId,
          account_id: accountId,
          project_id: selectedProject || null,
          location_id: selectedLocation || null,
          activity_id: selectedActivity || null,
          fiscal_year: fiscalYear,
          month: null,
          budgeted_amount: totalAnnual,
        }, { onConflict: "company_id,account_id,project_id,location_id,activity_id,fiscal_year,month" })
      }
    }

    setFlash("✅ Budget saved successfully!")
    setSaving(false)
    setTimeout(() => setFlash(""), 4000)
  }

  if (!canView) return <div style={{ padding: 24, textAlign: "center" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .budget-shell { max-width: 1200px; margin: 0 auto; }
        .budget-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .budget-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
        .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .filter-select { padding: 8px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px; background: white; }
        .budget-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow-x: auto; }
        .budget-header { display: grid; grid-template-columns: 120px repeat(12, 1fr); padding: 10px 16px; background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; position: sticky; top: 0; }
        .budget-row { display: grid; grid-template-columns: 120px repeat(12, 1fr); padding: 8px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 12px; }
        .budget-row:hover { background: #FAFBFF; }
        .budget-input { width: 100%; padding: 6px 4px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 11px; text-align: right; box-sizing: border-box; }
        .budget-input:focus { border-color: #1740C8; outline: none; }
        .btn-primary { padding: 10px 20px; background: #1D4ED8; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; }
      `}</style>

      <div className="budget-shell">
        <div className="budget-title">💰 Budget Entry</div>
        <div className="budget-subtitle">Set expense budgets per account for the fiscal year</div>

        {/* Filters */}
        <div className="filter-bar" style={{ marginTop: 16 }}>
          <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter-select" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
          <select className="filter-select" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="filter-select" value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="filter-select" value={selectedActivity} onChange={e => setSelectedActivity(e.target.value)}>
            <option value="">All Activities</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {flash && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {flash}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading budgets...</div>
        ) : (
          <div className="budget-table">
            <div className="budget-header">
              <span>Account</span>
              {MONTHS.map(m => <span key={m} style={{ textAlign: "right" }}>{m}</span>)}
            </div>
            {accounts.map(a => {
              const row = budgetGrid[a.id] || Array(12).fill(0)
              return (
                <div key={a.id} className="budget-row">
                  <span style={{ fontWeight: 600, color: "#1E3A8A", fontSize: 11 }}>{a.code}</span>
                  {row.map((val, idx) => (
                    <input
                      key={idx}
                      className="budget-input"
                      type="number"
                      min="0"
                      step="100"
                      value={val || ""}
                      onChange={e => updateCell(a.id, idx, Number(e.target.value))}
                      disabled={!canEdit}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {canEdit && (
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 16 }}>
            {saving ? "Saving..." : "💾 Save Budget"}
          </button>
        )}
      </div>
    </div>
  )
}