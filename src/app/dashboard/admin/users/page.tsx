"use client"

import { useState, useEffect } from "react"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

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
      setError("Network error. Please check your connection.")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

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

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .admin-header { margin-bottom: 20px; }
        .admin-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .admin-subtitle { font-size: 13px; color: #94A3B8; }
        .admin-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .admin-row { display: grid; grid-template-columns: 1fr 200px 120px 120px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 13px; }
        .admin-row-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
        .admin-badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; }
        .admin-select { padding: 6px 10px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 12px; }
        .admin-btn { padding: 6px 14px; background: #1D4ED8; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }
        @media (max-width: 700px) {
          .admin-row { grid-template-columns: 1fr 100px 100px; }
          .admin-hide-mobile { display: none; }
        }
      `}</style>

      <div className="admin-header">
        <div className="admin-title">👑 Admin Panel - User Roles</div>
        <div className="admin-subtitle">Manage user permissions</div>
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

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading users...</div>
      ) : users.length === 0 ? (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
          No users found. Users who sign up will appear here.
        </div>
      ) : (
        <div className="admin-table">
          <div className="admin-row admin-row-header">
            <span>Email</span>
            <span className="admin-hide-mobile">Created</span>
            <span>Role</span>
            <span>Action</span>
          </div>
          {users.map(u => (
            <div key={u.id} className="admin-row">
              <span>{u.email}</span>
              <span className="admin-hide-mobile" style={{ color: "#64748B" }}>
                {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
              </span>
              <span>
                <span className="admin-badge" style={{
                  background: u.role === "admin" ? "#D1FAE5" : u.role === "accountant" ? "#FEF3C7" : "#FEE2E2",
                  color: u.role === "admin" ? "#065F46" : u.role === "accountant" ? "#92400E" : "#991B1B"
                }}>
                  {u.role || "none"}
                </span>
              </span>
              <span>
                <select
                  className="admin-select"
                  value={u.role || "viewer"}
                  onChange={(e) => assignRole(u.id, e.target.value)}
                >
                  <option value="viewer">Viewer</option>
                  <option value="accountant">Accountant</option>
                  <option value="admin">Admin</option>
                </select>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}