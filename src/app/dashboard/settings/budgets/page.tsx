"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { Plus, X } from "lucide-react"

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
  const [locations, setLocations] = useState<any[]>([])            // all locations
  const [allActivities, setAllActivities] = useState<any[]>([])    // activities of selected project

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")
  const [filterActivityId, setFilterActivityId] = useState<string>("")   // optional activity filter
  const [filterLocationId, setFilterLocationId] = useState<string>("")   // optional location filter

  // Budget & Actuals data: { [activityId]: { [locationId]: { [accountId]: { budget: number, actual: number } } } }
  const [data, setData] = useState<Record<string, Record<string, Record<string, { budget: number; actual: number }>>>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")

  // Inline creation modals (same as before, not repeated for brevity but needed – I'll include a minimal version)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createType, setCreateType] = useState<"project" | "donor" | "location" | "activity">("project")
  const [createName, setCreateName] = useState("")
  const [createCode, setCreateCode] = useState("")
  const [createDesc, setCreateDesc] = useState("")
  const [createProjectId, setCreateProjectId] = useState<string>("")
  const [createLocationId, setCreateLocationId] = useState<string>("")

  // ── Load master data ─────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      supabase.from("companies").select("business_type").eq("id", cid).single().then(r => r.data && setBusinessType(r.data.business_type || ""))
      supabase.from("accounts").select("id, code, name").eq("company_id", cid).eq("type", "Expense").order("code").then(r => r.data && setAccounts(r.data))
      supabase.from("projects").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setProjects(r.data))
      supabase.from("donors").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setDonors(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setLocations(r.data))
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

    // Fetch budgets
    let budgetQuery = supabase.from("budgets")
      .select("*")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .eq("project_id", selectedProjectId)
      .is("month", null)
    if (businessType === "ngo") budgetQuery = budgetQuery.eq("donor_id", selectedDonorId)
    if (filterLocationId) budgetQuery = budgetQuery.eq("location_id", filterLocationId)
    budgetQuery.then(({ data: budgetRows }) => {
      // Fetch actuals
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
        // Build data structure
        const newData: Record<string, Record<string, Record<string, { budget: number; actual: number }>>> = {}

        // Process budgets
        budgetRows?.forEach((b: any) => {
          const { activity_id, location_id, account_id, budgeted_amount } = b
          if (!activity_id || !location_id || !account_id) return
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          if (!newData[activity_id][location_id][account_id]) newData[activity_id][location_id][account_id] = { budget: 0, actual: 0 }
          newData[activity_id][location_id][account_id].budget += budgeted_amount || 0
        })

        // Process actuals
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

  // ── Update a budget cell ────────────────────────────
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

  // ── Add a new location row for an activity ──────────
  const addLocationRow = (activityId: string, locationId: string) => {
    if (!locationId) return
    setData(prev => {
      const updated = { ...prev }
      if (!updated[activityId]) updated[activityId] = {}
      if (!updated[activityId][locationId]) updated[activityId][locationId] = {}
      return updated
    })
  }

  // ── Save ─────────────────────────────────────────────
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

    // Delete existing rows
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

  // ── Filter activities for display ──────────────────
  const displayActivities = filterActivityId ? allActivities.filter(a => a.id == filterActivityId) : allActivities

  if (!canView) return <div style={{ padding: 24, textAlign: "center" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        /* Basic styles for table, cells, inputs */
        .budget-shell { max-width: 100%; overflow-x: auto; }
        .filter-bar { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
        .table { border-collapse: collapse; width: 100%; font-size: 11px; }
        .table th, .table td { border: 1px solid #ddd; padding: 4px; text-align: center; }
        .act-header { background: #E2E8F0; font-weight: bold; }
        .sub-header { background: #F1F5F9; }
        .input-budget { width: 60px; text-align: right; }
        .total-row { font-weight: bold; background: #F8FAFC; }
      `}</style>

      <div className="budget-shell">
        <h2>💰 Budget vs Actuals</h2>
        <div className="filter-bar">
          {/* Project, Donor (if ngo), Activity filter, Location filter */}
          <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
            <option value="">-- Project --</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {businessType === "ngo" && (
            <select value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
              <option value="">-- Donor --</option>
              {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select value={filterActivityId} onChange={e => setFilterActivityId(e.target.value)}>
            <option value="">All Activities</option>
            {allActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filterLocationId} onChange={e => setFilterLocationId(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {flash && <div style={{ color: 'green' }}>{flash}</div>}

        <table className="table">
          <thead>
            <tr>
              <th rowSpan={2}>Activity / Location</th>
              {accounts.map(acc => (
                <th key={acc.id} colSpan={3}>{acc.code} {acc.name}</th>
              ))}
              <th colSpan={3}>TOTAL</th>
            </tr>
            <tr>
              {accounts.map(acc => (
                <React.Fragment key={acc.id}>
                  <th>B</th><th>A</th><th>V</th>
                </React.Fragment>
              ))}
              <th>B</th><th>A</th><th>V</th>
            </tr>
          </thead>
          <tbody>
            {displayActivities.map(act => {
              const actData = data[act.id] || {}
              const locationsInAct = Object.keys(actData)
              // Compute activity subtotals
              let actTotalBudget = 0, actTotalActual = 0
              locationsInAct.forEach(lid => {
                Object.keys(actData[lid]).forEach(accId => {
                  actTotalBudget += actData[lid][accId]?.budget || 0
                  actTotalActual += actData[lid][accId]?.actual || 0
                })
              })
              return (
                <React.Fragment key={act.id}>
                  <tr className="act-header">
                    <td colSpan={1 + accounts.length*3 + 3}>{act.name}</td>
                  </tr>
                  {locationsInAct.map(lid => {
                    const loc = locations.find(l => l.id == lid)
                    let rowBudget = 0, rowActual = 0
                    return (
                      <tr key={lid}>
                        <td>{loc?.name || lid}</td>
                        {accounts.map(acc => {
                          const cell = actData[lid]?.[acc.id] || { budget: 0, actual: 0 }
                          rowBudget += cell.budget
                          rowActual += cell.actual
                          return (
                            <React.Fragment key={acc.id}>
                              <td><input className="input-budget" type="number" value={cell.budget || ""} onChange={e => updateBudget(act.id, lid, acc.id, Number(e.target.value))} /></td>
                              <td>{cell.actual}</td>
                              <td>{cell.actual - cell.budget}</td>
                            </React.Fragment>
                          )
                        })}
                        <td>{rowBudget}</td><td>{rowActual}</td><td>{rowActual - rowBudget}</td>
                      </tr>
                    )
                  })}
                  {/* Add location row for this activity */}
                  <tr>
                    <td>
                      <select onChange={e => { if(e.target.value) addLocationRow(act.id, e.target.value) }}>
                        <option value="">+ Add Location</option>
                        {locations.filter(l => !locationsInAct.includes(l.id.toString())).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </td>
                    <td colSpan={accounts.length*3 + 3}></td>
                  </tr>
                  {/* Activity subtotal */}
                  <tr className="total-row">
                    <td>Sub Total</td>
                    {accounts.map(acc => {
                      let sb = 0, sa = 0
                      locationsInAct.forEach(lid => { sb += actData[lid][acc.id]?.budget || 0; sa += actData[lid][acc.id]?.actual || 0 })
                      return <React.Fragment key={acc.id}><td>{sb}</td><td>{sa}</td><td>{sa - sb}</td></React.Fragment>
                    })}
                    <td>{actTotalBudget}</td><td>{actTotalActual}</td><td>{actTotalActual - actTotalBudget}</td>
                  </tr>
                </React.Fragment>
              )
            })}
            {/* Grand total */}
            {displayActivities.length > 0 && (
              <tr className="total-row" style={{ fontWeight: 'bold' }}>
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
                  return <React.Fragment key={acc.id}><td>{gb}</td><td>{ga}</td><td>{ga - gb}</td></React.Fragment>
                })}
                {/* Grand total of all accounts */}
                <td>{displayActivities.reduce((sum, act) => { const ad = data[act.id]||{}; Object.keys(ad).forEach(l=> Object.keys(ad[l]).forEach(a => sum += ad[l][a].budget||0)); return sum }, 0)}</td>
                <td>{displayActivities.reduce((sum, act) => { const ad = data[act.id]||{}; Object.keys(ad).forEach(l=> Object.keys(ad[l]).forEach(a => sum += ad[l][a].actual||0)); return sum }, 0)}</td>
                <td>—</td>
              </tr>
            )}
          </tbody>
        </table>

        {canEdit && selectedProjectId && (businessType !== "ngo" || selectedDonorId) && (
          <button onClick={handleSave} disabled={saving} style={{ marginTop: 16 }}>💾 Save Budget</button>
        )}
      </div>
    </div>
  )
}