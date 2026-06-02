"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { createBrowserClient } from "@supabase/ssr"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import { useTheme } from "@/contexts/ThemeContext"
import ThemeToggleButton from "@/components/ThemeToggleButton"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"

// ── Types ──
interface NavItem { label: string; icon: string; href: string; feature?: string; adminOnly?: boolean }
interface NavGroup { groupLabel: string; items: NavItem[] }
interface NavSection { section: string; feature?: string; items?: NavItem[]; groups?: NavGroup[] }

// ── Navigation data (without Projects – we’ll add it conditionally) ──
const baseNavSections: NavSection[] = [
  { section: 'MAIN', items: [{ label: 'Dashboard', icon: '📊', href: '/dashboard' }] },
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
    { groupLabel: 'Fixed Assets', items: [
      { label: 'Asset Register', icon: '📦', href: '/dashboard/assets', feature: 'asset_management' },
    ]},
    { groupLabel: 'Automation', items: [
      { label: 'Invoice Automation', icon: '⚙️', href: '/dashboard/settings/invoice-automation', feature: 'invoice_automation' },
      { label: 'Investors',          icon: '💼', href: '/dashboard/investors', feature: 'investors' },
    ]},
  ]},
  { section: 'SYSTEM', items: [
    { label: 'Settings',        icon: '⚙️', href: '/dashboard/settings' },
    { label: 'Upgrade Plan',    icon: '⭐', href: '/dashboard/upgrade' },
  ]},
]

// ── Helper: exact match for /dashboard, startsWith for all other routes ──
const matchesItem = (item: NavItem, path: string): boolean =>
  item.href === "/dashboard" ? path === item.href : path.startsWith(item.href)

function getSectionForPath(path: string): string {
  for (const sec of baseNavSections) {
    if (sec.items?.some(item => matchesItem(item, path))) return sec.section
    if (sec.groups) {
      for (const grp of sec.groups) {
        if (grp.items.some(item => matchesItem(item, path))) return sec.section
      }
    }
  }
  return "MAIN"
}

