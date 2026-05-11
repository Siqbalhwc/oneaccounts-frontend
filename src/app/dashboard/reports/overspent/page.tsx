"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function OverspentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Read URL params to sync with dashboard
  const initialProject = searchParams.get("project") || ""
  const initialDonor = searchParams.get("donor") || ""

  const [companyId, setCompanyId] = useState("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    supabase.rpc("dashboard_project_utilization", {
      p_company_id: companyId, p_fiscal_year: fiscalYear,
    }).then(({ data }) => {
      let filtered = (data || []).filter((p: any) => (p.actual || 0) > (p.budget || 0))

      // Filter by dashboard selection if provided
      if (initialProject) {
        filtered = filtered.filter((p: any) => String(p.project_id) === initialProject)
      }
      if (initialDonor) {
        // RPC may not return donor_id per project; this filter works if data includes donor_id
        filtered = filtered.filter((p: any) => String(p.donor_id) === initialDonor)
      }

      setRows(filtered.map((p: any) => ({
        project: p.project_name,
        budget: p.budget || 0,
        actual: p.actual || 0,
        over: (p.actual || 0) - (p.budget || 0),
        pct: p.budget ? Math.round(((p.actual || 0) / p.budget) * 100) : 0,
      })))
      setLoading(false)
    })
  }, [companyId, fiscalYear, initialProject, initialDonor])

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      Project: r.project, Budget: r.budget, Actual: r.actual,
      Overspent: r.over, "Util %": r.pct,
    }))
    const ws = XLSX.utils.json_to_sheet(sheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Overspent")
    XLSX.writeFile(wb, `overspent_projects_${fiscalYear}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Overspent Projects", 14, 20)
    doc.setFontSize(10)
    doc.text(`Fiscal Year: ${fiscalYear}`, 14, 28)
    const body = rows.map(r => [r.project, r.budget, r.actual, r.over, `${r.pct}%`])
    autoTable(doc, { head: [["Project","Budget","Actual","Overspent","Util %"]], body, startY: 35 })
    doc.save(`overspent_projects_${fiscalYear}.pdf`)
  }

  const formatPKR = (v: number) =>
    v >= 1_000_000 ? `PKR ${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `PKR ${(v / 1_000).toFixed(0)}K` : `PKR ${v.toLocaleString()}`

  return (
    <div style={{ padding: "20px 24px", fontFamily: "Segoe UI, system-ui, sans-serif", background: "#f0f4f8", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .table { width: 100%; border-collapse: collapse; }
        .table th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; text-align: left; padding: 12px 12px; border-bottom: 1px solid #e2e8f0; }
        .table td { padding: 12px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .filter-select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; background: white; box-sizing: border-box; }
        .btn { padding: 8px 16px; border: none; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-secondary { background: #e2e8f0; color: #1e293b; }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Overspent Projects</h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Projects where actual spending exceeds budget</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select className="filter-select" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn btn-secondary" onClick={exportExcel}>📥 Excel</button>
          <button className="btn btn-secondary" onClick={exportPDF}>📄 PDF</button>
        </div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? <p>Loading...</p> : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <p style={{ fontSize: 48, color: "#16a34a", margin: 0 }}>✓</p>
            <p style={{ color: "#94a3b8", marginTop: 8 }}>All projects are within budget – great job!</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th style={{ textAlign: "right" }}>Budget</th>
                <th style={{ textAlign: "right" }}>Actual</th>
                <th style={{ textAlign: "right" }}>Overspent</th>
                <th style={{ textAlign: "right" }}>Util %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.project}</td>
                  <td style={{ textAlign: "right" }}>{formatPKR(r.budget)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: "#dc2626" }}>{formatPKR(r.actual)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: "#dc2626" }}>{formatPKR(r.over)}</td>
                  <td style={{ textAlign: "right", color: "#dc2626" }}>{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}