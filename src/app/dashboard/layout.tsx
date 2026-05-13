import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SidebarClient from './sidebar-client'
import DashboardTopBar from "@/components/DashboardTopBar"
import BottomNav from "@/components/BottomNav"
import SidebarNav from "@/components/SidebarNav"   // ✅ new import

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: #EFF4FB; }

  .dl-shell { display: flex; min-height: 100vh; background: #EFF4FB; }

  /* ── Sidebar ── */
  .dl-sidebar {
    width: 220px; min-width: 220px;
    background: linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%);
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    transition: transform 0.25s ease; overflow: hidden;
  }
  .dl-sidebar::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(rgba(255,255,255,0.055) 1.2px, transparent 1.2px);
    background-size: 28px 28px; pointer-events: none; z-index: 0;
  }
  .dl-sidebar-logo { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); min-height: 58px; position: relative; z-index: 1; }
  .dl-sidebar-logo-img { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; flex-shrink: 0; }
  .dl-sidebar-logo-name { color: white; font-size: 14px; font-weight: 700; line-height: 1.1; }
  .dl-sidebar-logo-sub { color: rgba(255,255,255,0.45); font-size: 9px; }

  /* ── New sidebar classes (used by SidebarNav) ── */
  .dl-section-btn {
    display: flex; align-items: center; gap: 6px; padding: 8px 12px;
    background: none; border: none; color: rgba(255,255,255,0.7); font-size: 12px;
    font-weight: 600; cursor: pointer; width: 100%; text-align: left;
    font-family: inherit; border-radius: 8px; transition: background 0.15s;
  }
  .dl-section-btn:hover { background: rgba(255,255,255,0.08); }
  .dl-section-content { padding-left: 6px; margin-top: 2px; margin-bottom: 8px; }

  .dl-sidebar-nav { flex: 1; padding: 8px 10px; overflow-y: auto; position: relative; z-index: 1; }

  .dl-nav-section {
    padding: 10px 8px 4px; color: rgba(255,255,255,0.35);
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em;
  }
  .dl-nav-group-label {
    padding: 6px 10px 2px; color: rgba(255,255,255,0.22);
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .dl-nav-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 12px;
    border-radius: 8px; color: rgba(255,255,255,0.65); font-size: 13px; font-weight: 500;
    text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
  }
  .dl-nav-item:hover { background: rgba(255,255,255,0.07); color: white; }
  .dl-nav-item.active { background: rgba(255,255,255,0.12); color: white; font-weight: 600; }
  .dl-nav-icon { width: 18px; text-align: center; flex-shrink: 0; }
  .dl-nav-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 6px 14px; }

  .dl-sidebar-user { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; }
  .dl-sidebar-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.15); color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
  .dl-sidebar-email { color: rgba(255,255,255,0.7); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-sidebar-signout { color: rgba(255,255,255,0.4); font-size: 10px; cursor: pointer; background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px; }
  .dl-sidebar-signout:hover { color: #EF4444; }

  /* ── Main area ── */
  .dl-main { flex: 1; margin-left: 220px; display: flex; flex-direction: column; min-height: 100vh; min-width: 0; overflow-x: hidden; }

  .dl-topbar { background: white; border-bottom: 1px solid #E2E8F0; padding: 0 20px; display: flex; align-items: center; min-height: 56px; gap: 16px; position: sticky; top: 0; z-index: 30; }
  .dl-topbar-greeting { flex: 1; min-width: 0; }
  .dl-topbar-title { font-size: clamp(12px, 1.1vw, 14px); font-weight: 700; color: #1E293B; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dl-topbar-subtitle { font-size: clamp(10px, 0.8vw, 11px); color: #94A3B8; line-height: 1.2; }
  .dl-topbar-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .dl-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px clamp(10px, 1.2vw, 14px); border-radius: 8px; font-size: clamp(10px, 0.78vw, 11.5px); font-weight: 600; text-decoration: none; cursor: pointer; border: 1.5px solid; font-family: inherit; transition: all 0.15s; white-space: nowrap; height: 34px; }
  .dl-btn-invoice { background: #EEF2FF; border-color: #C7D2FE; color: #4338CA; }
  .dl-btn-bill    { background: #FEF3C7; border-color: #FCD34D; color: #92400E; }
  .dl-btn-receipt { background: #D1FAE5; border-color: #A7F3D0; color: #065F46; }
  .dl-btn-payment { background: #FEE2E2; border-color: #FECACA; color: #991B1B; }
  .dl-btn-invoice:hover { background: #E0E7FF; }
  .dl-btn-bill:hover    { background: #FEF9C3; }
  .dl-btn-receipt:hover { background: #A7F3D0; }
  .dl-btn-payment:hover { background: #FECACA; }

  .dl-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 6px; flex-shrink: 0; }
  .dl-hamburger span { display: block; width: 20px; height: 2px; background: #475569; margin: 4px 0; border-radius: 2px; }
  .dl-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 35; }
  .dl-overlay.open { display: block; }

  /* ── Bottom nav – hidden on desktop, shown on mobile ── */
  .mobile-bottom-nav { display: none; }
  @media (max-width: 768px) {
    .mobile-bottom-nav { display: block; }
    .dl-main { padding-bottom: 56px; }
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
    .dl-sidebar { transform: translateX(-220px); width: 220px; min-width: 220px; }
    .dl-sidebar.mobile-open { transform: translateX(0); }
    .dl-sidebar.mobile-open .dl-sidebar-logo-name, .dl-sidebar.mobile-open .dl-sidebar-logo-sub,
    .dl-sidebar.mobile-open .dl-nav-section, .dl-sidebar.mobile-open .dl-nav-group-label,
    .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar.mobile-open .dl-sidebar-email, .dl-sidebar.mobile-open .dl-sidebar-signout { display: block; }
    .dl-sidebar.mobile-open .dl-sidebar-logo { justify-content: flex-start; padding: 16px 18px; }
    .dl-sidebar.mobile-open .dl-nav-item { justify-content: flex-start; padding: 8px 12px; }
    .dl-main { margin-left: 0; }
    .dl-hamburger { display: block; }
    .dl-topbar { flex-wrap: wrap; min-height: auto; padding: 10px 14px; gap: 10px; }
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
        {/* Mobile overlay (required for hamburger menu) */}
        <SidebarClient />

        {/* ✅ Now using the collapsible SidebarNav component */}
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
          {children}
          <div className="mobile-bottom-nav">
            <BottomNav />
          </div>
        </div>
      </div>
    </>
  )
}