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

    // Step 1: get budget rows without joins
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

      // Step 2: collect distinct IDs
      const accountIds = [...new Set(budgetRows.map((b: any) => b.account_id))]
      const projectIds = [...new Set(budgetRows.map((b: any) => b.project_id))]
      const activityIds = [...new Set(budgetRows.map((b: any) => b.activity_id))]
      const locationIds = [...new Set(budgetRows.map((b: any) => b.location_id))]
      const donorIds = [...new Set(budgetRows.map((b: any) => b.donor_id).filter(Boolean))]

      // Step 3: fetch related names
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

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      Project: r.project, Donor: r.donor, Activity: r.activity,
      Location: r.location, "Account Code": r.account_code,
      "Account Name": r.account_name, Budget: r.amount,
    }))
    const ws = XLSX.utils.json_to_sheet(sheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Budget Summary")
    XLSX.writeFile(wb, `budget_summary_${fiscalYear}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Budget Summary", 14, 20)
    doc.setFontSize(10)
    doc.text(`Fiscal Year: ${fiscalYear}`, 14, 28)
    const body = rows.map(r => [
      r.project, r.donor, r.activity, r.location,
      r.account_code, r.account_name, r.amount?.toLocaleString()
    ])
    autoTable(doc, {
      head: [["Project","Donor","Activity","Location","Code","Account","Budget"]],
      body,
      startY: 35,
    })
    doc.save(`budget_summary_${fiscalYear}.pdf`)
  }

  const formatPKR = (v: number) =>
    v >= 1_000_000 ? `PKR ${(v / 1_000_000).toFixed(1)}M` : `PKR ${v.toLocaleString()}`

  return (
    <div style={{ padding: "20px 24px", fontFamily: "Segoe UI, system-ui, sans-serif", background: "#f0f4f8", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .table th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
        .table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .filter-select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; background: white; box-sizing: border-box; }
        .btn { padding: 8px 16px; border: none; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-secondary { background: #e2e8f0; color: #1e293b; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Budget Summary</h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>All active budget lines with project, donor, activity, location and account</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="filter-select" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn btn-secondary" onClick={exportExcel}>📥 Excel</button>
          <button className="btn btn-secondary" onClick={exportPDF}>📄 PDF</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? <p>Loading...</p> : rows.length === 0 ? <p style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>No budget lines found.</p> : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Project</th><th>Donor</th><th>Activity</th><th>Location</th>
                <th>Code</th><th>Account</th><th style={{ textAlign: "right" }}>Budget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.project}</td>
                  <td>{r.donor||"—"}</td>
                  <td>{r.activity||"—"}</td>
                  <td>{r.location||"—"}</td>
                  <td>{r.account_code}</td>
                  <td>{r.account_name}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPKR(r.amount)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: "2px solid #e2e8f0" }}>
                <td colSpan={6} style={{ textAlign: "right" }}>Total</td>
                <td style={{ textAlign: "right" }}>{formatPKR(rows.reduce((s,r)=>s+(r.amount||0),0))}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}