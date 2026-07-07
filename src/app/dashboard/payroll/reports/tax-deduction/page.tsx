"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

export default function TaxDeductionPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [month, setMonth] = useState("")
  const [taxRecords, setTaxRecords] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("companies")
          .select("name, logo_url")
          .eq("id", cid)
          .single()
          .then(({ data }) => setCompany(data || null))
      }
    })
  }, [])

  const fetchTax = async () => {
    if (!month || !companyId) return
    setLoading(true)
    setError("")
    setTaxRecords([])

    // Find run for the month
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

    // Fetch taxable components
    const { data: lines, error: lineErr } = await supabase
      .from("payroll_run_line_components")
      .select("amount, payroll_run_lines!inner(employee_id, payroll_run_id, employees!inner(full_name, employee_code)), salary_components!inner(name, is_taxable)")
      .eq("payroll_run_lines.payroll_run_id", run.id)
      .eq("salary_components.is_taxable", true)

    if (lineErr) {
      setError(lineErr.message)
      setLoading(false)
      return
    }

    // Group by employee
    const grouped: Record<number, { name: string; code: string; total: number }> = {}
    for (const row of lines || []) {
      // Handle payroll_run_lines as array or single object
      const runLine = Array.isArray(row.payroll_run_lines) ? row.payroll_run_lines[0] : row.payroll_run_lines
      if (!runLine) continue
      const empId = runLine.employee_id
      if (!empId) continue

      // Handle employees as array or single object
      const emp = Array.isArray(runLine.employees) ? runLine.employees[0] : runLine.employees
      const employeeName = emp?.full_name || "Unknown"
      const employeeCode = emp?.employee_code || "N/A"

      if (!grouped[empId]) {
        grouped[empId] = { name: employeeName, code: employeeCode, total: 0 }
      }
      grouped[empId].total += row.amount
    }

    setTaxRecords(Object.values(grouped))
    setLoading(false)
  }

  useEffect(() => {
    if (month && companyId) fetchTax()
  }, [month, companyId])

  const totalTax = taxRecords.reduce((sum, r) => sum + r.total, 0)

  const downloadPDF = () => {
    if (taxRecords.length === 0) return
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(company?.name || "Company", 14, 20)
    doc.setFontSize(12)
    doc.text("Tax Deduction Report", 14, 30)
    doc.setFontSize(10)
    doc.text(`Month: ${new Date(month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}`, 14, 38)

    const rows = taxRecords.map((r) => [r.code, r.name, r.total.toLocaleString()])
    ;(doc as any).autoTable({
      startY: 45,
      head: [["Code", "Employee", "Tax Deduction"]],
      body: rows,
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.text(`Total Tax Deductions: PKR ${totalTax.toLocaleString()}`, 14, finalY)
    doc.save(`Tax_Deduction_${month}.pdf`)
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
        .input { width: 200px; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .totals { margin-top: 16px; font-weight: 700; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/reports")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🧾 Tax Deduction Report</h1>
      </div>

      <div className="card">
        <input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {taxRecords.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Tax Deduction</th>
              </tr>
            </thead>
            <tbody>
              {taxRecords.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>PKR {r.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">Total Tax Deductions: PKR {totalTax.toLocaleString()}</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={downloadPDF}>
            <Download size={16} /> Download PDF
          </button>
        </div>
      )}
    </div>
  )
}
