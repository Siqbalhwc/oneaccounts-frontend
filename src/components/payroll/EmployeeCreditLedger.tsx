"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

// Employee Loan / Salary Advance ledger, built from the accounts:
//   Dr "Employee Loans & Advances" when money is paid to the employee,
//   Cr when the payroll recovers it. Each line carries the employee.

type Kind = "loan" | "advance"

function lineKind(l: any): Kind | null {
  if (l.source_type === "employee_loan") return "loan"
  if (l.source_type === "salary_advance") return "advance"
  const n = String(l.narration || "").toLowerCase()
  if (n.startsWith("loan")) return "loan"
  if (n.startsWith("salary advance") || n.startsWith("advance")) return "advance"
  return null
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
const todayStr = () => new Date().toISOString().split("T")[0]

export default function EmployeeCreditLedger({ kind }: { kind: Kind }) {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"

  const title = kind === "loan" ? "Loan Ledger" : "Salary Advance Ledger"
  const issuedWord = kind === "loan" ? "Loan issued" : "Advance issued"

  const [companyId, setCompanyId] = useState("")
  const [company, setCompany] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(todayStr())
  const [employeeId, setEmployeeId] = useState<number | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [recordsBalance, setRecordsBalance] = useState<number | null>(null)
  const [noAccount, setNoAccount] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)
      supabase.from("companies").select("name").eq("id", cid).single().then(({ data }) => setCompany(data || null))
      supabase.from("employees").select("id, employee_code, full_name").eq("company_id", cid).order("full_name")
        .then(({ data }) => setEmployees(data || []))
    })
  }, [supabase])

  useEffect(() => {
    if (!companyId || !from || !to) return
    let cancelled = false
    const run = async () => {
      setLoading(true); setError(""); setNoAccount(false)
      const { data: acc } = await supabase.from("accounts").select("id").eq("company_id", companyId).ilike("name", "Employee Loans & Advances").limit(1)
      if (!acc || acc.length === 0) { if (!cancelled) { setGroups([]); setNoAccount(true); setLoading(false) }; return }

      // Read every line up to the end date (the opening balance needs the earlier ones), 1000 at a time
      const all: any[] = []
      const PAGE = 1000
      for (let start = 0; ; start += PAGE) {
        let q = supabase
          .from("journal_lines")
          .select("id, debit, credit, narration, source_type, employee_id, journal_entries!inner(date, entry_no, description)")
          .eq("company_id", companyId)
          .eq("account_id", acc[0].id)
          .not("employee_id", "is", null)
          .is("deleted_at", null)
          .is("journal_entries.deleted_at", null)
          .lte("journal_entries.date", to)
          .order("id")
          .range(start, start + PAGE - 1)
        if (employeeId) q = q.eq("employee_id", employeeId)
        const { data, error: qErr } = await q
        if (qErr) { if (!cancelled) { setError(qErr.message); setLoading(false) }; return }
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE) break
      }
      if (cancelled) return

      const byEmp: Record<number, any[]> = {}
      for (const l of all) {
        if (lineKind(l) !== kind) continue
        const entry = Array.isArray(l.journal_entries) ? l.journal_entries[0] : l.journal_entries
        ;(byEmp[l.employee_id] ||= []).push({
          id: l.id, date: entry?.date, entryNo: entry?.entry_no, text: l.narration || entry?.description || "",
          debit: Number(l.debit || 0), credit: Number(l.credit || 0), reversal: l.source_type === "payroll_reversal",
        })
      }
      const out: any[] = []
      for (const [eid, lines] of Object.entries(byEmp)) {
        lines.sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
        let opening = 0
        const rows: any[] = []
        let running = 0
        let issued = 0
        let recovered = 0
        for (const l of lines) {
          if (l.date < from) { opening += l.debit - l.credit; running = opening; continue }
          running += l.debit - l.credit
          // a reversal puts a recovery back: it shows as a negative recovery, not as a new issue
          const iss = l.reversal ? 0 : l.debit
          const rec = l.reversal ? -l.debit : l.credit
          issued += iss
          recovered += rec
          rows.push({ ...l, iss, rec, balance: running })
        }
        const closing = opening + issued - recovered
        if (rows.length === 0 && Math.abs(opening) < 0.005 && Math.abs(closing) < 0.005) continue
        const emp = employees.find(e => e.id === Number(eid))
        out.push({ id: Number(eid), code: emp?.employee_code || "", name: emp?.full_name || `Employee ${eid}`, opening, issued, recovered, closing, rows })
      }
      out.sort((a, b) => a.name.localeCompare(b.name))
      setGroups(out)

      // Cross-check with the loan / advance records (only meaningful up to today)
      if (to >= todayStr()) {
        const table = kind === "loan" ? "employee_loans" : "salary_advances"
        const { data: recs } = await supabase.from(table).select("employee_id, balance").eq("status", "active")
        const mine = (recs || []).filter((r: any) => !employeeId || r.employee_id === employeeId)
        if (!cancelled) setRecordsBalance(mine.reduce((s: number, r: any) => s + Number(r.balance || 0), 0))
      } else if (!cancelled) setRecordsBalance(null)
      if (!cancelled) setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [companyId, from, to, employeeId, employees, kind, supabase])

  const totals = useMemo(() => groups.reduce((t, g) => ({
    opening: t.opening + g.opening, issued: t.issued + g.issued, recovered: t.recovered + g.recovered, closing: t.closing + g.closing,
  }), { opening: 0, issued: 0, recovered: 0, closing: 0 }), [groups])

  const diff = recordsBalance === null ? 0 : Math.round((recordsBalance - totals.closing) * 100) / 100

  const downloadPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16); doc.text(company?.name || "Company", 14, 18)
    doc.setFontSize(12); doc.text(title, 14, 26)
    doc.setFontSize(10); doc.text(`From ${from} to ${to}`, 14, 33)
    const body: any[] = []
    for (const g of groups) {
      body.push([{ content: `${g.code} - ${g.name}`, colSpan: 3, styles: { fontStyle: "bold", fillColor: [235, 238, 245] } },
        { content: "Opening", styles: { fontStyle: "bold", fillColor: [235, 238, 245], halign: "right" } },
        { content: "", styles: { fillColor: [235, 238, 245] } },
        { content: fmt(g.opening), styles: { fontStyle: "bold", fillColor: [235, 238, 245], halign: "right" } }])
      for (const r of g.rows) body.push([r.date, r.entryNo || "", r.text, r.iss ? fmt(r.iss) : "", r.rec ? fmt(r.rec) : "", fmt(r.balance)])
      body.push([{ content: "Closing balance", colSpan: 3, styles: { fontStyle: "bold" } }, { content: fmt(g.issued), styles: { fontStyle: "bold", halign: "right" } }, { content: fmt(g.recovered), styles: { fontStyle: "bold", halign: "right" } }, { content: fmt(g.closing), styles: { fontStyle: "bold", halign: "right" } }])
    }
    body.push([{ content: "TOTAL", colSpan: 3, styles: { fontStyle: "bold" } }, { content: fmt(totals.issued), styles: { fontStyle: "bold", halign: "right" } }, { content: fmt(totals.recovered), styles: { fontStyle: "bold", halign: "right" } }, { content: fmt(totals.closing), styles: { fontStyle: "bold", halign: "right" } }])
    ;(doc as any).autoTable({
      startY: 38,
      head: [["Date", "Entry", "Description", issuedWord, "Recovered", "Balance"]],
      body,
      styles: { fontSize: 8 },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    })
    doc.save(`${title.replace(/ /g, "_")}_${from}_${to}.pdf`)
  }

  const downloadCSV = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = [["Employee code", "Employee", "Date", "Entry", "Description", issuedWord, "Recovered", "Balance"].map(esc).join(",")]
    for (const g of groups) {
      lines.push([g.code, g.name, from, "", "Opening balance", "", "", g.opening].map(esc).join(","))
      for (const r of g.rows) lines.push([g.code, g.name, r.date, r.entryNo, r.text, r.iss || "", r.rec || "", r.balance].map(esc).join(","))
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob); a.download = `${title.replace(/ /g, "_")}_${from}_${to}.csv`; a.click()
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
        .input, .select { height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); box-sizing: border-box; }
        .lbl { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 4px; }
        .wrap { overflow-x: auto; }
        .t { width: 100%; border-collapse: collapse; min-width: 620px; }
        .t th, .t td { padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .t th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .num { text-align: right !important; font-variant-numeric: tabular-nums; }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); }
        .btn:hover { background: var(--card-hover); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/reports")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, flex: 1 }}>{title}</h1>
        {groups.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={downloadPDF}><Download size={14} /> PDF</button>
            <button className="btn" onClick={downloadCSV}><Download size={14} /> CSV</button>
          </div>
        )}
      </div>

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><span className="lbl">From</span><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><span className="lbl">To</span><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div>
          <span className="lbl">Employee</span>
          <select className="select" style={{ minWidth: 220 }} value={employeeId ?? ""} onChange={e => setEmployeeId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">All employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.employee_code} - {e.full_name}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", border: "1px solid #dc2626", color: "var(--text)", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading && <div style={{ color: "var(--text-muted)", padding: 12 }}>Loading...</div>}
      {noAccount && !loading && <div className="card" style={{ color: "var(--text-muted)" }}>Nothing has been issued yet. The ledger fills when a {kind === "loan" ? "loan" : "salary advance"} is issued from the Payroll menu.</div>}

      {!loading && !noAccount && groups.length === 0 && !error && (
        <div className="card" style={{ color: "var(--text-muted)" }}>No {kind === "loan" ? "loan" : "advance"} activity or balance for these dates.</div>
      )}

      {groups.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
            {[["Opening", totals.opening], [issuedWord, totals.issued], ["Recovered", totals.recovered], ["Closing (still owed)", totals.closing]].map(([k, v]) => (
              <div key={String(k)} className="card" style={{ marginBottom: 0 }}>
                <span className="lbl">{k}</span>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(v as number)}</div>
              </div>
            ))}
          </div>

          {recordsBalance !== null && Math.abs(diff) > 0.5 && (
            <div style={{ background: "var(--card-hover)", border: "1px solid #F59E0B", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
              The {kind} records show <strong>{fmt(recordsBalance)}</strong> still owed, but this ledger shows <strong>{fmt(totals.closing)}</strong> (difference {fmt(diff)}).
              This usually means an older {kind} that was created before its accounting entry was booked.
            </div>
          )}

          {groups.map(g => (
            <div key={g.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <strong>{g.code} - {g.name}</strong>
                <span style={{ fontSize: 13 }}>Opening: <strong>{fmt(g.opening)}</strong></span>
              </div>
              <div className="wrap">
                <table className="t">
                  <thead>
                    <tr><th>Date</th><th>Entry</th><th>Description</th><th className="num">{issuedWord}</th><th className="num">Recovered</th><th className="num">Balance</th></tr>
                  </thead>
                  <tbody>
                    {g.rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>No movement in this period</td></tr>}
                    {g.rows.map((r: any) => (
                      <tr key={r.id}>
                        <td>{r.date}</td><td>{r.entryNo}</td><td>{r.text}</td>
                        <td className="num">{r.iss ? fmt(r.iss) : ""}</td>
                        <td className="num">{r.rec ? fmt(r.rec) : ""}</td>
                        <td className="num">{fmt(r.balance)}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: "var(--card-hover)" }}>
                      <td colSpan={3}>Closing balance</td>
                      <td className="num">{fmt(g.issued)}</td><td className="num">{fmt(g.recovered)}</td><td className="num">{fmt(g.closing)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
