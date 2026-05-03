"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { PlanProvider, usePlan } from "@/contexts/PlanContext"
import { RoleProvider, useRole } from "@/contexts/RoleContext"
import SidebarClient from "@/app/dashboard/sidebar-client"
import TrialGuard from "@/components/TrialGuard"
import NotificationBell from "@/components/NotificationBell"
import { ChevronDown, ChevronRight } from "lucide-react"

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

interface NavLeaf {
  label: string
  icon: string
  href: string
  feature: string | null
  roles: string[]
}

interface NavGroup {
  groupLabel: string
  items: NavLeaf[]
}

interface NavSection {
  section: string
  groups?: NavGroup[]
  items?: NavLeaf[]
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    MAIN: true,
    CRM: false,
    BANKING: false,
    INVENTORY: false,
    ACCOUNTING: false,
    SYSTEM: false,
  })

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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const isVisible = (leaf: NavLeaf) => {
    if (leaf.feature !== null && !hasFeature(leaf.feature)) return false
    if (role && leaf.roles.length > 0 && !leaf.roles.includes(role)) return false
    return true
  }

  const allNavItems: NavLeaf[] = [
    { label: 'Dashboard',          icon: '📊', href: '/dashboard',                    feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Customers',          icon: '👥', href: '/dashboard/customers',          feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Sales Invoices',     icon: '🧾', href: '/dashboard/invoices',           feature: null, roles: ["admin","accountant"] },
    { label: 'Receipts',           icon: '💰', href: '/dashboard/receipts',           feature: null, roles: ["admin","accountant"] },
    { label: 'Suppliers',          icon: '🚚', href: '/dashboard/suppliers',          feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Purchase Bills',     icon: '📦', href: '/dashboard/bills',              feature: null, roles: ["admin","accountant"] },
    { label: 'Payments',           icon: '💳', href: '/dashboard/payments',           feature: null, roles: ["admin","accountant"] },
    { label: 'Bank Accounts',      icon: '🏦', href: '/dashboard/banking/bank-accounts',  feature: null, roles: ["admin","accountant"] },
    { label: 'Bank Transfers',     icon: '🔄', href: '/dashboard/banking/bank-transfers', feature: null, roles: ["admin","accountant"] },
    { label: 'Products',           icon: '📦', href: '/dashboard/products',                 feature: null, roles: ["admin","accountant"] },
    { label: 'Inventory Adj.',     icon: '⚖️', href: '/dashboard/inventory/adjustments',    feature: "inventory", roles: ["admin","accountant"] },
    { label: 'Chart of Accounts',  icon: '📋', href: '/dashboard/accounts',           feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Journal Entries',    icon: '📓', href: '/dashboard/journal',            feature: null, roles: ["admin","accountant"] },
    { label: 'All Reports',        icon: '📁', href: '/dashboard/reports',            feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Invoice Automation', icon: '⚙️', href: '/dashboard/settings/invoice-automation', feature: "invoice_automation", roles: ["admin","accountant"] },
    { label: 'Investors',          icon: '💼', href: '/dashboard/investors',                        feature: "investors",           roles: ["admin","accountant"] },
    { label: 'Admin Panel',        icon: '👑', href: '/dashboard/admin/users',        feature: null, roles: ["admin"] },
    { label: 'Feature Manager',    icon: '⚙️', href: '/dashboard/admin/features',     feature: null, roles: ["admin"] },
    { label: 'Upgrade Plan',       icon: '⭐', href: '/dashboard/upgrade',            feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Audit Logs',        icon: '📋', href: '/dashboard/admin/audit-logs',   feature: null, roles: ["admin"] },
    { label: 'Settings',          icon: '⚙️', href: '/dashboard/settings',            feature: null, roles: ["admin"] },
    { label: 'New Company',       icon: '🏢', href: '/dashboard/companies/new',       feature: null, roles: ["admin","accountant"] },
  ]

  // ── Only add Super Admin link for the owner ──────────────────
  if (email === 'siqbalhwc@gmail.com') {
    allNavItems.push({
      label: 'Super Admin',
      icon: '🛡️',
      href: '/dashboard/super-admin',
      feature: null,
      roles: ["admin"],
    })
  }

  // ── Build navigation sections ─────────────────────────────────
  const navSections: NavSection[] = [
    {
      section: "MAIN",
      items: allNavItems.filter(i => i.href === '/dashboard'),
    },
    {
      section: "CRM",
      items: allNavItems.filter(i =>
        ["/dashboard/customers","/dashboard/invoices","/dashboard/receipts","/dashboard/suppliers","/dashboard/bills","/dashboard/payments"].includes(i.href)
      ),
    },
    {
      section: "BANKING",
      items: allNavItems.filter(i =>
        ["/dashboard/banking/bank-accounts","/dashboard/banking/bank-transfers"].includes(i.href)
      ),
    },
    {
      section: "INVENTORY",
      items: allNavItems.filter(i =>
        ["/dashboard/products","/dashboard/inventory/adjustments"].includes(i.href)
      ),
    },
    {
      section: "ACCOUNTING",
      groups: [
        {
          groupLabel: "General",
          items: allNavItems.filter(i =>
            ["/dashboard/accounts","/dashboard/journal"].includes(i.href)
          ),
        },
        {
          groupLabel: "Reports",
          items: allNavItems.filter(i =>
            ["/dashboard/reports"].includes(i.href)
          ),
        },
        {
          groupLabel: "Automation",
          items: allNavItems.filter(i =>
            ["/dashboard/settings/invoice-automation","/dashboard/investors"].includes(i.href)
          ),
        },
      ],
    },
    {
      section: "SYSTEM",
      items: allNavItems.filter(i =>
        !["/dashboard"].includes(i.href) &&
        !["/dashboard/customers","/dashboard/invoices","/dashboard/receipts","/dashboard/suppliers","/dashboard/bills","/dashboard/payments"].includes(i.href) &&
        !["/dashboard/banking/bank-accounts","/dashboard/banking/bank-transfers"].includes(i.href) &&
        !["/dashboard/products","/dashboard/inventory/adjustments"].includes(i.href) &&
        !["/dashboard/accounts","/dashboard/journal","/dashboard/reports","/dashboard/settings/invoice-automation","/dashboard/investors"].includes(i.href)
      ),
    },
  ]

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
          <nav className="dl-sidebar-nav" style={{ padding: "12px 8px" }}>
            {navSections.map((sec) => {
              let visibleGroups: { groupLabel: string; items: NavLeaf[] }[] = []
              let visibleFlatItems: NavLeaf[] = []
              if (sec.groups) {
                visibleGroups = sec.groups
                  .map(g => ({
                    groupLabel: g.groupLabel,
                    items: g.items.filter(isVisible),
                  }))
                  .filter(g => g.items.length > 0)
              } else if (sec.items) {
                visibleFlatItems = sec.items.filter(isVisible)
              }

              const hasContent = visibleGroups.length > 0 || visibleFlatItems.length > 0
              if (!hasContent) return null

              const expanded = expandedSections[sec.section] ?? false

              return (
                <div key={sec.section} style={{ marginBottom: 2 }}>
                  <button
                    onClick={() => toggleSection(sec.section)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 10px", background: "transparent", border: "none",
                      color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      cursor: "pointer", fontFamily: "inherit",
                      borderRadius: 6,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {sec.section}
                  </button>

                  {expanded && (
                    <div style={{ marginLeft: 6, borderLeft: "1px solid rgba(255,255,255,0.06)", paddingLeft: 6 }}>
                      {visibleGroups.map(group => (
                        <div key={group.groupLabel} style={{ marginBottom: 2 }}>
                          <div style={{
                            fontSize: 8, fontWeight: 700, textTransform: "uppercase",
                            color: "rgba(255,255,255,0.22)", padding: "4px 10px 2px",
                            letterSpacing: "0.05em",
                          }}>
                            {group.groupLabel}
                          </div>
                          {group.items.map(item => (
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
                        </div>
                      ))}
                      {visibleFlatItems.map(item => (
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
                    </div>
                  )}
                </div>
              )
            })}
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
                  width: 24, height: 24, borderRadius: 6,
                  objectFit: "contain", marginRight: 8,
                }}
              />
            )}
            <div className="dl-topbar-greeting">
              <div className="dl-topbar-title">👋 {getGreeting()}, {email.split('@')[0]}!</div>
              <div className="dl-topbar-subtitle">Here's what's happening with your business today</div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <NotificationBell />
            </div>
            <div className="dl-topbar-actions">
              {hasFeature('sales_invoices') && (
                <a href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice"><span>🧾</span> New Invoice</a>
              )}
              {hasFeature('purchase_bills') && (
                <a href="/dashboard/bills/new"    className="dl-action-btn dl-btn-bill"   ><span>📦</span> New Bill</a>
              )}
              <a href="/dashboard/receipts/new" className="dl-action-btn dl-btn-receipt"><span>💰</span> Receipt</a>
              <a href="/dashboard/payments/new" className="dl-action-btn dl-btn-payment"><span>💳</span> Payment</a>
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