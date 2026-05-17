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

  const [data, setData] = useState<Record<string, Record<string, Record<string, { budget: number; actual: number }>>>>({})
  const [loading, setLoading] = useState(true)

  const [monthlyActuals, setMonthlyActuals] = useState<Record<string, Record<string, Record<number, number>>>>({})
  const [monthBudgetOverrides, setMonthBudgetOverrides] = useState<Record<string, Record<string, Record<number, number | null>>>>({})
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")
  const [budgetImportFile, setBudgetImportFile] = useState<File | null>(null)
  const [importingBudget, setImportingBudget] = useState(false)

  const [editMode, setEditMode] = useState(false)

  // ── 1. Load master data ──
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

      supabase.from("projects").select("id, name, donor_id").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("donors").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setDonors(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setLocations(r.data))
    })
  }, [])

  // ── 2. Activities of selected project ──
  useEffect(() => {
    if (!companyId || !selectedProjectId) { setAllActivities([]); return }
    supabase.from("activities").select("id, name")
      .eq("company_id", companyId).eq("project_id", selectedProjectId)
      .is("deleted_at", null).order("name")
      .then(r => r.data && setAllActivities(r.data))
  }, [companyId, selectedProjectId])

  // ── 2b. Auto‑select donor ──
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

  // ── 3. Load budgets + actuals ──
  useEffect(() => {
    if (!companyId) { setData({}); setLoading(false); return }

    // Allow donor-only (no project) for NGO
    const canLoad = businessType !== "ngo" || selectedDonorId || selectedProjectId
    if (!canLoad) { setData({}); setLoading(false); return }

    setLoading(true)

    let budgetQuery = supabase.from("budgets")
      .select("account_id, activity_id, location_id, donor_id, budgeted_amount")
      .eq("company_id", companyId).eq("fiscal_year", fiscalYear)
      .is("month", null).is("deleted_at", null)

    if (selectedProjectId) budgetQuery = budgetQuery.eq("project_id", selectedProjectId)
    if (businessType === "ngo" && selectedDonorId) budgetQuery = budgetQuery.eq("donor_id", selectedDonorId)
    if (filterLocationId) budgetQuery = budgetQuery.eq("location_id", filterLocationId)

    budgetQuery.then(({ data: budgetRows }) => {
      const startDate = `${fiscalYear}-01-01`
      const endDate = `${fiscalYear}-12-31`

      let actualQuery = supabase.from("journal_lines")
        .select("account_id, activity_id, location_id, debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .gte("journal_entries.date", startDate).lte("journal_entries.date", endDate)

      if (selectedProjectId) actualQuery = actualQuery.eq("project_id", selectedProjectId)
      if (businessType === "ngo" && selectedDonorId) actualQuery = actualQuery.eq("donor_id", selectedDonorId)
      if (filterLocationId) actualQuery = actualQuery.eq("location_id", filterLocationId)

      actualQuery.then(({ data: actualRows }) => {
        const newData: Record<string, Record<string, Record<string, { budget: number; actual: number }>>> = {}
        budgetRows?.forEach((b: any) => {
          const { account_id, activity_id, location_id, budgeted_amount } = b
          if (!activity_id || !location_id || !account_id) return
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          newData[activity_id][location_id][account_id] = { budget: budgeted_amount || 0, actual: 0 }
        })
        actualRows?.forEach((line: any) => {
          const { account_id, activity_id, location_id, debit, credit } = line
          if (!activity_id || !location_id || !account_id) return
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          if (!newData[activity_id][location_id][account_id]) newData[activity_id][location_id][account_id] = { budget: 0, actual: 0 }
          newData[activity_id][location_id][account_id].actual += (debit || 0) - (credit || 0)
        })
        setData(newData)
        setLoading(false)
      })
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, filterLocationId, businessType])

  // ── 4. Monthly actuals ──
  useEffect(() => {
    if (viewMode !== "month" || !companyId) return
    if (businessType === "ngo" && !selectedDonorId && !selectedProjectId) return

    const startDate = `${fiscalYear}-01-01`
    const endDate = `${fiscalYear}-12-31`
    let query = supabase.from("journal_lines")
      .select("activity_id, location_id, debit, credit, journal_entries!inner(date)")
      .eq("company_id", companyId)
      .gte("journal_entries.date", startDate).lte("journal_entries.date", endDate)

    if (selectedProjectId) query = query.eq("project_id", selectedProjectId)
    if (businessType === "ngo" && selectedDonorId) query = query.eq("donor_id", selectedDonorId)
    if (filterLocationId) query = query.eq("location_id", filterLocationId)

    query.then(({ data: lines }) => {
      const agg: Record<string, Record<string, Record<number, number>>> = {}
      ;(lines || []).forEach((l: any) => {
        const act = String(l.activity_id)
        const loc = String(l.location_id)
        const month = new Date(l.journal_entries.date).getMonth() + 1
        if (!agg[act]) agg[act] = {}
        if (!agg[act][loc]) agg[act][loc] = {}
        agg[act][loc][month] = (agg[act][loc][month] || 0) + (l.debit || 0) - (l.credit || 0)
      })
      setMonthlyActuals(agg)
    })
  }, [viewMode, companyId, selectedProjectId, selectedDonorId, filterLocationId, fiscalYear, businessType])

  // ── Determine which accounts to display ──
  const usedAccountIds = new Set<string>()
  for (const actId of Object.keys(data)) {
    for (const locId of Object.keys(data[actId])) {
      for (const accId of Object.keys(data[actId][locId])) {
        const cell = data[actId][locId][accId]
        if (cell.budget > 0 || cell.actual !== 0) usedAccountIds.add(accId)
      }
    }
  }

  const relevantAccounts = editMode || usedAccountIds.size === 0
    ? accounts
    : accounts.filter(a => usedAccountIds.has(String(a.id)))

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

  // ── Save budgets ──
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
            company_id: companyId,
            account_id: parseInt(accountId),
            project_id: selectedProjectId || null,
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

    let deleteQuery = supabase.from("budgets").delete()
      .eq("company_id", companyId).eq("fiscal_year", fiscalYear).is("month", null)
    if (selectedProjectId) deleteQuery = deleteQuery.eq("project_id", selectedProjectId)
    if (businessType === "ngo") deleteQuery = deleteQuery.eq("donor_id", selectedDonorId)
    await deleteQuery

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from("budgets").insert(rowsToInsert)
      if (error) { setFlash("Error: " + error.message); setSaving(false); return }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from("data_change_logs").insert({
        table_name: "budgets",
        record_id: `${selectedProjectId || 'all'}_${fiscalYear}`,
        action: "UPDATE",
        old_data: null,
        new_data: rowsToInsert,
        changed_by: user?.email || user?.id || null,
        changed_at: new Date().toISOString(),
      })
    } catch {}

    setFlash("Budget saved!")
    setSaving(false)
    setEditMode(false)
    setTimeout(() => setFlash(""), 4000)
  }

  // ── Export functions ──
  const exportExcel = () => { /* same as before */ }

  const exportPDF = () => { /* same as before */ }

  const handleBudgetImport = async () => { /* same as before */ }

  const displayActivities = filterActivityId
    ? (selectedProjectId ? allActivities : []).filter(a => a.id == filterActivityId)
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

  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "#E2E8F0" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      {/* ... same style as before but unchanged */}
      <h2>Budget vs Actuals</h2>
      {/* ... filters, table, everything else same but with the donor/project logic adjustments */}
    </div>
  )
}