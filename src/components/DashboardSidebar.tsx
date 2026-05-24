"use client"

import { useState, useEffect } from "react"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import ThemeToggleButton from "@/components/ThemeToggleButton"
import { ChevronLeft, ChevronRight } from "lucide-react"

const navSections = [
  { section: 'MAIN', items: [
    { label: 'Dashboard', icon: '📊', href: '/dashboard' },
  ]},
  { section: 'CRM', items: [
    { label: 'Customers',      icon: '👥', href: '/dashboard/customers' },
    { label: 'Sales Invoices', icon: '🧾', href: '/dashboard/invoices'  },
    { label: 'Receipts',       icon: '💰', href: '/dashboard/receipts'  },
    { label: 'Suppliers',      icon: '🚚', href: '/dashboard/suppliers' },
    { label: 'Purchase Bills', icon: '📦', href: '/dashboard/bills'     },
    { label: 'Purchase Orders',icon: '📋', href: '/dashboard/purchase-orders', feature: 'purchase_orders' },
    { label: 'Payments',       icon: '💳', href: '/dashboard/payments'  },
  ]},
  { section: 'BANKING', items: [
    { label: 'Bank Accounts',  icon: '🏦', href: '/dashboard/banking/bank-accounts'  },
    { label: 'Bank Transfers', icon: '🔄', href: '/dashboard/banking/bank-transfers' },
  ]},
  { section: 'INVENTORY', feature: 'inventory', items: [
    { label: 'Products',       icon: '📦', href: '/dashboard/products'              },
    { label: 'Inventory Adj.', icon: '⚖️', href: '/dashboard/inventory/adjustments' },
  ]},
  { section: 'ACCOUNTING', groups: [
    { groupLabel: 'General', items: [
      { label: 'Chart of Accounts', icon: '📋', href: '/dashboard/accounts' },
      { label: 'Journal Entries',   icon: '📓', href: '/dashboard/journal'  },
    ]},
    { groupLabel: 'Reports', items: [
      { label: 'All Reports', icon: '📈', href: '/dashboard/reports' },
    ]},
    { groupLabel: 'Automation', items: [
      { label: 'Invoice Automation', icon: '⚙️', href: '/dashboard/settings/invoice-automation', feature: 'invoice_automation' },
      { label: 'Investors',          icon: '💼', href: '/dashboard/investors', feature: 'investors' },
    ]},
  ]},
  { section: 'SYSTEM', items: [
    { label: 'Admin Panel',     icon: '👑', href: '/dashboard/admin/users',      adminOnly: true },
    { label: 'Feature Manager', icon: '⚙️', href: '/dashboard/admin/features',   adminOnly: true },
    { label: 'Audit Logs',      icon: '📋', href: '/dashboard/admin/audit-logs', adminOnly: true },
    { label: 'Settings',        icon: '⚙️', href: '/dashboard/settings' },
    { label: 'New Company',     icon: '🏢', href: '/dashboard/companies/new' },
    { label: 'Upgrade Plan',    icon: '⭐', href: '/dashboard/upgrade' },
    { label: 'Super Admin',     icon: '🛡️', href: '/dashboard/super-admin',      adminOnly: true },
  ]},
]

export default function DashboardSidebar({
  email,
  initial,
  logoUrl,
  companyName,
  companyTagline,
}: {
  email: string
  initial: string
  logoUrl: string
  companyName: string
  companyTagline: string
}) {
  const { hasFeature } = usePlan()
  const { role } = useRole()

  // ── Collapse state (saved in localStorage) ──
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebarCollapsed") === "true"
    }
    return false
  })

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(collapsed))
  }, [collapsed])

  // ── New‑feature dot (visited features stored in localStorage) ──
  const [visitedFeatures, setVisitedFeatures] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const raw = localStorage.getItem("visitedFeatures")
    if (raw) {
      try {
        setVisitedFeatures(JSON.parse(raw))
      } catch {}
    }
  }, [])

  const markVisited = (featureCode: string) => {
    const updated = { ...visitedFeatures, [featureCode]: true }
    setVisitedFeatures(updated)
    localStorage.setItem("visitedFeatures", JSON.stringify(updated))
  }

  // Check if an item is new (has feature code, feature is enabled, but not visited)
  const isNew = (item: any) => {
    if (!item.feature) return false
    if (!hasFeature(item.feature)) return false
    return !visitedFeatures[item.feature]
  }

  // ── Visibility helper ──
  const isVisible = (item: any) => {
    if (item.adminOnly && role !== "admin") return false
    if (item.feature && !hasFeature(item.feature)) return false
    return true
  }

  return (
    <aside
      className="dl-sidebar"
      id="dl-sidebar"
      style={{
        width: collapsed ? 62 : 220,
        minWidth: collapsed ? 62 : 220,
        transition: "width 0.25s ease, min-width 0.25s ease",
        overflowX: "hidden",
      }}
    >
      {/* Collapse toggle (top left) */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px" }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Logo */}
      <div className="dl-sidebar-logo" style={{ justifyContent: collapsed ? "center" : "flex-start" }}>
        <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" />
        {!collapsed && (
          <div>
            <div className="dl-sidebar-logo-name">{companyName}</div>
            <div className="dl-sidebar-logo-sub">{companyTagline}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="dl-sidebar-nav">
        {navSections.map((sec) => {
          if (sec.feature && !hasFeature(sec.feature)) return null

          return (
            <div key={sec.section}>
              {!collapsed && <div className="dl-section-label">{sec.section}</div>}

              {/* Grouped items */}
              {sec.groups && sec.groups.map(group => (
                <div key={group.groupLabel}>
                  {!collapsed && <div className="dl-nav-group-label">{group.groupLabel}</div>}
                  {group.items.map(item => {
                    if (!isVisible(item)) return null
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className="dl-nav-item"
                        style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "10px 0" : "8px 14px" }}
                        onClick={() => { if (item.feature) markVisited(item.feature) }}
                      >
                        <span className="dl-nav-icon">{item.icon}</span>
                        {!collapsed && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {item.label}
                            {isNew(item) && (
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  backgroundColor: "#F97316",
                                  marginLeft: 2,
                                }}
                              />
                            )}
                          </span>
                        )}
                      </a>
                    )
                  })}
                </div>
              ))}

              {/* Flat items */}
              {sec.items && sec.items.map(item => {
                if (!isVisible(item)) return null
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className="dl-nav-item"
                    style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "10px 0" : "8px 14px" }}
                    onClick={() => { if (item.feature) markVisited(item.feature) }}
                  >
                    <span className="dl-nav-icon">{item.icon}</span>
                    {!collapsed && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {item.label}
                        {isNew(item) && (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: "#F97316",
                              marginLeft: 2,
                            }}
                          />
                        )}
                      </span>
                    )}
                  </a>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="dl-sidebar-user" style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "14px 0" : "14px 16px" }}>
        <div className="dl-sidebar-avatar">{initial}</div>
        {!collapsed && (
          <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
            <div className="dl-sidebar-email">{email}</div>
            <form action="/auth/signout" method="post">
              <button type="submit" className="dl-sidebar-signout">Sign out</button>
            </form>
          </div>
        )}
        {!collapsed && <ThemeToggleButton />}
      </div>
    </aside>
  )
}