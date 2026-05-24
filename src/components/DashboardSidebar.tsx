"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import ThemeToggleButton from "@/components/ThemeToggleButton"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"

// ── Types ──
interface NavItem {
  label: string
  icon: string
  href: string
  feature?: string
  adminOnly?: boolean
}

interface NavGroup {
  groupLabel: string
  items: NavItem[]
}

interface NavSection {
  section: string
  feature?: string
  items?: NavItem[]
  groups?: NavGroup[]
}

// ── Data ──
const navSections: NavSection[] = [
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
  const pathname = usePathname()
  const { hasFeature } = usePlan()
  const { role } = useRole()

  // ── Collapse state ──
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("sidebarCollapsed") === "true"
    return false
  })

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(collapsed))
    if (collapsed) {
      document.documentElement.setAttribute("data-sidebar-collapsed", "true")
    } else {
      document.documentElement.removeAttribute("data-sidebar-collapsed")
    }
  }, [collapsed])

  // ── Accordion: which sections are open ──
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())

  // Determine which section contains the current path
  const getSectionForPath = useCallback((path: string) => {
    for (const sec of navSections) {
      if (sec.items) {
        if (sec.items.some(item => path.startsWith(item.href))) return sec.section
      }
      if (sec.groups) {
        for (const grp of sec.groups) {
          if (grp.items.some(item => path.startsWith(item.href))) return sec.section
        }
      }
    }
    return "MAIN" // default open
  }, [])

  // Initialize open section based on current route
  useEffect(() => {
    const activeSection = getSectionForPath(pathname)
    setOpenSections(new Set([activeSection]))
  }, [pathname, getSectionForPath])

  const toggleSection = (section: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        // Optional: close all others when opening a new one? Uncomment the next line to enable that behavior.
        // next.clear()
        next.add(section)
      }
      return next
    })
  }

  // ── New‑feature dot ──
  const [visitedFeatures, setVisitedFeatures] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const raw = localStorage.getItem("visitedFeatures")
    if (raw) {
      try { setVisitedFeatures(JSON.parse(raw)) } catch {}
    }
  }, [])

  const markVisited = (featureCode: string) => {
    const updated = { ...visitedFeatures, [featureCode]: true }
    setVisitedFeatures(updated)
    localStorage.setItem("visitedFeatures", JSON.stringify(updated))
  }

  const isNew = (item: NavItem) => {
    if (!item.feature) return false
    if (!hasFeature(item.feature)) return false
    return !visitedFeatures[item.feature]
  }

  const isVisible = (item: NavItem) => {
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
        transition: "width 0.28s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        overflowX: "hidden",
      }}
    >
      {/* Header with collapse toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "10px 0" : "10px 16px",
          borderBottom: "1px solid var(--sidebar-border)",
          transition: "padding 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" />
          {!collapsed && (
            <div style={{ whiteSpace: "nowrap", opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>
              <div className="dl-sidebar-logo-name">{companyName}</div>
              <div className="dl-sidebar-logo-sub">{companyTagline}</div>
            </div>
          )}
        </div>
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
            flexShrink: 0,
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="dl-sidebar-nav">
        {navSections.map((sec) => {
          if (sec.feature && !hasFeature(sec.feature)) return null

          const isOpen = openSections.has(sec.section)

          return (
            <div key={sec.section}>
              {/* Section header (clickable) – only when not collapsed */}
              {!collapsed && (
                <div
                  className="dl-section-label"
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4, userSelect: "none" }}
                  onClick={() => toggleSection(sec.section)}
                >
                  <span style={{ flex: 1 }}>{sec.section}</span>
                  <ChevronDown
                    size={12}
                    style={{
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 0.2s",
                    }}
                  />
                </div>
              )}

              {/* If collapsed or section open, show items */}
              {(collapsed || isOpen) && (
                <>
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
                            style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "10px 0" : "8px 14px", position: "relative" }}
                            onClick={() => { if (item.feature) markVisited(item.feature) }}
                            title={collapsed ? item.label : undefined}
                          >
                            <span className="dl-nav-icon">{item.icon}</span>
                            {!collapsed && (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, opacity: 1, transition: "opacity 0.2s", whiteSpace: "nowrap" }}>
                                {item.label}
                                {isNew(item) && (
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#F97316", marginLeft: 2 }} />
                                )}
                              </span>
                            )}
                          </a>
                        )
                      })}
                    </div>
                  ))}

                  {sec.items && sec.items.map(item => {
                    if (!isVisible(item)) return null
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className="dl-nav-item"
                        style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "10px 0" : "8px 14px", position: "relative" }}
                        onClick={() => { if (item.feature) markVisited(item.feature) }}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className="dl-nav-icon">{item.icon}</span>
                        {!collapsed && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, opacity: 1, transition: "opacity 0.2s", whiteSpace: "nowrap" }}>
                            {item.label}
                            {isNew(item) && (
                              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#F97316", marginLeft: 2 }} />
                            )}
                          </span>
                        )}
                      </a>
                    )
                  })}
                </>
              )}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div
        className="dl-sidebar-user"
        style={{
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "14px 0" : "14px 16px",
          transition: "padding 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
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