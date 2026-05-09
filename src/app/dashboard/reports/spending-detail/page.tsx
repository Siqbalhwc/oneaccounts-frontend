"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function SpendingDetailPage() {
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
  const [donors, setDonors] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [selectedDonorId, setSelectedDonorId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase.from("projects").select("id, name").eq("company_id", cid).order("name")
          .then(r => r.data && setProjects(r.data))
        supabase.from("donors").select("id, name").eq("company_id", cid).order("name")
          .then(r => r.data && setDonors(r.data))
      }
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    let query = supabase
      .from("journal_lines")
      .select(`
        account_id,
        project_id,
        activity_id,
        location_id,
        donor_id,
        debit,
        credit,
        accounts(code, name, type),
        projects(name),
        donors(name),
        activities(name),
        locations(name),
        journal_entries!inner(date)
      `)
      .eq("company_id", companyId)
      .gte("journal_entries.date", `${fiscalYear}-01-01`)
      .lte("journal_entries.date", `${fiscalYear}-12-31`)
      .in("account_id", (await supabase.from("accounts").select("id").eq("company_id", companyId).eq("type", "Expense")).data?.map(a => a.id) || [])
      .order("journal_entries.date", { ascending: false })

    if (selectedProjectId) query = query.eq("project_id", selectedProjectId)
    if (selectedDonorId) query = query.eq("donor_id", selectedDonorId)

    query.then(({ data }) => {
      const enriched = (data || []).map((r: any) => ({
        date: r.journal_entries?.date,
        account_code: r.accounts?.code,
        account_name: r.accounts?.name,
        project: r.projects?.name,
        donor: r.donors?.name,
        activity: r.activities?.name,
        location: r.locations?.name,
        debit: r.debit,
        credit: r.credit,
        net: (r.debit || 0) - (r.credit || 0),
      }))
      setRows(enriched)
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId])

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      Date: r.date,
      Project: r.project,
      Donor: r.donor,
      Activity: r.activity,
      Location: r.location,
      "Account Code": r.account_code,
      "Account Name": r.account_name,
      Debit: r.debit,
      Credit: r.credit,
      Net: r.net,
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
    autoTable(doc, {
      head: [["Date","Project","Donor","Activity","Location","Code","Account","Debit","Credit","Net"]],
      body,
      startY: 35,
    })
    doc.save(`spending_detail_${fiscalYear}.pdf`)
  }

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
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Spending Detail</h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>All expense transactions with project, donor, activity, location</p>
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
        <select className="filter-select" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
          <option value="">All Donors</option>
          {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn btn-secondary" onClick={exportExcel}>📥 Excel</button>
          <button className="btn btn-secondary" onClick={exportPDF}>📄 PDF</button>
        </div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? <p>Loading...</p> : rows.length === 0 ? <p style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>No spending data found.</p> : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Date</th><th>Project</th><th>Donor</th><th>Activity</th><th>Location</th>
                <th>Code</th><th>Account</th><th>Debit</th><th>Credit</th><th>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td><td>{r.project||"—"}</td><td>{r.donor||"—"}</td><td>{r.activity||"—"}</td><td>{r.location||"—"}</td>
                  <td>{r.account_code}</td><td>{r.account_name}</td>
                  <td>{r.debit?.toLocaleString()}</td><td>{r.credit?.toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{r.net?.toLocaleString()}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: "2px solid #e2e8f0" }}>
                <td colSpan={7} style={{ textAlign: "right" }}>Total</td>
                <td>{rows.reduce((s,r) => s + (r.debit||0), 0).toLocaleString()}</td>
                <td>{rows.reduce((s,r) => s + (r.credit||0), 0).toLocaleString()}</td>
                <td>{rows.reduce((s,r) => s + (r.net||0), 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}