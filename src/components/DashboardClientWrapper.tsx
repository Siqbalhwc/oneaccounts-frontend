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
    CRM: true,
    BANKING: true,
    INVENTORY: true,
    ACCOUNTING: true,
    SYSTEM: true,
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
    { label: 'All Reports',        icon: '📈', href: '/dashboard/reports',            feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Invoice Automation', icon: '⚙️', href: '/dashboard/settings/invoice-automation', feature: "invoice_automation", roles: ["admin","accountant"] },
    { label: 'Investors',          icon: '💼', href: '/dashboard/investors',                        feature: "investors",           roles: ["admin","accountant"] },
    { label: 'Admin Panel',        icon: '👑', href: '/dashboard/admin/users',        feature: null, roles: ["admin"] },
    { label: 'Feature Manager',    icon: '⚙️', href: '/dashboard/admin/features',     feature: null, roles: ["admin"] },
    { label: 'Upgrade Plan',       icon: '⭐', href: '/dashboard/upgrade',            feature: null, roles: ["admin","accountant","viewer"] },
    { label: 'Audit Logs',        icon: '📋', href: '/dashboard/admin/audit-logs',   feature: null, roles: ["admin"] },
    { label: 'Settings',          icon: '⚙️', href: '/dashboard/settings',            feature: null, roles: ["admin"] },
    { label: 'New Company',       icon: '🏢', href: '/dashboard/companies/new',       feature: null, roles: ["admin","accountant"] },
  ]

  // Super Admin for owner
  if (email === 'siqbalhwc@gmail.com') {
    allNavItems.push({
      label: 'Super Admin',
      icon: '🛡️',
      href: '/dashboard/super-admin',
      feature: null,
      roles: ["admin"],
    })
  }

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
      <style>{`
        .dl-shell { display: flex; min-height: 100vh; background: #f4f8fc; }
        .dl-sidebar {
          width: 220px; min-width: 220px;
          background: linear-gradient(150deg, #0c2e4a 0%, #1e3a8a 100%);
          display: flex; flex-direction: column;
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
          transition: transform 0.25s ease; overflow: hidden;
          box-shadow: 2px 0 12px rgba(0,0,0,0.08);
        }
        .dl-sidebar::before {
          content: ''; position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 24px 24px; pointer-events: none; z-index: 0;
        }
        .dl-sidebar-logo { 
          display: flex; align-items: center; gap: 10px; 
          padding: 16px 18px; border-bottom: 1px solid rgba(255,255,255,0.1); 
          min-height: 58px; position: relative; z-index: 1; 
        }
        .dl-sidebar-logo-img { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; flex-shrink: 0; }
        .dl-sidebar-logo-name { color: white; font-size: 14px; font-weight: 700; line-height: 1.1; }
        .dl-sidebar-logo-sub { color: rgba(255,255,255,0.5); font-size: 9px; }
        .dl-sidebar-nav { flex: 1; padding: 8px 8px; overflow-y: auto; position: relative; z-index: 1; }
        .dl-section-btn {
          width: 100%; display: flex; align-items: center; gap: 6px;
          padding: 8px 10px; background: transparent; border: none;
          color: rgba(255,255,255,0.6); font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          cursor: pointer; font-family: inherit;
          border-radius: 6px;
          transition: background 0.15s, color 0.15s;
        }
        .dl-section-btn:hover {
          background: rgba(255,255,255,0.08);
          color: white;
        }
        .dl-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px; border-radius: 8px;
          color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 500;
          text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
        }
        .dl-nav-item:hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }
        .dl-nav-item.active {
          background: rgba(255,255,255,0.15);
          color: white; font-weight: 600;
        }
        .dl-nav-icon { width: 18px; text-align: center; flex-shrink: 0; }
        .dl-nav-group-label {
          font-size: 8px; font-weight: 700; text-transform: uppercase;
          color: rgba(255,255,255,0.25); padding: 4px 10px 2px;
          letter-spacing: 0.05em;
        }
        .dl-nav-divider {
          height: 1px; background: rgba(255,255,255,0.08);
          margin: 8px 14px;
        }
        .dl-sidebar-user { 
          padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.1); 
          display: flex; align-items: center; gap: 10px; 
          position: relative; z-index: 1; 
        }
        .dl-sidebar-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(255,255,255,0.15); color: white;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; flex-shrink: 0;
        }
        .dl-sidebar-email { color: rgba(255,255,255,0.8); font-size: 11px; }
        .dl-sidebar-signout {
          color: rgba(255,255,255,0.5); font-size: 10px; cursor: pointer;
          background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px;
        }
        .dl-sidebar-signout:hover { color: #f87171; }
        .dl-main {
          flex: 1; margin-left: 220px;
          display: flex; flex-direction: column;
          min-height: 100vh; min-width: 0;
          overflow-x: hidden;
        }
        .dl-topbar {
          background: white; border-bottom: 1px solid #d6e0eb;
          padding: 0 20px; display: flex; align-items: center;
          min-height: 56px; gap: 16px; position: sticky; top: 0; z-index: 30;
        }
        .dl-topbar-greeting { flex: 1; min-width: 0; }
        .dl-topbar-title { font-size: clamp(12px, 1.1vw, 14px); font-weight: 700; color: #0a2940; line-height: 1.2; }
        .dl-topbar-subtitle { font-size: clamp(10px, 0.8vw, 11px); color: #64748b; line-height: 1.2; }
        .dl-topbar-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .dl-action-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px clamp(10px, 1.2vw, 14px); border-radius: 8px;
          font-size: clamp(10px, 0.78vw, 11.5px); font-weight: 600;
          text-decoration: none; cursor: pointer;
          border: 1.5px solid; font-family: inherit;
          transition: all 0.15s; white-space: nowrap; height: 34px;
        }
        .dl-btn-invoice { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
        .dl-btn-bill    { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
        .dl-btn-receipt { background: #d1fae5; border-color: #a7f3d0; color: #065f46; }
        .dl-btn-payment { background: #fee2e2; border-color: #fecaca; color: #991b1b; }
        .dl-btn-invoice:hover { background: #e0e7ff; }
        .dl-btn-bill:hover    { background: #fef9c3; }
        .dl-btn-receipt:hover { background: #a7f3d0; }
        .dl-btn-payment:hover { background: #fecaca; }
        .dl-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 6px; flex-shrink: 0; }
        .dl-hamburger span { display: block; width: 20px; height: 2px; background: #475569; margin: 4px 0; border-radius: 2px; }
        .dl-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 35; }
        .dl-overlay.open { display: block; }
        @media (max-width: 768px) {
          .dl-sidebar { width: 60px; min-width: 60px; }
          .dl-sidebar-logo-name, .dl-sidebar-logo-sub, .dl-section-btn span,
          .dl-nav-group-label, .dl-nav-item span:not(.dl-nav-icon),
          .dl-sidebar-email, .dl-sidebar-signout { display: none; }
          .dl-sidebar-logo { justify-content: center; padding: 14px 0; }
          .dl-nav-item { justify-content: center; padding: 10px; }
          .dl-sidebar-user { justify-content: center; }
          .dl-main { margin-left: 60px; }
        }
        @media (max-width: 640px) {
          .dl-sidebar { transform: translateX(-220px); width: 220px; min-width: 220px; }
          .dl-sidebar.mobile-open { transform: translateX(0); }
          .dl-sidebar.mobile-open .dl-sidebar-logo-name,
          .dl-sidebar.mobile-open .dl-sidebar-logo-sub,
          .dl-sidebar.mobile-open .dl-section-btn span,
          .dl-sidebar.mobile-open .dl-nav-group-label,
          .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
          .dl-sidebar.mobile-open .dl-sidebar-email,
          .dl-sidebar.mobile-open .dl-sidebar-signout { display: block; }
          .dl-sidebar.mobile-open .dl-sidebar-logo { justify-content: flex-start; padding: 16px 18px; }
          .dl-sidebar.mobile-open .dl-nav-item { justify-content: flex-start; padding: 8px 12px; }
          .dl-main { margin-left: 0; }
          .dl-hamburger { display: block; }
          .dl-topbar { flex-wrap: wrap; min-height: auto; padding: 10px 14px; gap: 10px; }
          .dl-topbar-actions { flex: 1 1 100%; gap: 6px; }
          .dl-action-btn { flex: 1; justify-content: center; padding: 7px 8px; font-size: 10px; }
        }
        @media (max-width: 380px) {
          .dl-topbar-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
          .dl-action-btn { padding: 6px 4px; font-size: 9px; }
        }
      `}</style>

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

              // Force BANKING and SYSTEM to always appear
              const alwaysShow = sec.section === "BANKING" || sec.section === "SYSTEM"
              const hasContent = alwaysShow || visibleGroups.length > 0 || visibleFlatItems.length > 0
              if (!hasContent) return null

              const expanded = expandedSections[sec.section] ?? false

              return (
                <div key={sec.section} style={{ marginBottom: 2 }}>
                  <button className="dl-section-btn" onClick={() => toggleSection(sec.section)}>
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>{sec.section}</span>
                  </button>

                  {expanded && (
                    <div style={{ marginLeft: 6, borderLeft: "1px solid rgba(255,255,255,0.08)", paddingLeft: 6 }}>
                      {visibleGroups.map(group => (
                        <div key={group.groupLabel} style={{ marginBottom: 2 }}>
                          <div className="dl-nav-group-label">{group.groupLabel}</div>
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