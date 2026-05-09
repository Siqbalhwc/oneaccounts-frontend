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
  const [expenseAccountIds, setExpenseAccountIds] = useState<number[]>([])

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
        supabase.from("accounts").select("id").eq("company_id", cid).eq("type", "Expense")
          .then(r => r.data && setExpenseAccountIds(r.data.map((a: any) => a.id)))
      }
    })
  }, [])

  useEffect(() => {
    if (!companyId || expenseAccountIds.length === 0) return
    setLoading(true)

    let query = supabase.from("journal_lines")
      .select(`
        account_id, project_id, activity_id, location_id, donor_id, debit, credit,
        accounts(code, name, type), projects(name), donors(name), activities(name), locations(name),
        journal_entries!inner(date)
      `)
      .eq("company_id", companyId)
      .gte("journal_entries.date", `${fiscalYear}-01-01`)
      .lte("journal_entries.date", `${fiscalYear}-12-31`)
      .in("account_id", expenseAccountIds)
      .order("journal_entries.date", { ascending: false })

    if (selectedProjectId) query = query.eq("project_id", selectedProjectId)
    if (selectedDonorId) query = query.eq("donor_id", selectedDonorId)

    query.then(({ data }) => {
      setRows((data || []).map((r: any) => ({
        date: r.journal_entries?.date,
        project: r.projects?.name, donor: r.donors?.name,
        activity: r.activities?.name, location: r.locations?.name,
        account_code: r.accounts?.code, account_name: r.accounts?.name,
        debit: r.debit, credit: r.credit, net: (r.debit || 0) - (r.credit || 0),
      })))
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
    autoTable(doc, {
      head: [["Date","Project","Donor","Activity","Loc","Code","Account","Debit","Credit","Net"]],
      body,
      startY: 35,
    })
    doc.save(`spending_detail_${fiscalYear}.pdf`)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-[1600px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-2 inline-block">← Back</button>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Spending Detail</h2>
          <p className="text-sm text-slate-500 mt-0.5">All expense transactions with project, donor, activity, location</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y}</option>)}
          </select>
          <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)} className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            <option value="">All Donors</option>
            {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
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
            <p className="text-slate-400 text-center py-16">No spending data found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Date","Project","Donor","Activity","Loc","Code","Account","Debit","Credit","Net"].map(h => (
                      <th key={h} className="py-3 px-4 text-xs uppercase tracking-widest text-slate-400 font-semibold text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-sm text-slate-600">{r.date}</td>
                      <td className="py-3 px-4 text-sm text-slate-800 font-medium">{r.project}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{r.donor}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{r.activity}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{r.location}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{r.account_code}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{r.account_name}</td>
                      <td className="py-3 px-4 text-sm text-slate-700 tabular-nums text-right">{r.debit?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-sm text-slate-700 tabular-nums text-right">{r.credit?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-sm font-bold text-slate-900 tabular-nums text-right">{r.net?.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={7} className="py-3 px-4 text-sm text-slate-700 text-right">Total</td>
                    <td className="py-3 px-4 text-sm text-slate-900 tabular-nums text-right">{rows.reduce((s,r) => s + (r.debit||0), 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-slate-900 tabular-nums text-right">{rows.reduce((s,r) => s + (r.credit||0), 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm font-black text-slate-900 tabular-nums text-right">{rows.reduce((s,r) => s + (r.net||0), 0).toLocaleString()}</td>
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