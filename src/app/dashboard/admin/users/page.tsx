"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Shield, UserPlus, Search, Trash2 } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface User {
  id: string
  email: string
  created_at: string
  role: string
}

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

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    fetchUsers()
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

  const filtered = search.trim()
    ? users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))
    : users

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>Only administrators can access this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{`
          .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .input { height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #1D4ED8; color: white; }
          .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
          .btn-danger { background: #EF4444; color: white; }
          table { width: 100%; border-collapse: collapse; }
          th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
          td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
          tr:hover td { background: #FAFBFF; }
          .badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; }
          .badge-admin { background: #D1FAE5; color: #065F46; }
          .badge-accountant { background: #FEF3C7; color: #92400E; }
          .badge-viewer { background: #FEE2E2; color: #991B1B; }
          .badge-none { background: #F1F5F9; color: #64748B; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .action-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
          @media (max-width: 700px) {
            th:nth-child(2), td:nth-child(2) { display: none; }
            .action-row { flex-direction: column; align-items: stretch; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>👑 Admin Panel - User Roles</h1>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Manage user permissions and invite new users</p>
          </div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: "#F0FDF4", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Users</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{filtered.length}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Admins</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#065F46" }}>{filtered.filter(u => u.role === "admin").length}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Accountants</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#92400E" }}>{filtered.filter(u => u.role === "accountant").length}</div>
          </div>
        </div>

        {/* Invite + Search in one row */}
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
              disabled={inviting || !inviteEmail.trim()}
              className="btn btn-primary"
            >
              {inviting ? "Inviting..." : "Invite User"}
            </button>
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
                        u.role === "viewer" ? "badge-viewer" : "badge-none"
                      }`}>
                        {u.role || "none"}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {canEdit && (
                        <select
                          className="input"
                          style={{ width: 120, height: 32, fontSize: 12, padding: "0 8px" }}
                          value={u.role || "viewer"}
                          onChange={(e) => assignRole(u.id, e.target.value)}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="accountant">Accountant</option>
                          <option value="admin">Admin</option>
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