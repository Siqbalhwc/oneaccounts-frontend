"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

type DimensionType = "activity" | "project" | "location"

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
  const [dimension, setDimension] = useState<DimensionType>("activity")

  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])

  // Budget matrix: { [accountId]: { [dimValueId]: amount } }
  const [budgetMatrix, setBudgetMatrix] = useState<Record<string, Record<string, number>>>({})
  // Actuals matrix: same shape, pulled from journal_lines
  const [actualsMatrix, setActualsMatrix] = useState<Record<string, Record<string, number>>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")

  // ── Get company and lookup data ───────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

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

  const dimensionValues = dimension === "activity" ? activities : dimension === "project" ? projects : locations
  const dimField = dimension === "activity" ? "activity_id" : dimension === "project" ? "project_id" : "location_id"

  // ── Load budgets and actuals ──────────────────────────────
  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    // 1. Budgets
    supabase.from("budgets")
      .select("*")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .neq(dimField, null)
      .then(({ data }) => {
        const bMatrix: Record<string, Record<string, number>> = {}
        data?.forEach((b: any) => {
          const acc = b.account_id
          const dv = b[dimField]
          if (!bMatrix[acc]) bMatrix[acc] = {}
          bMatrix[acc][dv] = b.budgeted_amount || 0
        })
        setBudgetMatrix(bMatrix)
      })

    // 2. Actuals – sum of journal_lines for each account + dimension value
    const startDate = `${fiscalYear}-01-01`
    const endDate = `${fiscalYear}-12-31`

    supabase
      .from("journal_lines")
      .select(`
        account_id,
        ${dimField},
        debit,
        credit,
        journal_entries!inner(date)
      `)
      .eq("company_id", companyId)
      .gte("journal_entries.date", startDate)
      .lte("journal_entries.date", endDate)
      .then(({ data }) => {
        const aMatrix: Record<string, Record<string, number>> = {}
        data?.forEach((line: any) => {
          const acc = line.account_id
          const dv = line[dimField]
          if (!dv) return   // skip lines without dimension
          const net = (line.debit || 0) - (line.credit || 0)   // expense is a debit
          if (!aMatrix[acc]) aMatrix[acc] = {}
          aMatrix[acc][dv] = (aMatrix[acc][dv] || 0) + net
        })
        setActualsMatrix(aMatrix)
        setLoading(false)
      })
  }, [companyId, fiscalYear, dimField])

  const updateCell = (accountId: string, dimValId: string, amount: number) => {
    setBudgetMatrix(prev => {
      const updated = { ...prev }
      if (!updated[accountId]) updated[accountId] = {}
      updated[accountId][dimValId] = amount
      return updated
    })
  }

  const handleSave = async () => {
    if (!companyId || !canEdit) return
    setSaving(true)
    setFlash("")

    for (const accountId of Object.keys(budgetMatrix)) {
      for (const dimValId of Object.keys(budgetMatrix[accountId])) {
        const amount = budgetMatrix[accountId][dimValId]
        if (amount > 0) {
          await supabase.from("budgets").upsert({
            company_id: companyId,
            account_id: accountId,
            fiscal_year: fiscalYear,
            month: null,
            [dimField]: dimValId,
            budgeted_amount: amount,
          }, { onConflict: "company_id,account_id,project_id,location_id,activity_id,fiscal_year,month" })
        }
      }
    }

    setFlash("✅ Budget saved!")
    setSaving(false)
    setTimeout(() => setFlash(""), 4000)
  }

  if (!canView) return <div style={{ padding: 24, textAlign: "center" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .budget-shell { max-width: 100%; overflow-x: auto; }
        .budget-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .budget-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
        .filter-bar { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
        .filter-select { padding: 8px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px; background: white; }
        .matrix-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: auto; min-width: 800px; }
        .matrix-header { display: flex; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; background: #F8FAFC; position: sticky; top: 0; z-index: 1; }
        .matrix-row { display: flex; border-bottom: 1px solid #F1F5F9; align-items: stretch; }
        .matrix-row:hover { background: #FAFBFF; }
        .matrix-account-cell { width: 120px; flex-shrink: 0; padding: 8px 10px; font-size: 11px; font-weight: 600; color: #1E3A8A; border-right: 2px solid #E2E8F0; display: flex; align-items: center; }
        .matrix-dims-cell { display: flex; flex: 1; flex-direction: column; }
        .matrix-dim-row { display: flex; border-bottom: 1px solid #F1F5F9; }
        .matrix-dim-row:last-child { border-bottom: none; }
        .matrix-dim-name { width: 100%; padding: 4px 8px; font-size: 10px; font-weight: 600; color: #64748B; background: #F8FAFC; border-right: 1px solid #E2E8F0; display: flex; align-items: center; }
        .matrix-cell-group { display: flex; flex: 1; }
        .matrix-cell { flex: 1; min-width: 120px; padding: 4px 8px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
        .matrix-input { width: 100%; padding: 4px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 11px; text-align: right; box-sizing: border-box; }
        .matrix-input:focus { border-color: #1740C8; outline: none; }
        .matrix-actual { font-size: 10px; color: #64748B; text-align: right; }
        .matrix-variance { font-size: 10px; text-align: right; font-weight: 600; }
        .variance-negative { color: #EF4444; }
        .variance-positive { color: #10B981; }
        .btn-primary { padding: 10px 20px; background: #1D4ED8; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; }
      `}</style>

      <div className="budget-shell">
        <div className="budget-title">💰 Budget vs Actuals</div>
        <div className="budget-subtitle">Compare budgeted amounts with actual spending</div>

        <div className="filter-bar">
          <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter-select" value={dimension} onChange={e => setDimension(e.target.value as DimensionType)}>
            <option value="activity">Pivot by Activity</option>
            <option value="project">Pivot by Project</option>
            <option value="location">Pivot by Location</option>
          </select>
        </div>

        {flash && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {flash}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading budgets & actuals...</div>
        ) : dimensionValues.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
            No {dimension}s found. Create them in <a href="/dashboard/settings/projects">Settings → Projects & Activities</a>.
          </div>
        ) : (
          <div className="matrix-table">
            {/* Header */}
            <div className="matrix-header">
              <div className="matrix-account-cell">Account</div>
              {dimensionValues.map(dv => (
                <div key={dv.id} className="matrix-cell" style={{ flex: 1, minWidth: 120, padding: "8px 8px", textAlign: "center" }}>
                  {dv.name}
                  <div style={{ display: "flex", marginTop: 4, fontSize: 8, color: "#94A3B8" }}>
                    <span style={{ flex: 1, textAlign: "right", paddingRight: 4 }}>Budget</span>
                    <span style={{ flex: 1, textAlign: "right", paddingRight: 4 }}>Actual</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Var</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Rows */}
            {accounts.map(acc => (
              <div key={acc.id} className="matrix-row">
                <div className="matrix-account-cell" title={acc.name}>{acc.code}</div>
                {dimensionValues.map(dv => {
                  const budgetVal = (budgetMatrix[acc.id] && budgetMatrix[acc.id][dv.id]) || 0
                  const actualVal = (actualsMatrix[acc.id] && actualsMatrix[acc.id][dv.id]) || 0
                  const variance = actualVal - budgetVal
                  return (
                    <div key={dv.id} className="matrix-cell">
                      <input
                        className="matrix-input"
                        type="number"
                        min="0"
                        step="100"
                        value={budgetVal || ""}
                        onChange={e => updateCell(acc.id, dv.id, Number(e.target.value))}
                        disabled={!canEdit}
                        placeholder="Budget"
                      />
                      <div className="matrix-actual">{actualVal.toLocaleString()}</div>
                      <div className={`matrix-variance ${variance < 0 ? "variance-negative" : "variance-positive"}`}>
                        {variance === 0 ? "—" : (variance > 0 ? "+" : "") + variance.toLocaleString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
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