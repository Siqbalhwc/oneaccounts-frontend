"use client"

import { useState, useEffect, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import * as XLSX from "xlsx"
import { Upload, Download } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function BudgetsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const searchParams = useSearchParams()
  const initialProject = searchParams.get("project") || ""
  const initialDonor = searchParams.get("donor") || ""

  const [companyId, setCompanyId] = useState<string>("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [businessType, setBusinessType] = useState<string>("")

  // Master data – both Expense and Asset accounts
  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [allActivities, setAllActivities] = useState<any[]>([])

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProject)
  const [selectedDonorId, setSelectedDonorId] = useState<string>(initialDonor)
  const [filterActivityId, setFilterActivityId] = useState<string>("")
  const [filterLocationId, setFilterLocationId] = useState<string>("")

  // Data
  const [data, setData] = useState<Record<string, Record<string, Record<string, { budget: number; actual: number }>>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")

  // Budget import
  const [budgetImportFile, setBudgetImportFile] = useState<File | null>(null)
  const [importingBudget, setImportingBudget] = useState(false)

  // ── 1. Load master data (Expense + Asset accounts) ──────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))
      supabase.from("accounts")
        .select("id, code, name, type")
        .eq("company_id", cid)
        .in("type", ["Expense", "Asset"])
        .order("code")
        .then(r => r.data && setAccounts(r.data))
      supabase.from("projects").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("donors").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setDonors(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setLocations(r.data))
    })
  }, [])

  // ── 2. Activities of selected project ────────────────────────────────────
  useEffect(() => {
    if (!companyId || !selectedProjectId) { setAllActivities([]); return }
    supabase.from("activities")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .is("deleted_at", null)
      .order("name")
      .then(r => r.data && setAllActivities(r.data))
  }, [companyId, selectedProjectId])

  // ── 2b. Auto‑select donor if only one donor has budgets for the project ──
  useEffect(() => {
    if (!companyId || !selectedProjectId || businessType !== "ngo") return
    if (initialDonor) return
    supabase.from("budgets")
      .select("donor_id")
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .is("month", null)
      .is("deleted_at", null)
      .then(({ data: budgetRows }) => {
        if (!budgetRows) return
        const uniqueDonorIds = [...new Set(budgetRows.map((b: any) => b.donor_id).filter(Boolean))]
        if (uniqueDonorIds.length === 1) {
          setSelectedDonorId(String(uniqueDonorIds[0]))
        }
      })
  }, [companyId, selectedProjectId, businessType, initialDonor])

  // ── 3. Load budgets + actuals (actual = debit - credit) ─────────────────
  useEffect(() => {
    if (!companyId || !selectedProjectId) { setData({}); setLoading(false); return }
    if (businessType === "ngo" && !selectedDonorId) { setData({}); setLoading(false); return }
    setLoading(true)

    let budgetQuery = supabase.from("budgets")
      .select("account_id, activity_id, location_id, donor_id, budgeted_amount")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .eq("project_id", selectedProjectId)
      .is("month", null)
      .is("deleted_at", null)
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

        // Initialize from budget rows
        budgetRows?.forEach((b: any) => {
          const { account_id, activity_id, location_id, budgeted_amount } = b
          if (!activity_id || !location_id || !account_id) return
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          newData[activity_id][location_id][account_id] = { budget: budgeted_amount || 0, actual: 0 }
        })

        // Add actuals: net amount = debit - credit (returns reduce spending)
        actualRows?.forEach((line: any) => {
          const { account_id, activity_id, location_id, debit, credit } = line
          if (!activity_id || !location_id || !account_id) return
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          if (!newData[activity_id][location_id][account_id]) {
            newData[activity_id][location_id][account_id] = { budget: 0, actual: 0 }
          }
          newData[activity_id][location_id][account_id].actual += (debit || 0) - (credit || 0)
        })

        setData(newData)
        setLoading(false)
      })
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, filterLocationId, businessType])

  // ── Determine which accounts actually appear (budget > 0 or actual != 0) ─
  const usedAccountIds = new Set<string>()
  for (const actId of Object.keys(data)) {
    for (const locId of Object.keys(data[actId])) {
      for (const accId of Object.keys(data[actId][locId])) {
        const cell = data[actId][locId][accId]
        if (cell.budget > 0 || cell.actual !== 0) usedAccountIds.add(accId)
      }
    }
  }
  const relevantAccounts = accounts.filter(a => usedAccountIds.has(String(a.id)))

  // ── Helper: update a budget cell ────────────────────────────────────────
  const updateCell = (accountId: string, activityId: string, locationId: string, amount: number) => {
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

  // ── Save budgets ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId || !canEdit) return
    if (!selectedProjectId) { setFlash("Please select a Project first."); return }
    if (businessType === "ngo" && !selectedDonorId) { setFlash("Please select a Donor for NGO budgeting."); return }
    setSaving(true); setFlash("")

    const uniqueKeys = new Set<string>()
    const rowsToInsert: any[] = []
    for (const activityId of Object.keys(data)) {
      for (const locationId of Object.keys(data[activityId])) {
        for (const accountId of Object.keys(data[activityId][locationId])) {
          const budget = data[activityId][locationId][accountId].budget
          if (budget <= 0) continue
          const key = `${accountId}|${activityId}|${locationId}|${selectedDonorId || 'no-donor'}|${fiscalYear}`
          if (uniqueKeys.has(key)) continue
          uniqueKeys.add(key)
          rowsToInsert.push({
            company_id: companyId,
            account_id: parseInt(accountId),
            project_id: selectedProjectId,
            activity_id: activityId,
            donor_id: (businessType === "ngo") ? selectedDonorId : null,
            location_id: locationId,
            fiscal_year: fiscalYear,
            month: null,
            budgeted_amount: budget,
          })
        }
      }
    }

    let deleteQuery = supabase
      .from("budgets")
      .delete()
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)

    if (businessType === "ngo") {
      deleteQuery = deleteQuery.eq("donor_id", selectedDonorId)
    }
    await deleteQuery

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from("budgets").insert(rowsToInsert)
      if (error) {
        setFlash("Error: " + error.message)
        setSaving(false)
        return
      }
    }

    setFlash("Budget saved!")
    setSaving(false)
    setTimeout(() => setFlash(""), 4000)
  }

  // ── Export functions (only relevant accounts) ──────────────────────────
  const exportExcel = () => {
    const rows: any[] = []
    for (const actId of Object.keys(data)) {
      for (const locId of Object.keys(data[actId])) {
        const actName = allActivities.find(a => a.id == actId)?.name || actId
        const locName = locations.find(l => l.id == locId)?.name || locId
        const row: any = { "Activity / Location": `${actName} - ${locName}` }
        let rowBudget = 0, rowActual = 0
        relevantAccounts.forEach(acc => {
          const cell = data[actId][locId]?.[acc.id] || { budget: 0, actual: 0 }
          row[`${acc.code} Budget`] = cell.budget
          row[`${acc.code} Actual`] = cell.actual
          row[`${acc.code} Var`] = cell.budget - cell.actual
          rowBudget += cell.budget
          rowActual += cell.actual
        })
        row["Total Budget"] = rowBudget
        row["Total Actual"] = rowActual
        row["Total Var"] = rowBudget - rowActual
        rows.push(row)
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Budget vs Actual")
    XLSX.writeFile(wb, `budget_vs_actual_${fiscalYear}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(14)
    doc.text("Budget vs Actual Report", 14, 20)
    const tableColumns = ["Activity / Location", ...relevantAccounts.map(acc => `${acc.code} Budget`), ...relevantAccounts.map(acc => `${acc.code} Actual`), ...relevantAccounts.map(acc => `${acc.code} Var`), "Total Budget", "Total Actual", "Total Var"]

    const tableData: any[] = []
    for (const actId of Object.keys(data)) {
      for (const locId of Object.keys(data[actId])) {
        const actName = allActivities.find(a => a.id == actId)?.name || actId
        const locName = locations.find(l => l.id == locId)?.name || locId
        const row: any = { "Activity / Location": `${actName} - ${locName}` }
        let rowBudget = 0, rowActual = 0
        relevantAccounts.forEach(acc => {
          const cell = data[actId][locId]?.[acc.id] || { budget: 0, actual: 0 }
          row[`${acc.code} Budget`] = cell.budget
          row[`${acc.code} Actual`] = cell.actual
          row[`${acc.code} Var`] = cell.budget - cell.actual
          rowBudget += cell.budget
          rowActual += cell.actual
        })
        row["Total Budget"] = rowBudget
        row["Total Actual"] = rowActual
        row["Total Var"] = rowBudget - rowActual
        tableData.push(row)
      }
    }

    autoTable(doc, { head: [tableColumns], body: tableData.map(row => tableColumns.map(col => row[col] || "")), startY: 35, styles: { fontSize: 7 } })
    doc.save(`budget_vs_actual_${fiscalYear}.pdf`)
  }

  const handleBudgetImport = async () => {
    if (!budgetImportFile || !selectedProjectId || (businessType === "ngo" && !selectedDonorId)) {
      setFlash("Please select a project and donor (if NGO) before importing.")
      return
    }
    setImportingBudget(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const data = e.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet)
      let inserted = 0
      for (const row of rows as any[]) {
        const { Activity, Location, AccountCode, BudgetAmount } = row
        if (Activity && Location && AccountCode && BudgetAmount) {
          const { data: act } = await supabase.from("activities").select("id").eq("company_id", companyId).eq("project_id", selectedProjectId).ilike("name", Activity).maybeSingle()
          const { data: loc } = await supabase.from("locations").select("id").eq("company_id", companyId).ilike("name", Location).maybeSingle()
          const { data: acc } = await supabase.from("accounts").select("id").eq("company_id", companyId).eq("code", AccountCode).single()
          if (act && loc && acc) {
            await supabase.from("budgets").upsert({
              company_id: companyId,
              account_id: acc.id,
              project_id: selectedProjectId,
              activity_id: act.id,
              location_id: loc.id,
              donor_id: businessType === "ngo" ? selectedDonorId : null,
              fiscal_year: fiscalYear,
              month: null,
              budgeted_amount: parseFloat(BudgetAmount)
            }, { onConflict: "company_id,account_id,project_id,activity_id,location_id,donor_id,fiscal_year,month" })
            inserted++
          }
        }
      }
      setFlash(`Imported ${inserted} budget rows!`)
      setImportingBudget(false)
      setBudgetImportFile(null)
      window.location.reload()
    }
    reader.readAsBinaryString(budgetImportFile)
  }

  const displayActivities = filterActivityId ? allActivities.filter(a => a.id == filterActivityId) : allActivities

  // ── Compute overall totals ─────────────────────────────────────────────
  let grandBudget = 0, grandActual = 0
  for (const actId of Object.keys(data)) {
    for (const locId of Object.keys(data[actId])) {
      for (const accId of Object.keys(data[actId][locId])) {
        grandBudget += data[actId][locId][accId].budget || 0
        grandActual += data[actId][locId][accId].actual || 0
      }
    }
  }
  const grandVariance = grandBudget - grandActual

  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
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
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B" }}>Budget vs Actuals</h2>
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
          <button className="btn-primary" style={{ margin: 0, padding: "6px 12px", background: "#059669" }} onClick={exportExcel}>
            <Download size={14} /> Excel
          </button>
          <button className="btn-primary" style={{ margin: 0, padding: "6px 12px", background: "#dc2626" }} onClick={exportPDF}>
            <Download size={14} /> PDF
          </button>
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
          <>
            <table className="table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: 120 }}>Activity / Location</th>
                  {relevantAccounts.map(acc => (
                    <th key={acc.id} colSpan={3} style={{ fontSize: 10 }}>{acc.code}<br/>{acc.name}</th>
                  ))}
                  <th colSpan={3} style={{ fontSize: 10 }}>TOTAL</th>
                </tr>
                <tr className="sub-header">
                  {relevantAccounts.map(acc => (
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
                        <td colSpan={1 + relevantAccounts.length * 3 + 3}>{act.name}</td>
                      </tr>
                      {locationsInAct.map(lid => {
                        const loc = locations.find(l => l.id == lid)
                        let rowBudget = 0, rowActual = 0
                        return (
                          <tr key={lid}>
                            <td style={{ fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>{loc?.name || lid}</td>
                            {relevantAccounts.map(acc => {
                              const cell = actData[lid]?.[acc.id] || { budget: 0, actual: 0 }
                              rowBudget += cell.budget
                              rowActual += cell.actual
                              const variance = cell.budget - cell.actual
                              return (
                                <Fragment key={acc.id}>
                                  <td>
                                    <input
                                      className="input-budget"
                                      type="number"
                                      min="0"
                                      step="100"
                                      value={cell.budget || ""}
                                      onChange={e => updateCell(acc.id, act.id, lid, Number(e.target.value))}
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
                            <td style={{ fontWeight: 600, color: (rowBudget - rowActual) < 0 ? "#EF4444" : (rowBudget - rowActual) > 0 ? "#10B981" : "#64748B" }}>
                              {(rowBudget - rowActual) === 0 ? "—" : (rowBudget - rowActual > 0 ? "+" : "") + (rowBudget - rowActual).toLocaleString()}
                            </td>
                          </tr>
                        )
                      })}
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
                        <td colSpan={relevantAccounts.length * 3 + 3}></td>
                      </tr>
                      <tr className="total-row">
                        <td style={{ textAlign: "left", paddingLeft: 16 }}>Sub Total</td>
                        {relevantAccounts.map(acc => {
                          let sb = 0, sa = 0
                          locationsInAct.forEach(lid => {
                            sb += actData[lid][acc.id]?.budget || 0
                            sa += actData[lid][acc.id]?.actual || 0
                          })
                          const sv = sb - sa
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
                        <td style={{ color: (actTotalBudget - actTotalActual) < 0 ? "#EF4444" : (actTotalBudget - actTotalActual) > 0 ? "#10B981" : "#64748B" }}>
                          {(actTotalBudget - actTotalActual) === 0 ? "—" : (actTotalBudget - actTotalActual > 0 ? "+" : "") + (actTotalBudget - actTotalActual).toLocaleString()}
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
                {/* Grand total */}
                <tr className="total-row" style={{ fontSize: 12 }}>
                  <td>GRAND TOTAL</td>
                  {relevantAccounts.map(acc => {
                    let gb = 0, ga = 0
                    for (const actId of Object.keys(data)) {
                      for (const locId of Object.keys(data[actId])) {
                        const cell = data[actId][locId][acc.id]
                        if (cell) {
                          gb += cell.budget || 0
                          ga += cell.actual || 0
                        }
                      }
                    }
                    const gv = gb - ga
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
                  <td>{grandBudget.toLocaleString()}</td>
                  <td>{grandActual.toLocaleString()}</td>
                  <td style={{ color: grandVariance < 0 ? "#EF4444" : grandVariance > 0 ? "#10B981" : "#64748B" }}>
                    {grandVariance === 0 ? "—" : (grandVariance > 0 ? "+" : "") + grandVariance.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {canEdit && (
                <>
                  <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Budget"}
                  </button>
                  <button className="btn-primary" style={{ background: '#059669' }} onClick={() => document.getElementById('budget-file-input')?.click()}>
                    <Upload size={14} /> Import Budget
                  </button>
                  <input id="budget-file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setBudgetImportFile(e.target.files?.[0] || null)} />
                  {budgetImportFile && (
                    <button className="btn-primary" style={{ background: '#059669' }} onClick={handleBudgetImport} disabled={importingBudget}>Start Import</button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}