"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function SpendingDetailClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const initialFiscalYear = parseInt(searchParams.get("fy") || "") || new Date().getFullYear()
  const initialProject = searchParams.get("project") || ""
  const initialDonor = searchParams.get("donor") || ""

  const [companyId, setCompanyId] = useState("")
  const [fiscalYear, setFiscalYear] = useState(initialFiscalYear)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(initialProject)
  const [selectedDonorId, setSelectedDonorId] = useState(initialDonor)
  const [expenseAccountIds, setExpenseAccountIds] = useState<number[]>([])

  // ── 1. Initialise company and master data ──────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase.from("projects").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setProjects(r.data))
        supabase.from("donors").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setDonors(r.data))
        supabase.from("accounts").select("id").eq("company_id", cid).eq("type", "Expense")
          .then(r => {
            if (r.data) setExpenseAccountIds(r.data.map((a: any) => a.id))
          })
      }
    })
  }, [])

  // ── 2. Fetch rows once everything is ready ─────────────────────────────
  useEffect(() => {
    if (!companyId || expenseAccountIds.length === 0) return
    setLoading(true)

    let query = supabase
      .from("journal_lines")
      .select(`
        id,
        account_id,
        project_id,
        donor_id,
        activity_id,
        location_id,
        debit,
        credit,
        journal_entries!inner(date, entry_no)
      `)
      .eq("company_id", companyId)
      .gte("journal_entries.date", `${fiscalYear}-01-01`)
      .lte("journal_entries.date", `${fiscalYear}-12-31`)
      .in("account_id", expenseAccountIds)
      .order("journal_entries(date)", { ascending: false })
      .limit(500)

    if (selectedProjectId) query = query.eq("project_id", selectedProjectId)
    if (selectedDonorId) query = query.eq("donor_id", selectedDonorId)

    query.then(async ({ data: lines }) => {
      if (!lines || lines.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      // Gather distinct IDs for enrichment
      const accountIds = [...new Set(lines.map((l: any) => l.account_id))]
      const projectIds = [...new Set(lines.map((l: any) => l.project_id))]
      const donorIds = [...new Set(lines.map((l: any) => l.donor_id))]
      const activityIds = [...new Set(lines.map((l: any) => l.activity_id))]
      const locationIds = [...new Set(lines.map((l: any) => l.location_id))]

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

      const enriched = (lines || []).map((l: any) => ({
        date: l.journal_entries?.date,
        entry_no: l.journal_entries?.entry_no,
        project: projs[l.project_id]?.name || "",
        donor: dons[l.donor_id]?.name || "",
        activity: acts[l.activity_id]?.name || "",
        location: locs[l.location_id]?.name || "",
        account_code: accounts[l.account_id]?.code || "",
        account_name: accounts[l.account_id]?.name || "",
        debit: l.debit,
        credit: l.credit,
        net: (l.debit || 0) - (l.credit || 0),
      }))

      setRows(enriched)
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, expenseAccountIds])

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      Date: r.date, Project: r.project, Donor: r.donor,
      Activity: r.activity, Location: r.location,
      "Account Code": r.account_code, "Account Name": r.account_name,
      Debit: r.debit, Credit: r.credit, Net: r.net,
    }))
    const ws = XLSX.utils.json_to_sheet(sheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Spending Detail")
    XLSX.writeFile(wb, `spending_detail_${fiscalYear}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Spending Detail", 14, 20)
    doc.setFontSize(10)
    doc.text(`Fiscal Year: ${fiscalYear}`, 14, 28)
    const body = rows.map(r => [
      r.date, r.project, r.donor, r.activity, r.location,
      r.account_code, r.account_name, r.debit, r.credit, r.net
    ])
    autoTable(doc, { head: [["Date","Project","Donor","Activity","Loc","Code","Account","Debit","Credit","Net"]], body, startY: 35 })
    doc.save(`spending_detail_${fiscalYear}.pdf`)
  }

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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Spending Detail</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>All expense transactions with project, donor, activity, location</p>
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
        <select className="filter-select" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
          <option value="">All Donors</option>
          {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn btn-secondary" onClick={exportExcel}>📥 Excel</button>
          <button className="btn btn-secondary" onClick={exportPDF}>📄 PDF</button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No spending data found for the selected filters.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Donor</th>
                <th>Activity</th>
                <th>Loc</th>
                <th>Code</th>
                <th>Account</th>
                <th style={{ textAlign: "right" }}>Debit</th>
                <th style={{ textAlign: "right" }}>Credit</th>
                <th style={{ textAlign: "right" }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{r.project}</td>
                  <td>{r.donor || "—"}</td>
                  <td>{r.activity || "—"}</td>
                  <td>{r.location || "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{r.account_code}</td>
                  <td>{r.account_name}</td>
                  <td style={{ textAlign: "right", color: r.debit > 0 ? "#EF4444" : "var(--text-muted)" }}>{r.debit > 0 ? r.debit.toLocaleString() : "—"}</td>
                  <td style={{ textAlign: "right", color: r.credit > 0 ? "#10B981" : "var(--text-muted)" }}>{r.credit > 0 ? r.credit.toLocaleString() : "—"}</td>
                  <td style={{ fontWeight: 600, textAlign: "right", color: r.net >= 0 ? "var(--text)" : "#EF4444" }}>{r.net.toLocaleString()}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                  <td colSpan={7} style={{ textAlign: "right", color: "var(--text)" }}>Total</td>
                  <td style={{ textAlign: "right", color: "#EF4444" }}>{rows.reduce((s,r)=>s+(r.debit||0),0).toLocaleString()}</td>
                  <td style={{ textAlign: "right", color: "#10B981" }}>{rows.reduce((s,r)=>s+(r.credit||0),0).toLocaleString()}</td>
                  <td style={{ textAlign: "right", color: "var(--text)" }}>{rows.reduce((s,r)=>s+(r.net||0),0).toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}