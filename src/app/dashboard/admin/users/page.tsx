"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Shield, UserPlus, Search, Trash2, Plus, X, Save, CheckCircle } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

// Define the list of modules (permissions) that can be assigned
const ALL_MODULES = [
  "Dashboard",
  "Customers",
  "Sales Invoices",
  "Receipts",
  "Suppliers",
  "Purchase Bills",
  "Payments",
  "Bank Accounts",
  "Bank Transfers",
  "Products",
  "Inventory Adjustments",
  "Chart of Accounts",
  "Journal Entries",
  "Reports",
  "Budget vs Actuals",
  "Invoice Automation",
  "Investors",
  "Settings",
  "Admin Panel",
]

interface User {
  id: string
  email: string
  created_at: string
  role: string
}

interface Role {
  id: number
  role_name: string
  permissions: Record<string, boolean> | null
}

export default function AdminUsersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
// TODO: get plan limits from company_settings / plans table
const maxUsers = 0   // 0 = unlimited for now
  const canView = role === "admin"
  const canEdit = role === "admin"

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [search, setSearch] = useState("")

  // Custom roles
  const [roles, setRoles] = useState<Role[]>([])
  const [showRoleManager, setShowRoleManager] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null)
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({})

  // Plan limits
  const maxUsers = plan?.max_users ?? 0   // from your plan system (we'll add this later, for now default 0 = unlimited)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    fetchUsers()
    fetchRoles()
  }, [role, canView])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.users && Array.isArray(data.users)) {
        setUsers(data.users)
      } else if (data.error) {
        setError(data.error)
      } else {
        setError("Unknown response from server")
      }
    } catch {
      setError("Network error")
    }
    setLoading(false)
  }

  const fetchRoles = async () => {
    const { data } = await supabase.from("company_roles").select("*").order("role_name")
    if (data) {
      setRoles(data)
    }
  }

  const assignRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      })
      const data = await res.json()
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
        setMessage("Role updated!")
        setTimeout(() => setMessage(""), 3000)
      } else {
        setMessage(data.error || "Error updating role")
        setTimeout(() => setMessage(""), 5000)
      }
    } catch {
      setMessage("Network error")
      setTimeout(() => setMessage(""), 5000)
    }
  }

  const handleRemove = async (userId: string) => {
    if (!window.confirm("Remove this user from the company?")) return
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.success) {
        setUsers(prev => prev.filter(u => u.id !== userId))
        setMessage(data.message)
      } else {
        setMessage(data.error || "Remove failed")
      }
    } catch {
      setMessage("Network error")
    }
    setTimeout(() => setMessage(""), 4000)
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: "viewer" })
      })
      const data = await res.json()
      if (data.success) {
        setMessage(data.message)
        setInviteEmail("")
        fetchUsers()
      } else {
        setMessage(data.error || "Invite failed")
      }
    } catch {
      setMessage("Network error")
    }
    setInviting(false)
    setTimeout(() => setMessage(""), 5000)
  }

  // ── Role management ──
  const addOrUpdateRole = async () => {
    const name = newRoleName.trim()
    if (!name) return

    const payload: any = {
      role_name: name,
      permissions: permDraft,
    }

    if (editingRoleId) {
      // update
      const { error } = await supabase.from("company_roles").update(payload).eq("id", editingRoleId)
      if (!error) {
        setMessage("Role updated!")
        setNewRoleName("")
        setEditingRoleId(null)
        setPermDraft({})
        fetchRoles()
      } else {
        setMessage(error.message)
      }
    } else {
      // insert
      const { error } = await supabase.from("company_roles").insert(payload)
      if (!error) {
        setMessage("Role created!")
        setNewRoleName("")
        setPermDraft({})
        fetchRoles()
      } else {
        setMessage(error.message)
      }
    }
    setTimeout(() => setMessage(""), 3000)
  }

  const deleteRole = async (id: number) => {
    await supabase.from("company_roles").delete().eq("id", id)
    fetchRoles()
    setMessage("Role deleted")
    setTimeout(() => setMessage(""), 3000)
  }

  const startEditRole = (role: Role) => {
    setEditingRoleId(role.id)
    setNewRoleName(role.role_name)
    setPermDraft(role.permissions || {})
  }

  const cancelEdit = () => {
    setEditingRoleId(null)
    setNewRoleName("")
    setPermDraft({})
  }

  const togglePerm = (module: string) => {
    setPermDraft(prev => ({
      ...prev,
      [module]: !prev[module],
    }))
  }

  const filtered = search.trim()
    ? users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))
    : users

  // All roles (for dropdown) = built-in + custom
  const allRoles = ["admin", "accountant", "viewer", ...roles.map(r => r.role_name).filter(r => !["admin","accountant","viewer"].includes(r))]

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#E2E8F0" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>Only administrators can access this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
        <style>{`
          .card { background: #111827; border-radius: 12px; border: 1px solid #1E293B; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
          .input { height: 38px; border: 1px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; background: #1E293B; color: #F1F5F9; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #2563EB; color: white; }
          .btn-outline { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
          .btn-danger { background: #EF4444; color: white; }
          table { width: 100%; border-collapse: collapse; }
          th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #1E293B; }
          td { padding: 10px 6px; border-bottom: 1px solid #1E293B; font-size: 13px; color: #E2E8F0; }
          tr:hover td { background: #1E293B; }
          .badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; }
          .badge-admin { background: #D1FAE5; color: #065F46; }
          .badge-accountant { background: #FEF3C7; color: #92400E; }
          .badge-viewer { background: #FEE2E2; color: #991B1B; }
          .badge-custom { background: #1E293B; color: #CBD5E1; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .action-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
          .perm-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .perm-chip { background: #1E293B; border: 1px solid #334155; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
          .perm-chip.active { background: #2563EB; border-color: #2563EB; color: white; }
          @media (max-width: 700px) {
            th:nth-child(2), td:nth-child(2) { display: none; }
            .action-row { flex-direction: column; align-items: stretch; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>👑 Admin Panel - User Roles</h1>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Manage user permissions, invite users, and customize roles</p>
          </div>
          <button className="btn btn-outline" onClick={() => setShowRoleManager(!showRoleManager)}>
            <Shield size={14} /> Manage Roles
          </button>
        </div>

        {error && (
          <div style={{ background: "#1E293B", color: "#FCA5A5", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: "#064E3B", color: "#6EE7B7", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}

        {/* Custom Role Manager */}
        {showRoleManager && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ color: "#F1F5F9", marginBottom: 12 }}>
              {editingRoleId ? "Edit Role" : "Custom Roles"}
            </h3>
            {/* Existing roles list */}
            {!editingRoleId && (
              <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {roles.map(role => (
                  <div key={role.id} className="badge badge-custom" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px" }}>
                    <span>{role.role_name}</span>
                    <button onClick={() => startEditRole(role)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", padding: 0 }}>✏️</button>
                    <button onClick={() => deleteRole(role.id)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", padding: 0 }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Add / Edit form */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                className="input"
                placeholder="Role name (e.g. Purchaser)"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                style={{ flex: 1 }}
              />
              {editingRoleId ? (
                <>
                  <button className="btn btn-primary" onClick={addOrUpdateRole}>
                    <Save size={14} /> Update
                  </button>
                  <button className="btn btn-outline" onClick={cancelEdit}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={addOrUpdateRole}>
                  <Plus size={14} /> Add
                </button>
              )}
            </div>

            {/* Permissions checklist */}
            {(editingRoleId || newRoleName) && (
              <>
                <p style={{ color: "#94A3B8", fontSize: 12, margin: "0 0 8px" }}>Select permissions for this role:</p>
                <div className="perm-list">
                  {ALL_MODULES.map(mod => (
                    <div
                      key={mod}
                      className={`perm-chip ${permDraft[mod] ? "active" : ""}`}
                      onClick={() => togglePerm(mod)}
                    >
                      {mod}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Users</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#F1F5F9" }}>{filtered.length}</div>
            {maxUsers > 0 && <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>Plan limit: {maxUsers}</div>}
          </div>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Admins</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#6EE7B7" }}>{filtered.filter(u => u.role === "admin").length}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Accountants</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#FCD34D" }}>{filtered.filter(u => u.role === "accountant").length}</div>
          </div>
        </div>

        {/* Invite + Search */}
        {canEdit && (
          <div className="action-row">
            <input
              type="email"
              placeholder="Email to invite..."
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="input"
              style={{ flex: 1, maxWidth: 300 }}
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim() || (maxUsers > 0 && filtered.length >= maxUsers)}
              className="btn btn-primary"
            >
              {inviting ? "Inviting..." : "Invite User"}
            </button>
            {maxUsers > 0 && filtered.length >= maxUsers && (
              <span style={{ color: "#FCA5A5", fontSize: 12 }}>Plan limit reached</span>
            )}
            <div style={{ flex: 1, maxWidth: 300, marginLeft: 'auto', position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
              <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search by email..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading users...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
              No users found.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.email}</td>
                    <td style={{ color: "#64748B" }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td>
                      <span className={`badge ${
                        u.role === "admin" ? "badge-admin" :
                        u.role === "accountant" ? "badge-accountant" :
                        u.role === "viewer" ? "badge-viewer" :
                        "badge-custom"
                      }`}>
                        {u.role || "none"}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {canEdit && (
                        <select
                          className="input"
                          style={{ width: 140, height: 32, fontSize: 12, padding: "0 8px" }}
                          value={u.role || "viewer"}
                          onChange={(e) => assignRole(u.id, e.target.value)}
                        >
                          {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                      {canEdit && (
                        <button
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", color: "#EF4444", borderColor: "#FECACA" }}
                          onClick={() => handleRemove(u.id)}
                          title="Remove user"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </RoleGuard>
  )
}