"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import ManagementDashboard from "@/components/dashboard/ManagementDashboard"
import AccountantDashboard from "@/components/dashboard/AccountantDashboard"
import TradingServiceDashboard from "@/components/dashboard/TradingServiceDashboard"
import MobileDashboard from "@/components/dashboard/MobileDashboard"

export default function DashboardPage() {
  const { role, loading: roleLoading } = useRole()
  const [companyId, setCompanyId] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [isMobile, setIsMobile] = useState(false)

  // FIX: track whether we've given up waiting for role
  const [roleTimedOut, setRoleTimedOut] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // FIX: safety timeout — if role hasn't resolved in 5s, render anyway with fallback
  useEffect(() => {
    if (!roleLoading) return
    const timer = setTimeout(() => setRoleTimedOut(true), 5000)
    return () => clearTimeout(timer)
  }, [roleLoading])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      setUserEmail(user.email || "")

      // FIX: try app_metadata first, then fall back to user_roles table
      // New company users often don't have company_id in app_metadata yet
      let cid: string | null = (user?.app_metadata as any)?.company_id || null

      if (!cid) {
        try {
          const { data: roleRow } = await supabase
            .from("user_roles")
            .select("company_id")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()
          cid = roleRow?.company_id || null
        } catch {
          // ignore
        }
      }

      if (cid) {
        setCompanyId(cid)
        // Fetch business type
        try {
          const { data } = await supabase
            .from("companies")
            .select("business_type")
            .eq("id", cid)
            .single()
          if (data) setBusinessType(data.business_type || "")
        } catch {
          // ignore — businessType stays ""
        }
      }
    })
  }, [])

  const isDeveloper =
    userEmail === "siqbalhwc@gmail.com" &&
    companyId === "00000000-0000-0000-0000-000000000001"

  const [devRole, setDevRole] = useState<"management" | "accountant">("management")
  const [devBusinessType, setDevBusinessType] = useState<"ngo" | "trading">("ngo")

  const toggleDevRole = () => {
    setDevRole(prev => (prev === "management" ? "accountant" : "management"))
  }

  const toggleDevBusinessType = () => {
    setDevBusinessType(prev => (prev === "ngo" ? "trading" : "ngo"))
  }

  // FIX: was — if (roleLoading || !role) { return <Loading /> }
  // This blocked forever for new companies with no role row.
  // Now: wait max 5s, then fall through with "management" as default.
  const stillWaiting = roleLoading && !roleTimedOut
  if (stillWaiting) {
    return (
      <div style={{
        padding: 40, textAlign: "center", color: "#94A3B8",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        minHeight: "60vh", justifyContent: "center",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          border: "3px solid rgba(148,163,184,0.2)",
          borderTop: "3px solid #A78BFA",
          animation: "spin 1s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: "0.85rem" }}>Setting up your dashboard…</div>
      </div>
    )
  }

  // FIX: if role never loaded, default to "management" so dashboard renders
  const effectiveRole = isDeveloper ? devRole : (role || "management")
  const effectiveBusinessType = isDeveloper ? devBusinessType : businessType

  if (isMobile) {
    return <MobileDashboard role={effectiveRole} businessType={effectiveBusinessType} />
  }

  if (effectiveRole === "accountant") {
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
        <AccountantDashboard role="accountant" />
      </div>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      {isDeveloper && (
        <div style={{ position: "absolute", top: 16, right: 24, zIndex: 100, display: "flex", gap: 8 }}>
          <button
            onClick={toggleDevBusinessType}
            style={{
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid #334155", background: "#1E293B", color: "#F1F5F9",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {devBusinessType === "ngo" ? "🔄 Switch to Trading View" : "🔄 Switch to NGO View"}
          </button>
          <button
            onClick={toggleDevRole}
            style={{
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid #334155", background: "#1E293B", color: "#F1F5F9",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {devRole === "management" ? "🔄 Switch to Accountant" : "🔄 Switch to Management"}
          </button>
        </div>
      )}

      {effectiveBusinessType === "ngo" ? (
        <ManagementDashboard role="management" />
      ) : (
        <TradingServiceDashboard role="management" />
      )}
    </div>
  )
}