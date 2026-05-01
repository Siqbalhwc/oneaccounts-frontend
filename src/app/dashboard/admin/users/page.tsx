"use client"

import { useState, useEffect } from "react"
import { useRole } from "@/contexts/RoleContext"
import { Shield, X, Check } from "lucide-react"

export default function AdminUsersPage() {
  const { role, loading: roleLoading } = useRole()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (role !== "admin") {
      setLoading(false)
      return
    }
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(data => {
        if (data.users) setUsers(data.users)
        else setError(data.error || "Failed to load users")
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false))
  }, [role])

  const assignRole = async (userId: string, newRole: string) => {
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
      setMessage(data.error || "Error")
      setTimeout(() => setMessage(""), 3000)
    }
  }

  if (roleLoading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>

  if (role !== "admin") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <Shield size={48} color="#EF4444" />
        <h2 style={{ marginTop: 20 }}>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You need admin privileges to view this page.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .admin-header { margin-bottom: 20px; }
        .admin-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .admin-subtitle { font-size: 13px; color: #94A3B8; }
        .admin-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .admin-row { display: grid; grid-template-columns: 1fr 200px 120px 80px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 13px; }
        .admin-row-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
        .admin-badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .admin-select { padding: 6px 10px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 12px; }
        .admin-btn { padding: 6px 14px; background: #1D4ED8; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }
      `}</style>

      <div className="admin-header">
        <div className="admin-title">👑 Admin Panel - User Roles</div>
        <div className="admin-subtitle">Manage user permissions</div>
      </div>

      {message && (
        <div style={{ background: message.includes("Error") ? "#FEF2F2" : "#F0FDF4", color: message.includes("Error") ? "#B91C1C" : "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading users...</div>
      ) : (
        <div className="admin-table">
          <div className="admin-row admin-row-header">
            <span>Email</span>
            <span>Created</span>
            <span>Role</span>
            <span>Action</span>
          </div>
          {users.map(u => (
            <div key={u.id} className="admin-row">
              <span>{u.email}</span>
              <span style={{ color: "#64748B" }}>{new Date(u.created_at).toLocaleDateString()}</span>
              <span>
                <span className="admin-badge" style={{
                  background: u.role === "admin" ? "#D1FAE5" : u.role === "accountant" ? "#FEF3C7" : "#FEE2E2",
                  color: u.role === "admin" ? "#065F46" : u.role === "accountant" ? "#92400E" : "#991B1B"
                }}>
                  {u.role || "none"}
                </span>
              </span>
              <span>
                {u.role !== "admin" ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <select
                      className="admin-select"
                      value={u.role || "viewer"}
                      onChange={(e) => assignRole(u.id, e.target.value)}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="accountant">Accountant</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>Super admin</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}