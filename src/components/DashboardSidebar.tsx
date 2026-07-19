"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { createBrowserClient } from "@supabase/ssr"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import { useTheme } from "@/contexts/ThemeContext"
import ThemeToggleButton from "@/components/ThemeToggleButton"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { getLabel, type BusinessType } from "@/lib/labels"

// ── Types ──
interface NavItem { label: string; icon: string; href: string; feature?: string; adminOnly?: boolean }
interface NavGroup { groupLabel: string; items: NavItem[] }
interface NavSection { section: string; displayLabel?: string; feature?: string; items?: NavItem[]; groups?: NavGroup[] }

// ── Base navigation ──
const baseNavSections: NavSection[] = [
  { section: 'MAIN', items: [{ label: 'Dashboard', icon: '📊', href: '/dashboard' }] },
  { section: 'CRM', items: [
    { label: 'Customers',      icon: '👥', href: '/dashboard/customers' },
    { label: 'Sales Invoices', icon: '🧾', href: '/dashboard/invoices'  },
    { label: 'Cash Sales',     icon: '💵', href: '/dashboard/cash-sales' },  // ← new
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
  { section: 'PAYROLL', feature: 'payroll', items: [
    { label: 'Employees',         icon: '👥', href: '/dashboard/payroll/employees' },
    { label: 'Attendance',          icon: '📋', href: '/dashboard/payroll/attendance' },
    { label: 'Attendance Verification', icon: '✅', href: '/dashboard/payroll/attendance/verify' },
    { label: 'Leave Types',          icon: '🏖️', href: '/dashboard/payroll/leave-types' },    
    { label: 'Leave Applications',  icon: '📝', href: '/dashboard/payroll/leave-applications' },
    { label: 'Employee Loans',      icon: '💵', href: '/dashboard/payroll/loans' },
    { label: 'Salary Advances',     icon: '💸', href: '/dashboard/payroll/advances' },
    { label: 'Salary Components',  icon: '💰', href: '/dashboard/payroll/salary-components' },
    { label: 'Salary Structures', icon: '📊', href: '/dashboard/payroll/salary-structures' },
    { label: 'Payroll Runs',      icon: '📅', href: '/dashboard/payroll/runs' },
    { label: 'Approval Workflow',     icon: '⚙️', href: '/dashboard/payroll/settings/approval-workflow' },
    { label: 'Reports',               icon: '📊', href: '/dashboard/payroll/reports' },
  ]},
  { section: 'MATERIALS', feature: 'material_management', items: [
    { label: 'Overview', icon: '🏭', href: '/dashboard/materials' },
    { label: 'Products', icon: '📦', href: '/dashboard/materials/products' },
    { label: 'Inward Gate Pass', icon: '🚛', href: '/dashboard/materials/gate-pass' },
    { label: 'Material Store', icon: '🏬', href: '/dashboard/materials/material-store' },
    { label: 'WIP', icon: '⚙️', href: '/dashboard/materials/wip' },
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
    { label: 'Fiscal Periods',  icon: '📅', href: '/dashboard/settings/periods' },
    { label: 'Upgrade Plan',    icon: '⭐', href: '/dashboard/upgrade' },
  ]},
]

const matchesItem = (item: NavItem, path: string): boolean =>
  item.href === "/dashboard" ? path === item.href : path.startsWith(item.href)

// ── Tag-management section (Projects/Sites, Activities/Cost Codes, Budgets) —
// shown for both NGO and Construction, reusing the exact same underlying
// pages, since those pages already relabel themselves per business_type. ──
const TAG_SECTION_PATHS = [
  '/dashboard/projects',
  '/dashboard/settings/projects',
  '/dashboard/settings/budgets',
]

function getTagSectionLabel(businessType: string): string {
  const projectPlural = getLabel(businessType as BusinessType, 'project_plural')
  return `${projectPlural} & Budgets`
}

function getSectionForPath(path: string, businessType: string): string {
  if ((businessType === 'ngo' || businessType === 'construction') && TAG_SECTION_PATHS.some(p => path.startsWith(p))) {
    return getTagSectionLabel(businessType)
  }
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
  const { hasFeature, features, loading } = usePlan()
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

  const [dummy, setDummy] = useState(0)
  useEffect(() => {
    if (!loading && features.length > 0) {
      setDummy(prev => prev + 1)
    }
  }, [loading, features])

  const [businessType, setBusinessType] = useState<string>("")
  const [payrollEnabled, setPayrollEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    const getCompany = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return
        const cid = (user?.app_metadata as any)?.company_id
        if (!cid) return

        const { data } = await supabase
          .from("companies")
          .select("business_type")
          .eq("id", cid)
          .single()
        if (!cancelled && data) setBusinessType(data.business_type || "")

        // ✅ SAFE payroll check – wrapped in try/catch, correct join
        try {
          const { data: cfRow } = await supabase
            .from("company_features")
            .select("enabled, features!inner(code)")
            .eq("features.code", "payroll")
            .eq("company_id", cid)
            .maybeSingle()

          if (!cancelled && cfRow?.enabled) {
            setPayrollEnabled(true)
          }
        } catch (_) {
          // if this query fails, payroll simply stays hidden – no crash
          if (!cancelled) setPayrollEnabled(false)
        }
      } catch (_) {
        // outer try/catch – ignore any error in company fetch
      }
    }
    getCompany()
    return () => { cancelled = true }
  }, [])

  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  useEffect(() => {
    const check = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) return
        const { data } = await supabase
          .from("platform_admins")
          .select("id")
          .eq("email", user.email)
          .maybeSingle()
        setIsPlatformAdmin(!!data)
      } catch (_) {}
    }
    check()
  }, [])

  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  useEffect(() => {
    const checkSuper = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email === 'siqbalhwc@gmail.com') {
          setIsSuperAdmin(true)
        } else {
          setIsSuperAdmin(false)
        }
      } catch (_) {}
    }
    checkSuper()
  }, [])

  const navSections = [...baseNavSections]

  // ── NGO and Construction both get a tag-management section
  // (Projects/Sites, Activities/Cost Codes & Locations/Zones, Budgets),
  // reusing the same pages — those pages already relabel themselves
  // based on business_type, so no new pages are needed here. ──
  if (businessType === 'ngo' || businessType === 'construction') {
    const invIndex = navSections.findIndex(s => s.section === 'INVENTORY')
    const insertAt = invIndex >= 0 ? invIndex + 1 : navSections.length - 1
    const projectLabel = getLabel(businessType as BusinessType, 'project_plural')
    const activityLabel = getLabel(businessType as BusinessType, 'activity_plural')
    const locationLabel = getLabel(businessType as BusinessType, 'location_plural')

    const tagSectionItems: NavItem[] = [
      { label: projectLabel,                          icon: '📁', href: '/dashboard/projects'            },
      { label: `${activityLabel} & ${locationLabel}`, icon: '📍', href: '/dashboard/settings/projects' },
      { label: 'Budgets',                              icon: '💰', href: '/dashboard/settings/budgets'    },
    ]

    // Bookings is construction-only — NGO has no equivalent concept.
    if (businessType === 'construction') {
      tagSectionItems.push({ label: 'Investor Capital', icon: '💼', href: '/dashboard/settings/investor-capital' })
      tagSectionItems.push({ label: 'Bookings', icon: '🏗️', href: '/dashboard/bookings' })
      tagSectionItems.push({ label: 'Record Payment', icon: '💵', href: '/dashboard/bookings/record-payment' })
    }

    navSections.splice(insertAt, 0, {
      section: getTagSectionLabel(businessType),
      items: tagSectionItems,
    })
  }

  // ── Relabel INVENTORY -> "UNITS" for construction (selling rooms/plots
  // isn't "stock"), and hide Inventory Adj. (not a relevant concept for
  // real-estate units). We only change the displayLabel + item label
  // here, never `section` itself — the internal key must stay 'INVENTORY'
  // so getSectionForPath()/openSection state (which key off the original
  // name) keep matching correctly. ──
  if (businessType === 'construction') {
    const invSectionIdx = navSections.findIndex(s => s.section === 'INVENTORY')
    if (invSectionIdx >= 0) {
      const original = navSections[invSectionIdx]
      navSections[invSectionIdx] = {
        ...original,
        displayLabel: 'UNITS',
        items: (original.items || [])
          .filter(item => item.href !== '/dashboard/inventory/adjustments')
          .map(item => item.href === '/dashboard/products'
            ? { ...item, label: 'Units / Plots' }
            : item
          ),
      }
    }
  }

  const systemSection = navSections.find(s => s.section === 'SYSTEM')!
  if (isPlatformAdmin) {
    if (!systemSection.items!.some(item => item.href === '/dashboard/admin')) {
      systemSection.items!.push({ label: 'Platform Admin', icon: '🛡️', href: '/dashboard/admin' })
    }
  }
  if (isSuperAdmin) {
    if (!systemSection.items!.some(item => item.href === '/admin')) {
      systemSection.items!.push({ label: 'Super Admin', icon: '🏢', href: '/admin' })
    }
  }

  const GAP = 6

  const [openSection, setOpenSection] = useState<string>(() => getSectionForPath(pathname, businessType))

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(collapsed))
    if (collapsed) {
      document.documentElement.setAttribute("data-sidebar-collapsed", "true")
    } else {
      document.documentElement.removeAttribute("data-sidebar-collapsed")
    }
  }, [collapsed])

  useEffect(() => {
    setOpenSection(getSectionForPath(pathname, businessType))
  }, [pathname, businessType])

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

  const isVisible = (item: NavItem) => {
    if (item.adminOnly && role !== 'admin') return false
    if (loading && item.feature) return false
    if (item.feature && !hasFeature(item.feature)) return false
    if (['Admin Panel', 'Feature Manager', 'Audit Logs', 'New Company'].includes(item.label) && role !== 'super_admin') {
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
      key={`sidebar-${dummy}`}
      style={{
        width: collapsed ? 68 : 240,
        minWidth: collapsed ? 68 : 240,
        overflowX: "hidden",
        margin: GAP,
        marginRight: 0,
        borderRadius: 24,
        background: "transparent",
        boxShadow: shadow,
        border: `1px solid ${borderColor}`,
        position: "fixed",
        top: 0, left: 0, bottom: GAP,
        zIndex: 40,
        display: "flex", flexDirection: "column",
      }}
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ duration: 0.35, ease: [0.25, 0.8, 0.25, 1] }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: -1,
          borderRadius: 24,
          background: bg,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      />

      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "14px 0" : "14px 16px",
        borderBottom: `1px solid ${borderColor}`, transition: "padding 0.3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", flex: 1, minWidth: 0 }}>
          <img src={logoUrl} alt={companyName} style={{
            width: 34, height: 34, borderRadius: 9, objectFit: "contain",
            flexShrink: 0, imageRendering: "auto",
          }} />
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

      <nav className="dl-sidebar-nav" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 8px" }}>
        {navSections.map(sec => {
          // ✅ Payroll section guarded by direct DB flag (safe – will never crash)
          if (sec.section === 'PAYROLL' && !payrollEnabled) return null
          if (sec.feature && sec.section !== 'PAYROLL' && !hasFeature(sec.feature)) return null

          const isOpen = openSection === sec.section

          const visibleGroups = sec.groups
            ? sec.groups.filter(group => group.items.some(item => isVisible(item)))
            : []

          const visibleItems = sec.items?.filter(item => isVisible(item)) ?? []

          if (!sec.groups && visibleItems.length === 0) return null
          if (sec.groups && visibleGroups.length === 0) return null

          return (
            <div key={sec.section} style={{ marginBottom: 4 }}>
              {!collapsed && (
                <motion.div
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4, userSelect: "none", padding: "10px 14px 4px", color: mutedTextColor, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}
                  onClick={() => handleSectionClick(sec.section)}
                  whileHover={{ color: textColor }}
                >
                  <span style={{ flex: 1 }}>{sec.displayLabel ?? sec.section}</span>
                  <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}><ChevronDown size={12} /></motion.span>
                </motion.div>
              )}
              <AnimatePresence initial={false}>
                {(collapsed || isOpen) && (
                  <motion.div key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} style={{ overflow: "hidden" }}>
                    {visibleGroups.map(group => (
                      <div key={group.groupLabel}>
                        {!collapsed && <div style={{ padding: "6px 14px 2px", color: mutedTextColor, fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{group.groupLabel}</div>}
                        {group.items.map(item => isVisible(item) && <NavLink key={item.href} {...{ item, collapsed, isNew: isNew(item), markVisited, isActive: matchesItem(item, pathname), textColor, mutedTextColor, router }} />)}
                      </div>
                    ))}
                    {visibleItems.map(item => isVisible(item) && <NavLink key={item.href} {...{ item, collapsed, isNew: isNew(item), markVisited, isActive: matchesItem(item, pathname), textColor, mutedTextColor, router }} />)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

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