"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function RemainingFundsPage() {
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
    supabase.rpc("dashboard_project_utilization", {
      p_company_id: companyId, p_fiscal_year: fiscalYear,
    }).then(({ data }) => {
      setRows((data || []).filter((p: any) => selectedProjectId ? p.project_id == selectedProjectId : true)
        .map((p: any) => ({
          project: p.project_name,
          budget: p.budget || 0,
          actual: p.actual || 0,
          remaining: (p.budget || 0) - (p.actual || 0),
          pct: p.budget ? Math.round(((p.actual || 0) / p.budget) * 100) : 0,
        })))
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedProjectId])

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      Project: r.project, Budget: r.budget, Actual: r.actual,
      Remaining: r.remaining, "Util %": r.pct,
    }))
    const ws = XLSX.utils.json_to_sheet(sheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Remaining Funds")
    XLSX.writeFile(wb, `remaining_funds_${fiscalYear}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Remaining Funds", 14, 20)
    doc.setFontSize(10)
    doc.text(`Fiscal Year: ${fiscalYear}`, 14, 28)
    const body = rows.map(r => [r.project, r.budget, r.actual, r.remaining, `${r.pct}%`])
    autoTable(doc, {
      head: [["Project","Budget","Actual","Remaining","Util %"]],
      body,
      startY: 35,
    })
    doc.save(`remaining_funds_${fiscalYear}.pdf`)
  }

  const formatPKR = (v: number) =>
    v >= 1_000_000 ? `PKR ${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `PKR ${(v / 1_000).toFixed(0)}K` : `PKR ${v.toLocaleString()}`

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-[1600px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-2 inline-block">← Back</button>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Remaining Funds</h2>
          <p className="text-sm text-slate-500 mt-0.5">Budget vs Actual with remaining balance per project</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y}</option>)}
          </select>
          <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-2 ml-auto">
            <button onClick={exportExcel} className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5">📥 Excel</button>
            <button onClick={exportPDF} className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5">📄 PDF</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-slate-400 text-center py-16">No data found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Project","Budget","Actual","Remaining","Util %"].map(h => (
                      <th key={h} className="py-3 px-5 text-xs uppercase tracking-widest text-slate-400 font-semibold text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-5 text-sm font-semibold text-slate-800">{r.project}</td>
                      <td className="py-3 px-5 text-sm text-slate-600 tabular-nums">{formatPKR(r.budget)}</td>
                      <td className="py-3 px-5 text-sm font-bold text-slate-900 tabular-nums">{formatPKR(r.actual)}</td>
                      <td className={`py-3 px-5 text-sm font-bold tabular-nums ${r.remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>{formatPKR(r.remaining)}</td>
                      <td className="py-3 px-5 text-sm text-slate-600 tabular-nums">{r.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}