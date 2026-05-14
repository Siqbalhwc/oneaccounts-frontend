import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SidebarClient from './sidebar-client'
import DashboardTopBar from "@/components/DashboardTopBar"
import BottomNav from "@/components/BottomNav"
import SidebarNav from "@/components/SidebarNav"

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #0B1120; color: #E2E8F0; }

  .dl-shell { display: flex; min-height: 100vh; background: #0B1120; }

  /* ── Sidebar – 208 px (80% of original), same dark background as dashboard ── */
  .dl-sidebar {
    width: 208px; min-width: 208px;
    background: #0B1120;               /* ← matches dashboard */
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    transition: transform 0.25s ease; overflow: hidden;
    border-right: 1px solid #1E293B;
  }

  .dl-sidebar-logo {
    display: flex; align-items: center; gap: 8px;
    padding: 18px 14px;               /* slightly tighter for 208 px width */
    border-bottom: 1px solid #1E293B;
    min-height: 62px;
  }
  .dl-sidebar-logo-img {
    width: 36px; height: 36px;
    border-radius: 10px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .dl-sidebar-logo-name {
    color: white;
    font-size: 13px;                   /* smaller to fit on one line */
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
  }
  .dl-sidebar-logo-sub {
    color: #64748B;
    font-size: 9px;
  }

  .dl-section-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px;
    background: none; border: none;
    color: #94A3B8; font-size: 12px; font-weight: 600;
    cursor: pointer; width: 100%; text-align: left;
    font-family: inherit; border-radius: 8px;
    transition: all 0.2s;
  }
  .dl-section-btn:hover { background: rgba(255,255,255,0.04); color: white; }
  .dl-section-content { padding-left: 10px; margin-top: 4px; margin-bottom: 6px; }

  .dl-sidebar-nav { flex: 1; padding: 10px 8px; overflow-y: auto; }

  .dl-nav-section {
    padding: 10px 14px 4px; color: #64748B;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  }
  .dl-nav-group-label {
    padding: 4px 14px 2px; color: #475569;
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .dl-nav-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    border-radius: 8px; color: #94A3B8;
    font-size: 13px; font-weight: 500;
    text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
  }
  .dl-nav-item:hover { background: rgba(255,255,255,0.04); color: white; }

  /* Active item – NO blue, subtle white accent */
  .dl-nav-item.active {
    background: rgba(255,255,255,0.05);
    color: white; font-weight: 600;
    border-left: 3px solid #334155;    /* dark slate, no blue */
  }
  .dl-nav-icon { width: 20px; text-align: center; flex-shrink: 0; }
  .dl-nav-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 6px 14px; }

  .dl-sidebar-user { padding: 14px; border-top: 1px solid #1E293B; display: flex; align-items: center; gap: 10px; }
  .dl-sidebar-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    background: #1E293B; color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; flex-shrink: 0;
  }
  .dl-sidebar-email { color: #94A3B8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-sidebar-signout { color: #64748B; font-size: 10px; cursor: pointer; background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px; }
  .dl-sidebar-signout:hover { color: #EF4444; }

  /* ── Main area ── */
  .dl-main { flex: 1; margin-left: 208px; display: flex; flex-direction: column; min-height: 100vh; min-width: 0; overflow-x: hidden; background: #0B1120; }

  /* Large‑screen fix: stretch content */
  .dl-main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .dl-main-content > div {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #0B1120 !important;
  }

  .dl-topbar { background: #0F172A; border-bottom: 1px solid #1E293B; padding: 0 24px; display: flex; align-items: center; min-height: 64px; gap: 16px; position: sticky; top: 0; z-index: 30; }
  .dl-topbar-greeting { flex: 1; min-width: 0; }
  .dl-topbar-title { font-size: 14px; font-weight: 700; color: #F1F5F9; line-height: 1.2; }
  .dl-topbar-subtitle { font-size: 11px; color: #94A3B8; line-height: 1.2; }
  .dl-topbar-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .dl-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 10px; font-size: 11.5px; font-weight: 600; text-decoration: none; cursor: pointer; border: 1px solid; font-family: inherit; transition: all 0.15s; white-space: nowrap; height: 36px; }
  .dl-btn-invoice { background: #1E293B; border-color: #334155; color: #93C5FD; }
  .dl-btn-bill    { background: #1E293B; border-color: #334155; color: #FCD34D; }
  .dl-btn-receipt { background: #1E293B; border-color: #334155; color: #6EE7B7; }
  .dl-btn-payment { background: #1E293B; border-color: #334155; color: #FCA5A5; }
  .dl-btn-invoice:hover { background: #1E3A8A; border-color: #2563EB; color: white; }
  .dl-btn-bill:hover    { background: #1E3A8A; border-color: #2563EB; color: white; }
  .dl-btn-receipt:hover { background: #065F46; border-color: #10B981; color: white; }
  .dl-btn-payment:hover { background: #991B1B; border-color: #EF4444; color: white; }

  .dl-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 6px; flex-shrink: 0; position: relative; z-index: 100; }
  .dl-hamburger span { display: block; width: 20px; height: 2px; background: #94A3B8; margin: 4px 0; border-radius: 2px; }
  .dl-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 35; }
  .dl-overlay.open { display: block; }

  .mobile-bottom-nav { display: none; z-index: 10; }
  @media (max-width: 768px) {
    .mobile-bottom-nav { display: block; }
    .dl-main { padding-bottom: 60px; }
  }

  @media (max-width: 900px) {
    .dl-sidebar { width: 60px; min-width: 60px; }
    .dl-sidebar-logo-name, .dl-sidebar-logo-sub, .dl-nav-section, .dl-nav-group-label,
    .dl-nav-item span:not(.dl-nav-icon), .dl-sidebar-email, .dl-sidebar-signout { display: none; }
    .dl-sidebar-logo { justify-content: center; padding: 14px 0; }
    .dl-nav-item { justify-content: center; padding: 10px; }
    .dl-sidebar-user { justify-content: center; }
    .dl-main { margin-left: 60px; }
  }
  @media (max-width: 640px) {
    .dl-sidebar { transform: translateX(-208px); width: 260px; min-width: 260px; }
    .dl-sidebar.mobile-open { transform: translateX(0); }
    .dl-sidebar.mobile-open .dl-sidebar-logo-name, .dl-sidebar.mobile-open .dl-sidebar-logo-sub,
    .dl-sidebar.mobile-open .dl-nav-section, .dl-sidebar.mobile-open .dl-nav-group-label,
    .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar.mobile-open .dl-sidebar-email, .dl-sidebar.mobile-open .dl-sidebar-signout { display: block; }
    .dl-sidebar.mobile-open .dl-sidebar-logo { justify-content: flex-start; padding: 18px 14px; }
    .dl-sidebar.mobile-open .dl-nav-item { justify-content: flex-start; padding: 8px 14px; }
    .dl-main { margin-left: 0; }
    .dl-hamburger { display: block; }
    .dl-topbar { flex-wrap: wrap; min-height: auto; padding: 12px 16px; gap: 10px; }
    .dl-topbar-greeting { flex: 1 1 60%; }
    .dl-topbar-actions { flex: 1 1 100%; gap: 6px; }
    .dl-action-btn { flex: 1; justify-content: center; padding: 7px 8px; font-size: 10px; }
  }
  @media (max-width: 380px) {
    .dl-topbar-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .dl-action-btn { padding: 6px 4px; font-size: 9px; }
  }
`

// ── Navigation structure (unchanged) ──
const navSections = [
  {
    section: 'MAIN',
    items: [
      { label: 'Dashboard', icon: '📊', href: '/dashboard' },
    ],
  },
  {
    section: 'CRM',
    items: [
      { label: 'Customers',      icon: '👥', href: '/dashboard/customers' },
      { label: 'Sales Invoices', icon: '🧾', href: '/dashboard/invoices'  },
      { label: 'Receipts',       icon: '💰', href: '/dashboard/receipts'  },
      { label: 'Suppliers',      icon: '🚚', href: '/dashboard/suppliers' },
      { label: 'Purchase Bills', icon: '📦', href: '/dashboard/bills'     },
      { label: 'Payments',       icon: '💳', href: '/dashboard/payments'  },
    ],
  },
  {
    section: 'BANKING',
    items: [
      { label: 'Bank Accounts',  icon: '🏦', href: '/dashboard/banking/bank-accounts'  },
      { label: 'Bank Transfers', icon: '🔄', href: '/dashboard/banking/bank-transfers' },
    ],
  },
  {
    section: 'INVENTORY',
    items: [
      { label: 'Products',       icon: '📦', href: '/dashboard/products'              },
      { label: 'Inventory Adj.', icon: '⚖️', href: '/dashboard/inventory/adjustments' },
    ],
  },
  {
    section: 'ACCOUNTING',
    groups: [
      {
        groupLabel: 'General',
        items: [
          { label: 'Chart of Accounts', icon: '📋', href: '/dashboard/accounts' },
          { label: 'Journal Entries',   icon: '📓', href: '/dashboard/journal'  },
        ],
      },
      {
        groupLabel: 'Reports',
        items: [
          { label: 'All Reports', icon: '📈', href: '/dashboard/reports' },
        ],
      },
      {
        groupLabel: 'Automation',
        items: [
          { label: 'Invoice Automation', icon: '⚙️', href: '/dashboard/settings/invoice-automation' },
          { label: 'Investors',          icon: '💼', href: '/dashboard/investors'                   },
        ],
      },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Admin Panel',     icon: '👑', href: '/dashboard/admin/users'    },
      { label: 'Feature Manager', icon: '⚙️', href: '/dashboard/admin/features' },
      { label: 'Audit Logs',      icon: '📋', href: '/dashboard/admin/audit-logs' },
      { label: 'Settings',        icon: '⚙️', href: '/dashboard/settings'       },
      { label: 'New Company',     icon: '🏢', href: '/dashboard/companies/new'  },
      { label: 'Upgrade Plan',    icon: '⭐', href: '/dashboard/upgrade'        },
      { label: 'Super Admin',     icon: '🛡️', href: '/dashboard/super-admin'    },
    ],
  },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email   = user.email || ''
  const initial = email.charAt(0).toUpperCase()

  // ── Fetch company settings ──
  let companyName = 'OneAccounts'
  let companyTagline = 'by Siqbal'
  let logoUrl = '/logo.png'

  try {
    const cid = (user?.app_metadata as any)?.company_id
    if (cid) {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('business_name, logo_url, tagline')
        .eq('company_id', cid)
        .maybeSingle()

      if (settings) {
        if (settings.business_name) companyName = settings.business_name
        if (settings.logo_url) logoUrl = settings.logo_url
        if (settings.tagline) companyTagline = settings.tagline
      }
    }
  } catch {
    // keep hardcoded fallbacks
  }

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="dl-shell">
        <SidebarClient />

        <SidebarNav
          navSections={navSections}
          email={email}
          initial={initial}
          logoUrl={logoUrl}
          companyName={companyName}
          companyTagline={companyTagline}
        />

        <div className="dl-main">
          <DashboardTopBar email={email} greeting={getGreeting()} />
          <div className="dl-main-content">
            {children}
          </div>
          <div className="mobile-bottom-nav">
            <BottomNav />
          </div>
        </div>
      </div>
    </>
  )
}