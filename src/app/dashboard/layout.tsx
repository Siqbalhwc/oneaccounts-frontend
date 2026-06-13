// app/dashboard/layout.tsx
import { SessionMonitor } from "@/components/SessionMonitor"
import { redirect } from 'next/navigation'
import { getUserCompany } from '@/lib/get-user-company'
import SidebarClient from './sidebar-client'
import BottomNav from "@/components/BottomNav"
import DashboardSidebar from "@/components/DashboardSidebar"
import { CompanyProvider } from "@/contexts/CompanyContext"
import QueryProvider from "@/components/QueryProvider"

// ... (keep the entire styles constant exactly as you have it – unchanged) ...
const styles = `...` // same as your original

// ─────────────────────────────────────────────────────────────
// Server component (unchanged)
// ─────────────────────────────────────────────────────────────
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getUserCompany()

  if (!tenant) {
    return (
      <html lang="en">
        <body style={{ margin: 0, background: '#0B1120', color: '#E2E8F0', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>No Company Linked</h1>
            <p style={{ color: '#94A3B8', marginBottom: 16 }}>Your account is not linked to a company. Please contact your administrator.</p>
            <a href="/login" style={{ color: '#60A5FA', fontSize: 14 }}>← Back to login</a>
          </div>
        </body>
      </html>
    )
  }

  const email   = tenant.email
  const initial = email.charAt(0).toUpperCase()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <DashboardLayoutClient tenant={tenant} email={email} initial={initial}>
        {children}
      </DashboardLayoutClient>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Client component – decides desktop or mobile layout
// ─────────────────────────────────────────────────────────────
"use client"

import { useState } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import MobileBottomNav from "@/components/dashboard/MobileBottomNav"
import MobileDrawer from "@/components/dashboard/MobileDrawer"
import SidebarClient from './sidebar-client'
import DashboardSidebar from "@/components/DashboardSidebar"
import BottomNav from "@/components/BottomNav"
import { CompanyProvider } from "@/contexts/CompanyContext"
import QueryProvider from "@/components/QueryProvider"
import { SessionMonitor } from "@/components/SessionMonitor"

function DashboardLayoutClient({ tenant, email, initial, children }: { tenant: any; email: string; initial: string; children: React.ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (isMobile) {
    // Mobile layout: no sidebar, bottom navigation + drawer
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

  // Desktop layout – exactly your original
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