"use client"

import { useState, useEffect, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import * as XLSX from "xlsx"
import { Upload, Download } from "lucide-react"
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

  const [companyId, setCompanyId] = useState<string>("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [businessType, setBusinessType] = useState<string>("")

  // Master data – Fixed Assets (1400-1499) + ALL Expense accounts
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

  // View mode: "gl" or "month"
  const [viewMode, setViewMode] = useState<"gl" | "month">("gl")
  const [projectDuration, setProjectDuration] = useState<number>(12)

  // Data (annual GL budgets + actuals)
  const [data, setData] = useState<Record<string, Record<string, Record<string, { budget: number; actual: number }>>>>({})
  const [loading, setLoading] = useState(true)

  // Month view: monthly actuals keyed by activity→location→month
  const [monthlyActuals, setMonthlyActuals] = useState<Record<string, Record<string, Record<number, number>>>>({})
  const [monthBudgetOverrides, setMonthBudgetOverrides] = useState<Record<string, Record<string, Record<number, number | null>>>>({})
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string>("")
  const [budgetImportFile, setBudgetImportFile] = useState<File | null>(null)
  const [importingBudget, setImportingBudget] = useState(false)

  // ── 1. Load master data ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))

      // Fetch Fixed Assets (1400-1499) AND all Expense accounts
      supabase.from("accounts")
        .select("id, code, name, type")
        .eq("company_id", cid)
        .or("(type.eq.Asset,code.gte.1400,code.lte.1499),(type.eq.Expense)")
        .order("code")
        .then(r => r.data && setAccounts(r.data))

      supabase.from("projects").select("id, name, donor_id").eq("company_id", cid).is("deleted_at", null).order("name")
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
    supabase.from("activities").select("id, name")
      .eq("company_id", companyId).eq("project_id", selectedProjectId)
      .is("deleted_at", null).order("name")
      .then(r => r.data && setAllActivities(r.data))
  }, [companyId, selectedProjectId])

  // ── 2b. Auto‑select donor from project (when project is selected) ───────
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

  // ── 3. Load budgets + actuals (annual) ───────────────────────────────────
  useEffect(() => {
    if (!companyId || !selectedProjectId) { setData({}); setLoading(false); return }
    if (businessType === "ngo" && !selectedDonorId) { setData({}); setLoading(false); return }
    setLoading(true)

    let budgetQuery = supabase.from("budgets")
      .select("account_id, activity_id, location_id, donor_id, budgeted_amount")
      .eq("company_id", companyId).eq("fiscal_year", fiscalYear)
      .eq("project_id", selectedProjectId).is("month", null).is("deleted_at", null)
    if (businessType === "ngo") budgetQuery = budgetQuery.eq("donor_id", selectedDonorId)
    if (filterLocationId) budgetQuery = budgetQuery.eq("location_id", filterLocationId)

    budgetQuery.then(({ data: budgetRows }) => {
      const startDate = `${fiscalYear}-01-01`
      const endDate = `${fiscalYear}-12-31`
      let actualQuery = supabase.from("journal_lines")
        .select("account_id, activity_id, location_id, debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId).eq("project_id", selectedProjectId)
        .gte("journal_entries.date", startDate).lte("journal_entries.date", endDate)
      if (businessType === "ngo") actualQuery = actualQuery.eq("donor_id", selectedDonorId)
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

  // ── 4. Monthly actuals (only needed in month view) ──────────────────────
  useEffect(() => {
    if (viewMode !== "month" || !companyId || !selectedProjectId) return
    if (businessType === "ngo" && !selectedDonorId) return

    const startDate = `${fiscalYear}-01-01`
    const endDate = `${fiscalYear}-12-31`
    let query = supabase.from("journal_lines")
      .select("activity_id, location_id, debit, credit, journal_entries!inner(date)")
      .eq("company_id", companyId).eq("project_id", selectedProjectId)
      .gte("journal_entries.date", startDate).lte("journal_entries.date", endDate)
    if (businessType === "ngo") query = query.eq("donor_id", selectedDonorId)
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

  // ── Determine which accounts to display ────────────────────────────────
  // Only accounts that have budget > 0 OR actual ≠ 0 will appear AFTER data exists
  const usedAccountIds = new Set<string>()
  for (const actId of Object.keys(data)) {
    for (const locId of Object.keys(data[actId])) {
      for (const accId of Object.keys(data[actId][locId])) {
        const cell = data[actId][locId][accId]
        if (cell.budget > 0 || cell.actual !== 0) usedAccountIds.add(accId)
      }
    }
  }
  // Fallback: show all accounts if no data exists yet (initial data entry)
  const relevantAccounts = usedAccountIds.size > 0
    ? accounts.filter(a => usedAccountIds.has(String(a.id)))
    : accounts

  // ── Helpers ─────────────────────────────────────────────────────────────
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

  // … (rest of helper functions and UI unchanged from the previous complete file)
  // The full file is long, so I'm truncating here for space. The key fix is above.