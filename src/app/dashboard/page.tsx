"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import ManagementDashboard from "@/components/dashboard/ManagementDashboard"
import AccountantDashboard from "@/components/dashboard/AccountantDashboard"

export default function DashboardPage() {
  const { role, loading: roleLoading } = useRole()
  const [companyId, setCompanyId] = useState("")
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Developer toggle – allows switching between dashboards on screen
  const [demoRole, setDemoRole] = useState<"management" | "accountant">("management")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Sync demo role with actual role on first load
  useEffect(() => {
    if (role) {
      setDemoRole(role === "accountant" ? "accountant" : "management")
    }
  }, [role])

  const toggleRole = () => {
    setDemoRole(prev => prev === "management" ? "accountant" : "management")
  }

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Role Switcher (developer tool) */}
      <button
        onClick={toggleRole}
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
        }}
      >
        {demoRole === "management" ? "🔄 Switch to Accountant" : "🔄 Switch to Management"}
      </button>

      {demoRole === "accountant" ? (
        <AccountantDashboard role="accountant" />
      ) : (
        <ManagementDashboard role="management" />
      )}
    </div>
  )
}