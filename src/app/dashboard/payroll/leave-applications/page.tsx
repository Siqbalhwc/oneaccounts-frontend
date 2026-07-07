"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Plus, Search, Filter, X, Check, Eye, ChevronRight, RotateCcw,
  FileText, Clock, UserCheck, UserX, Calendar, MoreHorizontal,
  Send, Download
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

const PAGE_SIZE = 10
const STATUS_OPTIONS = ["all", "pending", "approved", "rejected"]

export default function LeaveApplicationsPage() {
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
  const [applications, setApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("all")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<any>(null)

  // Application form
  const [showForm, setShowForm] = useState(false)
  const [formEmployeeId, setFormEmployeeId] = useState<number | null>(null)
  const [formLeaveTypeId, setFormLeaveTypeId] = useState<number | null>(null)
  const [formFromDate, setFormFromDate] = useState("")
  const [formToDate, setFormToDate] = useState("")
  const [formReason, setFormReason] = useState("")
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [formFlash, setFormFlash] = useState("")

  // Leave balance state
  const [leaveBalances, setLeaveBalances] = useState<Record<string, { used: number; total: number }>>({})

  // Data arrays for dropdowns
  const [employees, setEmployees] = useState<any[]>([])
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])

  // Error / flash
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Fetch initial data
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)

        // 1. Fetch departments
        supabase
          .from("departments")
          .select("id, name")
          .eq("company_id", cid)
          .order("name")
          .then(({ data: depts }) => {
            const deptList = depts || []
            setDepartments(deptList)

            // 2. Fetch employees without join, then enrich locally
            return supabase
              .from("employees")
              .select("id, employee_code, full_name, department_id")
              .eq("company_id", cid)
              .eq("status", "active")
              .order("full_name")
          })
          .then(({ data: emps }) => {
            if (emps) {
              const deptList = departments // departments state may still be updating, but we'll use the freshly set one
              const enriched = emps.map((emp: any) => ({
                ...emp,
                departments: deptList.find(d => d.id === emp.department_id) || null,
              }))
              setEmployees(enriched)
            } else {
              setEmployees([])
            }
          })

        // 3. Fetch leave types (independent)
        supabase
          .from("leave_types")
          .select("id, name")
          .eq("company_id", cid)
          .eq("is_active", true)
          .order("name")
          .then(({ data }) => setLeaveTypes(data || []))
      }
    })
  }, [])

  const fetchApplications = () => {
    if (!companyId) return
    setLoading(true)
    let query = supabase
      .from("leave_applications")
      .select("*, employees!inner(full_name, employee_code, department_id, departments(name)), leave_types!inner(name)")
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") query = query.eq("status", statusFilter)
    if (leaveTypeFilter !== "all") query = query.eq("leave_type_id", parseInt(leaveTypeFilter))
    if (dateFrom) query = query.gte("from_date", dateFrom)
    if (dateTo) query = query.lte("to_date", dateTo)

    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((app: any) => {
          const emp = app.employees
          return emp?.full_name?.toLowerCase().includes(q) || emp?.employee_code?.toLowerCase().includes(q)
        })
      }
      if (departmentFilter !== "all") {
        filtered = filtered.filter((app: any) => String(app.employees?.department_id) === departmentFilter)
      }
      setApplications(filtered)
      setSelectedIds(new Set())
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchApplications()
  }, [role, canView, companyId, statusFilter, leaveTypeFilter, departmentFilter, dateFrom, dateTo, search])

  // Fetch leave balances (simplified: for each employee and leave type, count approved days)
  useEffect(() => {
    if (!companyId || employees.length === 0 || leaveTypes.length === 0) return
    supabase
      .from("leave_applications")
      .select("employee_id, leave_type_id, from_date, to_date")
      .eq("status", "approved")
      .then(({ data }) => {
        const balances: Record<string, { used: number; total: number }> = {}
        const totalDaysMap: Record<number, number> = {}
        leaveTypes.forEach(lt => { totalDaysMap[lt.id] = 20 }) // placeholder
        if (data) {
          data.forEach(app => {
            const key = `${app.employee_id}_${app.leave_type_id}`
            if (!balances[key]) {
              balances[key] = { used: 0, total: totalDaysMap[app.leave_type_id] || 20 }
            }
            const from = new Date(app.from_date)
            const to = new Date(app.to_date)
            const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1
            balances[key].used += diff
          })
        }
        setLeaveBalances(balances)
      })
  }, [companyId, employees, leaveTypes])

  // --- Helpers ---
  const getDurationDays = (from: string, to: string) => {
    const f = new Date(from)
    const t = new Date(to)
    return Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return { bg: "#FEF3C7", text: "#92400E", label: "Pending" }
      case "approved": return { bg: "#DCFCE7", text: "#166534", label: "Approved" }
      case "rejected": return { bg: "#FEE2E2", text: "#991B1B", label: "Rejected" }
      default: return { bg: "#F3F4F6", text: "#6B7280", label: status }
    }
  }

  const openDrawer = (record: any) => {
    setDrawerRecord(record)
    setDrawerOpen(true)
  }

  // Bulk actions
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === applications.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(applications.map(a => a.id)))
    }
  }

  const bulkAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return
    setBulkProcessing(true)
    const { data: { user } } = await supabase.auth.getUser()
    const updates = {
      status: action === "approve" ? "approved" : "rejected",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    }
    await supabase.from("leave_applications").update(updates).in("id", Array.from(selectedIds))
    setBulkProcessing(false)
    fetchApplications()
    setFlash(`✅ ${selectedIds.size} applications ${action}d`)
  }

  // Single action from table
  const singleAction = async (id: number, action: "approve" | "reject") => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from("leave_applications").update({
      status: action === "approve" ? "approved" : "rejected",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    }).eq("id", id)
    fetchApplications()
    setFlash(`Application ${action}d`)
  }

  // Pagination
  const totalPages = Math.ceil(applications.length / PAGE_SIZE)
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return applications.slice(start, start + PAGE_SIZE)
  }, [applications, currentPage])

  // Summary KPIs
  const pendingCount = applications.filter(a => a.status === "pending").length
  const approvedCount = applications.filter(a => a.status === "approved").length
  const rejectedCount = applications.filter(a => a.status === "rejected").length
  const thisMonth = new Date().getMonth()
  const thisMonthCount = applications.filter(a => {
    const d = new Date(a.from_date)
    return d.getMonth() === thisMonth && d.getFullYear() === new Date().getFullYear()
  }).length

  // Reset filters
  const resetFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setLeaveTypeFilter("all")
    setDepartmentFilter("all")
    setDateFrom("")
    setDateTo("")
    setCurrentPage(1)
  }

  // --- Submit new application ---
  const handleSubmitApplication = async () => {
    if (!formEmployeeId) { setFormError("Please select an employee"); return }
    if (!formLeaveTypeId) { setFormError("Please select a leave type"); return }
    if (!formFromDate) { setFormError("From date is required"); return }
    if (!formToDate) { setFormError("To date is required"); return }
    if (formFromDate > formToDate) { setFormError("From date cannot be after To date"); return }

    setFormSaving(true)
    setFormError("")

    const { error: insertErr } = await supabase
      .from("leave_applications")
      .insert({
        employee_id: formEmployeeId,
        leave_type_id: formLeaveTypeId,
        from_date: formFromDate,
        to_date: formToDate,
        status: "pending",
        reason: formReason.trim() || null,
      })

    if (insertErr) {
      setFormError(insertErr.message)
      setFormSaving(false)
      return
    }

    setFormFlash("Leave application submitted")
    setFormSaving(false)
    setShowForm(false)
    setFormEmployeeId(null)
    setFormLeaveTypeId(null)
    setFormFromDate("")
    setFormToDate("")
    setFormReason("")
    fetchApplications()
  }

  // Leave balance for current employee/leave type
  const currentBalance = useMemo(() => {
    if (!formEmployeeId || !formLeaveTypeId) return null
    const key = `${formEmployeeId}_${formLeaveTypeId}`
    return leaveBalances[key] || { used: 0, total: 20 }
  }, [formEmployeeId, formLeaveTypeId, leaveBalances])

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
    <div style={{ padding: "24px 32px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", position: "relative" }}>
      <style>{`
        .kpi-card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px; text-align: center;
        }
        .kpi-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .kpi-value { font-size: 28px; font-weight: 800; }
        .badge {
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
          position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000;
          display: flex; justify-content: flex-end;
        }
        .drawer-panel {
          background: var(--card); width: 420px; max-width: 90vw; height: 100%; overflow-y: auto;
          padding: 24px; border-left: 1px solid var(--border); box-shadow: -4px 0 20px rgba(0,0,0,0.1);
          animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-panel {
          background: var(--card); border-radius: 12px; padding: 24px; width: 560px; max-width: 90vw;
          max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .input, .select, textarea {
          width: 100%; height: 38px; border: 1px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text);
          outline: none; box-sizing: border-box; font-family: inherit;
        }
        textarea { height: auto; padding: 8px 12px; resize: vertical; }
        .input:focus, .select:focus, textarea:focus { border-color: var(--primary); }
        .filter-input { height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--card); color: var(--text); outline: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={24} style={{ color: "var(--primary)" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Leave Applications</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Manage employee leave requests and approvals
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setFormError(""); setFormFlash(""); }}>
            <Plus size={16} /> New Leave Application
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{flash}</div>}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label"><Clock size={12} style={{ marginRight: 4 }} /> Pending</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>{pendingCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><UserCheck size={12} style={{ marginRight: 4 }} /> Approved</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>{approvedCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><UserX size={12} style={{ marginRight: 4 }} /> Rejected</div>
          <div className="kpi-value" style={{ color: "#EF4444" }}>{rejectedCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Calendar size={12} style={{ marginRight: 4 }} /> This Month</div>
          <div className="kpi-value" style={{ color: "#1D4ED8" }}>{thisMonthCount}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 240 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="filter-input" placeholder="Search employee..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} style={{ paddingLeft: 36 }} />
        </div>
        <select className="filter-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }} style={{ width: 140 }}>
          <option value="all">All Status</option>
          {STATUS_OPTIONS.filter(s => s !== "all").map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-input" value={leaveTypeFilter} onChange={e => { setLeaveTypeFilter(e.target.value); setCurrentPage(1); }} style={{ width: 160 }}>
          <option value="all">All Leave Types</option>
          {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
        </select>
        <select className="filter-input" value={departmentFilter} onChange={e => { setDepartmentFilter(e.target.value); setCurrentPage(1); }} style={{ width: 160 }}>
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input type="date" className="filter-input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }} style={{ width: 140 }} />
        <input type="date" className="filter-input" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }} style={{ width: 140 }} />
        <button className="btn btn-outline" onClick={resetFilters}><RotateCcw size={16} /> Reset</button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 140 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: "12px 12px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                <input type="checkbox" onChange={selectAll} checked={selectedIds.size === paginated.length && paginated.length > 0} />
              </th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Employee</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Leave Type</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Duration</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Status</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Approver</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</td></tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                  {applications.length === 0 ? (
                    <>
                      <div style={{ fontSize: 16, marginBottom: 8 }}>No leave applications yet</div>
                      {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> New Leave Application</button>}
                    </>
                  ) : "No applications match your filters"}
                </td>
              </tr>
            ) : (
              paginated.map(app => {
                const emp = app.employees
                const leaveTypeName = app.leave_types?.name || "Unknown"
                const days = getDurationDays(app.from_date, app.to_date)
                const statusBadge = getStatusBadge(app.status)
                const approverName = app.approved_by ? "Approved" : "—"
                return (
                  <tr key={app.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--card-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => openDrawer(app)}
                  >
                    <td style={{ padding: "12px 12px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(app.id)} onChange={() => toggleSelect(app.id)} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{emp?.full_name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{emp?.employee_code} · {emp?.departments?.name || "—"}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>{leaveTypeName}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{days} Day{days !== 1 ? "s" : ""}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{app.from_date} – {app.to_date}</div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span className="badge" style={{ background: statusBadge.bg, color: statusBadge.text }}>{statusBadge.label}</span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{approverName}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-outline" style={{ padding: "4px 6px" }} title="View Details" onClick={() => openDrawer(app)}>
                          <Eye size={14} />
                        </button>
                        {app.status === "pending" && (
                          <>
                            <button className="btn btn-success" style={{ padding: "4px 6px" }} title="Approve" onClick={() => singleAction(app.id, "approve")}>
                              <Check size={14} />
                            </button>
                            <button className="btn btn-danger" style={{ padding: "4px 6px" }} title="Reject" onClick={() => singleAction(app.id, "reject")}>
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
            <span style={{ fontSize: 13 }}>Page {currentPage} of {totalPages}</span>
            <button className="btn btn-outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Sticky Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="sticky-bar">
          <div style={{ fontWeight: 600 }}>{selectedIds.size} selected</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-success" onClick={() => bulkAction("approve")} disabled={bulkProcessing}><Check size={16} /> Approve</button>
            <button className="btn btn-danger" onClick={() => bulkAction("reject")} disabled={bulkProcessing}><X size={16} /> Reject</button>
            <button className="btn btn-outline"><Download size={16} /> Export</button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {drawerOpen && drawerRecord && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Leave Request Details</h2>
              <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => setDrawerOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{drawerRecord.employees?.full_name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              {drawerRecord.employees?.employee_code} · {drawerRecord.employees?.departments?.name || "—"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><div className="kpi-label">Leave Type</div><div>{drawerRecord.leave_types?.name}</div></div>
              <div><div className="kpi-label">Status</div><span className="badge" style={{ background: getStatusBadge(drawerRecord.status).bg, color: getStatusBadge(drawerRecord.status).text }}>{getStatusBadge(drawerRecord.status).label}</span></div>
              <div><div className="kpi-label">From</div><div>{drawerRecord.from_date}</div></div>
              <div><div className="kpi-label">To</div><div>{drawerRecord.to_date}</div></div>
              <div><div className="kpi-label">Duration</div><div>{getDurationDays(drawerRecord.from_date, drawerRecord.to_date)} days</div></div>
              <div><div className="kpi-label">Applied On</div><div>{new Date(drawerRecord.created_at).toLocaleDateString("en-PK")}</div></div>
              {drawerRecord.approved_at && <div><div className="kpi-label">Approved On</div><div>{new Date(drawerRecord.approved_at).toLocaleDateString("en-PK")}</div></div>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="kpi-label">Reason</div>
              <div style={{ fontSize: 13, background: "var(--bg)", padding: 8, borderRadius: 6 }}>{drawerRecord.reason || "No reason provided"}</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {drawerRecord.status === "pending" && (
                <>
                  <button className="btn btn-success" onClick={() => { singleAction(drawerRecord.id, "approve"); setDrawerOpen(false); }}><Check size={16} /> Approve</button>
                  <button className="btn btn-danger" onClick={() => { singleAction(drawerRecord.id, "reject"); setDrawerOpen(false); }}><X size={16} /> Reject</button>
                </>
              )}
              <button className="btn btn-outline" onClick={() => setDrawerOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Application Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>New Leave Application</h2>
            {formError && <div style={{ color: "#EF4444", marginBottom: 12, fontSize: 13 }}>{formError}</div>}
            {formFlash && <div style={{ color: "#10B981", marginBottom: 12, fontSize: 13 }}>{formFlash}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Employee *</label>
                <select className="select" value={formEmployeeId ?? ""} onChange={e => { setFormEmployeeId(e.target.value ? Number(e.target.value) : null); }}>
                  <option value="">Select employee…</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.full_name}</option>
                  ))}
                </select>
                {formEmployeeId && (
                  <div style={{ marginTop: 8, background: "var(--bg)", padding: 8, borderRadius: 6, fontSize: 12 }}>
                    <div><strong>Department:</strong> {employees.find(e => e.id === formEmployeeId)?.departments?.name || "—"}</div>
                  </div>
                )}
              </div>
              <div>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Leave Type *</label>
                <select className="select" value={formLeaveTypeId ?? ""} onChange={e => setFormLeaveTypeId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select type…</option>
                  {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
                {currentBalance && (
                  <div style={{ marginTop: 8, background: "var(--bg)", padding: 8, borderRadius: 6, fontSize: 12 }}>
                    <div><strong>Balance:</strong> {currentBalance.total - currentBalance.used} days remaining (of {currentBalance.total})</div>
                    <div style={{ color: "var(--text-muted)", marginTop: 2 }}>Used: {currentBalance.used} days</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>From Date *</label>
                <input type="date" className="input" value={formFromDate} onChange={e => setFormFromDate(e.target.value)} />
              </div>
              <div>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>To Date *</label>
                <input type="date" className="input" value={formToDate} onChange={e => setFormToDate(e.target.value)} />
              </div>
            </div>
            {formFromDate && formToDate && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                Duration: {getDurationDays(formFromDate, formToDate)} days
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Reason</label>
              <textarea rows={3} value={formReason} onChange={e => setFormReason(e.target.value)} placeholder="Optional reason…" />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}><X size={16} /> Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmitApplication} disabled={formSaving}>
                <Send size={16} /> {formSaving ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
