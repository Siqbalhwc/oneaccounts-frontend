"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function BudgetSummaryPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase.from("projects").select("id, name").eq("company_id", cid).order("name")
          .then(r => r.data && setProjects(r.data))
      }
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    // Step 1 – get all active budget lines (no joins)
    let query = supabase
      .from("budgets")
      .select("id, account_id, project_id, activity_id, location_id, donor_id, budgeted_amount")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .is("deleted_at", null)
      .order("id")

    if (selectedProjectId) query = query.eq("project_id", selectedProjectId)

    query.then(async ({ data: budgetRows }) => {
      if (!budgetRows || budgetRows.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      // Step 2 – collect all IDs
      const accountIds = [...new Set(budgetRows.map((b: any) => b.account_id))]
      const projectIds = [...new Set(budgetRows.map((b: any) => b.project_id))]
      const activityIds = [...new Set(budgetRows.map((b: any) => b.activity_id))]
      const locationIds = [...new Set(budgetRows.map((b: any) => b.location_id))]
      const donorIds = [...new Set(budgetRows.map((b: any) => b.donor_id).filter(Boolean))]

      // Step 3 – fetch names in parallel
      const [accRes, projRes, donRes, actRes, locRes] = await Promise.all([
        supabase.from("accounts").select("id,code,name").in("id", accountIds),
        supabase.from("projects").select("id,name").in("id", projectIds),
        supabase.from("donors").select("id,name").in("id", donorIds),
        supabase.from("activities").select("id,name").in("id", activityIds),
        supabase.from("locations").select("id,name").in("id", locationIds),
      ])

      const mapFrom = (arr: any[]) => {
        const m: Record<number, any> = {}
        ;(arr || []).forEach((x: any) => (m[x.id] = x))
        return m
      }
      const accounts = mapFrom(accRes.data || [])
      const projs = mapFrom(projRes.data || [])
      const dons = mapFrom(donRes.data || [])
      const acts = mapFrom(actRes.data || [])
      const locs = mapFrom(locRes.data || [])

      const enriched = budgetRows.map((r: any) => ({
        id: r.id,
        account_code: accounts[r.account_id]?.code || "",
        account_name: accounts[r.account_id]?.name || "",
        project: projs[r.project_id]?.name || "",
        donor: dons[r.donor_id]?.name || "—",
        activity: acts[r.activity_id]?.name || "—",
        location: locs[r.location_id]?.name || "—",
        amount: r.budgeted_amount,
      }))

      setRows(enriched)
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedProjectId])

  const exportExcel = () => { /* unchanged */ }
  const exportPDF = () => { /* unchanged */ }
  const formatPKR = (v: number) =>
    v >= 1_000_000 ? `PKR ${(v / 1_000_000).toFixed(1)}M` : `PKR ${v.toLocaleString()}`

  return ( /* same JSX as before */ )
}