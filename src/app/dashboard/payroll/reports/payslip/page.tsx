"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

export default function PayslipPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null)
  const [month, setMonth] = useState("")
  const [runData, setRunData] = useState<any>(null)
  const [payslip, setPayslip] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch employees
        supabase
          .from("employees")
          .select("id, employee_code, full_name")
          .eq("company_id", cid)
          .eq("status", "active")
          .order("full_name")
          .then(({ data }) => setEmployees(data || []))
        // Fetch company details for header
        supabase
          .from("companies")
          .select("name, logo_url")
          .eq("id", cid)
          .single()
          .then(({ data }) => setCompany(data || null))
      }
    })
  }, [])

  const fetchPayslip = async () => {
    if (!selectedEmployee || !month) return
    setLoading(true)
    setError("")
    setPayslip(null)

    // Find run for that month
    const { data: run } = await supabase
      .from("payroll_runs")
      .select("id, month")
      .eq("company_id", companyId)
      .eq("month", month)
      .maybeSingle()

    if (!run) {
      setError("No payroll run found for this month.")
      setLoading(false)
      return
    }

    // Find run line for that employee
    const { data: line } = await supabase
      .from("payroll_run_lines")
      .select("*, employees!inner(full_name, employee_code, department_id, designation_id)")
      .eq("payroll_run_id", run.id)
      .eq("employee_id", selectedEmployee)
      .maybeSingle()

    if (!line) {
      setError("No payslip found for this employee in the selected month.")
      setLoading(false)
      return
    }

    setRunData(run)
    setPayslip(line)
    setLoading(false)
  }

  useEffect(() => {
    if (selectedEmployee && month) fetchPayslip()
  }, [selectedEmployee, month])

  const downloadPDF = () => {
    if (!payslip) return
    const doc = new jsPDF()
    const emp = payslip.employees
    const components = payslip.salary_structure_snapshot?.components || []

    // Header
    doc.setFontSize(16)
    doc.text(company?.name || "Company", 14, 20)
    doc.setFontSize(12)
    doc.text("Payslip", 14, 30)
    doc.setFontSize(10)
    doc.text(`Employee: ${emp?.full_name} (${emp?.employee_code})`, 14, 38)
    doc.text(`Month: ${new Date(runData.month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}`, 14, 44)

    // Table
    const rows = components.map((c: any) => [c.name, c.type, c.amount.toLocaleString()])
    ;(doc as any).autoTable({
      startY: 52,
      head: [["Component", "Type", "Amount"]],
      body: rows,
    })

    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.text(`Gross Pay: PKR ${payslip.gross_amount.toLocaleString()}`, 14, finalY)
    doc.text(`Total Deductions: PKR ${payslip.total_deductions.toLocaleString()}`, 14, finalY + 7)
    doc.text(`Net Pay: PKR ${payslip.net_amount.toLocaleString()}`, 14, finalY + 14)
    doc.save(`Payslip_${emp?.employee_code}_${month}.pdf`)
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
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .select, .input { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .payslip { max-width: 400px; }
        .line { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border); }
        .total { font-weight: 700; border-top: 2px solid var(--text); margin-top: 8px; padding-top: 8px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/reports")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🧾 Payslip</h1>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select className="select" style={{ width: 200 }} value={selectedEmployee ?? ""} onChange={e => setSelectedEmployee(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Select employee…</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.full_name}</option>
          ))}
        </select>
        <input type="date" className="input" style={{ width: 200 }} value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {payslip && (
        <div className="card payslip">
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <h2>{company?.name || "Company"}</h2>
            <h3>Payslip</h3>
            <div>Employee: {payslip.employees?.full_name} ({payslip.employees?.employee_code})</div>
            <div>Month: {new Date(runData.month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}</div>
          </div>
          <div>
            {payslip.salary_structure_snapshot?.components?.map((c: any, i: number) => (
              <div key={i} className="line">
                <span>{c.name}</span>
                <span style={{ fontWeight: 600, color: c.type === "earning" ? "#10B981" : "#EF4444" }}>
                  {c.type === "earning" ? "+" : "-"} {c.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="total line"><span>Gross Pay</span><span>{payslip.gross_amount.toLocaleString()}</span></div>
          <div className="line"><span>Deductions</span><span style={{ color: "#EF4444" }}>{payslip.total_deductions.toLocaleString()}</span></div>
          <div className="total line" style={{ fontSize: 16 }}><span>Net Pay</span><span style={{ color: "#10B981" }}>{payslip.net_amount.toLocaleString()}</span></div>
          <button className="btn btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} onClick={downloadPDF}>
            <Download size={16} /> Download PDF
          </button>
        </div>
      )}
    </div>
  )
}
