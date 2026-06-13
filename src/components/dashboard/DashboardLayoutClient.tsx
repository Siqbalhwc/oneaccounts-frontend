"use client"

import { useState, useEffect } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import MobileBottomNav from "@/components/dashboard/MobileBottomNav"
import MobileDrawer from "@/components/dashboard/MobileDrawer"
import SidebarClient from "@/app/dashboard/sidebar-client"
import DashboardSidebar from "@/components/DashboardSidebar"
import BottomNav from "@/components/BottomNav"
import { CompanyProvider } from "@/contexts/CompanyContext"
import QueryProvider from "@/components/QueryProvider"
import { SessionMonitor } from "@/components/SessionMonitor"

export default function DashboardLayoutClient({ tenant, email, initial, children }: { tenant: any; email: string; initial: string; children: React.ReactNode }) {
  const [forceMobile, setForceMobile] = useState(false)
  const isMobileMedia = useMediaQuery("(max-width: 768px)")
  const isMobile = forceMobile || isMobileMedia
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Debug: show a small banner on mobile detection
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("forceMobile")
      if (stored === "true") setForceMobile(true)
    }
  }, [])

  const toggleForceMobile = () => {
    const newVal = !forceMobile
    setForceMobile(newVal)
    localStorage.setItem("forceMobile", String(newVal))
    window.location.reload()
  }

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
            {/* Debug banner */}
            <div style={{ background: "#F97316", color: "black", fontSize: 10, textAlign: "center", padding: "4px", position: "sticky", top: 0, zIndex: 1000 }}>
              MOBILE MODE {forceMobile ? "(force)" : ""} | <button onClick={toggleForceMobile} style={{ background: "none", border: "none", color: "black", fontWeight: "bold", cursor: "pointer" }}>Toggle</button>
            </div>
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

  // Desktop layout
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