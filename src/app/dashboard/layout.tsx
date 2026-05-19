// app/dashboard/layout.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SidebarClient from './sidebar-client'
import DashboardTopBar from "@/components/DashboardTopBar"
import BottomNav from "@/components/BottomNav"

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #0B1120; color: #E2E8F0; }

  /* ── Shell ── */
  .dl-shell { display: flex; min-height: 100vh; background: #0B1120; }

  /* ── Sidebar ── */
  .dl-sidebar {
    width: 220px; min-width: 220px;
    background: #0B1120;
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    border-right: 1px solid #1E293B;
    transition: transform 0.28s cubic-bezier(.4,0,.2,1), width 0.25s ease;
    overflow: hidden;
  }

  /* Logo */
  .dl-sidebar-logo {
    display: flex; align-items: center; gap: 10px;
    padding: 18px 16px; border-bottom: 1px solid #1E293B;
    min-height: 64px; flex-shrink: 0;
  }
  .dl-sidebar-logo-img { width: 34px; height: 34px; border-radius: 9px; object-fit: contain; flex-shrink: 0; }
  .dl-sidebar-logo-name { color: #F1F5F9; font-size: 13px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
  .dl-sidebar-logo-sub  { color: #475569; font-size: 9px; white-space: nowrap; }

  /* Nav */
  .dl-sidebar-nav { flex: 1; padding: 10px 8px; overflow-y: auto; overflow-x: hidden; }
  .dl-sidebar-nav::-webkit-scrollbar { width: 4px; }
  .dl-sidebar-nav::-webkit-scrollbar-track { background: transparent; }
  .dl-sidebar-nav::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 4px; }

  .dl-section-label {
    padding: 10px 14px 4px;
    color: #334155; font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    white-space: nowrap;
  }
  .dl-nav-group-label {
    padding: 6px 14px 2px; color: #334155;
    font-size: 8px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .dl-nav-item {
    display: flex; align-items: center; gap: 9px;
    padding: 8px 14px; border-radius: 8px;
    color: #94A3B8; font-size: 13px; font-weight: 500;
    text-decoration: none; transition: all 0.15s;
    margin-bottom: 1px; white-space: nowrap;
    position: relative;
  }
  .dl-nav-item:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
  .dl-nav-item.active {
    background: rgba(255,255,255,0.07);
    color: #FFFFFF; font-weight: 600;
  }
  .dl-nav-item.active::before {
    content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
    width: 3px; border-radius: 0 3px 3px 0;
    background: linear-gradient(180deg, #22D3EE, #3B82F6);
  }
  .dl-nav-icon { width: 18px; text-align: center; flex-shrink: 0; font-size: 14px; }

  /* User footer */
  .dl-sidebar-user {
    padding: 14px 16px; border-top: 1px solid #1E293B;
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .dl-sidebar-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: linear-gradient(135deg, #1E3A8A, #1E293B);
    color: white; display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; flex-shrink: 0;
  }
  .dl-sidebar-email { color: #64748B; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-sidebar-signout {
    color: #475569; font-size: 10px; cursor: pointer;
    background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px;
    transition: color 0.15s;
  }
  .dl-sidebar-signout:hover { color: #EF4444; }

  /* ── Main area ── */
  .dl-main {
    flex: 1; margin-left: 220px;
    display: flex; flex-direction: column;
    min-height: 100vh; min-width: 0;
    overflow-x: hidden; background: #0B1120;
    transition: margin-left 0.25s ease;
  }
  .dl-main-content { flex: 1; display: flex; flex-direction: column; }

  /* ── Topbar ── */
  .dl-topbar {
    background: #0F172A; border-bottom: 1px solid #1E293B;
    padding: 0 24px; display: flex; align-items: center;
    min-height: 60px; gap: 14px;
    position: sticky; top: 0; z-index: 30;
  }
  .dl-topbar-greeting { flex: 1; min-width: 0; }
  .dl-topbar-title    { font-size: 14px; font-weight: 700; color: #F1F5F9; line-height: 1.2; }
  .dl-topbar-subtitle { font-size: 11px; color: #94A3B8; }
  .dl-topbar-actions  { display: flex; gap: 8px; flex-shrink: 0; }

  .dl-action-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 9px;
    font-size: 11px; font-weight: 600;
    text-decoration: none; cursor: pointer; border: 1px solid;
    font-family: inherit; transition: all 0.15s; white-space: nowrap; height: 34px;
  }
  .dl-btn-invoice { background:#1E293B; border-color:#334155; color:#93C5FD; }
  .dl-btn-bill    { background:#1E293B; border-color:#334155; color:#FCD34D; }
  .dl-btn-receipt { background:#1E293B; border-color:#334155; color:#6EE7B7; }
  .dl-btn-payment { background:#1E293B; border-color:#334155; color:#FCA5A5; }
  .dl-btn-invoice:hover { background:#1E3A8A; border-color:#1E3A8A; color:white; }
  .dl-btn-bill:hover    { background:#1E3A8A; border-color:#1E3A8A; color:white; }
  .dl-btn-receipt:hover { background:#065F46; border-color:#10B981; color:white; }
  .dl-btn-payment:hover { background:#991B1B; border-color:#EF4444; color:white; }

  /* ── Hamburger ── */
  .dl-hamburger {
    display: none; background: none; border: none;
    cursor: pointer; padding: 6px; flex-shrink: 0; z-index: 100;
  }
  .dl-hamburger span {
    display: block; width: 20px; height: 2px;
    background: #94A3B8; margin: 4px 0; border-radius: 2px;
    transition: all 0.25s;
  }

  /* ── Overlay ── */
  .dl-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.65); z-index: 35;
  }
  .dl-overlay.open { display: block; }

  /* ── Mobile bottom nav ── */
  .mobile-bottom-nav { display: none; }

  /* ════════════════════════════════
     RESPONSIVE BREAKPOINTS
  ════════════════════════════════ */

  /* Tablet: collapse sidebar to icon-only */
  @media (max-width: 960px) {
    .dl-sidebar {
      width: 62px; min-width: 62px;
    }
    .dl-sidebar-logo-name,
    .dl-sidebar-logo-sub,
    .dl-section-label,
    .dl-nav-group-label,
    .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar-email,
    .dl-sidebar-signout { display: none !important; }
    .dl-sidebar-logo    { justify-content: center; padding: 14px 0; }
    .dl-nav-item        { justify-content: center; padding: 10px 0; }
    .dl-sidebar-user    { justify-content: center; padding: 14px 0; }
    .dl-main            { margin-left: 62px; }
  }

  /* Mobile: sidebar slides in as drawer */
  @media (max-width: 640px) {
    .dl-hamburger { display: block; }

    .dl-sidebar {
      width: 240px; min-width: 240px;
      transform: translateX(-100%);
    }
    /* When open, restore all text */
    .dl-sidebar.mobile-open {
      transform: translateX(0);
      box-shadow: 4px 0 24px rgba(0,0,0,0.5);
    }
    .dl-sidebar.mobile-open .dl-sidebar-logo-name,
    .dl-sidebar.mobile-open .dl-sidebar-logo-sub,
    .dl-sidebar.mobile-open .dl-section-label,
    .dl-sidebar.mobile-open .dl-nav-group-label,
    .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar.mobile-open .dl-sidebar-email,
    .dl-sidebar.mobile-open .dl-sidebar-signout { display: block !important; }
    .dl-sidebar.mobile-open .dl-sidebar-logo { justify-content: flex-start; padding: 18px 16px; }
    .dl-sidebar.mobile-open .dl-nav-item      { justify-content: flex-start; padding: 8px 14px; }
    .dl-sidebar.mobile-open .dl-sidebar-user  { justify-content: flex-start; padding: 14px 16px; }

    .dl-main        { margin-left: 0; padding-bottom: 64px; }
    .dl-topbar      { padding: 0 14px; min-height: 54px; }
    .dl-topbar-actions { display: none; }

    .mobile-bottom-nav { display: block; position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; }
  }

  /* Very small screens */
  @media (max-width: 380px) {
    .dl-sidebar { width: 100vw; min-width: unset; }
  }

  /* ── Global dark overrides for child pages ── */
  body, .dl-shell, .dl-main, .dl-main-content { background: #0B1120 !important; }

  .dl-main-content input,
  .dl-main-content select,
  .dl-main-content textarea {
    background: #1E293B !important; border-color: #334155 !important; color: #F1F5F9 !important;
  }
  .dl-main-content input:focus,
  .dl-main-content select:focus,
  .dl-main-content textarea:focus {
    border-color: #64748B !important; outline: none !important;
  }
  .dl-main-content table    { background: #111827 !important; color: #E2E8F0 !important; }
  .dl-main-content table th { background: #1E293B !important; color: #94A3B8 !important; border-color: #1E293B !important; }
  .dl-main-content table td { border-color: #1E293B !important; background: #111827 !important; color: #E2E8F0 !important; }
  .dl-main-content tr:hover td { background: #1E293B !important; }
`

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
  { section: 'INVENTORY', items: [
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
      { label: 'Invoice Automation', icon: '⚙️', href: '/dashboard/settings/invoice-automation' },
      { label: 'Investors',          icon: '💼', href: '/dashboard/investors'                   },
    ]},
  ]},
  { section: 'SYSTEM', items: [
    { label: 'Admin Panel',     icon: '👑', href: '/dashboard/admin/users'      },
    { label: 'Feature Manager', icon: '⚙️', href: '/dashboard/admin/features'   },
    { label: 'Audit Logs',      icon: '📋', href: '/dashboard/admin/audit-logs' },
    { label: 'Settings',        icon: '⚙️', href: '/dashboard/settings'         },
    { label: 'New Company',     icon: '🏢', href: '/dashboard/companies/new'    },
    { label: 'Upgrade Plan',    icon: '⭐', href: '/dashboard/upgrade'          },
    { label: 'Super Admin',     icon: '🛡️', href: '/dashboard/super-admin'      },
  ]},
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email   = user.email || ''
  const initial = email.charAt(0).toUpperCase()
  let companyName    = 'OneAccounts'
  let companyTagline = 'by Siqbal'
  let logoUrl        = '/logo.png'

  try {
    const cid = (user?.app_metadata as any)?.company_id
    if (cid) {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('business_name, logo_url, tagline')
        .eq('company_id', cid)
        .maybeSingle()
      if (settings) {
        if (settings.business_name) companyName    = settings.business_name
        if (settings.logo_url)      logoUrl        = settings.logo_url
        if (settings.tagline)       companyTagline = settings.tagline
      }
    }
  } catch {}

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

        {/* SidebarClient: hamburger wiring + active link highlighting */}
        <SidebarClient />

        {/* ── Sidebar ── */}
        <aside className="dl-sidebar" id="dl-sidebar">
          <div className="dl-sidebar-logo">
            <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" />
            <div>
              <div className="dl-sidebar-logo-name">{companyName}</div>
              <div className="dl-sidebar-logo-sub">{companyTagline}</div>
            </div>
          </div>

          <nav className="dl-sidebar-nav">
            {navSections.map((sec) => (
              <div key={sec.section}>
                <div className="dl-section-label">{sec.section}</div>

                {/* Grouped items (e.g. ACCOUNTING) */}
                {sec.groups && sec.groups.map(group => (
                  <div key={group.groupLabel}>
                    <div className="dl-nav-group-label">{group.groupLabel}</div>
                    {group.items.map(item => (
                      <a key={item.href} href={item.href} className="dl-nav-item">
                        <span className="dl-nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                      </a>
                    ))}
                  </div>
                ))}

                {/* Flat items */}
                {sec.items && sec.items.map(item => (
                  <a key={item.href} href={item.href} className="dl-nav-item">
                    <span className="dl-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </div>
            ))}
          </nav>

          <div className="dl-sidebar-user">
            <div className="dl-sidebar-avatar">{initial}</div>
            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <div className="dl-sidebar-email">{email}</div>
              <form action="/auth/signout" method="post">
                <button type="submit" className="dl-sidebar-signout">Sign out</button>
              </form>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="dl-main">
          <DashboardTopBar email={email} greeting={getGreeting()} />
          <div className="dl-main-content">{children}</div>
          <div className="mobile-bottom-nav"><BottomNav /></div>
        </div>

      </div>
    </>
  )
}