"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { PlanProvider, usePlan } from "@/contexts/PlanContext"
import { RoleProvider, useRole } from "@/contexts/RoleContext"
import SidebarClient from "@/app/dashboard/sidebar-client"
import TrialGuard from "@/components/TrialGuard"
import NotificationBell from "@/components/NotificationBell"

export default function DashboardClientWrapper({
  children,
  enabledFeatures,
  email,
  initial,
}: {
  children: React.ReactNode
  enabledFeatures: string[]
  email: string
  initial: string
}) {
  return (
    <RoleProvider>
      <PlanProvider enabledFeatures={enabledFeatures}>
        <DashboardLayoutInner email={email} initial={initial}>
          {children}
        </DashboardLayoutInner>
      </PlanProvider>
    </RoleProvider>
  )
}

function DashboardLayoutInner({
  children,
  email,
  initial,
}: {
  children: React.ReactNode
  email: string
  initial: string
}) {
  const { hasFeature } = usePlan()
  const { role } = useRole()
  const pathname = usePathname()
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase
      .from("company_settings")
      .select("logo_url")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data?.logo_url) setLogoUrl(data.logo_url)
      })
  }, [])

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // Role-based access map
  const roleAccess: Record<string, string[]> = {
    "Dashboard": ["admin", "accountant", "viewer"],
    "Customers": ["admin", "accountant", "viewer"],
    "Suppliers": ["admin", "accountant", "viewer"],
    "Chart of Accounts": ["admin", "accountant", "viewer"],
    "All Reports": ["admin", "accountant", "viewer"],
    "Trial Balance": ["admin", "accountant", "viewer"],
    "Profit & Loss": ["admin", "accountant", "viewer"],
    "Balance Sheet": ["admin", "accountant", "viewer"],
    "Sales Invoices": ["admin", "accountant"],
    "Purchase Bills": ["admin", "accountant"],
    "Receipts": ["admin", "accountant"],
    "Payments": ["admin", "accountant"],
    "Journal Entries": ["admin", "accountant"],
    "Investors": ["admin", "accountant"],
    "Products": ["admin", "accountant"],
    "Inventory Adj.": ["admin", "accountant"],
    "Bank Accounts": ["admin", "accountant"],
    "Bank Transfers": ["admin", "accountant"],
    "Admin Panel": ["admin"],
    "Feature Manager": ["admin"],
    "Audit Logs": ["admin"],
    "Invoice Automation": ["admin", "accountant"],
    "Upgrade Plan": ["admin", "accountant", "viewer"],
    "Settings": ["admin"],
    "New Company": ["admin", "accountant"],
  }

  const allNavItems = [
    { label: 'Dashboard',          icon: '📊', href: '/dashboard',                    section: 'MAIN',       feature: null },
    { label: 'Customers',          icon: '👥', href: '/dashboard/customers',          section: 'CRM',        feature: null },
    { label: 'Sales Invoices',     icon: '🧾', href: '/dashboard/invoices',           section: 'CRM',        feature: null },
    { label: 'Receipts',           icon: '💰', href: '/dashboard/receipts',           section: 'CRM',        feature: null },
    { label: 'Suppliers',          icon: '🚚', href: '/dashboard/suppliers',          section: 'CRM',        feature: null },
    { label: 'Purchase Bills',     icon: '📦', href: '/dashboard/bills',              section: 'CRM',        feature: null },
    { label: 'Payments',           icon: '💳', href: '/dashboard/payments',           section: 'CRM',        feature: null },
    { label: 'Bank Accounts',      icon: '🏦', href: '/dashboard/banking/bank-accounts', section: 'BANKING',  feature: null },
    { label: 'Bank Transfers',     icon: '🔄', href: '/dashboard/banking/bank-transfers', section: 'BANKING',  feature: null },
    { label: 'Products',           icon: '📦', href: '/dashboard/products',           section: 'INVENTORY',  feature: null },
    { label: 'Inventory Adj.',     icon: '⚖️', href: '/dashboard/inventory/adjustments', section: 'INVENTORY', feature: 'inventory' },
    { label: 'Chart of Accounts',  icon: '📋', href: '/dashboard/accounts',           section: 'ACCOUNTING', feature: null },
    { label: 'Journal Entries',    icon: '📓', href: '/dashboard/journal',            section: 'ACCOUNTING', feature: null },
    { label: 'Trial Balance',      icon: '⚖️', href: '/dashboard/reports/trial-balance', section: 'ACCOUNTING', feature: null },
    { label: 'Profit & Loss',      icon: '📈', href: '/dashboard/reports/profit-loss',  section: 'ACCOUNTING', feature: null },
    { label: 'Balance Sheet',      icon: '📊', href: '/dashboard/reports/balance-sheet', section: 'ACCOUNTING', feature: 'balance_sheet' },
    { label: 'All Reports',        icon: '📁', href: '/dashboard/reports',            section: 'ACCOUNTING', feature: null },
    { label: 'Invoice Automation', icon: '⚙️', href: '/dashboard/settings/invoice-automation', section: 'ACCOUNTING', feature: 'invoice_automation' },
    { label: 'Investors',          icon: '💼', href: '/dashboard/investors',           section: 'ACCOUNTING', feature: 'investors' },
    { label: 'Admin Panel',        icon: '👑', href: '/dashboard/admin/users',        section: 'SYSTEM',     feature: null },
    { label: 'Feature Manager',    icon: '⚙️', href: '/dashboard/admin/features',     section: 'SYSTEM',     feature: null },
    { label: 'Upgrade Plan',       icon: '⭐', href: '/dashboard/upgrade',            section: 'SYSTEM',     feature: null },
    { label: 'Audit Logs',        icon: '📋', href: '/dashboard/admin/audit-logs', section: 'SYSTEM',     feature: null },
    { label: 'Settings',          icon: '⚙️', href: '/dashboard/settings',            section: 'SYSTEM',     feature: null },
    { label: 'New Company',       icon: '🏢', href: '/dashboard/companies/new',       section: 'SYSTEM',     feature: null },
  ]

  const navItems = allNavItems.filter(
    item =>
      (item.feature === null || hasFeature(item.feature)) &&
      (!role || (roleAccess[item.label] && roleAccess[item.label].includes(role)))
  )

  const sections = navItems.reduce((acc: Record<string, typeof navItems>, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {})

  return (
    <>
      <div className="dl-shell">
        <SidebarClient />
        <aside className="dl-sidebar" id="dl-sidebar">
          <div className="dl-sidebar-logo">
            <img src="/logo.png" alt="OneAccounts" className="dl-sidebar-logo-img" />
            <div>
              <div className="dl-sidebar-logo-name">OneAccounts</div>
              <div className="dl-sidebar-logo-sub">by Siqbal</div>
            </div>
          </div>
          <nav className="dl-sidebar-nav">
            {Object.entries(sections).map(([section, items], secIdx) => (
              <div key={section}>
                <div className="dl-nav-section">{section}</div>
                {items.map((item) => (
                  <a key={item.href} href={item.href}
                    className={`dl-nav-item${
                      (item.href === '/dashboard' && pathname === '/dashboard') ||
                      (item.href !== '/dashboard' && pathname.startsWith(item.href))
                      ? ' active' : ''
                    }`}>
                    <span className="dl-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
                {secIdx < Object.keys(sections).length - 1 && <div className="dl-nav-divider" />}
              </div>
            ))}
          </nav>
          <div className="dl-sidebar-user">
            <div className="dl-sidebar-avatar">{initial}</div>
            <div style={{ overflow: 'hidden' }}>
              <div className="dl-sidebar-email">{email}</div>
              <form action="/auth/signout" method="post">
                <button type="submit" className="dl-sidebar-signout">Sign Out</button>
              </form>
            </div>
          </div>
        </aside>
        <div className="dl-main">
          <header className="dl-topbar">
            <button className="dl-hamburger" id="dl-hamburger" aria-label="Open menu">
              <span/><span/><span/>
            </button>
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  objectFit: "contain",
                  marginRight: 8,
                }}
              />
            )}
            {/* Back and Dashboard shortcuts removed for mobile clarity */}
            <div className="dl-topbar-greeting">
              <div className="dl-topbar-title">👋 {getGreeting()}, {email.split('@')[0]}!</div>
              <div className="dl-topbar-subtitle">Here's what's happening with your business today</div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <NotificationBell />
            </div>
            <div className="dl-topbar-actions">
              {hasFeature('sales_invoices') && (
                <a href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice">
                  <span>🧾</span> New Invoice
                </a>
              )}
              {hasFeature('purchase_bills') && (
                <a href="/dashboard/bills/new" className="dl-action-btn dl-btn-bill">
                  <span>📦</span> New Bill
                </a>
              )}
              <a href="/dashboard/receipts/new" className="dl-action-btn dl-btn-receipt">
                <span>💰</span> Receipt
              </a>
              <a href="/dashboard/payments/new" className="dl-action-btn dl-btn-payment">
                <span>💳</span> Payment
              </a>
            </div>
          </header>
          <TrialGuard>
            <div className="dl-main-inner">
              {children}
            </div>
          </TrialGuard>
        </div>
      </div>
    </>
  )
}