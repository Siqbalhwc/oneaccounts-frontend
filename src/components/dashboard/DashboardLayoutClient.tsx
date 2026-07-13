"use client"

import { useState } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import MobileBottomNav from "@/components/dashboard/MobileBottomNav"
import MobileDrawer from "@/components/dashboard/MobileDrawer"
import SidebarClient from "@/app/dashboard/sidebar-client"
import DashboardSidebar from "@/components/DashboardSidebar"
import BottomNav from "@/components/BottomNav"
import { CompanyProvider } from "@/contexts/CompanyContext"
import QueryProvider from "@/components/QueryProvider"
import { SessionMonitor } from "@/components/SessionMonitor"
import TrialGuard from "@/components/TrialGuard"
import Breadcrumb from "@/components/Breadcrumb"

// Branded splash screen shown while permissions are loading
function BrandedSplash() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "'Inter', sans-serif",
        gap: 20,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          background: "linear-gradient(135deg, #1740C8, #071352)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          fontWeight: 800,
          color: "#fff",
          boxShadow: "0 8px 32px rgba(23,64,200,0.3)",
        }}
      >
        OA
      </div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>OneAccounts</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Loading your workspace…
      </div>
    </div>
  )
}

export default function DashboardLayoutClient({
  tenant,
  email,
  initial,
  children,
}: {
  tenant: any
  email: string
  initial: string
  children: React.ReactNode
}) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 🔐 Wait until role and plan are fully loaded before rendering any dashboard UI
  const { loading: roleLoading } = useRole()
  const { loading: planLoading } = usePlan()

  if (roleLoading || planLoading) {
    return <BrandedSplash />
  }

  // ── Mobile Layout ──────────────────────────────────────
  if (isMobile) {
    return (
      <CompanyProvider
        value={{
          companyId: tenant.companyId,
          companyName: tenant.companyName,
          companyTagline: tenant.companyTagline,
          logoUrl: tenant.companyLogo,
        }}
      >
        <QueryProvider>
          <SessionMonitor>
            <TrialGuard>
              <div
                style={{
                  position: "relative",
                  minHeight: "100vh",
                  background: "var(--bg)",
                  paddingBottom: "60px",
                }}
              >
                {children}
              </div>
            </TrialGuard>
            <MobileBottomNav onMenuClick={() => setDrawerOpen(true)} />
            <MobileDrawer
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />
          </SessionMonitor>
        </QueryProvider>
      </CompanyProvider>
    )
  }

  // ── Desktop Layout ─────────────────────────────────────
  return (
    <div className="dl-shell">
      <SidebarClient />
      <DashboardSidebar
        email={email}
        initial={initial}
        logoUrl={tenant.companyLogo}
        companyName={tenant.companyName}
        companyTagline={tenant.companyTagline}
      />
      <div className="dl-main">
        <CompanyProvider
          value={{
            companyId: tenant.companyId,
            companyName: tenant.companyName,
            companyTagline: tenant.companyTagline,
            logoUrl: tenant.companyLogo,
          }}
        >
          <QueryProvider>
            <SessionMonitor>
              <TrialGuard>
  <div className="dl-main-content">
    <Breadcrumb />
    {children}
  </div>
</TrialGuard>
            </SessionMonitor>
          </QueryProvider>
        </CompanyProvider>
        <div className="mobile-bottom-nav">
          <BottomNav />
        </div>
      </div>
    </div>
  )
}