export default function DashboardSidebar({
  email, initial, logoUrl, companyName, companyTagline,
}: { email: string; initial: string; logoUrl: string; companyName: string; companyTagline: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { hasFeature } = usePlan()
  const { role } = useRole()
  const { theme } = useTheme()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("sidebarCollapsed") === "true"
    return false
  })

  // Fetch business type directly from the database
  const [businessType, setBusinessType] = useState<string>("")
  useEffect(() => {
    const getCompany = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      const { data } = await supabase
        .from("companies")
        .select("business_type")
        .eq("id", cid)
        .single()
      if (data) setBusinessType(data.business_type || "")
    }
    getCompany()
  }, [])

  // Build final nav sections – add Projects only for NGO
  const navSections = [...baseNavSections]
  const systemSection = navSections.find(s => s.section === 'SYSTEM')!
  if (businessType === 'ngo') {
    systemSection.items!.push({ label: 'Projects', icon: '📁', href: '/dashboard/projects' })
  }

  const GAP = 6

  const [openSection, setOpenSection] = useState<string>(() => getSectionForPath(pathname))

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(collapsed))
    if (collapsed) {
      document.documentElement.setAttribute("data-sidebar-collapsed", "true")
    } else {
      document.documentElement.removeAttribute("data-sidebar-collapsed")
    }
  }, [collapsed])

  useEffect(() => {
    setOpenSection(getSectionForPath(pathname))
  }, [pathname])

  const handleSectionClick = (section: string) => {
    setOpenSection(section)
  }

  const [visitedFeatures, setVisitedFeatures] = useState<Record<string, boolean>>({})
  useEffect(() => { const raw = localStorage.getItem("visitedFeatures"); if (raw) try { setVisitedFeatures(JSON.parse(raw)) } catch {} }, [])

  const markVisited = (code: string) => { const u = { ...visitedFeatures, [code]: true }; setVisitedFeatures(u); localStorage.setItem("visitedFeatures", JSON.stringify(u)) }

  const isNew = (item: NavItem): boolean => {
    if (!item.feature) return false
    if (!hasFeature(item.feature)) return false
    return !visitedFeatures[item.feature]
  }

  // Visibility: hide admin-only items unless user has role 'admin' AND is platform admin (we'll use a simple check: role==='admin' and feature flags)
  const isVisible = (item: NavItem) => {
    if (item.adminOnly && role !== 'admin') return false
    if (item.feature && !hasFeature(item.feature)) return false
    // Hide certain items for non‑super admins
    if (['Admin Panel', 'Feature Manager', 'Audit Logs', 'Super Admin', 'New Company'].includes(item.label) && role !== 'super_admin') {
      return false
    }
    return true
  }

  const bg = theme === "oneaccounts"
    ? "linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%)"
    : "var(--main-bg)"

  const isDarkText = theme === "light" || (theme === "system" && typeof window !== "undefined" && !window.matchMedia("(prefers-color-scheme: dark)").matches)
  const textColor      = theme === "oneaccounts" ? "rgba(255,255,255,0.9)" : (isDarkText ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.85)")
  const mutedTextColor  = theme === "oneaccounts" ? "rgba(255,255,255,0.6)" : (isDarkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)")
  const borderColor     = theme === "oneaccounts" ? "rgba(255,255,255,0.15)" : (isDarkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)")
  const shadow = theme === "oneaccounts"
    ? "0 25px 50px -12px rgba(0,0,0,0.6)"
    : (isDarkText ? "0 25px 50px -12px rgba(0,0,0,0.15)" : "0 25px 50px -12px rgba(0,0,0,0.5)")

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <motion.aside
      className="dl-sidebar"
      id="dl-sidebar"
      style={{
        width: collapsed ? 68 : 240,
        minWidth: collapsed ? 68 : 240,
        overflowX: "hidden",
        margin: GAP,
        marginRight: 0,
        borderRadius: 24,
        background: bg,
        boxShadow: shadow,
        border: `1px solid ${borderColor}`,
        position: "fixed",
        top: 0, left: 0, bottom: GAP,
        zIndex: 40,
        display: "flex", flexDirection: "column",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      }}
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ duration: 0.35, ease: [0.25, 0.8, 0.25, 1] }}
    >
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "14px 0" : "14px 16px",
        borderBottom: `1px solid ${borderColor}`, transition: "padding 0.3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", flex: 1, minWidth: 0 }}>
          <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" width={34} height={34} />
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: textColor, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{companyName}</div>
              <div style={{ color: mutedTextColor, fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{companyTagline}</div>
            </div>
          )}
        </div>
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          style={{ background: "none", border: "none", color: mutedTextColor, cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0 }}
          whileHover={{ scale: 1.1, color: textColor }} whileTap={{ scale: 0.9 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </motion.button>
      </div>

      {/* ── Navigation ── */}
      <nav className="dl-sidebar-nav" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 8px" }}>
        {navSections.map(sec => {
          if (sec.feature && !hasFeature(sec.feature)) return null
          const isOpen = openSection === sec.section
          return (
            <div key={sec.section} style={{ marginBottom: 4 }}>
              {!collapsed && (
                <motion.div
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4, userSelect: "none", padding: "10px 14px 4px", color: mutedTextColor, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}
                  onClick={() => handleSectionClick(sec.section)}
                  whileHover={{ color: textColor }}
                >
                  <span style={{ flex: 1 }}>{sec.section}</span>
                  <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}><ChevronDown size={12} /></motion.span>
                </motion.div>
              )}
              <AnimatePresence initial={false}>
                {(collapsed || isOpen) && (
                  <motion.div key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} style={{ overflow: "hidden" }}>
                    {sec.groups?.map(group => (
                      <div key={group.groupLabel}>
                        {!collapsed && <div style={{ padding: "6px 14px 2px", color: mutedTextColor, fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{group.groupLabel}</div>}
                        {group.items.map(item => isVisible(item) && <NavLink key={item.href} {...{ item, collapsed, isNew: isNew(item), markVisited, isActive: matchesItem(item, pathname), textColor, mutedTextColor, router }} />)}
                      </div>
                    ))}
                    {sec.items?.map(item => isVisible(item) && <NavLink key={item.href} {...{ item, collapsed, isNew: isNew(item), markVisited, isActive: matchesItem(item, pathname), textColor, mutedTextColor, router }} />)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      {/* ── User footer ── */}
      <div style={{
        borderTop: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 10,
        padding: collapsed ? "12px 0" : "14px 16px",
        justifyContent: collapsed ? "center" : "flex-start", flexShrink: 0, transition: "padding 0.3s",
      }}>
        <div style={{ background: "rgba(255,255,255,0.1)", color: textColor, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{initial}</div>
        {!collapsed && (
          <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
            <div style={{ color: textColor, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
            <button
              onClick={handleSignOut}
              style={{ color: mutedTextColor, fontSize: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Sign out
            </button>
          </div>
        )}
        {!collapsed && <ThemeToggleButton />}
      </div>
    </motion.aside>
  )
}

// ── NavLink (unchanged) ──
function NavLink({ item, collapsed, isNew, markVisited, isActive, textColor, mutedTextColor, router }: {
  item: NavItem; collapsed: boolean; isNew: boolean; markVisited: (c: string) => void; isActive: boolean; textColor: string; mutedTextColor: string; router: ReturnType<typeof useRouter>
}) {
  return (
    <motion.a
      href={item.href}
      onClick={(e) => {
        e.preventDefault()
        if (item.feature) markVisited(item.feature)
        router.push(item.href)
      }}
      style={{
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "0" : "0 14px",
        height: 44, borderRadius: 10,
        position: "relative",
        color: isActive ? textColor : mutedTextColor,
        background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
        textDecoration: "none", display: "flex", alignItems: "center", gap: 9, marginBottom: 2, overflow: "hidden",
        fontWeight: isActive ? 600 : 400,
      }}
      whileHover={{ x: 4, backgroundColor: isActive ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)", color: textColor, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.97 }}
      title={collapsed ? item.label : undefined}
    >
      {isActive && (
        <motion.div layoutId="activeSidebar" style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 24, borderRadius: "0 3px 3px 0", background: "#3B82F6", boxShadow: "0 0 8px rgba(59,130,246,0.6)" }} transition={{ duration: 0.3 }} />
      )}
      <span className="dl-nav-icon" style={{ width: 18, textAlign: "center", flexShrink: 0, fontSize: 14 }}>{item.icon}</span>
      {!collapsed && (
        <span style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontSize: 13 }}>
          {item.label}
          {isNew && <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#F97316", marginLeft: 4 }} />}
        </span>
      )}
    </motion.a>
  )
}