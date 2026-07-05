"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Pencil, Trash2, Search, CheckCircle, X } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

export default function LeaveTypesPage() {
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
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  // Inline editor state
  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)   // null = new
  const [editName, setEditName] = useState("")
  const [editIsPaid, setEditIsPaid] = useState(true)
  const [editIsActive, setEditIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Fetch company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Fetch leave types
  const fetchLeaveTypes = () => {
    if (!companyId) return
    setLoading(true)
    supabase
      .from("leave_types")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => {
        setLeaveTypes(data || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchLeaveTypes()
  }, [role, canView, companyId])

  const filtered = search.trim()
    ? leaveTypes.filter(lt => lt.name?.toLowerCase().includes(search.toLowerCase()))
    : leaveTypes

  // Open editor for NEW
  const openNewEditor = () => {
    setEditingId(null)
    setEditName("")
    setEditIsPaid(true)
    setEditIsActive(true)
    setShowEditor(true)
    setError("")
    setFlash("")
  }

  // Open editor for EDIT
  const openEditEditor = (lt: any) => {
    setEditingId(lt.id)
    setEditName(lt.name)
    setEditIsPaid(lt.is_paid)
    setEditIsActive(lt.is_active)
    setShowEditor(true)
    setError("")
    setFlash("")
  }

  // Close editor
  const closeEditor = () => {
    setShowEditor(false)
    setEditingId(null)
  }

  // Save (create or update)
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
      if (updateErr) {
        setError(updateErr.message)
        setSaving(false)
        return
      }
      setFlash("✅ Leave type updated")
    } else {
      // INSERT
      const { error: insertErr } = await supabase
        .from("leave_types")
        .insert({ company_id: companyId, name: editName.trim(), is_paid: editIsPaid, is_active: editIsActive })
      if (insertErr) {
        setError(insertErr.message)
        setSaving(false)
        return
      }
      setFlash("✅ Leave type created")
    }

    setSaving(false)
    closeEditor()
    fetchLeaveTypes()
  }

  // Delete (soft-delete by toggling is_active off) – or hard delete with confirmation
  const handleDelete = async (id: number) => {
    if (!confirm("Remove this leave type?")) return
    const { error: deleteErr } = await supabase
      .from("leave_types")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
    if (deleteErr) {
      setError(deleteErr.message)
      return
    }
    setFlash("✅ Leave type removed")
    fetchLeaveTypes()
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
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
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
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table tr:hover td { background: var(--card-hover); }

        .editor-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.3);
          z-index: 1000; display: flex; align-items: center; justify-content: center;
        }
        .editor-panel {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; width: 90%; max-width: 420px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .input:focus, .select:focus { border-color: var(--primary); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🏖️ Leave Types</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Manage leave categories (Casual, Sick, Annual, etc.)" : "View leave types"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={openNewEditor}>
            <Plus size={16} /> New Leave Type
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Paid</th>
              <th>Active</th>
              {canEdit && <th style={{ textAlign: "center", width: 80 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 4 : 3} style={{ textAlign: "center", padding: 20 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={canEdit ? 4 : 3} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No leave types found.</td></tr>
            ) : (
              filtered.map(lt => (
                <tr key={lt.id}>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{lt.name}</td>
                  <td>{lt.is_paid ? "✅ Paid" : "❌ Unpaid"}</td>
                  <td>{lt.is_active ? "Yes" : "No"}</td>
                  {canEdit && (
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn-icon" onClick={() => openEditEditor(lt)} title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button className="btn-icon" style={{ color: "#EF4444" }} onClick={() => handleDelete(lt.id)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inline Editor Modal */}
      {showEditor && (
        <div className="editor-overlay" onClick={(e) => e.target === e.currentTarget && closeEditor()}>
          <div className="editor-panel">
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>
              {editingId ? "Edit Leave Type" : "New Leave Type"}
            </h2>
            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Name *</label>
              <input className="input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Casual, Sick, Annual" />
            </div>
            <div style={{ marginBottom: 12, display: "flex", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={editIsPaid} onChange={e => setEditIsPaid(e.target.checked)} />
                Paid Leave
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={editIsActive} onChange={e => setEditIsActive(e.target.checked)} />
                Active
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn-icon" style={{ padding: "8px 16px", border: "1.5px solid var(--border)", color: "var(--text-muted)" }} onClick={closeEditor}>
                <X size={16} /> Cancel
              </button>
              <button className="btn" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : <><CheckCircle size={16} /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}