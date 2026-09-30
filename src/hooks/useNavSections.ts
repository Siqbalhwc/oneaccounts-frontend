"use client"

// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for the dashboard menu.
// Used by BOTH the desktop sidebar (DashboardSidebar.tsx) and the mobile
// drawer (dashboard/MobileDrawer.tsx), so they can never drift apart.
// The menu definition, business-type rules and visibility rules below were
// moved here unchanged from DashboardSidebar.tsx.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import { getLabel, type BusinessType } from "@/lib/labels"

// ── Types ──
export interface NavItem { label: string; icon: string; href: string; feature?: string; adminOnly?: boolean }
export interface NavGroup { groupLabel: string; items: NavItem[] }
export interface NavSection { section: string; displayLabel?: string; feature?: string; items?: NavItem[]; groups?: NavGroup[] }

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

export const matchesItem = (item: NavItem, path: string): boolean =>
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

export function getSectionForPath(path: string, businessType: string): string {
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


// Builds the full (unfiltered-by-feature) menu for a business type.
// Pure function: never mutates baseNavSections.
function buildNavSections(businessType: string, isPlatformAdmin: boolean, isSuperAdmin: boolean): NavSection[] {
  let navSections: NavSection[] = [...baseNavSections]

  // Construction has its own dedicated Investor Capital page under the
  // tag-management section below - the legacy standalone Investors page
  // should not also appear under Accounting for Construction companies.
  if (businessType === 'construction') {
    navSections = navSections.map(section => {
      if (section.section !== 'ACCOUNTING') return section
      return {
        ...section,
        groups: section.groups?.map((g: any) => ({
          ...g,
          items: g.items.filter((item: NavItem) => item.href !== '/dashboard/investors'),
        })),
      }
    })
  }

  // NGO and Construction both get a tag-management section.
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

  // Relabel INVENTORY -> "UNITS" for construction and hide Inventory Adj.
  // Only displayLabel + item label change; `section` stays 'INVENTORY'.
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

  // SYSTEM section: copy its items array first so the admin links added
  // below never leak into the shared module-level menu between users.
  navSections = navSections.map(s =>
    s.section === 'SYSTEM' ? { ...s, items: [...(s.items || [])] } : s
  )
  const systemSection = navSections.find(s => s.section === 'SYSTEM')
  if (systemSection) {
    if (isPlatformAdmin) {
      systemSection.items!.push({ label: 'Platform Admin', icon: '🛡️', href: '/dashboard/admin' })
    }
    if (isSuperAdmin) {
      systemSection.items!.push({ label: 'Super Admin', icon: '🏢', href: '/admin' })
    }
  }

  return navSections
}

// The menu exactly as the current user is allowed to see it:
// feature-gated, role-gated, business-type aware, empty sections removed.
export function useNavSections() {
  const { hasFeature, loading } = usePlan()
  const { role } = useRole()

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  )

  const [businessType, setBusinessType] = useState<string>("")
  const [payrollEnabled, setPayrollEnabled] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        // Super admin (same rule as before)
        setIsSuperAdmin(user.email === 'siqbalhwc@gmail.com')

        // Platform admin
        try {
          if (user.email) {
            const { data } = await supabase
              .from("platform_admins")
              .select("id")
              .eq("email", user.email)
              .maybeSingle()
            if (!cancelled) setIsPlatformAdmin(!!data)
          }
        } catch (_) {}

        // Company: JWT claim first (as before); if it is missing, fall back
        // to the user_roles lookup used everywhere else in the app.
        let cid = (user.app_metadata as any)?.company_id as string | undefined
        if (!cid) {
          try {
            const { data: ur } = await supabase
              .from("user_roles")
              .select("company_id")
              .eq("user_id", user.id)
              .eq("is_active", true)
              .limit(1)
              .maybeSingle()
            cid = ur?.company_id
          } catch (_) {}
        }
        if (!cid || cancelled) return

        const { data } = await supabase
          .from("companies")
          .select("business_type")
          .eq("id", cid)
          .single()
        if (!cancelled && data) setBusinessType(data.business_type || "")

        // Payroll flag - wrapped so a failure only hides Payroll
        try {
          const { data: cfRow } = await supabase
            .from("company_features")
            .select("enabled, features!inner(code)")
            .eq("features.code", "payroll")
            .eq("company_id", cid)
            .maybeSingle()
          if (!cancelled && cfRow?.enabled) setPayrollEnabled(true)
        } catch (_) {
          if (!cancelled) setPayrollEnabled(false)
        }
      } catch (_) {
        // ignore - menu just shows the base items
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  const isVisible = (item: NavItem) => {
    if (item.adminOnly && role !== 'admin') return false
    if (loading && item.feature) return false
    if (item.feature && !hasFeature(item.feature)) return false
    if (['Admin Panel', 'Feature Manager', 'Audit Logs', 'New Company'].includes(item.label) && role !== 'super_admin') {
      return false
    }
    return true
  }

  const sections: NavSection[] = []
  for (const sec of buildNavSections(businessType, isPlatformAdmin, isSuperAdmin)) {
    if (sec.section === 'PAYROLL' && !payrollEnabled) continue
    if (sec.feature && sec.section !== 'PAYROLL' && !hasFeature(sec.feature)) continue

    if (sec.groups) {
      const groups = sec.groups
        .map(g => ({ ...g, items: g.items.filter(isVisible) }))
        .filter(g => g.items.length > 0)
      if (groups.length === 0) continue
      sections.push({ ...sec, groups })
    } else {
      const items = (sec.items ?? []).filter(isVisible)
      if (items.length === 0) continue
      sections.push({ ...sec, items })
    }
  }

  return { sections, businessType }
}
