"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

export default function BankTransferSheetPage() {
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
  const [sheetData, setSheetData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchSheet = async () => {
    if (!month || !companyId) return
    setLoading(true)
    setError("")

    // Find run for month
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

    // Fetch run lines with employee bank details
    const { data: lines } = await supabase
      .from("payroll_run_lines")
      .select("net_amount, employees!inner(employee_code, full_name, bank_account_no, payment_method)")
      .eq("payroll_run_id", run.id)
      .order("id")

    if (!lines || lines.length === 0) {
      setError("No employees found in this payroll run.")
      setSheetData([])
    } else {
      // Flatten the join
      const flat = lines.map((line: any) => {
        const emp = Array.isArray(line.employees) ? line.employees[0] : line.employees
        return {
          code: emp?.employee_code || "N/A",
          name: emp?.full_name || "Unknown",
          bank_account: emp?.bank_account_no || "N/A",
          payment_method: emp?.payment_method || "N/A",
          net: line.net_amount,
        }
      })
      setSheetData(flat)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (month && companyId) fetchSheet()
  }, [month, companyId])

  const totalNet = sheetData.reduce((sum, r) => sum + r.net, 0)

  const downloadCSV = () => {
    let csv = "Employee Code,Employee Name,Bank Account,Payment Method,Net Pay\n"
    sheetData.forEach((r) => {
      csv += `"${r.code}","${r.name}","${r.bank_account}","${r.payment_method}",${r.net}\n`
    })
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Bank_Transfer_${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🏦 Bank Transfer Sheet</h1>
      </div>

      <div className="card">
        <input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {sheetData.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Bank Account</th>
                <th>Payment Method</th>
                <th>Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {sheetData.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.bank_account}</td>
                  <td>{r.payment_method}</td>
                  <td>PKR {r.net.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">Total Net Pay: PKR {totalNet.toLocaleString()}</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={downloadCSV}>
            <Download size={16} /> Download CSV
          </button>
        </div>
      )}
    </div>
  )
}