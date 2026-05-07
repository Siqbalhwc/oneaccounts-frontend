"use client"

import { useState, useEffect, Fragment } from "react"
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
  const [businessType, setBusinessType] = useState<string>("")

  // Master data
  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [allActivities, setAllActivities] = useState<any[]>([])

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")
  const [filterActivityId, setFilterActivityId] = useState<string>("")
  const [filterLocationId, setFilterLocationId] = useState<string>("")

  // Data: { [activityId]: { [locationId]: { [accountId]: { budget: number, actual: number } } } }
  const [data, setData] = useState<Record<string, Record<string, Record<string, { budget: number; actual: number }>>>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")

  // ── Load master data ─────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))
      supabase.from("accounts").select("id, code, name").eq("company_id", cid).eq("type", "Expense").order("code")
        .then(r => r.data && setAccounts(r.data))
      supabase.from("projects").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("donors").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setDonors(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
    })
  }, [])

  // Load activities of selected project
  useEffect(() => {
    if (!companyId || !selectedProjectId) { setAllActivities([]); return }
    supabase.from("activities")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .order("name")
      .then(r => r.data && setAllActivities(r.data))
  }, [companyId, selectedProjectId])

  // ── Load budgets and actuals ──────────────────────────
  useEffect(() => {
    if (!companyId || !selectedProjectId) { setData({}); setLoading(false); return }
    if (businessType === "ngo" && !selectedDonorId) { setData({}); setLoading(false); return }
    setLoading(true)

    let budgetQuery = supabase.from("budgets")
      .select("*")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .eq("project_id", selectedProjectId)
      .is("month", null)
    if (businessType === "ngo") budgetQuery = budgetQuery.eq("donor_id", selectedDonorId)
    if (filterLocationId) budgetQuery = budgetQuery.eq("location_id", filterLocationId)

    budgetQuery.then(({ data: budgetRows }) => {
      const startDate = `${fiscalYear}-01-01`
      const endDate = `${fiscalYear}-12-31`
      let actualQuery = supabase.from("journal_lines")
        .select("account_id, activity_id, location_id, debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .eq("project_id", selectedProjectId)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)
      if (businessType === "ngo") actualQuery = actualQuery.eq("donor_id", selectedDonorId)
      if (filterLocationId) actualQuery = actualQuery.eq("location_id", filterLocationId)

      actualQuery.then(({ data: actualRows }) => {
        const newData: Record<string, Record<string, Record<string, { budget: number; actual: number }>>> = {}

        budgetRows?.forEach((b: any) => {
          const { activity_id, location_id, account_id, budgeted_amount } = b
          if (!activity_id || !location_id || !account_id) return
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          if (!newData[activity_id][location_id][account_id]) newData[activity_id][location_id][account_id] = { budget: 0, actual: 0 }
          newData[activity_id][location_id][account_id].budget += budgeted_amount || 0
        })

        actualRows?.forEach((line: any) => {
          const { account_id, activity_id, location_id, debit, credit } = line
          if (!activity_id || !location_id || !account_id) return
          const net = (debit || 0) - (credit || 0)
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          if (!newData[activity_id][location_id][account_id]) newData[activity_id][location_id][account_id] = { budget: 0, actual: 0 }
          newData[activity_id][location_id][account_id].actual += net
        })

        setData(newData)
        setLoading(false)
      })
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, filterLocationId, businessType])

  const updateBudget = (activityId: string, locationId: string, accountId: string, amount: number) => {
    setData(prev => {
      const updated = { ...prev }
      if (!updated[activityId]) updated[activityId] = {}
      if (!updated[activityId][locationId]) updated[activityId][locationId] = {}
      updated[activityId][locationId] = {
        ...updated[activityId][locationId],
        [accountId]: { ...updated[activityId][locationId][accountId] || { actual: 0 }, budget: amount },
      }
      return updated
    })
  }

  const addLocationRow = (activityId: string, locationId: string) => {
    if (!locationId) return
    setData(prev => {
      const updated = { ...prev }
      if (!updated[activityId]) updated[activityId] = {}
      if (!updated[activityId][locationId]) updated[activityId][locationId] = {}
      return updated
    })
  }

  const handleSave = async () => {
    if (!companyId || !canEdit) return
    if (!selectedProjectId) { setFlash("⚠️ Please select a Project first."); return }
    if (businessType === "ngo" && !selectedDonorId) { setFlash("⚠️ Please select a Donor for NGO budgeting."); return }
    setSaving(true); setFlash("")

    const rowsToInsert: any[] = []
    for (const activityId of Object.keys(data)) {
      for (const locationId of Object.keys(data[activityId])) {
        for (const accountId of Object.keys(data[activityId][locationId])) {
          const budget = data[activityId][locationId][accountId].budget
          if (budget <= 0) continue
          rowsToInsert.push({
            company_id: companyId,
            account_id: parseInt(accountId),
            project_id: selectedProjectId,
            activity_id: activityId,
            location_id: locationId,
            donor_id: (businessType === "ngo") ? selectedDonorId : null,
            fiscal_year: fiscalYear,
            month: null,
            budgeted_amount: budget,
          })
        }
      }
    }

    let deleteQuery = supabase.from("budgets").delete().eq("company_id", companyId).eq("project_id", selectedProjectId).eq("fiscal_year", fiscalYear).is("month", null)
    if (businessType === "ngo") deleteQuery = deleteQuery.eq("donor_id", selectedDonorId)
    if (filterLocationId) deleteQuery = deleteQuery.eq("location_id", filterLocationId)
    await deleteQuery

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from("budgets").insert(rowsToInsert)
      if (error) { setFlash("❌ Error: " + error.message); setSaving(false); return }
    }
    setFlash("✅ Budget saved!"); setSaving(false); setTimeout(() => setFlash(""), 4000)
  }

  const displayActivities = filterActivityId ? allActivities.filter(a => a.id == filterActivityId) : allActivities

  if (!canView) return <div style={{ padding: 24, textAlign: "center" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .budget-shell { max-width: 100%; overflow-x: auto; }
        .filter-bar { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
        .filter-select { padding: 8px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px; background: white; }
        .table { border-collapse: collapse; width: 100%; font-size: 11px; background: white; }
        .table th, .table td { border: 1px solid #E2E8F0; padding: 4px 6px; text-align: center; }
        .act-header td { background: #E2E8F0; font-weight: 700; text-align: left; padding: 6px; }
        .sub-header th { background: #F1F5F9; font-weight: 600; font-size: 9px; }
        .input-budget { width: 70px; text-align: right; border: 1px solid #E2E8F0; border-radius: 4px; padding: 2px 4px; font-size: 10px; }
        .total-row td { font-weight: 700; background: #F8FAFC; }
        .btn-primary { padding: 10px 20px; background: #1D4ED8; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; margin-top: 16px; }
      `}</style>

      <div className="budget-shell">
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B" }}>💰 Budget vs Actuals</h2>
        <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>
          {businessType === "ngo"
            ? "Enter budgets per Project, Donor, Activity, and Location"
            : "Enter budgets per Project, Activity, and Location"}
        </p>

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
          <select className="filter-select" value={filterActivityId} onChange={e => setFilterActivityId(e.target.value)}>
            <option value="">All Activities</option>
            {allActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="filter-select" value={filterLocationId} onChange={e => setFilterLocationId(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{flash}</div>}

        {!selectedProjectId || (businessType === "ngo" && !selectedDonorId) ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
            {businessType === "ngo"
              ? "Please select Project and Donor to display the budget matrix."
              : "Please select a Project to display the budget matrix."}
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading budgets & actuals...</div>
        ) : displayActivities.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
            No Activities found for this project. Create them in Settings.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: 100 }}>Activity / Location</th>
                {accounts.map(acc => (
                  <th key={acc.id} colSpan={3} style={{ fontSize: 10 }}>{acc.code}<br/>{acc.name}</th>
                ))}
                <th colSpan={3} style={{ fontSize: 10 }}>TOTAL</th>
              </tr>
              <tr className="sub-header">
                {accounts.map(acc => (
                  <Fragment key={acc.id}>
                    <th>Budget</th><th>Actual</th><th>Var</th>
                  </Fragment>
                ))}
                <th>Budget</th><th>Actual</th><th>Var</th>
              </tr>
            </thead>
            <tbody>
              {displayActivities.map(act => {
                const actData = data[act.id] || {}
                const locationsInAct = Object.keys(actData)
                let actTotalBudget = 0, actTotalActual = 0
                locationsInAct.forEach(lid => {
                  Object.keys(actData[lid]).forEach(accId => {
                    actTotalBudget += actData[lid][accId]?.budget || 0
                    actTotalActual += actData[lid][accId]?.actual || 0
                  })
                })
                return (
                  <Fragment key={act.id}>
                    <tr className="act-header">
                      <td colSpan={1 + accounts.length * 3 + 3}>{act.name}</td>
                    </tr>
                    {locationsInAct.map(lid => {
                      const loc = locations.find(l => l.id == lid)
                      let rowBudget = 0, rowActual = 0
                      return (
                        <tr key={lid}>
                          <td style={{ fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>{loc?.name || lid}</td>
                          {accounts.map(acc => {
                            const cell = actData[lid]?.[acc.id] || { budget: 0, actual: 0 }
                            rowBudget += cell.budget
                            rowActual += cell.actual
                            const variance = cell.actual - cell.budget
                            return (
                              <Fragment key={acc.id}>
                                <td>
                                  <input
                                    className="input-budget"
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={cell.budget || ""}
                                    onChange={e => updateBudget(act.id, lid, acc.id, Number(e.target.value))}
                                    disabled={!canEdit}
                                    placeholder="0"
                                  />
                                </td>
                                <td style={{ fontSize: 10 }}>{cell.actual.toLocaleString()}</td>
                                <td style={{ fontSize: 10, fontWeight: 600, color: variance < 0 ? "#EF4444" : variance > 0 ? "#10B981" : "#64748B" }}>
                                  {variance === 0 ? "—" : (variance > 0 ? "+" : "") + variance.toLocaleString()}
                                </td>
                              </Fragment>
                            )
                          })}
                          <td style={{ fontWeight: 600 }}>{rowBudget.toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{rowActual.toLocaleString()}</td>
                          <td style={{ fontWeight: 600, color: (rowActual - rowBudget) < 0 ? "#EF4444" : (rowActual - rowBudget) > 0 ? "#10B981" : "#64748B" }}>
                            {(rowActual - rowBudget) === 0 ? "—" : (rowActual - rowBudget > 0 ? "+" : "") + (rowActual - rowBudget).toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Add location row */}
                    <tr>
                      <td>
                        <select
                          style={{ width: "100%", padding: "2px 4px", fontSize: 10 }}
                          value=""
                          onChange={e => { if (e.target.value) addLocationRow(act.id, e.target.value) }}
                        >
                          <option value="">+ Add Location</option>
                          {locations.filter(l => !locationsInAct.includes(l.id.toString())).map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </td>
                      <td colSpan={accounts.length * 3 + 3}></td>
                    </tr>
                    {/* Activity subtotal */}
                    <tr className="total-row">
                      <td style={{ textAlign: "left", paddingLeft: 16 }}>Sub Total</td>
                      {accounts.map(acc => {
                        let sb = 0, sa = 0
                        locationsInAct.forEach(lid => {
                          sb += actData[lid][acc.id]?.budget || 0
                          sa += actData[lid][acc.id]?.actual || 0
                        })
                        const sv = sa - sb
                        return (
                          <Fragment key={acc.id}>
                            <td>{sb.toLocaleString()}</td>
                            <td>{sa.toLocaleString()}</td>
                            <td style={{ color: sv < 0 ? "#EF4444" : sv > 0 ? "#10B981" : "#64748B" }}>
                              {sv === 0 ? "—" : (sv > 0 ? "+" : "") + sv.toLocaleString()}
                            </td>
                          </Fragment>
                        )
                      })}
                      <td>{actTotalBudget.toLocaleString()}</td>
                      <td>{actTotalActual.toLocaleString()}</td>
                      <td style={{ color: (actTotalActual - actTotalBudget) < 0 ? "#EF4444" : (actTotalActual - actTotalBudget) > 0 ? "#10B981" : "#64748B" }}>
                        {(actTotalActual - actTotalBudget) === 0 ? "—" : (actTotalActual - actTotalBudget > 0 ? "+" : "") + (actTotalActual - actTotalBudget).toLocaleString()}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
              {/* Grand total */}
              {displayActivities.length > 0 && (
                <tr className="total-row" style={{ fontSize: 12 }}>
                  <td>GRAND TOTAL</td>
                  {accounts.map(acc => {
                    let gb = 0, ga = 0
                    displayActivities.forEach(act => {
                      const actData = data[act.id] || {}
                      Object.keys(actData).forEach(lid => {
                        gb += actData[lid][acc.id]?.budget || 0
                        ga += actData[lid][acc.id]?.actual || 0
                      })
                    })
                    const gv = ga - gb
                    return (
                      <Fragment key={acc.id}>
                        <td>{gb.toLocaleString()}</td>
                        <td>{ga.toLocaleString()}</td>
                        <td style={{ color: gv < 0 ? "#EF4444" : gv > 0 ? "#10B981" : "#64748B" }}>
                          {gv === 0 ? "—" : (gv > 0 ? "+" : "") + gv.toLocaleString()}
                        </td>
                      </Fragment>
                    )
                  })}
                  <td>
                    {displayActivities.reduce((sum, act) => {
                      const ad = data[act.id] || {}
                      Object.keys(ad).forEach(l => Object.keys(ad[l]).forEach(a => sum += ad[l][a].budget || 0))
                      return sum
                    }, 0).toLocaleString()}
                  </td>
                  <td>
                    {displayActivities.reduce((sum, act) => {
                      const ad = data[act.id] || {}
                      Object.keys(ad).forEach(l => Object.keys(ad[l]).forEach(a => sum += ad[l][a].actual || 0))
                      return sum
                    }, 0).toLocaleString()}
                  </td>
                  <td>—</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {canEdit && selectedProjectId && (businessType !== "ngo" || selectedDonorId) && (
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "💾 Save Budget"}
          </button>
        )}
      </div>
    </div>
  )
}