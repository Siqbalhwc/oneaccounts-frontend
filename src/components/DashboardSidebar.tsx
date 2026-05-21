"use client"

import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import ThemeToggleButton from "@/components/ThemeToggleButton"

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

  // Show an item if:
  // - it's not gated by feature, OR the feature is enabled
  // - AND if it's adminOnly, the user must be admin
  const isVisible = (item: any) => {
    if (item.adminOnly && role !== "admin") return false
    if (item.feature && !hasFeature(item.feature)) return false
    return true
  }

  return (
    <aside className="dl-sidebar" id="dl-sidebar">
      <div className="dl-sidebar-logo">
        <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" />
        <div>
          <div className="dl-sidebar-logo-name">{companyName}</div>
          <div className="dl-sidebar-logo-sub">{companyTagline}</div>
        </div>
      </div>

      <nav className="dl-sidebar-nav">
        {navSections.map((sec) => {
          // If the whole section is feature‑gated, check the feature
          if (sec.feature && !hasFeature(sec.feature)) return null

          return (
            <div key={sec.section}>
              <div className="dl-section-label">{sec.section}</div>

              {/* Grouped items (e.g. ACCOUNTING) */}
              {sec.groups && sec.groups.map(group => (
                <div key={group.groupLabel}>
                  <div className="dl-nav-group-label">{group.groupLabel}</div>
                  {group.items.map(item => {
                    if (!isVisible(item)) return null
                    return (
                      <a key={item.href} href={item.href} className="dl-nav-item">
                        <span className="dl-nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                      </a>
                    )
                  })}
                </div>
              ))}

              {/* Flat items */}
              {sec.items && sec.items.map(item => {
                if (!isVisible(item)) return null
                return (
                  <a key={item.href} href={item.href} className="dl-nav-item">
                    <span className="dl-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="dl-sidebar-user">
        <div className="dl-sidebar-avatar">{initial}</div>
        <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
          <div className="dl-sidebar-email">{email}</div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="dl-sidebar-signout">Sign out</button>
          </form>
        </div>
        <ThemeToggleButton />
      </div>
    </aside>
  )
}