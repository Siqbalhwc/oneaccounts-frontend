"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ChevronLeft, ChevronRight, Save, Calendar as CalendarIcon, List,
  Upload, Search, Check, Lock, AlertCircle, Users, Clock, CheckCircle,
  Percent
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

const STATUS_PILLS: Record<string, { bg: string; text: string; label: string }> = {
  present:       { bg: "#DCFCE7", text: "#166534", label: "Present" },
  absent:        { bg: "#FEE2E2", text: "#991B1B", label: "Absent" },
  leave:         { bg: "#FEF3C7", text: "#92400E", label: "Leave" },
  half_day:      { bg: "#DBEAFE", text: "#1D4ED8", label: "Half Day" },
  missing_punch: { bg: "#EDE9FE", text: "#6D28D9", label: "Missing Punch" },
}

const STATUS_ORDER = ["present", "absent", "leave", "half_day", "missing_punch"]
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function UnifiedAttendancePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar")
  const [employees, setEmployees] = useState<any[]>([])
  const [attendanceData, setAttendanceData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Filters
  const [searchEmployee, setSearchEmployee] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [departments, setDepartments] = useState<any[]>([])

  // Frozen state
  const [frozen, setFrozen] = useState(false)

  // Horizontal scroll sync (calendar)
  const calendarRef = useRef<HTMLDivElement>(null)
  const stickyColRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // Fetch company ID, employees, departments, attendance, freeze status
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch employees WITHOUT joining departments
        supabase
          .from("employees")
          .select("id, employee_code, full_name, department_id")
          .eq("company_id", cid)
          .eq("status", "active")
          .order("full_name")
          .then(({ data }) => setEmployees(data || []))
        // Fetch departments separately for the filter dropdown
        supabase
          .from("departments")
          .select("id, name")
          .eq("company_id", cid)
          .order("name")
          .then(({ data }) => setDepartments(data || []))
        // Check freeze status
        supabase
          .from("attendance_freeze")
          .select("id")
          .eq("company_id", cid)
          .eq("month", `${year}-${String(month + 1).padStart(2, "0")}-01`)
          .maybeSingle()
          .then(({ data }) => setFrozen(!!data))
      }
    })
  }, [month, year])

  // Fetch attendance for month
  useEffect(() => {
    if (!companyId) return
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`
    supabase
      .from("attendance_records")
      .select("employee_id, date, raw_status, check_in, check_out, verified_status")
      .eq("company_id", companyId)
      .gte("date", startDate)
      .lte("date", endDate)
      .then(({ data }) => {
        const map: Record<string, any> = {}
        if (data) {
          data.forEach((row: any) => {
            const key = `${row.employee_id}_${row.date}`
            map[key] = row
          })
        }
        setAttendanceData(map)
        setLoading(false)
      })
  }, [companyId, month, year, daysInMonth])

  // --- Helpers ---
  const getCell = (empId: number, dateStr: string) => {
    const key = `${empId}_${dateStr}`
    return attendanceData[key] || { raw_status: "present", verified_status: "pending", check_in: "", check_out: "" }
  }

  const setCell = (empId: number, dateStr: string, field: string, value: any) => {
    const key = `${empId}_${dateStr}`
    setAttendanceData(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { raw_status: "present", verified_status: "pending" }), [field]: value }
    }))
    setDirty(true)
  }

  const cycleStatus = (empId: number, dateStr: string, currentStatus: string) => {
    const idx = STATUS_ORDER.indexOf(currentStatus)
    const nextIdx = (idx + 1) % STATUS_ORDER.length
    setCell(empId, dateStr, "raw_status", STATUS_ORDER[nextIdx])
  }

  // --- Summaries ---
  const presentCount = Object.values(attendanceData).filter((r: any) => r.raw_status === "present").length
  const absentCount = Object.values(attendanceData).filter((r: any) => r.raw_status === "absent").length
  const leaveCount = Object.values(attendanceData).filter((r: any) => r.raw_status === "leave").length
  const missingPunchCount = Object.values(attendanceData).filter((r: any) => r.raw_status === "missing_punch").length
  const totalRecords = Object.keys(attendanceData).length
  const attendancePercent = totalRecords > 0
    ? Math.round((presentCount / totalRecords) * 100)
    : 100

  // --- Filtered employees for display ---
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchSearch = searchEmployee.trim() === "" ||
        emp.full_name?.toLowerCase().includes(searchEmployee.toLowerCase()) ||
        emp.employee_code?.toLowerCase().includes(searchEmployee.toLowerCase())
      const matchDept = departmentFilter === "all" || emp.department_id?.toString() === departmentFilter
      return matchSearch && matchDept
    })
  }, [employees, searchEmployee, departmentFilter])

  // --- Save ---
  const handleSave = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    setSaving(true)
    setError("")

    const records: any[] = []
    filteredEmployees.forEach(emp => {
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
          verified_status: cell.verified_status || "pending",
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

    setDirty(false)
    setFlash(`Attendance saved for ${monthLabel}`)
    setSaving(false)
  }

  // --- Navigation ---
  const goToPrevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const goToNextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: "24px 32px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", position: "relative" }}>
      <style>{`
        .status-pill {
          width: 28px; height: 28px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center; font-size: 11px;
          font-weight: 700; cursor: pointer; transition: all 0.15s;
          border: 2px solid transparent; margin: 0 auto;
        }
        .status-pill:hover { transform: scale(1.15); border-color: rgba(0,0,0,0.1); }
        .calendar-cell {
          text-align: center; vertical-align: middle; padding: 6px 4px;
          border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
        }
        .calendar-cell.today { background: rgba(59,130,246,0.06); }
        .calendar-cell.weekend { background: var(--card-hover); }
        .calendar-cell:hover { background: rgba(0,0,0,0.03); }
        .sticky-col {
          position: sticky; left: 0; z-index: 2; background: var(--card);
          border-right: 1px solid var(--border);
        }
        .sticky-header {
          position: sticky; top: 0; z-index: 3; background: var(--card-hover);
        }
        .summary-card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 18px; text-align: center;
        }
        .summary-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .summary-value { font-size: 26px; font-weight: 800; }
        .btn {
          padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 13px;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--border); background: transparent; color: var(--text-muted);
          transition: all 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn.active { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { filter: brightness(0.95); }
        .btn-save { background: #059669; color: white; border-color: #059669; }
        .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .sticky-footer {
          position: sticky; bottom: 0; background: var(--card); border-top: 1px solid var(--border);
          padding: 12px 24px; display: flex; justify-content: space-between;
          align-items: center; z-index: 5; margin-top: 12px;
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Attendance</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
            Manage employee attendance for {monthLabel}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn ${viewMode === "calendar" ? "active" : ""}`} onClick={() => setViewMode("calendar")}>
            <CalendarIcon size={16} /> Calendar
          </button>
          <button className={`btn ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")}>
            <List size={16} /> List
          </button>
          <button className="btn" onClick={() => router.push("/dashboard/payroll/attendance/verify")}>
            <Check size={16} /> Verify
          </button>
          <button className="btn" onClick={() => router.push("/dashboard/payroll/attendance/import")}>
            <Upload size={16} /> Import CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="summary-card">
          <div className="summary-label"><Users size={12} style={{ marginRight: 4 }} /> Present Today</div>
          <div className="summary-value" style={{ color: "#166534" }}>{presentCount}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label"><AlertCircle size={12} style={{ marginRight: 4 }} /> Absent</div>
          <div className="summary-value" style={{ color: "#991B1B" }}>{absentCount}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label"><CalendarIcon size={12} style={{ marginRight: 4 }} /> Leave</div>
          <div className="summary-value" style={{ color: "#92400E" }}>{leaveCount}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label"><Clock size={12} style={{ marginRight: 4 }} /> Missing Punch</div>
          <div className="summary-value" style={{ color: "#6D28D9" }}>{missingPunchCount}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label"><Percent size={12} style={{ marginRight: 4 }} /> Attendance %</div>
          <div className="summary-value" style={{ color: "#1D4ED8" }}>{attendancePercent}%</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text" placeholder="Search employee..." value={searchEmployee}
            onChange={e => setSearchEmployee(e.target.value)}
            style={{ width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px 0 36px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}
          />
        </div>
        <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}
          style={{ height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}>
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn" onClick={goToPrevMonth}><ChevronLeft size={18} /></button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{monthLabel}</span>
          <button className="btn" onClick={goToNextMonth}><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          {frozen ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#DC2626", fontWeight: 600, fontSize: 13 }}>
              <Lock size={16} /> Frozen
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#10B981", fontWeight: 600, fontSize: 13 }}>
              <CheckCircle size={16} /> Open
            </span>
          )}
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{flash}</div>}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", overflowX: "auto", maxHeight: "calc(100vh - 340px)" }} ref={calendarRef}>
            {/* Sticky Employee Column */}
            <div style={{ minWidth: 200, maxWidth: 200, flexShrink: 0 }}>
              <div className="sticky-header" style={{ height: 44, padding: "8px 12px", fontWeight: 700, borderBottom: "1px solid var(--border)" }}>Employee</div>
              {filteredEmployees.map(emp => (
                <div key={emp.id} className="sticky-col" style={{ height: 48, padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.full_name}</div>
                </div>
              ))}
            </div>

            {/* Scrollable Calendar Grid */}
            <div style={{ flex: 1, overflowX: "auto" }}>
              <div style={{ display: "flex", minWidth: `${daysInMonth * 40}px` }}>
                {/* Day headers */}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1
                  const date = new Date(year, month, day)
                  const weekday = WEEK_DAYS[date.getDay()]
                  const isToday = date.toDateString() === new Date().toDateString()
                  return (
                    <div key={day} className={`calendar-cell sticky-header`} style={{ width: 40, height: 44, fontWeight: 700, fontSize: 11, background: isToday ? "rgba(59,130,246,0.08)" : "var(--card-hover)", color: isToday ? "var(--primary)" : "var(--text-muted)" }}>
                      <div>{day}</div>
                      <div style={{ fontSize: 9 }}>{weekday}</div>
                    </div>
                  )
                })}
              </div>
              {/* Rows */}
              {filteredEmployees.map(emp => (
                <div key={emp.id} style={{ display: "flex", minWidth: `${daysInMonth * 40}px` }}>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                    const cell = getCell(emp.id, dateStr)
                    const status = cell.raw_status || "present"
                    const { bg, text } = STATUS_PILLS[status] || STATUS_PILLS.present
                    const date = new Date(year, month, day)
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6
                    const isToday = date.toDateString() === new Date().toDateString()
                    return (
                      <div key={day} className={`calendar-cell ${isWeekend ? "weekend" : ""} ${isToday ? "today" : ""}`} style={{ width: 40, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div
                          className="status-pill"
                          style={{ backgroundColor: bg, color: text }}
                          title={STATUS_PILLS[status].label}
                          onClick={() => !frozen && cycleStatus(emp.id, dateStr, status)}
                        >
                          {status.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", padding: 16, boxShadow: "var(--shadow-sm)", maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Employee</th>
                <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Date</th>
                <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Status</th>
                <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Check In</th>
                <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Check Out</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.flatMap(emp =>
                Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  const cell = getCell(emp.id, dateStr)
                  const { bg, text, label } = STATUS_PILLS[cell.raw_status] || STATUS_PILLS.present
                  return (
                    <tr key={`${emp.id}-${dateStr}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>{emp.full_name}</td>
                      <td style={{ textAlign: "center", padding: "8px 12px", fontSize: 12 }}>{dateStr}</td>
                      <td style={{ textAlign: "center", padding: "8px 12px" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: bg, color: text }}>
                          {label}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", padding: "8px 12px", fontSize: 12 }}>{cell.check_in || "—"}</td>
                      <td style={{ textAlign: "center", padding: "8px 12px", fontSize: 12 }}>{cell.check_out || "—"}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sticky Save Footer */}
      {dirty && (
        <div className="sticky-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#F59E0B", fontWeight: 600 }}>
            <AlertCircle size={16} /> Unsaved changes
          </div>
          <button className="btn btn-save" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? "Saving..." : `Save ${monthLabel}`}
          </button>
        </div>
      )}
    </div>
  )
}