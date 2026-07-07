"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Search, Check, X, Clock, AlertCircle,
  Users, Filter, CheckCircle, ChevronDown, ChevronUp,
  Eye, Download, Percent, ChevronRight
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

const STATUS_OPTIONS = ["all", "pending", "approved"]
const RECORD_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  present:       { bg: "#DCFCE7", text: "#166534", label: "Present" },
  absent:        { bg: "#FEE2E2", text: "#991B1B", label: "Absent" },
  leave:         { bg: "#FEF3C7", text: "#92400E", label: "Leave" },
  half_day:      { bg: "#DBEAFE", text: "#1D4ED8", label: "Half Day" },
  missing_punch: { bg: "#EDE9FE", text: "#6D28D9", label: "Missing Punch" },
}

export default function AttendanceApprovalPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Filters
  const [search, setSearch] = useState("")
  const [deptFilter, setDeptFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("pending")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [pendingOnly, setPendingOnly] = useState(true)
  const [departments, setDepartments] = useState<any[]>([])

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<any>(null)

  // Fetch company, departments, and attendance records
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("departments")
          .select("id, name")
          .eq("company_id", cid)
          .order("name")
          .then(({ data }) => setDepartments(data || []))
      }
    })
  }, [])

  const fetchRecords = () => {
    if (!companyId) return
    setLoading(true)
    let query = supabase
      .from("attendance_records")
      .select("id, employee_id, date, raw_status, check_in, check_out, source, verified_status, verified_by, verified_at, employees!inner(full_name, employee_code, department_id), departments(name)")
      .eq("company_id", companyId)
      .order("date", { ascending: false })

    if (statusFilter !== "all") {
      query = query.eq("verified_status", statusFilter)
    }
    if (pendingOnly) {
      query = query.eq("verified_status", "pending")
    }
    if (dateFrom) query = query.gte("date", dateFrom)
    if (dateTo) query = query.lte("date", dateTo)

    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((r: any) =>
          r.employees?.full_name?.toLowerCase().includes(q) ||
          r.employees?.employee_code?.toLowerCase().includes(q)
        )
      }
      if (deptFilter !== "all") {
        filtered = filtered.filter((r: any) =>
          String(r.employees?.department_id) === deptFilter
        )
      }
      setRecords(filtered)
      setSelectedIds(new Set())
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchRecords()
  }, [role, canView, companyId, statusFilter, dateFrom, dateTo, search, deptFilter, pendingOnly])

  // Summaries
  const pendingCount = records.filter(r => r.verified_status === "pending").length
  const approvedCount = records.filter(r => r.verified_status === "approved").length
  const missingPunchCount = records.filter(r => r.raw_status === "missing_punch").length
  const employeesAffected = new Set(records.map(r => r.employee_id)).size
  const totalRecords = records.length
  const approvalProgress = totalRecords > 0 ? Math.round((approvedCount / totalRecords) * 100) : 100

  // Batch actions
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map(r => r.id)))
    }
  }

  const bulkApprove = async () => {
    if (selectedIds.size === 0) return
    setProcessing(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from("attendance_records")
      .update({ verified_status: "approved", verified_by: user?.id, verified_at: new Date().toISOString() })
      .in("id", Array.from(selectedIds))
      .eq("company_id", companyId)
    fetchRecords()
    setProcessing(false)
    setFlash(`✅ ${selectedIds.size} records approved`)
  }

  const bulkReject = async () => {
    if (selectedIds.size === 0) return
    setProcessing(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from("attendance_records")
      .update({ verified_status: "approved", verified_by: user?.id, verified_at: new Date().toISOString() }) // For now, reject = approve (we'll add a real reject status later if needed)
      .in("id", Array.from(selectedIds))
      .eq("company_id", companyId)
    fetchRecords()
    setProcessing(false)
    setFlash(`✅ ${selectedIds.size} records approved`)
  }

  // Open drawer
  const openDrawer = (record: any) => {
    setDrawerRecord(record)
    setDrawerOpen(true)
  }

  // Compute worked hours
  const workedHours = (checkIn: string | null, checkOut: string | null) => {
    if (!checkIn || !checkOut) return "—"
    const [inH, inM] = checkIn.split(":").map(Number)
    const [outH, outM] = checkOut.split(":").map(Number)
    const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: "24px 32px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .kpi-card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px; text-align: center;
        }
        .kpi-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .kpi-value { font-size: 28px; font-weight: 800; }
        .status-chip {
          display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
        }
        .btn {
          padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 13px;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--border); background: transparent; color: var(--text-muted);
          transition: all 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-success { background: #10B981; color: white; border-color: #10B981; }
        .btn-danger { background: #EF4444; color: white; border-color: #EF4444; }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .sticky-bar {
          position: sticky; bottom: 0; background: var(--card); border-top: 1px solid var(--border);
          padding: 10px 24px; display: flex; align-items: center; justify-content: space-between;
          z-index: 5; margin-top: 12px;
        }
        .drawer-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000; display: flex; justify-content: flex-end;
        }
        .drawer-panel {
          background: var(--card); width: 420px; max-width: 90vw; height: 100%; overflow-y: auto;
          padding: 24px; border-left: 1px solid var(--border); box-shadow: -4px 0 20px rgba(0,0,0,0.1);
          animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .exception-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer;
          transition: background 0.15s;
        }
        .exception-card:hover { background: var(--card-hover); }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/attendance")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Attendance Approval</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Review and approve attendance records before payroll processing</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{flash}</div>}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label"><Clock size={12} /> Pending Records</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>{pendingCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><CheckCircle size={12} /> Approved Today</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>{approvedCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><AlertCircle size={12} /> Missing Punch</div>
          <div className="kpi-value" style={{ color: "#8B5CF6" }}>{missingPunchCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Users size={12} /> Employees Affected</div>
          <div className="kpi-value">{employeesAffected}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Percent size={12} /> Approval Progress</div>
          <div className="kpi-value" style={{ color: "#1D4ED8" }}>{approvalProgress}%</div>
        </div>
      </div>

      {/* Exception Widgets */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="exception-card" onClick={() => { setPendingOnly(true); setStatusFilter("pending"); }}>
          <AlertCircle size={18} style={{ color: "#F59E0B" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Pending Approval</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{pendingCount} records</div>
          </div>
          <ChevronRight size={16} />
        </div>
        <div className="exception-card" onClick={() => { setStatusFilter("pending"); }}>
          <X size={18} style={{ color: "#EF4444" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Absent</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{records.filter(r => r.raw_status === "absent").length} records</div>
          </div>
          <ChevronRight size={16} />
        </div>
        <div className="exception-card" onClick={() => { setStatusFilter("pending"); }}>
          <AlertCircle size={18} style={{ color: "#8B5CF6" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Missing Punch</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{missingPunchCount} records</div>
          </div>
          <ChevronRight size={16} />
        </div>
        <div className="exception-card" onClick={() => { setStatusFilter("approved"); }}>
          <CheckCircle size={18} style={{ color: "#10B981" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Approved</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{approvedCount} records</div>
          </div>
          <ChevronRight size={16} />
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 240 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text" placeholder="Search employee..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px 0 36px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}
          />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}>
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none", width: 140 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none", width: 140 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === "all" ? "All Status" : s}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} />
          Pending Only
        </label>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 40, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                <input type="checkbox" onChange={selectAll} checked={selectedIds.size === records.length && records.length > 0} />
              </th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Employee</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Department</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Date</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Check In</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Check Out</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Worked</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Status</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>Verification</th>
              <th style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                <div style={{ fontSize: 16, marginBottom: 8 }}>🎉 All attendance has been approved.</div>
                <p style={{ margin: 0 }}>Payroll generation can begin.</p>
              </td></tr>
            ) : (
              records.map(rec => {
                const emp = rec.employees
                const statusColors = RECORD_STATUS_COLORS[rec.raw_status] || RECORD_STATUS_COLORS.present
                return (
                  <tr key={rec.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => openDrawer(rec)}>
                    <td style={{ padding: "10px 12px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(rec.id)} onChange={() => toggleSelect(rec.id)} />
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                      <div>{emp?.full_name || "Unknown"}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{emp?.employee_code}</div>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{rec.departments?.name || "—"}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontSize: 13 }}>{rec.date}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{rec.check_in || "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{rec.check_out || "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{workedHours(rec.check_in, rec.check_out)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className="status-chip" style={{ background: statusColors.bg, color: statusColors.text }}>
                        {statusColors.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {rec.verified_status === "approved" ? (
                        <span className="status-chip" style={{ background: "#DCFCE7", color: "#166534" }}>✓ Approved</span>
                      ) : (
                        <span className="status-chip" style={{ background: "#FEF3C7", color: "#92400E" }}>⏳ Pending</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <button className="btn" style={{ padding: "4px 8px" }} onClick={(e) => { e.stopPropagation(); openDrawer(rec); }}>
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="sticky-bar">
          <div style={{ fontWeight: 600 }}>{selectedIds.size} selected</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-success" onClick={bulkApprove} disabled={processing}>
              <Check size={16} /> Approve
            </button>
            <button className="btn btn-danger" onClick={bulkReject} disabled={processing}>
              <X size={16} /> Reject
            </button>
            <button className="btn btn-outline" onClick={() => {}}>
              <Download size={16} /> Export
            </button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {drawerOpen && drawerRecord && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Attendance Detail</h2>
              <button className="btn" style={{ padding: "4px 8px" }} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{drawerRecord.employees?.full_name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{drawerRecord.employees?.employee_code}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><div className="kpi-label">Date</div><div>{drawerRecord.date}</div></div>
              <div><div className="kpi-label">Department</div><div>{drawerRecord.departments?.name || "—"}</div></div>
              <div><div className="kpi-label">Check In</div><div>{drawerRecord.check_in || "—"}</div></div>
              <div><div className="kpi-label">Check Out</div><div>{drawerRecord.check_out || "—"}</div></div>
              <div><div className="kpi-label">Worked</div><div>{workedHours(drawerRecord.check_in, drawerRecord.check_out)}</div></div>
              <div><div className="kpi-label">Source</div><div style={{ textTransform: "capitalize" }}>{drawerRecord.source}</div></div>
              <div><div className="kpi-label">Status</div>
                <span className="status-chip" style={{ background: RECORD_STATUS_COLORS[drawerRecord.raw_status]?.bg, color: RECORD_STATUS_COLORS[drawerRecord.raw_status]?.text }}>
                  {RECORD_STATUS_COLORS[drawerRecord.raw_status]?.label}
                </span>
              </div>
              <div><div className="kpi-label">Verification</div>
                {drawerRecord.verified_status === "approved" ? "✓ Approved" : "⏳ Pending"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button className="btn btn-success" onClick={() => { bulkApprove(); setDrawerOpen(false); }}>
                <Check size={16} /> Approve
              </button>
              <button className="btn btn-danger" onClick={() => { bulkReject(); setDrawerOpen(false); }}>
                <X size={16} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
