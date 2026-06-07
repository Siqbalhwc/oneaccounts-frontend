"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import ManagementDashboard from "@/components/dashboard/ManagementDashboard"
import AccountantDashboard from "@/components/dashboard/AccountantDashboard"

export default function DashboardPage() {
  const { role, loading: roleLoading } = useRole()
  const [companyId, setCompanyId] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      const email = user.email
      if (cid) setCompanyId(cid)
      if (email) setUserEmail(email)
    })
  }, [])

  // Show role‑switcher only for the seed developer (siqbalhwc@gmail.com + company ending 0001)
  const isDeveloper =
    userEmail === "siqbalhwc@gmail.com" &&
    companyId === "00000000-0000-0000-0000-000000000001"

  const [devRole, setDevRole] = useState<"management" | "accountant">("management")

  const toggleDevRole = () => {
    setDevRole(prev => (prev === "management" ? "accountant" : "management"))
  }

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  }

  const effectiveRole = isDeveloper ? devRole : role

  return (
    <div style={{ position: "relative" }}>
      {isDeveloper && (
        <button
          onClick={toggleDevRole}
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
          {devRole === "management" ? "🔄 Switch to Accountant" : "🔄 Switch to Management"}
        </button>
      )}

      {effectiveRole === "accountant" ? (
        <AccountantDashboard role="accountant" />
      ) : (
        <ManagementDashboard role="management" />
      )}
    </div>
  )
}