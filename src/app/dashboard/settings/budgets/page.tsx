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

  // Master data lists
  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [allActivities, setAllActivities] = useState<any[]>([])

  // Context filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")

  // Derived column list
  const [columnActivities, setColumnActivities] = useState<any[]>([])

  // Budget matrix
  const [budgetMatrix, setBudgetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [actualsMatrix, setActualsMatrix] = useState<Record<string, Record<string, number>>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")

  // ── Inline creation states ────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createType, setCreateType] = useState<"project" | "donor" | "location" | "activity">("project")
  const [createName, setCreateName] = useState("")
  const [createCode, setCreateCode] = useState("")          // for donors
  const [createDesc, setCreateDesc] = useState("")          // for projects
  const [createProjectId, setCreateProjectId] = useState<string>("") // for activities
  const [createLocationId, setCreateLocationId] = useState<string>("") // for activities

  const openCreateModal = (type: "project" | "donor" | "location" | "activity") => {
    setCreateType(type)
    setCreateName("")
    setCreateCode("")
    setCreateDesc("")
    setCreateProjectId(type === "activity" ? selectedProjectId : "")
    setCreateLocationId(type === "activity" ? selectedLocationId : "")
    setShowCreateModal(true)
  }

  const handleCreate = async () => {
    if (!companyId || !createName.trim()) return
    const table = createType === "project" ? "projects" : createType === "donor" ? "donors" : createType === "location" ? "locations" : "activities"
    const payload: any = { company_id: companyId, name: createName.trim(), is_active: true }
    if (createType === "project") payload.description = createDesc.trim()
    if (createType === "donor") payload.code = createCode.trim() || null
    if (createType === "activity") {
      if (!createProjectId || !createLocationId) { setFlash("⚠️ Project and Location required"); return }
      payload.project_id = createProjectId
      payload.location_id = createLocationId
    }

    const { data, error } = await supabase.from(table).insert(payload).select(createType === "activity" ? "id, name, project_id, location_id, projects(name), locations(name)" : "*").single()

    if (error) { setFlash("Error: " + error.message); return }
    setFlash("✅ Created!")

    // Refresh the corresponding list
    if (createType === "project") {
      const fresh = await supabase.from("projects").select("id, name").eq("company_id", companyId).order("name")
      if (fresh.data) setProjects(fresh.data)
      setSelectedProjectId(data.id)
    } else if (createType === "donor") {
      const fresh = await supabase.from("donors").select("id, name").eq("company_id", companyId).order("name")
      if (fresh.data) setDonors(fresh.data)
      setSelectedDonorId(data.id)
    } else if (createType === "location") {
      const fresh = await supabase.from("locations").select("id, name").eq("company_id", companyId).order("name")
      if (fresh.data) setLocations(fresh.data)
      setSelectedLocationId(data.id)
    } else if (createType === "activity") {
      // Reload all activities to include the new one
      const fresh = await supabase.from("activities")
        .select("id, name, project_id, location_id, projects(name), locations(name)")
        .eq("company_id", companyId).order("name")
      if (fresh.data) {
        const flat = fresh.data.map((a: any) => ({
          ...a,
          project_name: a.projects?.name,
          location_name: a.locations?.name,
        }))
        setAllActivities(flat)
      }
      // Auto-select the project/location used for the activity if not set
      if (!selectedProjectId) setSelectedProjectId(createProjectId)
      if (!selectedLocationId) setSelectedLocationId(createLocationId)
    }
    setShowCreateModal(false)
    setTimeout(() => setFlash(""), 3000)
  }

  // ── Load master data & business type ──────────────
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

      supabase.from("activities")
        .select("id, name, project_id, location_id, projects(name), locations(name)")
        .eq("company_id", cid).order("name")
        .then(r => {
          if (r.data) {
            const flat = r.data.map((a: any) => ({ ...a, project_name: a.projects?.name, location_name: a.locations?.name }))
            setAllActivities(flat)
          }
        })
    })
  }, [])

  // Filter activities
  useEffect(() => {
    let filtered = allActivities
    if (selectedProjectId) filtered = filtered.filter(a => a.project_id == selectedProjectId)
    if (selectedLocationId) filtered = filtered.filter(a => a.location_id == selectedLocationId)
    setColumnActivities(filtered)
  }, [selectedProjectId, selectedLocationId, allActivities])

  // Load budgets & actuals (same as before)
  useEffect(() => {
    if (!companyId || !selectedProjectId) { setBudgetMatrix({}); setActualsMatrix({}); setLoading(false); return }
    if (businessType === "ngo" && !selectedDonorId) { setBudgetMatrix({}); setActualsMatrix({}); setLoading(false); return }
    setLoading(true)

    let budgetQuery = supabase.from("budgets").select("*").eq("company_id", companyId).eq("fiscal_year", fiscalYear).eq("project_id", selectedProjectId).is("month", null)
    if (businessType === "ngo") budgetQuery = budgetQuery.eq("donor_id", selectedDonorId)
    if (selectedLocationId) budgetQuery = budgetQuery.eq("location_id", selectedLocationId)
    budgetQuery.then(({ data }) => {
      const bMatrix: Record<string, Record<string, number>> = {}
      data?.forEach((b: any) => {
        if (!b.account_id || !b.activity_id) return
        if (!bMatrix[b.account_id]) bMatrix[b.account_id] = {}
        bMatrix[b.account_id][b.activity_id] = b.budgeted_amount || 0
      })
      setBudgetMatrix(bMatrix)
    })

    const startDate = `${fiscalYear}-01-01`
    const endDate = `${fiscalYear}-12-31`
    let actualQuery = supabase.from("journal_lines").select("account_id, activity_id, debit, credit, journal_entries!inner(date)").eq("company_id", companyId).eq("project_id", selectedProjectId).gte("journal_entries.date", startDate).lte("journal_entries.date", endDate)
    if (businessType === "ngo") actualQuery = actualQuery.eq("donor_id", selectedDonorId)
    if (selectedLocationId) actualQuery = actualQuery.eq("location_id", selectedLocationId)
    actualQuery.then(({ data }) => {
      const aMatrix: Record<string, Record<string, number>> = {}
      data?.forEach((line: any) => {
        const acc = line.account_id
        const act = line.activity_id
        if (!act || !acc) return
        const net = (line.debit || 0) - (line.credit || 0)
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
    if (!selectedProjectId) { setFlash("⚠️ Please select a Project first."); return }
    if (businessType === "ngo" && !selectedDonorId) { setFlash("⚠️ Please select a Donor for NGO budgeting."); return }
    setSaving(true); setFlash("")

    const rowsToInsert: any[] = []
    for (const accountId of Object.keys(budgetMatrix)) {
      for (const activityId of Object.keys(budgetMatrix[accountId])) {
        const amount = budgetMatrix[accountId][activityId]
        if (amount <= 0) continue
        rowsToInsert.push({
          company_id: companyId, account_id: parseInt(accountId), project_id: selectedProjectId,
          activity_id: activityId, donor_id: (businessType === "ngo") ? selectedDonorId : null,
          location_id: selectedLocationId || null, fiscal_year: fiscalYear, month: null, budgeted_amount: amount,
        })
      }
    }

    let deleteQuery = supabase.from("budgets").delete().eq("company_id", companyId).eq("project_id", selectedProjectId).eq("fiscal_year", fiscalYear).is("month", null)
    if (businessType === "ngo") deleteQuery = deleteQuery.eq("donor_id", selectedDonorId)
    if (selectedLocationId) deleteQuery = deleteQuery.eq("location_id", selectedLocationId)
    await deleteQuery

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from("budgets").insert(rowsToInsert)
      if (error) { setFlash("❌ Error: " + error.message); setSaving(false); return }
    }
    setFlash("✅ Budget saved!"); setSaving(false); setTimeout(() => setFlash(""), 4000)
  }

  const columnTotals: Record<string, {budget: number; actual: number}> = {}
  let grandTotalBudget = 0, grandTotalActual = 0
  columnActivities.forEach(act => {
    let colBudget = 0, colActual = 0
    accounts.forEach(acc => {
      colBudget += (budgetMatrix[acc.id] && budgetMatrix[acc.id][act.id]) || 0
      colActual += (actualsMatrix[acc.id] && actualsMatrix[acc.id][act.id]) || 0
    })
    columnTotals[act.id] = { budget: colBudget, actual: colActual }
    grandTotalBudget += colBudget
    grandTotalActual += colActual
  })

  if (!canView) return <div style={{ padding: 24, textAlign: "center" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .budget-shell { max-width: 100%; overflow-x: auto; }
        .budget-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .budget-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
        .filter-bar { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
        .filter-select { padding: 8px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px; background: white; }
        .inline-btn { background: none; border: 1px solid #E2E8F0; border-radius: 6px; padding: 6px 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #64748B; }
        .inline-btn:hover { background: #F1F5F9; color: #1E3A8A; }
        .matrix-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: auto; min-width: 800px; margin-top: 10px; }
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
        .total-cell { font-weight: 700; background: #F8FAFC; }
        .btn-primary { padding: 10px 20px; background: #1D4ED8; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: white; border-radius: 14px; width: 100%; max-width: 450px; max-height: 90vh; overflow-y: auto; }
        .pr-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
        .pr-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .pr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .pr-field-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .pr-field-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .pr-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
      `}</style>

      <div className="budget-shell">
        <div className="budget-title">💰 Budget vs Actuals</div>
        <div className="budget-subtitle">
          {businessType === "ngo" ? "Enter budgets per Project, Donor, and Activity (optional Location)" : "Enter budgets per Project and Activity (optional Location)"}
        </div>

        <div className="filter-bar">
          <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <select className="filter-select" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
              <option value="">-- Select Project --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="inline-btn" onClick={() => openCreateModal("project")} title="Add Project"><Plus size={14} /></button>
          </div>

          {businessType === "ngo" && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <select className="filter-select" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
                <option value="">-- Select Donor --</option>
                {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="inline-btn" onClick={() => openCreateModal("donor")} title="Add Donor"><Plus size={14} /></button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <select className="filter-select" value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)}>
              <option value="">-- All Locations (optional) --</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="inline-btn" onClick={() => openCreateModal("location")} title="Add Location"><Plus size={14} /></button>
          </div>

          {/* Quick add Activity */}
          <button className="inline-btn" onClick={() => openCreateModal("activity")} title="Add Activity" style={{ padding: "8px 12px", fontWeight: 600 }}>
            <Plus size={14} /> Activity
          </button>
        </div>

        {flash && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {flash}
          </div>
        )}

        {/* Budget matrix unchanged */}
        {/* ... (rest of matrix JSX identical to previously provided) ... */}

        {canEdit && selectedProjectId && (businessType !== "ngo" || selectedDonorId) && (
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 16 }}>
            {saving ? "Saving..." : "💾 Save Budget"}
          </button>
        )}
      </div>

      {/* Inline Creation Modal */}
      {showCreateModal && (
        <div className="pr-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-title">➕ Add {createType}</div>
              <button className="inline-btn" onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>
            <div className="pr-modal-body">
              <div>
                <label className="pr-field-label">Name *</label>
                <input className="pr-field-input" value={createName} onChange={e => setCreateName(e.target.value)} placeholder={`Enter ${createType} name`} />
              </div>
              {createType === "project" && (
                <div>
                  <label className="pr-field-label">Description (optional)</label>
                  <input className="pr-field-input" value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Brief description" />
                </div>
              )}
              {createType === "donor" && (
                <div>
                  <label className="pr-field-label">Code (optional)</label>
                  <input className="pr-field-input" value={createCode} onChange={e => setCreateCode(e.target.value)} placeholder="e.g., UNICEF" />
                </div>
              )}
              {createType === "activity" && (
                <>
                  <div>
                    <label className="pr-field-label">Project *</label>
                    <select className="pr-field-input" value={createProjectId} onChange={e => setCreateProjectId(e.target.value)}>
                      <option value="">-- Select --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="pr-field-label">Location *</label>
                    <select className="pr-field-input" value={createLocationId} onChange={e => setCreateLocationId(e.target.value)}>
                      <option value="">-- Select --</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="pr-modal-footer">
              <button className="btn-primary" style={{ background: "#E2E8F0", color: "#475569" }} onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={!createName.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}