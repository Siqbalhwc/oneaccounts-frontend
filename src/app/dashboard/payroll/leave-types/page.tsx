"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Plus, Search, X, Check, MoreVertical, Edit, Trash2,
  CalendarDays, Filter, RotateCcw
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

const PAGE_SIZE = 10

export default function LeaveTypesPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [paidFilter, setPaidFilter] = useState("all")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Menu state
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Editor modal
  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [editIsPaid, setEditIsPaid] = useState(true)
  const [editIsActive, setEditIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Summary counts
  const [employeeCounts, setEmployeeCounts] = useState<Record<number, number>>({})

  // Fetch company and data
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchLeaveTypes = () => {
    if (!companyId) return
    setLoading(true)

    supabase
      .from("leave_types")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => {
        const types = data || []
        setLeaveTypes(types)

        // Fetch employee usage counts (number of distinct employees who have applied)
        if (types.length > 0) {
          const typeIds = types.map(t => t.id)
          supabase
            .from("leave_applications")
            .select("leave_type_id, employee_id")
            .in("leave_type_id", typeIds)
            .then(({ data: apps }) => {
              const counts: Record<number, number> = {}
              if (apps) {
                apps.forEach((app: any) => {
                  if (app.leave_type_id) {
                    counts[app.leave_type_id] = (counts[app.leave_type_id] || 0) + 1
                  }
                })
              }
              setEmployeeCounts(counts)
            })
        } else {
          setEmployeeCounts({})
        }
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchLeaveTypes()
  }, [role, canView, companyId])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Filter & pagination
  const filtered = useMemo(() => {
    let list = leaveTypes
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(lt => lt.name?.toLowerCase().includes(q))
    }
    if (statusFilter !== "all") {
      list = list.filter(lt => lt.is_active === (statusFilter === "active"))
    }
    if (paidFilter !== "all") {
      list = list.filter(lt => lt.is_paid === (paidFilter === "paid"))
    }
    return list
  }, [leaveTypes, search, statusFilter, paidFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  // Summary
  const totalCount = leaveTypes.length
  const activeCount = leaveTypes.filter(t => t.is_active).length
  const paidCount = leaveTypes.filter(t => t.is_paid).length
  const unpaidCount = leaveTypes.filter(t => !t.is_paid).length

  // Editor handlers
  const openNewEditor = () => {
    setEditingId(null)
    setEditName("")
    setEditIsPaid(true)
    setEditIsActive(true)
    setShowEditor(true)
    setError("")
    setFlash("")
  }

  const openEditEditor = (lt: any) => {
    setEditingId(lt.id)
    setEditName(lt.name)
    setEditIsPaid(lt.is_paid)
    setEditIsActive(lt.is_active)
    setShowEditor(true)
    setError("")
    setFlash("")
  }

  const handleSave = async () => {
    if (!editName.trim()) { setError("Name is required"); return }
    setSaving(true)
    setError("")

    if (editingId) {
      // UPDATE
      const { error: updateErr } = await supabase
        .from("leave_types")
        .update({ name: editName.trim(), is_paid: editIsPaid, is_active: editIsActive })
        .eq("id", editingId)
        .eq("company_id", companyId)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      setFlash("Leave type updated")
    } else {
      // INSERT
      const { error: insertErr } = await supabase
        .from("leave_types")
        .insert({ company_id: companyId, name: editName.trim(), is_paid: editIsPaid, is_active: editIsActive })
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      setFlash("Leave type created")
    }

    setSaving(false)
    setShowEditor(false)
    fetchLeaveTypes()
  }

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    // Deactivate/Activate
    const action = currentActive ? "deactivate" : "activate"
    if (!confirm(`Are you sure you want to ${action} this leave type?`)) return
    await supabase
      .from("leave_types")
      .update({ is_active: !currentActive })
      .eq("id", id)
      .eq("company_id", companyId)
    fetchLeaveTypes()
    setFlash(`Leave type ${action}d`)
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this leave type? This may affect historical leave records.")) return
    const { error: deleteErr } = await supabase
      .from("leave_types")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
    if (deleteErr) {
      setError(deleteErr.message)
      return
    }
    fetchLeaveTypes()
    setFlash("Leave type deleted")
    setMenuOpenId(null)
  }

  const resetFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setPaidFilter("all")
    setCurrentPage(1)
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
        .btn-primary:hover { filter: brightness(0.95); }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-danger { color: #EF4444; border-color: #EF4444; }
        .btn-danger:hover { background: #FEE2E2; }
        .menu-popup {
          position: absolute; right: 0; top: 100%; background: var(--card); border: 1px solid var(--border);
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10; min-width: 140px;
        }
        .menu-item {
          display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; font-size: 13px;
          transition: background 0.15s;
        }
        .menu-item:hover { background: var(--card-hover); }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-panel {
          background: var(--card); border-radius: 12px; padding: 24px; width: 420px; max-width: 90vw;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .input, .select {
          width: 100%; height: 38px; border: 1px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text);
          outline: none; box-sizing: border-box;
        }
        .input:focus, .select:focus { border-color: var(--primary); }
        .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
        @media (max-width: 768px) {
          .table-responsive { overflow-x: auto; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CalendarDays size={24} style={{ color: "var(--primary)" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Leave Types</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Configure leave categories available for employees
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNewEditor}>
            <Plus size={16} /> New Leave Type
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Check size={16} /> {flash}</div>}

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Types</div>
          <div className="kpi-value">{totalCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>{activeCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Paid</div>
          <div className="kpi-value" style={{ color: "#1D4ED8" }}>{paidCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Unpaid</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>{unpaidCount}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Search leave types..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            style={{ width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px 0 36px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}
          />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          style={{ height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={paidFilter} onChange={e => { setPaidFilter(e.target.value); setCurrentPage(1); }}
          style={{ height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}>
          <option value="all">All Paid Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <button className="btn btn-outline" onClick={resetFilters}>
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <div className="table-responsive">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 750 }}>
            <colgroup>
              <col style={{ width: 80 }} />
              <col />
              <col style={{ width: 80 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Code</th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Leave Type</th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Paid</th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Status</th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Employees</th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Last Updated</th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>⋮</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                    {filtered.length === 0 ? (
                      <>
                        <div style={{ fontSize: 16, marginBottom: 8 }}>No leave types found</div>
                        {canEdit && (
                          <button className="btn btn-primary" onClick={openNewEditor}>
                            <Plus size={16} /> Create your first leave type
                          </button>
                        )}
                      </>
                    ) : (
                      "No leave types match your filters"
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map(lt => {
                  const empCount = employeeCounts[lt.id] || 0
                  return (
                    <tr key={lt.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--card-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
                        {lt.id}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>
                        {lt.name}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span className="badge" style={{ background: lt.is_paid ? "#DCFCE7" : "#FEF3C7", color: lt.is_paid ? "#166534" : "#92400E" }}>
                          {lt.is_paid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span className="badge" style={{ background: lt.is_active ? "#DCFCE7" : "#F3F4F6", color: lt.is_active ? "#166534" : "#6B7280" }}>
                          {lt.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13 }}>
                        {empCount}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {lt.created_at ? new Date(lt.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", position: "relative" }}>
                        <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => setMenuOpenId(menuOpenId === lt.id ? null : lt.id)}>
                          <MoreVertical size={14} />
                        </button>
                        {menuOpenId === lt.id && (
                          <div className="menu-popup" ref={menuRef} onClick={e => e.stopPropagation()}>
                            <div className="menu-item" onClick={() => { setMenuOpenId(null); openEditEditor(lt); }}>
                              <Edit size={14} /> Edit
                            </div>
                            <div className="menu-item" onClick={() => { setMenuOpenId(null); handleToggleActive(lt.id, lt.is_active); }}>
                              {lt.is_active ? (
                                <><X size={14} /> Deactivate</>
                              ) : (
                                <><Check size={14} /> Activate</>
                              )}
                            </div>
                            <div className="menu-item" style={{ color: "#EF4444" }} onClick={() => { handleDelete(lt.id); }}>
                              <Trash2 size={14} /> Delete
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
              Previous
            </button>
            <span style={{ fontSize: 13 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button className="btn btn-outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              Next
            </button>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="modal-overlay" onClick={() => setShowEditor(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{editingId ? "Edit Leave Type" : "New Leave Type"}</h2>

            {/* General Section */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>General</div>
              <div>
                <label className="kpi-label" style={{ marginBottom: 4, display: "block" }}>Name *</label>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Annual Leave" />
              </div>
            </div>

            {/* Settings Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>Settings</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="checkbox-label">
                  <input type="checkbox" checked={editIsPaid} onChange={e => setEditIsPaid(e.target.checked)} />
                  Paid Leave
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={editIsActive} onChange={e => setEditIsActive(e.target.checked)} />
                  Active
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowEditor(false)}>
                <X size={16} /> Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Check size={16} /> {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}