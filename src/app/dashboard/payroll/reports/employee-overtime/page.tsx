"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

// Employee-wise overtime, from the posted payroll entries (Overtime Expense, tagged with the employee).
// Reversed runs are netted off automatically.

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function EmployeeOvertimePage() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [company, setCompany] = useState<any>(null)
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().split("T")[0])
  const [rows, setRows] = useState<any[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [noAccount, setNoAccount] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)
      supabase.from("companies").select("name").eq("id", cid).single().then(({ data }) => setCompany(data || null))
    })
  }, [supabase])

  useEffect(() => {
    if (!companyId || !from || !to) return
    let cancelled = false
    const run = async () => {
      setLoading(true); setError(""); setNoAccount(false); setOpen(null)
      const { data: acc } = await supabase.from("accounts").select("id").eq("company_id", companyId).ilike("name", "Overtime Expense").limit(1)
      if (!acc || acc.length === 0) { if (!cancelled) { setRows([]); setNoAccount(true); setLoading(false) }; return }

      const all: any[] = []
      const PAGE = 1000
      for (let start = 0; ; start += PAGE) {
        const { data, error: qErr } = await supabase
          .from("journal_lines")
          .select("id, debit, credit, employee_id, journal_entries!inner(date, entry_no)")
          .eq("company_id", companyId)
          .eq("account_id", acc[0].id)
          .not("employee_id", "is", null)
          .is("deleted_at", null)
          .is("journal_entries.deleted_at", null)
          .gte("journal_entries.date", from)
          .lte("journal_entries.date", to)
          .order("id")
          .range(start, start + PAGE - 1)
        if (qErr) { if (!cancelled) { setError(qErr.message); setLoading(false) }; return }
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE) break
      }
      if (cancelled) return

      const ids = Array.from(new Set(all.map(l => l.employee_id)))
      const { data: emps } = ids.length
        ? await supabase.from("employees").select("id, employee_code, full_name").eq("company_id", companyId).in("id", ids)
        : { data: [] as any[] }

      const byEmp: Record<number, { months: Record<string, number>; total: number }> = {}
      for (const l of all) {
        const entry = Array.isArray(l.journal_entries) ? l.journal_entries[0] : l.journal_entries
        const month = String(entry?.date || "").slice(0, 7)
        const amt = Number(l.debit || 0) - Number(l.credit || 0)
        const e = (byEmp[l.employee_id] ||= { months: {}, total: 0 })
        e.months[month] = (e.months[month] || 0) + amt
        e.total += amt
      }
      const out = Object.entries(byEmp)
        .map(([id, v]) => {
          const emp = (emps || []).find((x: any) => x.id === Number(id))
          return { id: Number(id), code: emp?.employee_code || "", name: emp?.full_name || `Employee ${id}`, total: Math.round(v.total * 100) / 100, months: Object.entries(v.months).sort(([a], [b]) => (a < b ? -1 : 1)) }
        })
        .filter(r => Math.abs(r.total) > 0.004)
        .sort((a, b) => b.total - a.total)
      setRows(out)
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [companyId, from, to, supabase])

  const grand = rows.reduce((s, r) => s + r.total, 0)

  const downloadPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16); doc.text(company?.name || "Company", 14, 18)
    doc.setFontSize(12); doc.text("Employee-wise Overtime", 14, 26)
    doc.setFontSize(10); doc.text(`From ${from} to ${to}`, 14, 33)
    const body: any[] = []
    for (const r of rows) {
      body.push([{ content: r.code, styles: { fontStyle: "bold" } }, { content: r.name, styles: { fontStyle: "bold" } }, { content: fmt(r.total), styles: { fontStyle: "bold", halign: "right" } }])
      for (const [m, a] of r.months) body.push(["", `   ${m}`, { content: fmt(a as number), styles: { halign: "right" } }])
    }
    body.push([{ content: "TOTAL", colSpan: 2, styles: { fontStyle: "bold" } }, { content: fmt(grand), styles: { fontStyle: "bold", halign: "right" } }])
    ;(doc as any).autoTable({ startY: 38, head: [["Code", "Employee / Month", "Overtime"]], body, styles: { fontSize: 9 }, columnStyles: { 2: { halign: "right" } } })
    doc.save(`Employee_Overtime_${from}_${to}.pdf`)
  }

  const downloadCSV = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = [["Employee code", "Employee", "Month", "Overtime"].map(esc).join(",")]
    for (const r of rows) for (const [m, a] of r.months) lines.push([r.code, r.name, m, a].map(esc).join(","))
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob); a.download = `Employee_Overtime_${from}_${to}.csv`; a.click()
  }

  if (planLoading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2><p>Enable it in the Feature Manager.</p>
      </div>
    )
  }
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .input { height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); box-sizing: border-box; }
        .lbl { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 4px; }
        .wrap { overflow-x: auto; }
        .t { width: 100%; border-collapse: collapse; min-width: 420px; }
        .t th, .t td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .t th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .num { text-align: right !important; font-variant-numeric: tabular-nums; }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); }
        .btn:hover { background: var(--card-hover); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/reports")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, flex: 1 }}>Employee-wise Overtime</h1>
        {rows.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={downloadPDF}><Download size={14} /> PDF</button>
            <button className="btn" onClick={downloadCSV}><Download size={14} /> CSV</button>
          </div>
        )}
      </div>

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><span className="lbl">From</span><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><span className="lbl">To</span><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 360 }}>
          Overtime of posted payroll runs. A run you reverse is taken off automatically. Click an employee to see the months.
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", border: "1px solid #dc2626", color: "var(--text)", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading && <div style={{ color: "var(--text-muted)", padding: 12 }}>Loading...</div>}
      {noAccount && !loading && <div className="card" style={{ color: "var(--text-muted)" }}>No overtime has been posted yet. It appears here after a payroll run containing overtime is posted.</div>}
      {!loading && !noAccount && rows.length === 0 && !error && <div className="card" style={{ color: "var(--text-muted)" }}>No overtime posted between these dates.</div>}

      {rows.length > 0 && (
        <div className="card">
          <div className="wrap">
            <table className="t">
              <thead><tr><th>Code</th><th>Employee</th><th className="num">Overtime</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <>
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td>{r.code}</td><td style={{ fontWeight: 600 }}>{r.name}</td><td className="num" style={{ fontWeight: 700 }}>{fmt(r.total)}</td>
                    </tr>
                    {open === r.id && r.months.map(([m, a]: [string, number]) => (
                      <tr key={r.id + m} style={{ background: "var(--card-hover)" }}>
                        <td></td><td style={{ paddingLeft: 28, color: "var(--text-muted)" }}>{m}</td><td className="num">{fmt(a)}</td>
                      </tr>
                    ))}
                  </>
                ))}
                <tr style={{ fontWeight: 800, background: "var(--card-hover)" }}>
                  <td colSpan={2}>Total</td><td className="num">{fmt(grand)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
