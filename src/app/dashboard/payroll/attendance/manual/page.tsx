"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

const STATUS_OPTIONS = ["present", "absent", "leave", "half_day", "missing_punch"]

export default function ManualAttendancePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [employees, setEmployees] = useState<any[]>([])
  const [attendanceRows, setAttendanceRows] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Fetch company ID and active employees
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
          .then(({ data }) => {
            if (data) {
              setEmployees(data)
              // Initialize all rows to 'present'
              const initial: Record<number, any> = {}
              data.forEach((emp: any) => {
                initial[emp.id] = {
                  employee_id: emp.id,
                  raw_status: "present",
                  check_in: "",
                  check_out: "",
                }
              })
              setAttendanceRows(initial)
            }
            setLoading(false)
          })
      }
    })
  }, [])

  // Fetch existing records for the selected date and pre‑fill
  useEffect(() => {
    if (!companyId || !date) return
    supabase
      .from("attendance_records")
      .select("employee_id, raw_status, check_in, check_out")
      .eq("company_id", companyId)
      .eq("date", date)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const existing: Record<number, any> = { ...attendanceRows }
          data.forEach((row: any) => {
            existing[row.employee_id] = {
              employee_id: row.employee_id,
              raw_status: row.raw_status,
              check_in: row.check_in || "",
              check_out: row.check_out || "",
            }
          })
          setAttendanceRows(existing)
        }
      })
  }, [date, companyId])

  const handleRowChange = (empId: number, field: string, value: string) => {
    setAttendanceRows((prev) => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: value },
    }))
  }

  const handleSave = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    setSaving(true)
    setError("")
    setFlash("")

    const records = Object.values(attendanceRows).map((row: any) => ({
      company_id: companyId,
      employee_id: row.employee_id,
      date,
      raw_status: row.raw_status,
      check_in: row.check_in || null,
      check_out: row.check_out || null,
      source: "manual",
      verified_status: "pending",
    }))

    const { error: upsertErr } = await supabase
      .from("attendance_records")
      .upsert(records, { onConflict: "company_id,employee_id,date" })

    if (upsertErr) {
      setError(upsertErr.message)
      setSaving(false)
      return
    }

    // ✅ Refresh the displayed records from the database
    const { data } = await supabase
      .from("attendance_records")
      .select("employee_id, raw_status, check_in, check_out")
      .eq("company_id", companyId)
      .eq("date", date)
    if (data) {
      const refreshed: Record<number, any> = { ...attendanceRows }
      data.forEach((row: any) => {
        refreshed[row.employee_id] = {
          employee_id: row.employee_id,
          raw_status: row.raw_status,
          check_in: row.check_in || "",
          check_out: row.check_out || "",
        }
      })
      setAttendanceRows(refreshed)
    }

    setFlash(`✅ Attendance saved for ${date}`)
    setSaving(false)
  }

  if (planLoading || loading) {
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
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .input:focus, .select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-save { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table tr:hover td { background: var(--card-hover); }
        @media (max-width: 640px) {
          .hide-mobile { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/runs")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📋 Manual Attendance</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Record daily attendance for all active employees</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="label" style={{ marginBottom: 0, whiteSpace: "nowrap" }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ height: 38, width: 180 }}
          />
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      {employees.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
          No active employees found. Please add employees first.
        </div>
      ) : (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th className="hide-mobile">Check In</th>
                  <th className="hide-mobile">Check Out</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const row = attendanceRows[emp.id] || { raw_status: "present", check_in: "", check_out: "" }
                  return (
                    <tr key={emp.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{emp.employee_code}</td>
                      <td style={{ fontWeight: 600 }}>{emp.full_name}</td>
                      <td>
                        <select
                          value={row.raw_status}
                          onChange={(e) => handleRowChange(emp.id, "raw_status", e.target.value)}
                          style={{ height: 34, width: "100%", fontSize: 13 }}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s.replace("_", " ")}</option>
                          ))}
                        </select>
                      </td>
                      <td className="hide-mobile">
                        <input
                          type="time"
                          value={row.check_in}
                          onChange={(e) => handleRowChange(emp.id, "check_in", e.target.value)}
                          style={{ height: 34, width: "100%", fontSize: 13 }}
                        />
                      </td>
                      <td className="hide-mobile">
                        <input
                          type="time"
                          value={row.check_out}
                          onChange={(e) => handleRowChange(emp.id, "check_out", e.target.value)}
                          style={{ height: 34, width: "100%", fontSize: 13 }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button className="btn btn-save" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? "Saving..." : "Save Attendance"}
          </button>
        </>
      )}
    </div>
  )
}