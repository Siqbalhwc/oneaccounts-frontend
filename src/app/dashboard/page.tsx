"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import ManagementDashboard from "@/components/dashboard/ManagementDashboard"
import AccountantDashboard from "@/components/dashboard/AccountantDashboard"
import TradingServiceDashboard from "@/components/dashboard/TradingServiceDashboard"

export default function DashboardPage() {
  const { role, loading: roleLoading } = useRole()
  const [companyId, setCompanyId] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [businessType, setBusinessType] = useState("")
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
      // Fetch business type
      if (cid) {
        supabase.from("companies").select("business_type").eq("id", cid).single()
          .then(({ data }) => { if (data) setBusinessType(data.business_type || "") })
      }
    })
  }, [])

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

  // Accountant → Accountant Dashboard
  if (effectiveRole === "accountant") {
    return <AccountantDashboard role="accountant" />
  }

  // Management → NGO or Trading/Service
  return (
    <div style={{ position: "relative" }}>
      {isDeveloper && (
        <button
          onClick={toggleDevRole}
          style={{
            position: "absolute", top: 16, right: 24, zIndex: 100,
            padding: "6px 14px", borderRadius: 8,
            border: "1px solid #334155", background: "#1E293B", color: "#F1F5F9",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {devRole === "management" ? "🔄 Switch to Accountant" : "🔄 Switch to Management"}
        </button>
      )}

      {businessType === "ngo" ? (
        <ManagementDashboard role="management" />
      ) : (
        <TradingServiceDashboard role="management" />
      )}
    </div>
  )
}