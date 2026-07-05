"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Save, ChevronLeft, ChevronRight, CheckCircle,
  Calendar as CalendarIcon, List, Upload
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

// Status mapping for calendar cells
const STATUS_MAP: Record<string, { code: string; color: string; label: string }> = {
  present:       { code: "P", color: "#10B981", label: "Present" },
  absent:        { code: "A", color: "#EF4444", label: "Absent" },
  leave:         { code: "L", color: "#F59E0B", label: "Leave" },
  half_day:      { code: "H", color: "#3B82F6", label: "Half Day" },
  missing_punch: { code: "M", color: "#8B5CF6", label: "Missing Punch" },
}

const STATUS_ORDER = ["present", "absent", "leave", "half_day", "missing_punch"]
const STATUS_OPTIONS = STATUS_ORDER   // for dropdowns

export default function UnifiedAttendancePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  // Month navigation
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar")

  const [companyId, setCompanyId] = useState("")
  const [employees, setEmployees] = useState<any[]>([])
  const [attendanceData, setAttendanceData] = useState<Record<string, any>>({})   // key "empId_dateStr"
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Navigation
  const goToPrevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const goToNextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  // Fetch company and active employees
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
            if (data) setEmployees(data)
            setLoading(false)
          })
      }
    })
  }, [])

  // Fetch attendance for the current month
  useEffect(() => {
    if (!companyId) return
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`

    supabase
      .from("attendance_records")
      .select("employee_id, date, raw_status, check_in, check_out")
      .eq("company_id", companyId)
      .gte("date", startDate)
      .lte("date", endDate)
      .then(({ data }) => {
        const map: Record<string, any> = {}
        if (data) {
          data.forEach((row: any) => {
            const key = `${row.employee_id}_${row.date}`
            map[key] = {
              raw_status: row.raw_status,
              check_in: row.check_in || "",
              check_out: row.check_out || "",
            }
          })
        }
        setAttendanceData(map)
      })
  }, [companyId, month, year, daysInMonth])

  // Helper to get/set cell data
  const getCell = (empId: number, dateStr: string) => {
    const key = `${empId}_${dateStr}`
    return attendanceData[key] || { raw_status: "present", check_in: "", check_out: "" }
  }

  const setCell = (empId: number, dateStr: string, field: string, value: any) => {
    const key = `${empId}_${dateStr}`
    setAttendanceData(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { raw_status: "present", check_in: "", check_out: "" }), [field]: value }
    }))
  }

  // Calendar: cycle status
  const cycleStatus = (empId: number, dateStr: string, currentStatus: string) => {
    const idx = STATUS_ORDER.indexOf(currentStatus)
    const nextIdx = (idx + 1) % STATUS_ORDER.length
    setCell(empId, dateStr, "raw_status", STATUS_ORDER[nextIdx])
  }

  // Save all visible records for the month
  const handleSave = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    setSaving(true)
    setError("")
    setFlash("")

    const records: any[] = []
    employees.forEach(emp => {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
        const cell = getCell(emp.id, dateStr)
        records.push({
          company_id: companyId,
          employee_id: emp.id,
          date: dateStr,
          raw_status: cell.raw_status,
          check_in: cell.check_in || null,
          check_out: cell.check_out || null,
          source: "manual",
          verified_status: "pending",
        })
      }
    })

    const { error: upsertErr } = await supabase
      .from("attendance_records")
      .upsert(records, { onConflict: "company_id,employee_id,date" })

    if (upsertErr) {
      setError(upsertErr.message)
      setSaving(false)
      return
    }

    setFlash(`✅ Attendance saved for ${monthLabel}`)
    setSaving(false)
  }

  // CSV import placeholder
  const handleCsvImport = () => {
    router.push("/dashboard/payroll/attendance/import")   // future page
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

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .calendar-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .calendar-table th, .calendar-table td {
          border: 1px solid var(--border);
          padding: 4px 2px;
          text-align: center;
          font-size: 12px;
          vertical-align: middle;
        }
        .calendar-table th {
          background: var(--card-hover);
          font-weight: 700;
          color: var(--text-muted);
          font-size: 11px;
          text-transform: uppercase;
        }
        .cell {
          cursor: pointer;
          min-width: 24px;
          border-radius: 4px;
          padding: 2px 0;
          transition: background 0.1s;
          margin: 0 auto;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: white;
        }
        .cell:hover { filter: brightness(0.9); }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-active { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-save { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .month-nav { display: flex; align-items: center; gap: 12px; }
        .month-title { font-size: 20px; font-weight: 800; color: var(--text); }
        .list-table { width: 100%; border-collapse: collapse; }
        .list-table th, .list-table td {
          padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px;
        }
        .list-table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .list-table tr:hover td { background: var(--card-hover); }
        .small-input { height: 32px; width: 100%; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; padding: 0 6px; background: var(--bg); color: var(--text); }
        .small-select { height: 32px; width: 100%; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; padding: 0 4px; background: var(--bg); color: var(--text); }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/runs")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📋 Attendance</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {viewMode === "calendar" ? "Click a day to cycle status" : "Edit detailed attendance"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn ${viewMode === "calendar" ? "btn-active" : ""}`}
            onClick={() => setViewMode("calendar")}
            title="Calendar View"
          >
            <CalendarIcon size={16} /> Calendar
          </button>
          <button
            className={`btn ${viewMode === "list" ? "btn-active" : ""}`}
            onClick={() => setViewMode("list")}
            title="List View"
          >
            <List size={16} /> List
          </button>
          <button className="btn" onClick={handleCsvImport} title="Import CSV (coming soon)">
            <Upload size={16} /> Import
          </button>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="month-nav" style={{ marginBottom: 16 }}>
        <button className="btn" onClick={goToPrevMonth}><ChevronLeft size={16} /></button>
        <span className="month-title">{monthLabel}</span>
        <button className="btn" onClick={goToNextMonth}><ChevronRight size={16} /></button>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      {/* CALENDAR VIEW */}
      {viewMode === "calendar" && (
        <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", padding: 12, boxShadow: "var(--shadow-sm)" }}>
          <table className="calendar-table">
            <thead>
              <tr>
                <th style={{ width: 180, textAlign: "left", paddingLeft: 12 }}>Employee</th>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1
                  const date = new Date(year, month, day)
                  const weekday = weekDays[date.getDay()]
                  return (
                    <th key={day}>
                      <div>{day}</div>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>{weekday}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td style={{ textAlign: "left", paddingLeft: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                    <div>{emp.full_name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{emp.employee_code}</div>
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                    const cell = getCell(emp.id, dateStr)
                    const { code, color, label } = STATUS_MAP[cell.raw_status] || STATUS_MAP.present
                    return (
                      <td key={day}>
                        <div
                          className="cell"
                          style={{ background: color }}
                          title={`${label} - ${dateStr}`}
                          onClick={() => cycleStatus(emp.id, dateStr, cell.raw_status)}
                        >
                          {code}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", padding: 12, boxShadow: "var(--shadow-sm)" }}>
          <table className="list-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
              </tr>
            </thead>
            <tbody>
              {employees.flatMap(emp =>
                Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  const cell = getCell(emp.id, dateStr)
                  return (
                    <tr key={`${emp.id}-${dateStr}`}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {emp.full_name}<br />
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{emp.employee_code}</span>
                      </td>
                      <td>{dateStr}</td>
                      <td>
                        <select
                          className="small-select"
                          value={cell.raw_status}
                          onChange={(e) => setCell(emp.id, dateStr, "raw_status", e.target.value)}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s.replace("_", " ")}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="time"
                          className="small-input"
                          value={cell.check_in}
                          onChange={(e) => setCell(emp.id, dateStr, "check_in", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          className="small-input"
                          value={cell.check_out}
                          onChange={(e) => setCell(emp.id, dateStr, "check_out", e.target.value)}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Save Button */}
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-save" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? "Saving..." : `Save ${monthLabel}`}
        </button>
      </div>
    </div>
  )
}