"use client"
import { useEffect, useState } from "react"
import { useRole } from "@/contexts/RoleContext"
import ManagementDashboard from "@/components/dashboard/ManagementDashboard"
import AccountantDashboard from "@/components/dashboard/AccountantDashboard"

export default function DashboardPage() {
  const { role, loading: roleLoading } = useRole()
  const [demoRole, setDemoRole] = useState<"management" | "accountant">("management")
  const [timedOut, setTimedOut] = useState(false)

  // Safety timeout – if role never loads after 5s, show dashboard anyway
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 5000)
    return () => clearTimeout(t)
  }, [])

  // Sync demo role with actual role once loaded
  useEffect(() => {
    if (role) {
      setDemoRole(role === "accountant" ? "accountant" : "management")
    }
  }, [role])

  // Still loading and haven't timed out yet
  if (roleLoading && !timedOut) {
    return (
      <div style={{
        padding: 40,
        textAlign: "center",
        color: "#94A3B8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 16,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid #1E293B",
          borderTop: "3px solid #A78BFA",
          animation: "spin 1s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 14 }}>Loading dashboard…</div>
      </div>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Role Switcher (developer tool) */}
      <button
        onClick={() => setDemoRole(p => p === "management" ? "accountant" : "management")}
        style={{
          position: "absolute",
          top: 16,
          right: 24,
          zIndex: 100,
          padding: "6px 14px",
          borderRadius: 8,
          border: "1px solid #334155",
          background: "#1E293B",
          color: "#F1F5F9",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {demoRole === "management" ? "🔄 Switch to Accountant" : "🔄 Switch to Management"}
      </button>

      {demoRole === "accountant"
        ? <AccountantDashboard role="accountant" />
        : <ManagementDashboard role="management" />
      }
    </div>
  )
}