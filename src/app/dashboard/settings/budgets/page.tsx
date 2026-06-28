"use client"

import { useState, useEffect, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import * as XLSX from "xlsx"
import { Upload, Download, Edit } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
]

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
  const initialActivity = searchParams.get("activity") || ""

  const [companyId, setCompanyId] = useState<string>("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [businessType, setBusinessType] = useState<string>("")

  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [allActivities, setAllActivities] = useState<any[]>([])

  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProject)
  const [selectedDonorId, setSelectedDonorId] = useState<string>(initialDonor)
  const [filterActivityId, setFilterActivityId] = useState<string>(initialActivity)
  const [filterLocationId, setFilterLocationId] = useState<string>("")

  const [viewMode, setViewMode] = useState<"gl" | "month">("gl")
  const [projectDuration, setProjectDuration] = useState<number>(12)

  // ✅ Editable project start/end dates
  const [projectStartDate, setProjectStartDate] = useState<string>("")
  const [projectEndDate, setProjectEndDate] = useState<string>("")

  const [data, setData] = useState<Record<string, Record<string, Record<string, { budget: number; actual: number }>>>>({})
  const [loading, setLoading] = useState(true)

  const [monthlyActuals, setMonthlyActuals] = useState<Record<string, Record<string, Record<number, number>>>>({})
  const [monthBudgetOverrides, setMonthBudgetOverrides] = useState<Record<string, Record<string, Record<number, number | null>>>>({})
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")
  const [budgetImportFile, setBudgetImportFile] = useState<File | null>(null)
  const [importingBudget, setImportingBudget] = useState(false)

  const [editMode, setEditMode] = useState(false)

  // ── 1. Load master data (accounts, projects, donors, locations) ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))

      supabase.from("accounts")
        .select("id, code, name, type")
        .eq("company_id", cid)
        .eq("type", "Asset")
        .gte("code", "1400")
        .lte("code", "1499")
        .order("code")
        .then(r => {
          const fixedAssets = r.data || []
          supabase.from("accounts")
            .select("id, code, name, type")
            .eq("company_id", cid)
            .eq("type", "Expense")
            .order("code")
            .then(r2 => {
              const expenses = r2.data || []
              setAccounts([...fixedAssets, ...expenses].sort((a, b) =>
                a.code.localeCompare(b.code, undefined, { numeric: true })
              ))
            })
        })

      supabase.from("projects")
        .select("id, name, donor_id, start_date, end_date")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("name")
        .then(r => r.data && setProjects(r.data))

      supabase.from("donors").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setDonors(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setLocations(r.data))
    })
  }, [])

  // ── 2. If activity is passed, find its project and set it ──
  useEffect(() => {
    if (!initialActivity || !companyId) return
    supabase.from("activities").select("project_id").eq("id", initialActivity).single()
      .then(({ data }) => {
        if (data?.project_id) {
          setSelectedProjectId(String(data.project_id))
        }
      })
  }, [initialActivity, companyId])

  // ── 3. Activities of selected project – junction table ──
  useEffect(() => {
    if (!companyId || !selectedProjectId) {
      if (!selectedDonorId) setAllActivities([])
      return
    }

    const fetchActivities = async () => {
      const { data: junctionRows } = await supabase
        .from("activity_projects")
        .select("activity_id")
        .eq("project_id", selectedProjectId)

      const junctionIds = junctionRows?.map((j: any) => j.activity_id) || []

      let allActivityIds = [...junctionIds]
      const { data: legacyActivities } = await supabase
        .from("activities")
        .select("id")
        .eq("company_id", companyId)
        .eq("project_id", selectedProjectId)
        .is("deleted_at", null)

      if (legacyActivities) {
        legacyActivities.forEach((a: any) => {
          if (!allActivityIds.includes(a.id)) allActivityIds.push(a.id)
        })
      }

      if (allActivityIds.length === 0) {
        setAllActivities([])
        return
      }

      const { data: activities } = await supabase
        .from("activities")
        .select("id, name")
        .in("id", allActivityIds)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name")

      setAllActivities(activities || [])
    }

    fetchActivities()
  }, [companyId, selectedProjectId])

  // ── 4. Auto‑select donor for the selected project ──
  useEffect(() => {
    if (!selectedProjectId || businessType !== "ngo") return
    if (initialDonor) return

    const project = projects.find(p => p.id == selectedProjectId)
    if (project?.donor_id) {
      setSelectedDonorId(String(project.donor_id))
    } else {
      supabase.from("budgets").select("donor_id")
        .eq("company_id", companyId).eq("project_id", selectedProjectId)
        .is("month", null).is("deleted_at", null)
        .then(({ data: budgetRows }) => {
          if (!budgetRows) return
          const unique = [...new Set(budgetRows.map((b: any) => b.donor_id).filter(Boolean))]
          if (unique.length === 1) setSelectedDonorId(String(unique[0]))
        })
    }
  }, [selectedProjectId, projects, businessType, initialDonor, companyId])

  // ✅ NEW: when project changes, load its dates and calculate duration
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectStartDate("")
      setProjectEndDate("")
      return
    }
    const project = projects.find(p => p.id == selectedProjectId)
    if (!project) return

    setProjectStartDate(project.start_date || "")
    setProjectEndDate(project.end_date || "")

    if (project.start_date) {
      const start = new Date(project.start_date)
      if (isNaN(start.getTime())) return

      let end: Date
      if (project.end_date) {
        end = new Date(project.end_date)
        if (isNaN(end.getTime())) return
      } else {
        end = new Date(fiscalYear, 11, 31) // 31 Dec of selected fiscal year
      }

      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      if (months > 0) setProjectDuration(months)
    }
  }, [selectedProjectId, projects, fiscalYear])

  // ✅ Save project dates when they change
  const saveProjectDates = async (field: "start_date" | "end_date", value: string) => {
    if (!selectedProjectId || !companyId) return
    if (field === "start_date") {
      setProjectStartDate(value)
    } else {
      setProjectEndDate(value)
    }

    await supabase
      .from("projects")
      .update({ [field]: value || null })
      .eq("id", selectedProjectId)
      .eq("company_id", companyId)

    // Refresh the project in local list
    setProjects(prev =>
      prev.map(p => (p.id == selectedProjectId ? { ...p, [field]: value || null } : p))
    )
  }

  // ── 5. Load budgets + actuals (NOW VIA SECURE API) ──
  useEffect(() => {
    if (!companyId) { setData({}); setLoading(false); return }

    const canLoad = businessType !== "ngo" || selectedDonorId || selectedProjectId
    if (!canLoad) { setData({}); setLoading(false); return }

    setLoading(true)

    const params = new URLSearchParams({
      fiscalYear: String(fiscalYear),
      view: viewMode,
      duration: String(projectDuration),
    })
    if (selectedProjectId) params.set("projectId", selectedProjectId)
    if (selectedDonorId) params.set("donorId", selectedDonorId)
    if (filterLocationId) params.set("locationId", filterLocationId)

    fetch(`/api/budgets/matrix?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        if (json.data) {
          // Convert flat rows back into the nested structure used by the UI
          const newData: Record<string, Record<string, Record<string, { budget: number; actual: number }>>> = {}
          json.data.forEach((row: any) => {
            const actId = String(row.activity_id)
            const locId = String(row.location_id)
            const accId = String(row.account_id)
            if (!newData[actId]) newData[actId] = {}
            if (!newData[actId][locId]) newData[actId][locId] = {}
            newData[actId][locId][accId] = {
              budget: row.budget || 0,
              actual: row.actual || 0,
            }
          })
          setData(newData)
        }
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, filterLocationId, businessType, viewMode, projectDuration])

  // ── 6. Monthly actuals (NOW VIA SECURE API – month view returns these directly) ──
  useEffect(() => {
    if (viewMode !== "month" || !companyId) return
    if (businessType === "ngo" && !selectedDonorId && !selectedProjectId) return

    // The month view data is already included in the matrix call above,
    // but we still need to populate monthlyActuals for the UI.
    // Since the API returns month_budget and month_actual per row,
    // we'll build monthlyActuals from the same response.
    const params = new URLSearchParams({
      fiscalYear: String(fiscalYear),
      view: "month",
      duration: String(projectDuration),
    })
    if (selectedProjectId) params.set("projectId", selectedProjectId)
    if (selectedDonorId) params.set("donorId", selectedDonorId)
    if (filterLocationId) params.set("locationId", filterLocationId)

    fetch(`/api/budgets/matrix?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        if (json.data) {
          const monthly: Record<string, Record<string, Record<number, number>>> = {}
          json.data.forEach((row: any) => {
            const actId = String(row.activity_id)
            const locId = String(row.location_id)
            const month = row.month_num
            if (!monthly[actId]) monthly[actId] = {}
            if (!monthly[actId][locId]) monthly[actId][locId] = {}
            monthly[actId][locId][month] = row.month_actual || 0
          })
          setMonthlyActuals(monthly)
        }
      })
  }, [viewMode, companyId, fiscalYear, selectedProjectId, selectedDonorId, filterLocationId, businessType, projectDuration])

  // ── Always show all eligible accounts ──
  const relevantAccounts = accounts

  // ── Helpers ──
  const rowTotalBudget = (actId: string, locId: string) => {
    let total = 0
    relevantAccounts.forEach(acc => {
      const cell = data[actId]?.[locId]?.[String(acc.id)]
      if (cell) total += cell.budget || 0
    })
    return total
  }

  const rowTotalActual = (actId: string, locId: string) => {
    let total = 0
    relevantAccounts.forEach(acc => {
      const cell = data[actId]?.[locId]?.[String(acc.id)]
      if (cell) total += cell.actual || 0
    })
    return total
  }

  const getMonthBudget = (actId: string, locId: string, month: number) => {
    const override = monthBudgetOverrides[actId]?.[locId]?.[month]
    if (override !== null && override !== undefined) return override
    const annual = rowTotalBudget(actId, locId)
    const duration = projectDuration > 0 ? projectDuration : 12
    return Math.round(annual / duration)
  }

  const setMonthBudget = (actId: string, locId: string, month: number, value: number) => {
    setMonthBudgetOverrides(prev => {
      const a = { ...prev }
      if (!a[actId]) a[actId] = {}
      if (!a[actId][locId]) a[actId][locId] = {}
      a[actId][locId] = { ...a[actId][locId], [month]: value }
      return a
    })
  }

  const monthRowTotal = (actId: string, locId: string) => {
    let sum = 0
    for (let m = 1; m <= projectDuration; m++) sum += getMonthBudget(actId, locId, m)
    return sum
  }

  const updateCell = (accountId: string, activityId: string, locationId: string, amount: number) => {
    setData(prev => {
      const updated = { ...prev }
      if (!updated[activityId]) updated[activityId] = {}
      if (!updated[activityId][locationId]) updated[activityId][locationId] = {}
      const existing = updated[activityId][locationId][accountId] || { budget: 0, actual: 0 }
      updated[activityId][locationId] = {
        ...updated[activityId][locationId],
        [accountId]: { ...existing, budget: amount },
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

  // ── Save budgets (NOW VIA SECURE API) ──
  const handleSave = async () => {
    if (!companyId || !canEdit) return
    if (!selectedProjectId && !selectedDonorId) { setFlash("Please select a Project or Donor first."); return }
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
            account_id: parseInt(accountId),
            activity_id: activityId,
            location_id: locationId,
            budgeted_amount: budget,
          })
        }
      }
    }

    try {
      const res = await fetch('/api/budgets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiscalYear,
          projectId: selectedProjectId || null,
          donorId: selectedDonorId || null,
          rows: rowsToInsert,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setFlash("Error: " + (result.error || "Failed"))
        setSaving(false)
        return
      }
      setFlash("Budget saved!")
      setSaving(false)
      setEditMode(false)
      setTimeout(() => setFlash(""), 4000)
    } catch (err: any) {
      setFlash("Error: " + err.message)
      setSaving(false)
    }
  }

  // ── Export (unchanged) ──
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

  // ── Import (unchanged) ──
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
          const { data: act } = await supabase
            .from("activities")
            .select("id, project_id")
            .eq("company_id", companyId)
            .ilike("name", Activity)
            .maybeSingle()

          if (!act) continue

          let isLinked = false
          if (act.project_id == selectedProjectId) {
            isLinked = true
          } else {
            const { data: junction } = await supabase
              .from("activity_projects")
              .select("id")
              .eq("activity_id", act.id)
              .eq("project_id", selectedProjectId)
              .maybeSingle()
            if (junction) isLinked = true
          }

          if (!isLinked) continue

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

  const displayActivities = filterActivityId
    ? allActivities.filter(a => a.id == filterActivityId)
    : allActivities

  let grandBudget = 0, grandActual = 0
  for (const actId of Object.keys(data)) for (const locId of Object.keys(data[actId])) {
    for (const accId of Object.keys(data[actId][locId])) {
      if (relevantAccounts.some(a => String(a.id) === accId)) {
        grandBudget += data[actId][locId][accId].budget || 0
        grandActual += data[actId][locId][accId].actual || 0
      }
    }
  }
  const grandVariance = grandBudget - grandActual

  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .budget-shell { max-width: 100%; overflow-x: auto; }
        .filter-bar { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
        .filter-select {
          padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px;
          background: var(--card); color: var(--text);
        }
        .table { border-collapse: collapse; width: 100%; font-size: 11px; background: var(--card); }
        .table th, .table td { border: 1px solid var(--border); padding: 4px 6px; text-align: center; color: var(--text); }
        .table th { background: var(--card-hover); color: var(--text-muted); }
        .act-header td { background: var(--card-hover); font-weight: 700; text-align: left; padding: 6px; color: var(--text); }
        .sub-header th { background: var(--card-hover); font-weight: 600; font-size: 9px; color: var(--text-muted); }
        .input-budget {
          width: 70px; text-align: right; border: 1px solid var(--border); border-radius: 4px;
          padding: 2px 4px; font-size: 10px; background: var(--bg); color: var(--text);
        }
        .total-row td { font-weight: 700; background: var(--card-hover); color: var(--text); }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: none;
          background: var(--primary); color: var(--primary-text); transition: all 0.15s; white-space: nowrap;
        }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-outline {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; background: transparent;
          border: 1.5px solid var(--border); color: var(--text-muted); transition: all 0.15s; white-space: nowrap;
        }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-sm { padding: 6px 12px; font-size: 12px; }
        h2 { color: var(--text); }
        p { color: var(--text-muted); }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        .message-bar {
          background: var(--card); border: 1px solid var(--border); padding: 10px 14px;
          border-radius: 8px; margin-bottom: 12px; font-size: 13px;
        }
        .message-bar.success { border-color: #065F46; color: #6EE7B7; }
        .message-bar.error { border-color: #EF4444; color: #FCA5A5; }
      `}</style>

      <div className="budget-shell">
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>Budget vs Actuals</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
          {businessType === "ngo"
            ? "Enter budgets per Project, Donor, Activity, and Location"
            : "Enter budgets per Project, Activity, and Location"}
        </p>

        <div className="filter-bar">
          <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
            {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter-select" value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); setFilterActivityId("") }}>
            <option value="">-- Select Project --</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="filter-select" value={filterActivityId} onChange={e => setFilterActivityId(e.target.value)}>
            <option value="">All Activities</option>
            {allActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="filter-select" value={filterLocationId} onChange={e => setFilterLocationId(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="filter-select" value={viewMode} onChange={e => setViewMode(e.target.value as "gl" | "month")}>
            <option value="gl">View by: GL</option>
            <option value="month">View by: Month</option>
          </select>
          {viewMode === "month" && (
            <input
              type="number"
              min={1}
              max={12}
              value={projectDuration}
              onChange={e => setProjectDuration(Number(e.target.value) || 12)}
              className="filter-select"
              style={{ width: 80 }}
              placeholder="Months"
            />
          )}
          <button className="btn-outline btn-sm" onClick={exportExcel}><Download size={14} /> Excel</button>
          <button className="btn-outline btn-sm" onClick={exportPDF}><Download size={14} /> PDF</button>
        </div>

        {/* ✅ Editable project dates */}
        {selectedProjectId && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Start Date:</label>
              <input
                type="date"
                className="filter-select"
                style={{ width: 140 }}
                value={projectStartDate}
                onChange={e => saveProjectDates("start_date", e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>End Date:</label>
              <input
                type="date"
                className="filter-select"
                style={{ width: 140 }}
                value={projectEndDate}
                onChange={e => saveProjectDates("end_date", e.target.value)}
              />
            </div>
            {(projectStartDate || projectEndDate) && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                ({projectDuration} month{projectDuration !== 1 ? "s" : ""})
              </span>
            )}
          </div>
        )}

        {flash && (
          <div className={`message-bar ${flash.startsWith("Error") ? "error" : "success"}`}>
            {flash}
          </div>
        )}

        {(!selectedProjectId && !selectedDonorId) ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
            {businessType === "ngo"
              ? "Please select Project and/or Donor to display the budget matrix."
              : "Please select a Project to display the budget matrix."}
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading budgets & actuals...</div>
        ) : displayActivities.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
            No Activities found for this project. Create them in Settings.
          </div>
        ) : viewMode === "gl" ? (
          /* ───────────────── GL‑wise view ───────────────── */
          relevantAccounts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              No budget accounts found. Add Fixed Asset or Expense accounts to start budgeting.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                {!editMode && (
                  <button className="btn-outline" onClick={() => setEditMode(true)}>
                    <Edit size={14} /> Edit Budget
                  </button>
                )}
              </div>

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
                      relevantAccounts.forEach(acc => {
                        const cell = actData[lid]?.[String(acc.id)]
                        if (cell) { actTotalBudget += cell.budget || 0; actTotalActual += cell.actual || 0 }
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
                              <td style={{ fontWeight: 600, textAlign: "left", paddingLeft: 16, color: "var(--text)" }}>{loc?.name || lid}</td>
                              {relevantAccounts.map(acc => {
                                const cell = actData[lid]?.[String(acc.id)] || { budget: 0, actual: 0 }
                                rowBudget += cell.budget
                                rowActual += cell.actual
                                const variance = cell.budget - cell.actual
                                return (
                                  <Fragment key={acc.id}>
                                    <td>
                                      <input
                                        className="input-budget"
                                        type="number" min="0" step="100"
                                        value={cell.budget || ""}
                                        onChange={e => updateCell(String(acc.id), act.id, lid, Number(e.target.value))}
                                        disabled={!canEdit}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td style={{ fontSize: 10, color: "var(--text)" }}>{cell.actual.toLocaleString()}</td>
                                    <td style={{ fontSize: 10, fontWeight: 600, color: variance < 0 ? "#EF4444" : variance > 0 ? "#10B981" : "var(--text-muted)" }}>
                                      {variance === 0 ? "—" : (variance > 0 ? "+" : "") + variance.toLocaleString()}
                                    </td>
                                  </Fragment>
                                )
                              })}
                              <td style={{ fontWeight: 600, color: "var(--text)" }}>{rowBudget.toLocaleString()}</td>
                              <td style={{ fontWeight: 600, color: "var(--text)" }}>{rowActual.toLocaleString()}</td>
                              <td style={{ fontWeight: 600, color: (rowBudget - rowActual) < 0 ? "#EF4444" : (rowBudget - rowActual) > 0 ? "#10B981" : "var(--text-muted)" }}>
                                {(rowBudget - rowActual) === 0 ? "—" : (rowBudget - rowActual > 0 ? "+" : "") + (rowBudget - rowActual).toLocaleString()}
                              </td>
                            </tr>
                          )
                        })}
                        <tr>
                          <td>
                            <select
                              style={{ width: "100%", padding: "2px 4px", fontSize: 10, background: "var(--bg)", color: "var(--text)", borderColor: "var(--border)" }}
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
                              const cell = actData[lid]?.[String(acc.id)]
                              if (cell) { sb += cell.budget || 0; sa += cell.actual || 0 }
                            })
                            const sv = sb - sa
                            return (
                              <Fragment key={acc.id}>
                                <td>{sb.toLocaleString()}</td>
                                <td>{sa.toLocaleString()}</td>
                                <td style={{ color: sv < 0 ? "#EF4444" : sv > 0 ? "#10B981" : "var(--text-muted)" }}>
                                  {sv === 0 ? "—" : (sv > 0 ? "+" : "") + sv.toLocaleString()}
                                </td>
                              </Fragment>
                            )
                          })}
                          <td>{actTotalBudget.toLocaleString()}</td>
                          <td>{actTotalActual.toLocaleString()}</td>
                          <td style={{ color: (actTotalBudget - actTotalActual) < 0 ? "#EF4444" : (actTotalBudget - actTotalActual) > 0 ? "#10B981" : "var(--text-muted)" }}>
                            {(actTotalBudget - actTotalActual) === 0 ? "—" : (actTotalBudget - actTotalActual > 0 ? "+" : "") + (actTotalBudget - actTotalActual).toLocaleString()}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                  <tr className="total-row" style={{ fontSize: 12 }}>
                    <td>GRAND TOTAL</td>
                    {relevantAccounts.map(acc => {
                      let gb = 0, ga = 0
                      for (const actId of Object.keys(data)) for (const locId of Object.keys(data[actId])) {
                        const cell = data[actId][locId]?.[String(acc.id)]
                        if (cell) { gb += cell.budget || 0; ga += cell.actual || 0 }
                      }
                      const gv = gb - ga
                      return (
                        <Fragment key={acc.id}>
                          <td>{gb.toLocaleString()}</td>
                          <td>{ga.toLocaleString()}</td>
                          <td style={{ color: gv < 0 ? "#EF4444" : gv > 0 ? "#10B981" : "var(--text-muted)" }}>{gv === 0 ? "—" : (gv > 0 ? "+" : "") + gv.toLocaleString()}</td>
                        </Fragment>
                      )
                    })}
                    <td>{grandBudget.toLocaleString()}</td>
                    <td>{grandActual.toLocaleString()}</td>
                    <td style={{ color: grandVariance < 0 ? "#EF4444" : grandVariance > 0 ? "#10B981" : "var(--text-muted)" }}>{grandVariance === 0 ? "—" : (grandVariance > 0 ? "+" : "") + grandVariance.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {canEdit && (
                  <>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Budget"}</button>
                    <button className="btn-primary" onClick={() => document.getElementById('budget-file-input')?.click()}><Upload size={14} /> Import Budget</button>
                    <input id="budget-file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setBudgetImportFile(e.target.files?.[0] || null)} />
                    {budgetImportFile && <button className="btn-primary" onClick={handleBudgetImport} disabled={importingBudget}>Start Import</button>}
                  </>
                )}
              </div>
            </>
          )
        ) : (
          /* ───────────────── Month‑wise view ───────────────── */
          relevantAccounts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              No budget accounts found. Add Fixed Asset or Expense accounts to start budgeting.
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: 120 }}>Activity / Location</th>
                    {MONTHS.slice(0, projectDuration).map(m => (
                      <th key={m} colSpan={3} style={{ fontSize: 10 }}>{m}</th>
                    ))}
                    <th colSpan={3} style={{ fontSize: 10 }}>TOTAL</th>
                  </tr>
                  <tr className="sub-header">
                    {MONTHS.slice(0, projectDuration).map(m => (
                      <Fragment key={m}>
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
                    return (
                      <Fragment key={act.id}>
                        <tr className="act-header"><td colSpan={1 + projectDuration * 3 + 3}>{act.name}</td></tr>
                        {locationsInAct.map(lid => {
                          const loc = locations.find(l => l.id == lid)
                          return (
                            <tr key={lid}>
                              <td style={{ fontWeight: 600, textAlign: "left", paddingLeft: 16, color: "var(--text)" }}>{loc?.name || lid}</td>
                              {MONTHS.slice(0, projectDuration).map((_, idx) => {
                                const monthNum = idx + 1
                                const budget = getMonthBudget(act.id, lid, monthNum)
                                const actual = monthlyActuals[act.id]?.[lid]?.[monthNum] || 0
                                const variance = budget - actual
                                return (
                                  <Fragment key={monthNum}>
                                    <td>
                                      <input
                                        className="input-budget"
                                        type="number" min="0" step="100"
                                        value={budget || ""}
                                        onChange={e => setMonthBudget(act.id, lid, monthNum, Number(e.target.value))}
                                        disabled={!canEdit}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td style={{ fontSize: 10, color: "var(--text)" }}>{actual.toLocaleString()}</td>
                                    <td style={{ fontSize: 10, fontWeight: 600, color: variance < 0 ? "#EF4444" : variance > 0 ? "#10B981" : "var(--text-muted)" }}>
                                      {variance === 0 ? "—" : (variance > 0 ? "+" : "") + variance.toLocaleString()}
                                    </td>
                                  </Fragment>
                                )
                              })}
                              <td style={{ fontWeight: 600, color: "var(--text)" }}>{monthRowTotal(act.id, lid).toLocaleString()}</td>
                              <td style={{ fontWeight: 600, color: "var(--text)" }}>{rowTotalActual(act.id, lid).toLocaleString()}</td>
                              <td style={{ fontWeight: 600, color: (monthRowTotal(act.id, lid) - rowTotalActual(act.id, lid)) < 0 ? "#EF4444" : (monthRowTotal(act.id, lid) - rowTotalActual(act.id, lid)) > 0 ? "#10B981" : "var(--text-muted)" }}>
                                {(monthRowTotal(act.id, lid) - rowTotalActual(act.id, lid)) === 0 ? "—" : (monthRowTotal(act.id, lid) - rowTotalActual(act.id, lid) > 0 ? "+" : "") + (monthRowTotal(act.id, lid) - rowTotalActual(act.id, lid)).toLocaleString()}
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {canEdit && (
                  <>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Budget"}</button>
                    <button className="btn-primary" onClick={() => document.getElementById('budget-file-input')?.click()}><Upload size={14} /> Import Budget</button>
                    <input id="budget-file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setBudgetImportFile(e.target.files?.[0] || null)} />
                    {budgetImportFile && <button className="btn-primary" onClick={handleBudgetImport} disabled={importingBudget}>Start Import</button>}
                  </>
                )}
              </div>
            </>
          )
        )}
      </div>
    </div>
  )
}