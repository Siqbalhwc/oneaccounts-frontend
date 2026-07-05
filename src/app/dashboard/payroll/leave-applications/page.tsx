"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Plus, Search, CheckCircle, XCircle, Eye, Check, X
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

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
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [employees, setEmployees] = useState<any[]>([])
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [formEmployeeId, setFormEmployeeId] = useState<number | null>(null)
  const [formLeaveTypeId, setFormLeaveTypeId] = useState<number | null>(null)
  const [formFromDate, setFormFromDate] = useState("")
  const [formToDate, setFormToDate] = useState("")
  const [formReason, setFormReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Fetch company ID and initial data
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch active employees for the form
        supabase
          .from("employees")
          .select("id, employee_code, full_name")
          .eq("company_id", cid)
          .eq("status", "active")
          .order("full_name")
          .then(({ data }) => setEmployees(data || []))
        // Fetch active leave types
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
      .select("*, employees!inner(full_name, employee_code), leave_types!inner(name)")
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }

    // Filter by employee name via search (client-side after fetch)
    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((app: any) =>
          app.employees?.full_name?.toLowerCase().includes(q) ||
          app.employees?.employee_code?.toLowerCase().includes(q)
        )
      }
      setApplications(filtered)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchApplications()
  }, [role, canView, companyId, statusFilter, search])

  const openForm = () => {
    setFormEmployeeId(null)
    setFormLeaveTypeId(null)
    setFormFromDate("")
    setFormToDate("")
    setFormReason("")
    setShowForm(true)
    setError("")
    setFlash("")
  }

  const handleSubmit = async () => {
    if (!formEmployeeId) { setError("Please select an employee"); return }
    if (!formLeaveTypeId) { setError("Please select a leave type"); return }
    if (!formFromDate) { setError("From date is required"); return }
    if (!formToDate) { setError("To date is required"); return }
    if (formFromDate > formToDate) { setError("From date cannot be after To date"); return }

    setSaving(true)
    setError("")

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
      setError(insertErr.message)
      setSaving(false)
      return
    }

    setFlash("✅ Leave application created")
    setSaving(false)
    setShowForm(false)
    fetchApplications()
  }

  const handleApprove = async (id: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from("leave_applications")
      .update({ status: "approved", approved_by: user?.id, approved_at: new Date().toISOString() })
      .eq("id", id)
    fetchApplications()
    setFlash("✅ Leave approved")
  }

  const handleReject = async (id: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from("leave_applications")
      .update({ status: "rejected", approved_by: user?.id, approved_at: new Date().toISOString() })
      .eq("id", id)
    fetchApplications()
    setFlash("❌ Leave rejected")
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
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input, .select, .input, textarea {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        textarea { height: auto; padding: 8px 12px; resize: vertical; }
        .search-input:focus, .select:focus, .input:focus, textarea:focus { border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table tr:hover td { background: var(--card-hover); }

        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.3);
          z-index: 1000; display: flex; align-items: center; justify-content: center;
        }
        .modal-panel {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; width: 90%; max-width: 500px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          max-height: 80vh; overflow-y: auto;
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📝 Leave Applications</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Apply for leave and manage requests" : "View leave applications"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={openForm}>
            <Plus size={16} /> Apply for Leave
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder="Search employee name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 140 }}>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Leave Type</th>
              <th>From</th>
              <th>To</th>
              <th>Reason</th>
              <th>Status</th>
              {canEdit && <th style={{ textAlign: "center", width: 120 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: "center", padding: 20 }}>Loading…</td></tr>
            ) : applications.length === 0 ? (
              <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No leave applications found.</td></tr>
            ) : (
              applications.map((app) => (
                <tr key={app.id}>
                  <td style={{ fontWeight: 600 }}>{app.employees?.full_name}<br /><span style={{ fontSize: 10, color: "var(--text-muted)" }}>{app.employees?.employee_code}</span></td>
                  <td>{app.leave_types?.name}</td>
                  <td>{app.from_date}</td>
                  <td>{app.to_date}</td>
                  <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.reason || "—"}</td>
                  <td>
                    <span style={{
                      padding: "2px 8px", borderRadius: "20px", fontSize: 10, fontWeight: 600,
                      background: app.status === "approved" ? "#065F46" : app.status === "rejected" ? "#7F1D1D" : "#F59E0B",
                      color: "#E2E8F0",
                    }}>
                      {app.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: "center" }}>
                      {app.status === "pending" && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button className="btn-icon" style={{ color: "#10B981" }} onClick={() => handleApprove(app.id)} title="Approve">
                            <Check size={14} />
                          </button>
                          <button className="btn-icon" style={{ color: "#EF4444" }} onClick={() => handleReject(app.id)} title="Reject">
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      {app.status !== "pending" && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{app.approved_at ? new Date(app.approved_at).toLocaleDateString() : "—"}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Apply Leave */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel">
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>Apply for Leave</h2>

            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Employee *</label>
              <select className="select" value={formEmployeeId ?? ""} onChange={(e) => setFormEmployeeId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select employee…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.full_name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Leave Type *</label>
              <select className="select" value={formLeaveTypeId ?? ""} onChange={(e) => setFormLeaveTypeId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select type…</option>
                {leaveTypes.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>From Date *</label>
                <input type="date" className="input" value={formFromDate} onChange={(e) => setFormFromDate(e.target.value)} />
              </div>
              <div>
                <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>To Date *</label>
                <input type="date" className="input" value={formToDate} onChange={(e) => setFormToDate(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Reason</label>
              <textarea rows={3} value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder="Optional reason…" />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn-icon" style={{ padding: "8px 16px", border: "1.5px solid var(--border)", color: "var(--text-muted)" }} onClick={() => setShowForm(false)}>
                <XCircle size={16} /> Cancel
              </button>
              <button className="btn" onClick={handleSubmit} disabled={saving}>
                {saving ? "Submitting..." : <><CheckCircle size={16} /> Submit</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}