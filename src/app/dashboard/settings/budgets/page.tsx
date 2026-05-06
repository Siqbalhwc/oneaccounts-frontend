"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

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
  const [businessType, setBusinessType] = useState<string>("") // "ngo", "service", "trading"

  // Master data
  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])

  // Context filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")     // required only for NGO
  const [selectedLocationId, setSelectedLocationId] = useState<string>("") // optional

  // Budget matrix: { [accountId]: { [activityId]: amount } }
  const [budgetMatrix, setBudgetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [actualsMatrix, setActualsMatrix] = useState<Record<string, Record<string, number>>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")

  // ── Load master data & business type ──────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Business type
      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))

      supabase.from("accounts")
        .select("id, code, name")
        .eq("company_id", cid)
        .eq("type", "Expense")
        .order("code")
        .then(r => r.data && setAccounts(r.data))

      supabase.from("projects").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("donors").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setDonors(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
      supabase.from("activities").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setActivities(r.data))
    })
  }, [])

  // ── Load budgets & actuals ────────────────────────
  useEffect(() => {
    // For non‑NGO, donor is not required; matrix loads with any donor
    if (!companyId || !selectedProjectId) {
      setBudgetMatrix({})
      setActualsMatrix({})
      setLoading(false)
      return
    }
    if (businessType === "ngo" && !selectedDonorId) {
      setBudgetMatrix({})
      setActualsMatrix({})
      setLoading(false)
      return
    }
    setLoading(true)

    // 1. Budgets – filter by project, donor (if NGO), and activity columns
    let budgetQuery = supabase.from("budgets")
      .select("*")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .eq("project_id", selectedProjectId)
      .is("month", null)
      .not("activity_id", "is", null)

    if (businessType === "ngo") {
      budgetQuery = budgetQuery.eq("donor_id", selectedDonorId)
    }
    // For other types, we don't filter by donor (show all)
    if (selectedLocationId) {
      budgetQuery = budgetQuery.eq("location_id", selectedLocationId)
    } else {
      budgetQuery = budgetQuery.is("location_id", null)
    }

    budgetQuery.then(({ data }) => {
      const bMatrix: Record<string, Record<string, number>> = {}
      data?.forEach((b: any) => {
        const acc = b.account_id
        const act = b.activity_id
        if (!acc || !act) return
        if (!bMatrix[acc]) bMatrix[acc] = {}
        bMatrix[acc][act] = b.budgeted_amount || 0
      })
      setBudgetMatrix(bMatrix)
    })

    // 2. Actuals – sum journal_lines with matching tags
    const startDate = `${fiscalYear}-01-01`
    const endDate = `${fiscalYear}-12-31`

    let actualQuery = supabase
      .from("journal_lines")
      .select(`
        account_id,
        activity_id,
        debit,
        credit,
        journal_entries!inner(date)
      `)
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .gte("journal_entries.date", startDate)
      .lte("journal_entries.date", endDate)

    if (businessType === "ngo") {
      actualQuery = actualQuery.eq("donor_id", selectedDonorId)
    }
    if (selectedLocationId) {
      actualQuery = actualQuery.eq("location_id", selectedLocationId)
    }

    actualQuery.then(({ data }) => {
      const aMatrix: Record<string, Record<string, number>> = {}
      data?.forEach((line: any) => {
        const acc = line.account_id
        const act = line.activity_id
        if (!act || !acc) return
        const net = (line.debit || 0) - (line.credit || 0) // expenses are debits
        if (!aMatrix[acc]) aMatrix[acc] = {}
        aMatrix[acc][act] = (aMatrix[acc][act] || 0) + net
      })
      setActualsMatrix(aMatrix)
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, selectedLocationId, businessType])

  const updateCell = (accountId: string, activityId: string, amount: number) => {
    setBudgetMatrix(prev => {
      const updated = { ...prev }
      if (!updated[accountId]) updated[accountId] = {}
      updated[accountId][activityId] = amount
      return updated
    })
  }

  const handleSave = async () => {
    if (!companyId || !canEdit) return
    if (!selectedProjectId) {
      setFlash("⚠️ Please select a Project first.")
      return
    }
    if (businessType === "ngo" && !selectedDonorId) {
      setFlash("⚠️ Please select a Donor for NGO budgeting.")
      return
    }
    setSaving(true)
    setFlash("")

    for (const accountId of Object.keys(budgetMatrix)) {
      for (const activityId of Object.keys(budgetMatrix[accountId])) {
        const amount = budgetMatrix[accountId][activityId]
        if (amount > 0) {
          const payload: any = {
            company_id: companyId,
            account_id: parseInt(accountId),
            fiscal_year: fiscalYear,
            month: null,
            project_id: selectedProjectId,
            activity_id: activityId,
            budgeted_amount: amount,
          }
          // For NGO, include donor; for others, set donor to null or keep it out
          if (businessType === "ngo") {
            payload.donor_id = selectedDonorId
          } else {
            payload.donor_id = null   // no donor constraint for service/trading
          }
          payload.location_id = selectedLocationId || null

          await supabase.from("budgets").upsert(payload, {
            onConflict: "company_id,account_id,project_id,activity_id,location_id,donor_id,fiscal_year,month"
          })
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
        <div className="budget-subtitle">
          {businessType === "ngo"
            ? "Enter budgets per Project, Donor, and Activity (optional Location filter)"
            : "Enter budgets per Project and Activity (optional Location)"}
        </div>

        <div className="filter-bar">
          <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select className="filter-select" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
            <option value="">-- Select Project --</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {businessType === "ngo" && (
            <select className="filter-select" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
              <option value="">-- Select Donor --</option>
              {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}

          <select className="filter-select" value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)}>
            <option value="">-- All Locations (optional) --</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {flash && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {flash}
          </div>
        )}

        {!selectedProjectId || (businessType === "ngo" && !selectedDonorId) ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
            {businessType === "ngo"
              ? "Please select Project and Donor to display the budget matrix."
              : "Please select a Project to display the budget matrix."}
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading budgets & actuals...</div>
        ) : activities.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
            No Activities found. Create them in Settings.
          </div>
        ) : (
          <div className="matrix-table">
            <div className="matrix-header">
              <div className="matrix-account-cell">Account</div>
              {activities.map(act => (
                <div key={act.id} className="matrix-cell" style={{ flex: 1, minWidth: 120, padding: "8px 8px", textAlign: "center" }}>
                  {act.name}
                  <div style={{ display: "flex", marginTop: 4, fontSize: 8, color: "#94A3B8" }}>
                    <span style={{ flex: 1, textAlign: "right", paddingRight: 4 }}>Budget</span>
                    <span style={{ flex: 1, textAlign: "right", paddingRight: 4 }}>Actual</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Var</span>
                  </div>
                </div>
              ))}
            </div>

            {accounts.map(acc => (
              <div key={acc.id} className="matrix-row">
                <div className="matrix-account-cell" title={acc.name}>{acc.code}</div>
                {activities.map(act => {
                  const budgetVal = (budgetMatrix[acc.id] && budgetMatrix[acc.id][act.id]) || 0
                  const actualVal = (actualsMatrix[acc.id] && actualsMatrix[acc.id][act.id]) || 0
                  const variance = actualVal - budgetVal
                  return (
                    <div key={act.id} className="matrix-cell">
                      <input
                        className="matrix-input"
                        type="number"
                        min="0"
                        step="100"
                        value={budgetVal || ""}
                        onChange={e => updateCell(acc.id, act.id, Number(e.target.value))}
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

        {canEdit && selectedProjectId && (businessType !== "ngo" || selectedDonorId) && (
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 16 }}>
            {saving ? "Saving..." : "💾 Save Budget"}
          </button>
        )}
      </div>
    </div>
  )
}