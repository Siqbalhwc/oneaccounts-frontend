"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

export default function PayrollRegisterPage() {
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
  const [runLines, setRunLines] = useState<any[]>([])
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

  const fetchRegister = async () => {
    if (!month || !companyId) return
    setLoading(true)
    setError("")
    setRunLines([])

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

    // Fetch all run lines for that run with employee details
    const { data: lines } = await supabase
      .from("payroll_run_lines")
      .select("*, employees!inner(full_name, employee_code)")
      .eq("payroll_run_id", run.id)
      .order("id")

    if (!lines || lines.length === 0) {
      setError("No employees found in this payroll run.")
    } else {
      setRunLines(lines)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (month && companyId) fetchRegister()
  }, [month, companyId])

  const totals = runLines.reduce(
    (acc, line) => ({
      gross: acc.gross + (line.gross_amount || 0),
      deductions: acc.deductions + (line.total_deductions || 0),
      net: acc.net + (line.net_amount || 0),
    }),
    { gross: 0, deductions: 0, net: 0 }
  )

  const downloadPDF = () => {
    if (runLines.length === 0) return
    const doc = new jsPDF()
    // Header
    doc.setFontSize(16)
    doc.text(company?.name || "Company", 14, 20)
    doc.setFontSize(12)
    doc.text("Payroll Register", 14, 30)
    doc.setFontSize(10)
    doc.text(`Month: ${new Date(month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}`, 14, 38)

    const rows = runLines.map((line) => [
      line.employees?.employee_code || "N/A",
      line.employees?.full_name || "Unknown",
      line.gross_amount.toLocaleString(),
      line.total_deductions.toLocaleString(),
      line.net_amount.toLocaleString(),
    ])

    ;(doc as any).autoTable({
      startY: 45,
      head: [["Code", "Employee", "Gross", "Deductions", "Net"]],
      body: rows,
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.text(`Total Gross: PKR ${totals.gross.toLocaleString()}`, 14, finalY)
    doc.text(`Total Deductions: PKR ${totals.deductions.toLocaleString()}`, 14, finalY + 7)
    doc.text(`Total Net Pay: PKR ${totals.net.toLocaleString()}`, 14, finalY + 14)
    doc.save(`Payroll_Register_${month}.pdf`)
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📋 Payroll Register</h1>
      </div>

      <div className="card">
        <input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {runLines.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {runLines.map((line) => (
                <tr key={line.id}>
                  <td>{line.employees?.employee_code}</td>
                  <td>{line.employees?.full_name}</td>
                  <td>{Number(line.gross_amount).toLocaleString()}</td>
                  <td>{Number(line.total_deductions).toLocaleString()}</td>
                  <td>{Number(line.net_amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <div>Total Gross: PKR {totals.gross.toLocaleString()}</div>
            <div>Total Deductions: PKR {totals.deductions.toLocaleString()}</div>
            <div>Total Net: PKR {totals.net.toLocaleString()}</div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={downloadPDF}>
            <Download size={16} /> Download PDF
          </button>
        </div>
      )}
    </div>
  )
}