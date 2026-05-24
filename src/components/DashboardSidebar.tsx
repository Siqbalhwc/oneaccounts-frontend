"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
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

// ── Navigation data (unchanged) ──
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
    return "MAIN"
  }, [])

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
    <motion.aside
      className="dl-sidebar"
      id="dl-sidebar"
      style={{
        width: collapsed ? 68 : 240,
        minWidth: collapsed ? 68 : 240,
        transition: "none", // we handle via framer-motion
        overflowX: "hidden",
        margin: 12,
        borderRadius: 24,
        background: "linear-gradient(180deg, rgba(7,18,40,0.95) 0%, rgba(10,24,48,0.95) 100%)",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 12,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ duration: 0.35, ease: [0.25, 0.8, 0.25, 1] }}
    >
      {/* ── Header with logo & collapse toggle ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "14px 0" : "14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        transition: "padding 0.3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" />
          {!collapsed && (
            <div style={{ whiteSpace: "nowrap" }}>
              <div className="dl-sidebar-logo-name" style={{ color: "white", fontSize: 13, fontWeight: 700 }}>{companyName}</div>
              <div className="dl-sidebar-logo-sub" style={{ color: "rgba(255,255,255,0.45)", fontSize: 9 }}>{companyTagline}</div>
            </div>
          )}
        </div>
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
          whileHover={{ scale: 1.1, color: "rgba(255,255,255,0.9)" }}
          whileTap={{ scale: 0.9 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </motion.button>
      </div>

      {/* ── Navigation ── */}
      <nav className="dl-sidebar-nav" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 8px" }}>
        {navSections.map((sec) => {
          if (sec.feature && !hasFeature(sec.feature)) return null

          const isOpen = openSections.has(sec.section)

          return (
            <div key={sec.section} style={{ marginBottom: 4 }}>
              {/* Section header */}
              {!collapsed && (
                <motion.div
                  className="dl-section-label"
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4, userSelect: "none", padding: "10px 14px 4px", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}
                  onClick={() => toggleSection(sec.section)}
                  whileHover={{ color: "rgba(255,255,255,0.7)" }}
                >
                  <span style={{ flex: 1 }}>{sec.section}</span>
                  <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }} style={{ display: "inline-flex" }}>
                    <ChevronDown size={12} />
                  </motion.span>
                </motion.div>
              )}

              {/* Items */}
              {(collapsed || isOpen) && (
                <>
                  {sec.groups && sec.groups.map(group => (
                    <div key={group.groupLabel}>
                      {!collapsed && <div className="dl-nav-group-label" style={{ padding: "6px 14px 2px", color: "rgba(255,255,255,0.35)", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{group.groupLabel}</div>}
                      {group.items.map(item => {
                        if (!isVisible(item)) return null
                        return (
                          <NavLink
                            key={item.href}
                            item={item}
                            collapsed={collapsed}
                            isNew={isNew(item)}
                            markVisited={markVisited}
                            isActive={pathname.startsWith(item.href)}
                          />
                        )
                      })}
                    </div>
                  ))}

                  {sec.items && sec.items.map(item => {
                    if (!isVisible(item)) return null
                    return (
                      <NavLink
                        key={item.href}
                        item={item}
                        collapsed={collapsed}
                        isNew={isNew(item)}
                        markVisited={markVisited}
                        isActive={pathname.startsWith(item.href)}
                      />
                    )
                  })}
                </>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── User footer ── */}
      <div
        className="dl-sidebar-user"
        style={{
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "14px 0" : "14px 16px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          transition: "padding 0.3s",
        }}
      >
        <div className="dl-sidebar-avatar" style={{ background: "rgba(255,255,255,0.1)", color: "white", width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{initial}</div>
        {!collapsed && (
          <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
            <div className="dl-sidebar-email" style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{email}</div>
            <form action="/auth/signout" method="post">
              <button type="submit" className="dl-sidebar-signout" style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, background: "none", border: "none", cursor: "pointer" }}>Sign out</button>
            </form>
          </div>
        )}
        {!collapsed && <ThemeToggleButton />}
      </div>
    </motion.aside>
  )
}

// ── Animated Nav Link component ──
function NavLink({
  item,
  collapsed,
  isNew,
  markVisited,
  isActive,
}: {
  item: NavItem
  collapsed: boolean
  isNew: boolean
  markVisited: (code: string) => void
  isActive: boolean
}) {
  return (
    <motion.a
      href={item.href}
      className="dl-nav-item"
      style={{
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "10px 0" : "10px 14px",
        borderRadius: 10,
        position: "relative",
        color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
        background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: 2,
        overflow: "hidden",
        fontWeight: isActive ? 600 : 400,
      }}
      whileHover={{
        x: 4,
        backgroundColor: isActive ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
        color: "#fff",
        transition: { duration: 0.2 },
      }}
      whileTap={{ scale: 0.97 }}
      onClick={() => { if (item.feature) markVisited(item.feature) }}
      title={collapsed ? item.label : undefined}
    >
      {/* Active indicator bar */}
      {isActive && (
        <motion.div
          layoutId="activeSidebar"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 24,
            borderRadius: "0 3px 3px 0",
            background: "#3B82F6",
            boxShadow: "0 0 8px rgba(59,130,246,0.6)",
          }}
          transition={{ duration: 0.3 }}
        />
      )}

      <span className="dl-nav-icon" style={{ width: 18, textAlign: "center", flexShrink: 0, fontSize: 14 }}>{item.icon}</span>

      {!collapsed && (
        <span style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontSize: 13 }}>
          {item.label}
          {isNew && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#F97316", marginLeft: 4 }} />
          )}
        </span>
      )}
    </motion.a>
  )
}