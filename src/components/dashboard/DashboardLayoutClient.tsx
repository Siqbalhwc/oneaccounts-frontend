"use client"

import { useState } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import MobileBottomNav from "@/components/dashboard/MobileBottomNav"
import MobileDrawer from "@/components/dashboard/MobileDrawer"
import SidebarClient from "@/app/dashboard/sidebar-client"
import DashboardSidebar from "@/components/DashboardSidebar"   // ← fixed path
import BottomNav from "@/components/BottomNav"
import { CompanyProvider } from "@/contexts/CompanyContext"
import QueryProvider from "@/components/QueryProvider"
import { SessionMonitor } from "@/components/SessionMonitor"

export default function DashboardLayoutClient({ tenant, email, initial, children }: { tenant: any; email: string; initial: string; children: React.ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (isMobile) {
    return (
      <CompanyProvider value={{
        companyId: tenant.companyId,
        companyName: tenant.companyName,
        companyTagline: tenant.companyTagline,
        logoUrl: tenant.companyLogo,
      }}>
        <QueryProvider>
          <SessionMonitor>
            <div style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", paddingBottom: "60px" }}>
              {children}
            </div>
            <MobileBottomNav onMenuClick={() => setDrawerOpen(true)} />
            <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
          </SessionMonitor>
        </QueryProvider>
      </CompanyProvider>
    )
  }

  // Desktop layout – matches original
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
        <CompanyProvider value={{
          companyId: tenant.companyId,
          companyName: tenant.companyName,
          companyTagline: tenant.companyTagline,
          logoUrl: tenant.companyLogo,
        }}>
          <QueryProvider>
            <SessionMonitor>
              <div className="dl-main-content">{children}</div>
            </SessionMonitor>
          </QueryProvider>
        </CompanyProvider>
        <div className="mobile-bottom-nav"><BottomNav /></div>
      </div>
    </div>
  )
}