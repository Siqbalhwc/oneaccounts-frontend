"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Shield, UserPlus, Search, Trash2, Plus, X, Save, CheckCircle, Edit3, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

const ADMIN_WHATSAPP = "923117798157" // ⬅️ Replace with your actual WhatsApp number (without +)

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
  "Can Approve Purchase Orders",
]

interface User {
  id: string
  email: string
  created_at: string
  role: string
  customPermissions?: Record<string, boolean> | null
}

interface Role {
  id: number
  role_name: string
  permissions: Record<string, boolean> | null
}

type SortField = "email" | "created_at" | "role"
type SortDir = "asc" | "desc"

export default function AdminUsersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin"
  const canEdit = role === "admin"

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [search, setSearch] = useState("")

  // Sorting
  const [sortField, setSortField] = useState<SortField>("email")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Custom roles (fetched from DB)
  const [roles, setRoles] = useState<Role[]>([])
  const [showRoleManager, setShowRoleManager] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null)
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({})

  // Per‑user permissions modal
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({})
  const [savingUserPerms, setSavingUserPerms] = useState(false)

  // Company ID & subscription limit
  const [companyId, setCompanyId] = useState("")
  const [maxUsers, setMaxUsers] = useState<number | null>(null) // null = unlimited, number = limit
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)
  const [requestingUpgrade, setRequestingUpgrade] = useState(false)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
        setCompanyId(cid)
        // Fetch subscription limit
        supabase
          .from("subscriptions")
          .select("max_users")
          .eq("company_id", cid)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data: sub }) => {
            if (sub?.max_users !== undefined && sub?.max_users !== null) {
              setMaxUsers(sub.max_users)
            } else {
              setMaxUsers(null) // unlimited
            }
          })
      }
    })

    fetchUsers()
    fetchRoles()
  }, [role, canView])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.users && Array.isArray(data.users)) {
        const enriched = await Promise.all(data.users.map(async (u: any) => {
          const { data: userRole } = await supabase
            .from("user_roles")
            .select("permissions")
            .eq("user_id", u.id)
            .maybeSingle()
          return {
            ...u,
            customPermissions: userRole?.permissions || null,
          }
        }))
        setUsers(enriched)
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
    const { data } = await supabase
      .from("company_roles")
      .select("*")
      .order("role_name")
    if (data) {
      setRoles(data)
    }
  }

  // Check if limit is reached
  const isLimitReached = maxUsers !== null && maxUsers > 0 && users.length >= maxUsers

  // ── Helper: get effective permissions for a user ──
  const getEffectivePermissions = (user: User): Record<string, boolean> => {
    if (user.customPermissions && Object.keys(user.customPermissions).length > 0) {
      return { ...user.customPermissions }
    }
    const rolePermissions: Record<string, boolean> = {}
    if (user.role === "admin") {
      ALL_MODULES.forEach(m => rolePermissions[m] = true)
    } else if (user.role === "accountant") {
      ALL_MODULES.forEach(m => rolePermissions[m] = m !== "Admin Panel" && m !== "Settings")
    } else if (user.role === "viewer") {
      const viewerModules = ["Dashboard", "Customers", "Sales Invoices", "Receipts", "Suppliers", "Purchase Bills", "Payments", "Reports"]
      ALL_MODULES.forEach(m => rolePermissions[m] = viewerModules.includes(m))
    } else {
      const customRole = roles.find(r => r.role_name === user.role)
      if (customRole?.permissions) {
        Object.entries(customRole.permissions).forEach(([mod, enabled]) => {
          rolePermissions[mod] = enabled
        })
      }
      ALL_MODULES.forEach(m => { if (!(m in rolePermissions)) rolePermissions[m] = false })
    }
    return rolePermissions
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
    if (isLimitReached) {
      setShowUpgradePrompt(true)
      return
    }
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

  const requestUpgrade = async () => {
    if (!companyId) return
    setRequestingUpgrade(true)
    const { error } = await supabase
      .from("payment_notifications")
      .insert({
        company_id: companyId,
        amount: 0,
        plan_code: "upgrade_request",
        period: "N/A",
        topups: [],
        // receipt_url can be null
      })
    if (error) {
      setMessage("Failed to send upgrade request. Please try WhatsApp.")
    } else {
      setMessage("✅ Upgrade request sent! Our team will contact you.")
      setShowUpgradePrompt(false)
    }
    setRequestingUpgrade(false)
    setTimeout(() => setMessage(""), 5000)
  }

  const openWhatsApp = () => {
    const msg = encodeURIComponent(
      `Hi, I'm the admin of ${users.length > 0 ? 'my company' : ''}. I've reached my user limit and would like to upgrade to add more team members.`
    )
    window.open(getWhatsAppLink(ADMIN_WHATSAPP, msg), "_blank")
  }

  // ── Open user permissions modal ──
  const openUserPerms = (user: User) => {
    setSelectedUser(user)
    setUserPerms(getEffectivePermissions(user))
  }

  // ── Save user permissions (overrides) ──
  const saveUserPerms = async () => {
    if (!selectedUser || !companyId) return
    setSavingUserPerms(true)
    const { error } = await supabase
      .from("user_roles")
      .update({ permissions: userPerms })
      .eq("user_id", selectedUser.id)
      .eq("company_id", companyId)

    if (!error) {
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, customPermissions: { ...userPerms } } : u))
      setMessage("Permissions updated!")
      setSelectedUser(null)
    } else {
      setMessage(error.message)
    }
    setSavingUserPerms(false)
    setTimeout(() => setMessage(""), 3000)
  }

  // ── Role management ──
  const addOrUpdateRole = async () => {
    const name = newRoleName.trim()
    if (!name || !companyId) return
    const payload: any = {
      role_name: name,
      permissions: permDraft,
      company_id: companyId,
    }
    if (editingRoleId) {
      const { error } = await supabase
        .from("company_roles")
        .update(payload)
        .eq("id", editingRoleId)
        .eq("company_id", companyId)
      if (!error) {
        setMessage("Role updated!")
        setNewRoleName(""); setEditingRoleId(null); setPermDraft({})
        fetchRoles()
      } else setMessage(error.message)
    } else {
      const { error } = await supabase.from("company_roles").insert(payload)
      if (!error) {
        setMessage("Role created!")
        setNewRoleName(""); setPermDraft({})
        fetchRoles()
      } else setMessage(error.message)
    }
    setTimeout(() => setMessage(""), 3000)
  }

  const deleteRole = async (id: number) => {
    if (!companyId) return
    await supabase.from("company_roles").delete().eq("id", id).eq("company_id", companyId)
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
    setEditingRoleId(null); setNewRoleName(""); setPermDraft({})
  }

  const togglePerm = (module: string) => {
    setPermDraft(prev => ({ ...prev, [module]: !prev[module] }))
  }

  // ── Sort & Filter ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const filtered = search.trim()
    ? users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))
    : users

  const sorted = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "created_at") {
      valA = new Date(a.created_at).getTime() || 0
      valB = new Date(b.created_at).getTime() || 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const allRoles = ["admin", "accountant", "viewer", ...roles.map(r => r.role_name).filter(r => !["admin","accountant","viewer"].includes(r))]

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>Only administrators can access this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          .card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 16px 20px; box-shadow: var(--shadow-sm); }
          .input, .select { height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; background: var(--bg); color: var(--text); }
          .input:focus, .select:focus { border-color: var(--primary); }
          .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); }
          .btn:hover { background: var(--card-hover); }
          .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
          .btn-primary:hover { background: var(--primary-hover); }
          .btn-danger { background: #EF4444; color: white; border-color: #EF4444; }
          .btn-danger:hover { background: #DC2626; }
          .badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; }
          .badge-admin { background: #D1FAE5; color: #065F46; }
          .badge-accountant { background: #FEF3C7; color: #92400E; }
          .badge-viewer { background: #FEE2E2; color: #991B1B; }
          .badge-custom { background: var(--card-hover); color: var(--text); border: 1px solid var(--border); }
          .perm-badge { background: var(--card-hover); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 10px; color: var(--text-muted); white-space: nowrap; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
          .action-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
          .perm-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .perm-chip { background: var(--card-hover); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; color: var(--text-muted); }
          .perm-chip.active { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: center; justify-content: center; }
          .modal { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; }
          .header-row {
            display: grid;
            grid-template-columns: 1fr 120px 120px 1fr 140px;
            padding: 14px 24px;
            font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
            border-bottom: 1px solid var(--border);
            background: var(--card);
          }
          .data-row {
            display: grid;
            grid-template-columns: 1fr 120px 120px 1fr 140px;
            padding: 12px 24px;
            border-bottom: 1px solid var(--border);
            font-size: 13px; align-items: center;
            transition: background 0.15s;
          }
          .data-row:hover { background: var(--card-hover); }
          .data-row:last-child { border-bottom: none; }
          .sort-btn {
            background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
            display: inline-flex; align-items: center; gap: 4px; padding: 0;
            font-weight: 700; text-transform: uppercase; font-size: 10px;
          }
          .sort-btn:hover { color: var(--primary); }
          .upgrade-card {
            background: #7F1D1D;
            border: 1px solid #FECACA;
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 16px;
            color: #FEE2E2;
          }
          .upgrade-title { font-weight: 700; font-size: 15px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
          .upgrade-actions { display: flex; gap: 10px; margin-top: 12px; }
          @media (max-width: 700px) {
            .header-row, .data-row { grid-template-columns: 1fr 80px 80px 80px; }
            .header-row > :nth-child(2), .data-row > :nth-child(2) { display: none; }
          }
        `}</style>

        {/* ── Upgrade Prompt ── */}
        {showUpgradePrompt && (
          <div className="upgrade-card">
            <div className="upgrade-title">
              <AlertCircle size={18} />
              User Limit Reached
            </div>
            <p style={{ margin: 0, fontSize: 13 }}>
              You have reached the maximum number of users allowed by your current plan ({users.length}/{maxUsers}). Upgrade to add more team members.
            </p>
            <div className="upgrade-actions">
              <button className="btn btn-primary" onClick={requestUpgrade} disabled={requestingUpgrade}>
                {requestingUpgrade ? "Sending..." : "Request Upgrade"}
              </button>
              <button className="btn" onClick={openWhatsApp} style={{ borderColor: "#25D366", color: "#25D366" }}>
                WhatsApp Admin
              </button>
            </div>
          </div>
        )}

        {/* ── User Permissions Modal ── */}
        {selectedUser && (
          <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "var(--text)", fontSize: 16 }}>
                  Permissions for {selectedUser.email}
                </h3>
                <button onClick={() => setSelectedUser(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                  <X size={18} />
                </button>
              </div>
              <div className="perm-list" style={{ marginBottom: 20 }}>
                {ALL_MODULES.map(mod => (
                  <div
                    key={mod}
                    className={`perm-chip ${userPerms[mod] ? "active" : ""}`}
                    onClick={() => setUserPerms(prev => ({ ...prev, [mod]: !prev[mod] }))}
                  >
                    {mod}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setSelectedUser(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveUserPerms} disabled={savingUserPerms}>
                  {savingUserPerms ? "Saving..." : "Save Permissions"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>👑 Admin Panel - User Roles</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Manage user permissions, invite users, and customize roles</p>
          </div>
          <button className="btn" onClick={() => setShowRoleManager(!showRoleManager)}>
            <Shield size={14} /> Manage Roles
          </button>
        </div>

        {error && (
          <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, border: "1px solid #FECACA" }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: "var(--card)", color: "#6EE7B7", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, border: "1px solid #065F46" }}>
            {message}
          </div>
        )}

        {/* Custom Role Manager */}
        {showRoleManager && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ color: "var(--text)", marginBottom: 12 }}>
              {editingRoleId ? "Edit Role" : "Custom Roles"}
            </h3>
            {!editingRoleId && (
              <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {roles.map(role => (
                  <div key={role.id} className="badge badge-custom" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px" }}>
                    <span>{role.role_name}</span>
                    <button onClick={() => startEditRole(role)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}>✏️</button>
                    <button onClick={() => deleteRole(role.id)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", padding: 0 }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
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
                  <button className="btn btn-primary" onClick={addOrUpdateRole}><Save size={14} /> Update</button>
                  <button className="btn" onClick={cancelEdit}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={addOrUpdateRole}><Plus size={14} /> Add</button>
              )}
            </div>
            {(editingRoleId || newRoleName) && (
              <>
                <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "0 0 8px" }}>Select permissions for this role:</p>
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
          <div className="summary-item">
            <div className="summary-label">Total Users</div>
            <div className="summary-value">{filtered.length}</div>
            {maxUsers !== null && maxUsers > 0 && <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4 }}>Plan limit: {maxUsers}</div>}
          </div>
          <div className="summary-item">
            <div className="summary-label">Admins</div>
            <div className="summary-value" style={{ color: "#10B981" }}>{filtered.filter(u => u.role === "admin").length}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Accountants</div>
            <div className="summary-value" style={{ color: "#F59E0B" }}>{filtered.filter(u => u.role === "accountant").length}</div>
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
              disabled={isLimitReached}
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim() || isLimitReached}
              className="btn btn-primary"
              title={isLimitReached ? "User limit reached. Upgrade to invite more users." : ""}
            >
              {inviting ? "Inviting..." : "Invite User"}
            </button>
            {isLimitReached && (
              <button className="btn" onClick={() => setShowUpgradePrompt(true)} style={{ borderColor: "#F59E0B", color: "#F59E0B" }}>
                <AlertCircle size={14} /> Upgrade
              </button>
            )}
            <div style={{ flex: 1, maxWidth: 300, marginLeft: 'auto', position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "var(--text-muted)" }} />
              <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search by email..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading users...</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              No users found.
            </div>
          ) : (
            <>
              <div className="header-row">
                <button className="sort-btn" onClick={() => handleSort("email")}>Email {getSortIcon("email")}</button>
                <button className="sort-btn" onClick={() => handleSort("created_at")}>Created {getSortIcon("created_at")}</button>
                <button className="sort-btn" onClick={() => handleSort("role")}>Role {getSortIcon("role")}</button>
                <span>Permissions</span>
                <span style={{ textAlign: "right" }}>Action</span>
              </div>
              {sorted.map(u => {
                const perms = getEffectivePermissions(u)
                const permList = Object.keys(perms).filter(k => perms[k])
                return (
                  <div key={u.id} className="data-row">
                    <span style={{ fontWeight: 500 }}>{u.email}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                    </span>
                    <span>
                      <span className={`badge ${
                        u.role === "admin" ? "badge-admin" :
                        u.role === "accountant" ? "badge-accountant" :
                        u.role === "viewer" ? "badge-viewer" :
                        "badge-custom"
                      }`}>
                        {u.role || "none"}
                      </span>
                    </span>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                      onClick={() => openUserPerms(u)}
                      title="Click to edit permissions"
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                        {permList.slice(0, 3).map(perm => (
                          <span key={perm} className="perm-badge">{perm}</span>
                        ))}
                        {permList.length > 3 && (
                          <span className="perm-badge">+{permList.length - 3} more</span>
                        )}
                      </div>
                      <Edit3 size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                      {canEdit && (
                        <select
                          className="input"
                          style={{ width: 130, height: 32, fontSize: 12, padding: "0 8px" }}
                          value={u.role || "viewer"}
                          onChange={(e) => assignRole(u.id, e.target.value)}
                        >
                          {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                      {canEdit && (
                        <button
                          className="btn"
                          style={{ padding: "4px 8px", color: "#EF4444", borderColor: "#FECACA" }}
                          onClick={() => handleRemove(u.id)}
                          title="Remove user"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </RoleGuard>
  )
}