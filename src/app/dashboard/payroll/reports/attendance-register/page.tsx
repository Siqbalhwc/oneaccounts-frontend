"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import jsPDF from "jspdf"
import "jspdf-autotable"

export default function AttendanceRegisterPage() {
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
  const [register, setRegister] = useState<any[]>([])
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
    setRegister([])

    // Fetch all attendance records for the company in this month
    const [y, m] = month.split("-").map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const startDate = month
    const endDate = `${y}-${String(m).padStart(2, "0")}-${daysInMonth}`

    const { data: records } = await supabase
      .from("attendance_records")
      .select("employee_id, date, raw_status, employees!inner(full_name, employee_code)")
      .eq("company_id", companyId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date")

    if (!records || records.length === 0) {
      setError("No attendance records found for this month.")
      setLoading(false)
      return
    }

    // Group by employee
    const grouped: Record<number, { name: string; code: string; present: number; absent: number; leave: number; halfDay: number }> = {}
    for (const rec of records) {
      const emp = Array.isArray(rec.employees) ? rec.employees[0] : rec.employees
      const empId = rec.employee_id
      if (!grouped[empId]) {
        grouped[empId] = {
          name: emp?.full_name || "Unknown",
          code: emp?.employee_code || "N/A",
          present: 0,
          absent: 0,
          leave: 0,
          halfDay: 0,
        }
      }
      const status = rec.raw_status
      if (status === "present") grouped[empId].present++
      else if (status === "absent") grouped[empId].absent++
      else if (status === "leave") grouped[empId].leave++
      else if (status === "half_day") grouped[empId].halfDay++
    }

    setRegister(Object.values(grouped))
    setLoading(false)
  }

  useEffect(() => {
    if (month && companyId) fetchRegister()
  }, [month, companyId])

  const totalPresent = register.reduce((s, r) => s + r.present, 0)
  const totalAbsent = register.reduce((s, r) => s + r.absent, 0)
  const totalLeave = register.reduce((s, r) => s + r.leave, 0)
  const totalHalf = register.reduce((s, r) => s + r.halfDay, 0)

  const downloadPDF = () => {
    if (register.length === 0) return
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(company?.name || "Company", 14, 20)
    doc.setFontSize(12)
    doc.text("Attendance Register", 14, 30)
    doc.setFontSize(10)
    doc.text(`Month: ${new Date(month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}`, 14, 38)

    const rows = register.map((r) => [
      r.code,
      r.name,
      r.present.toString(),
      r.absent.toString(),
      r.leave.toString(),
      r.halfDay.toString(),
    ])
    ;(doc as any).autoTable({
      startY: 45,
      head: [["Code", "Employee", "Present", "Absent", "Leave", "Half Days"]],
      body: rows,
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.text(`Total Present: ${totalPresent}`, 14, finalY)
    doc.text(`Total Absent: ${totalAbsent}`, 14, finalY + 7)
    doc.text(`Total Leave: ${totalLeave}`, 14, finalY + 14)
    doc.text(`Total Half Days: ${totalHalf}`, 14, finalY + 21)
    doc.save(`Attendance_Register_${month}.pdf`)
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📅 Attendance Register</h1>
      </div>

      <div className="card">
        <input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {register.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Leave</th>
                <th>Half Days</th>
              </tr>
            </thead>
            <tbody>
              {register.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.present}</td>
                  <td>{r.absent}</td>
                  <td>{r.leave}</td>
                  <td>{r.halfDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <div>Total Present: {totalPresent}</div>
            <div>Total Absent: {totalAbsent}</div>
            <div>Total Leave: {totalLeave}</div>
            <div>Total Half Days: {totalHalf}</div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={downloadPDF}>
            <Download size={16} /> Download PDF
          </button>
        </div>
      )}
    </div>
  )
}
