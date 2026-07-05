"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

export default function AdvanceLedgerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [ledgerLines, setLedgerLines] = useState<any[]>([])
  const [advances, setAdvances] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("employees")
          .select("id, employee_code, full_name")
          .eq("company_id", cid)
          .eq("status", "active")
          .order("full_name")
          .then(({ data }) => setEmployees(data || []))
        supabase
          .from("salary_advances")
          .select("id, employee_id, advance_amount, balance, status, employees!inner(full_name, employee_code)")
          .order("created_at", { ascending: false })
          .then(({ data }) => setAdvances(data || []))
      }
    })
  }, [])

  const fetchLedger = async () => {
    if (!selectedEmployee || !companyId) return
    setLoading(true)
    setError("")

    const { data: advancesForEmp } = await supabase
      .from("salary_advances")
      .select("id")
      .eq("employee_id", selectedEmployee)

    const advanceIds = (advancesForEmp || []).map(a => a.id)
    if (advanceIds.length === 0) {
      setLedgerLines([])
      setLoading(false)
      return
    }

    const { data: deductions } = await supabase
      .from("payroll_run_line_components")
      .select("amount, payroll_run_lines!inner(payroll_run_id, payroll_runs!inner(month)), created_at")
      .in("source_id", advanceIds)
      .eq("source_type", "advance")
      .order("created_at", { ascending: true })

    if (!deductions) {
      setLedgerLines([])
    } else {
      const rows = deductions.map((d: any) => {
        const runLine = Array.isArray(d.payroll_run_lines) ? d.payroll_run_lines[0] : d.payroll_run_lines
        const payrollRun = Array.isArray(runLine?.payroll_runs) ? runLine.payroll_runs[0] : runLine?.payroll_runs
        return {
          month: payrollRun?.month || "N/A",
          amount: d.amount,
        }
      })
      setLedgerLines(rows)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (selectedEmployee && companyId) fetchLedger()
  }, [selectedEmployee, companyId])

  const totalAdvance = advances.reduce((s, a) => s + (a.advance_amount || 0), 0)
  const totalBalance = advances.reduce((s, a) => s + (a.balance || 0), 0)

  const downloadPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text("Advance Ledger & Trial Balance", 14, 20)
    doc.setFontSize(10)
    doc.text(`Employee: ${employees.find(e => e.id === selectedEmployee)?.full_name || ""}`, 14, 30)

    const rows = ledgerLines.map(l => [new Date(l.month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" }), l.amount.toLocaleString()])
    ;(doc as any).autoTable({
      startY: 38,
      head: [["Month", "Deduction"]],
      body: rows,
    })

    const trialRows = advances.map(adv => {
      const emp = Array.isArray(adv.employees) ? adv.employees[0] : adv.employees
      return [emp?.employee_code || "N/A", emp?.full_name || "Unknown", adv.advance_amount.toLocaleString(), adv.balance.toLocaleString(), adv.status]
    })
    const finalY = (doc as any).lastAutoTable.finalY + 15
    doc.setFontSize(12)
    doc.text("Advance Trial Balance", 14, finalY)
    ;(doc as any).autoTable({
      startY: finalY + 6,
      head: [["Code", "Employee", "Advance", "Balance", "Status"]],
      body: trialRows,
    })
    doc.save(`Advance_Ledger_${selectedEmployee}.pdf`)
  }

  if (planLoading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }
  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
        .select { width: 250px; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/reports")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💸 Advance Ledger & Trial Balance</h1>
      </div>

      <div className="card">
        <select className="select" value={selectedEmployee ?? ""} onChange={e => setSelectedEmployee(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Select employee for ledger…</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.full_name}</option>
          ))}
        </select>
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {ledgerLines.length > 0 && (
        <div className="card">
          <h3>Ledger</h3>
          <table className="table">
            <thead>
              <tr><th>Month</th><th>Deduction</th></tr>
            </thead>
            <tbody>
              {ledgerLines.map((l, idx) => (
                <tr key={idx}>
                  <td>{new Date(l.month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}</td>
                  <td>PKR {l.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Advance Trial Balance</h3>
        <table className="table">
          <thead>
            <tr><th>Code</th><th>Employee</th><th>Advance</th><th>Balance</th><th>Status</th></tr>
          </thead>
          <tbody>
            {advances.map((adv) => {
              const emp = Array.isArray(adv.employees) ? adv.employees[0] : adv.employees
              return (
                <tr key={adv.id}>
                  <td>{emp?.employee_code || "N/A"}</td>
                  <td>{emp?.full_name || "Unknown"}</td>
                  <td>{adv.advance_amount.toLocaleString()}</td>
                  <td>{adv.balance.toLocaleString()}</td>
                  <td>{adv.status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontWeight: 700 }}>
          <div>Total Advance: PKR {totalAdvance.toLocaleString()}</div>
          <div>Total Balance: PKR {totalBalance.toLocaleString()}</div>
        </div>
      </div>

      {selectedEmployee && ledgerLines.length > 0 && (
        <button className="btn btn-primary" onClick={downloadPDF}>
          <Download size={16} /> Download PDF
        </button>
      )}
    </div>
  )
}