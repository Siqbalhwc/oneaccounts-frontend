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
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          box-shadow: var(--shadow-sm);
          overflow-x: auto;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
        }
        .table th {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          background: var(--card);
          white-space: nowrap;
        }
        .table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          color: var(--text);
          white-space: nowrap;
        }
        .table tr:hover td {
          background: var(--card-hover);
        }
        .filter-select {
          height: 38px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          background: var(--card);
          color: var(--text);
          outline: none;
          font-family: inherit;
          box-sizing: border-box;
        }
        .filter-select:focus {
          border-color: var(--primary);
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1.5px solid var(--border);
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .btn-outline {
          background: transparent;
          color: var(--text-muted);
          border-color: var(--border);
        }
        .btn-outline:hover {
          background: var(--card-hover);
        }
        .btn-secondary {
          background: var(--card);
          color: var(--text-muted);
          border-color: var(--border);
        }
        .btn-secondary:hover {
          background: var(--card-hover);
        }
        @media (max-width: 640px) {
          .table th, .table td {
            padding: 8px 6px;
            font-size: 11px;
          }
          .btn {
            padding: 6px 12px;
            font-size: 12px;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button className="btn btn-outline" onClick={() => router.back()}>← Back</button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Budget Summary</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>All active budget lines with project, donor, activity, location and account</p>
        </div>
      </div>

      {/* Filters & Export */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
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

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading budget lines…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No budget lines found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Donor</th>
                <th>Activity</th>
                <th>Location</th>
                <th>Code</th>
                <th>Account</th>
                <th style={{ textAlign: "right" }}>Budget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{r.project}</td>
                  <td>{r.donor || "—"}</td>
                  <td>{r.activity || "—"}</td>
                  <td>{r.location || "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{r.account_code}</td>
                  <td>{r.account_name}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPKR(r.amount)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                <td colSpan={6} style={{ textAlign: "right" }}>Total</td>
                <td style={{ textAlign: "right" }}>{formatPKR(rows.reduce((s, r) => s + (r.amount || 0), 0))}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}