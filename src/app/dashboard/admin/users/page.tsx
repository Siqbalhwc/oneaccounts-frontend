"use client"

import { useState, useEffect } from "react"
import { useRole } from "@/contexts/RoleContext"
import { Shield } from "lucide-react"

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

    const fetchUsers = async () => {
      try {
        setLoading(true)
        setError("")
        const res = await fetch("/api/admin/users", { credentials: "include" })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        console.log("Admin API response:", data)
        if (data.users && Array.isArray(data.users)) {
          setUsers(data.users)
        } else {
          setUsers([])
        }
      } catch (e: any) {
        setError(e.message || "Failed to load users")
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [role])

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
    } catch (e: any) {
      setMessage("Network error")
      setTimeout(() => setMessage(""), 5000)
    }
  }

  if (roleLoading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
  }

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

      {message && (
        <div style={{
          background: message.includes("Error") || message.includes("error") || message.includes("Failed") ? "#FEF2F2" : "#F0FDF4",
          color: message.includes("Error") || message.includes("error") || message.includes("Failed") ? "#B91C1C" : "#15803D",
          padding: "10px 16px",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ {error}
          <button onClick={() => window.location.reload()} style={{ marginLeft: 12, background: "none", border: "none", color: "#1D4ED8", cursor: "pointer", textDecoration: "underline" }}>
            Retry
          </button>
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