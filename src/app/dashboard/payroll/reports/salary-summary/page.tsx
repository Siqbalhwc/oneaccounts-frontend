"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

export default function SalarySummaryPage() {
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
  const [summaryData, setSummaryData] = useState<any[]>([])
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

  const fetchSummary = async () => {
    if (!month || !companyId) return
    setLoading(true)
    setError("")
    setSummaryData([])

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

    // Fetch run lines with employee departments
    const { data: lines } = await supabase
      .from("payroll_run_lines")
      .select("gross_amount, total_deductions, net_amount, employees!inner(department_id, departments(name))")
      .eq("payroll_run_id", run.id)

    if (!lines || lines.length === 0) {
      setError("No employees found in this payroll run.")
      setLoading(false)
      return
    }

    // Group by department
    const groups: Record<string, { dept: string; gross: number; deductions: number; net: number; count: number }> = {}
    for (const line of lines) {
      const emp = Array.isArray(line.employees) ? line.employees[0] : line.employees
      // departments could also be an array
      const dept = Array.isArray(emp?.departments) ? emp.departments[0] : emp?.departments
      const deptName = dept?.name || "Unassigned"
      if (!groups[deptName]) {
        groups[deptName] = { dept: deptName, gross: 0, deductions: 0, net: 0, count: 0 }
      }
      groups[deptName].gross += line.gross_amount || 0
      groups[deptName].deductions += line.total_deductions || 0
      groups[deptName].net += line.net_amount || 0
      groups[deptName].count++
    }

    setSummaryData(Object.values(groups))
    setLoading(false)
  }

  useEffect(() => {
    if (month && companyId) fetchSummary()
  }, [month, companyId])

  const totalGross = summaryData.reduce((s, r) => s + r.gross, 0)
  const totalDeductions = summaryData.reduce((s, r) => s + r.deductions, 0)
  const totalNet = summaryData.reduce((s, r) => s + r.net, 0)

  const downloadPDF = () => {
    if (summaryData.length === 0) return
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(company?.name || "Company", 14, 20)
    doc.setFontSize(12)
    doc.text("Salary Summary (Department‑wise)", 14, 30)
    doc.setFontSize(10)
    doc.text(`Month: ${new Date(month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}`, 14, 38)

    const rows = summaryData.map((r) => [r.dept, r.count.toString(), r.gross.toLocaleString(), r.deductions.toLocaleString(), r.net.toLocaleString()])
    ;(doc as any).autoTable({
      startY: 45,
      head: [["Department", "Employees", "Gross", "Deductions", "Net"]],
      body: rows,
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.text(`Total Gross: PKR ${totalGross.toLocaleString()}`, 14, finalY)
    doc.text(`Total Deductions: PKR ${totalDeductions.toLocaleString()}`, 14, finalY + 7)
    doc.text(`Total Net Pay: PKR ${totalNet.toLocaleString()}`, 14, finalY + 14)
    doc.save(`Salary_Summary_${month}.pdf`)
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📊 Salary Summary</h1>
      </div>

      <div className="card">
        <input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {summaryData.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Employees</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {summaryData.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.dept}</td>
                  <td>{r.count}</td>
                  <td>PKR {r.gross.toLocaleString()}</td>
                  <td>PKR {r.deductions.toLocaleString()}</td>
                  <td>PKR {r.net.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <div>Total Gross: PKR {totalGross.toLocaleString()}</div>
            <div>Total Deductions: PKR {totalDeductions.toLocaleString()}</div>
            <div>Total Net Pay: PKR {totalNet.toLocaleString()}</div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={downloadPDF}>
            <Download size={16} /> Download PDF
          </button>
        </div>
      )}
    </div>
  )
}
