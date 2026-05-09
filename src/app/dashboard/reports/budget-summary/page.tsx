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

    let query = supabase.from("budgets")
      .select(`
        id, account_id, project_id, activity_id, location_id, donor_id, budgeted_amount,
        accounts(code, name), projects(name), donors(name), activities(name), locations(name)
      `)
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .is("deleted_at", null)
      .order("id")

    if (selectedProjectId) query = query.eq("project_id", selectedProjectId)

    query.then(({ data }) => {
      setRows((data || []).map((r: any) => ({
        id: r.id,
        account_code: r.accounts?.code,
        account_name: r.accounts?.name,
        project: r.projects?.name,
        donor: r.donors?.name,
        activity: r.activities?.name,
        location: r.locations?.name,
        amount: r.budgeted_amount,
      })))
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedProjectId])

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      Project: r.project, Donor: r.donor, Activity: r.activity, Location: r.location,
      "Account Code": r.account_code, "Account Name": r.account_name, Budget: r.amount,
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
    v >= 1_000_000 ? `PKR ${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `PKR ${(v / 1_000).toFixed(0)}K` : `PKR ${v.toLocaleString()}`

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-[1600px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <button onClick={() => router.back()} className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-2 inline-block">← Back</button>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Budget Summary</h2>
            <p className="text-sm text-slate-500 mt-0.5">All active budget lines with project, donor, activity, location and account</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select
            value={fiscalYear}
            onChange={e => setFiscalYear(Number(e.target.value))}
            className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y}</option>)}
          </select>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-2 ml-auto">
            <button onClick={exportExcel} className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
              📥 Excel
            </button>
            <button onClick={exportPDF} className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
              📄 PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-slate-400 text-center py-16">No budget lines found. Create a budget on the Budget vs Actual page.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Project","Donor","Activity","Location","Code","Account","Budget"].map(h => (
                      <th key={h} className="py-3 px-5 text-xs uppercase tracking-widest text-slate-400 font-semibold text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-5 text-sm font-semibold text-slate-800">{r.project}</td>
                      <td className="py-3 px-5 text-sm text-slate-600">{r.donor || "—"}</td>
                      <td className="py-3 px-5 text-sm text-slate-600">{r.activity || "—"}</td>
                      <td className="py-3 px-5 text-sm text-slate-600">{r.location || "—"}</td>
                      <td className="py-3 px-5 text-sm text-slate-600">{r.account_code}</td>
                      <td className="py-3 px-5 text-sm text-slate-600">{r.account_name}</td>
                      <td className="py-3 px-5 text-sm font-bold text-slate-900 text-right tabular-nums">{formatPKR(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={6} className="py-3 px-5 text-sm text-slate-700 text-right">Total</td>
                    <td className="py-3 px-5 text-sm font-black text-slate-900 text-right tabular-nums">{formatPKR(rows.reduce((s, r) => s + (r.amount || 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}