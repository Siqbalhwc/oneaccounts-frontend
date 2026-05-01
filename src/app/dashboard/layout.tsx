import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SidebarClient from './sidebar-client'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: #EFF4FB; }

  .dl-shell { display: flex; min-height: 100vh; background: #EFF4FB; }

  /* ── SIDEBAR ── */
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
  .dl-sidebar-nav { flex: 1; padding: 12px 10px; overflow-y: auto; position: relative; z-index: 1; }
  .dl-nav-section { padding: 8px 8px 4px; color: rgba(255,255,255,0.35); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  .dl-nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; color: rgba(255,255,255,0.65); font-size: 13px; font-weight: 500; text-decoration: none; transition: all 0.15s; margin-bottom: 2px; }
  .dl-nav-item:hover { background: rgba(255,255,255,0.06); color: white; }
  .dl-nav-item.active { background: rgba(255,255,255,0.1); color: white; font-weight: 600; }
  .dl-nav-icon { width: 18px; text-align: center; flex-shrink: 0; }
  .dl-nav-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 8px 14px; }
  .dl-sidebar-user { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; }
  .dl-sidebar-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.15); color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
  .dl-sidebar-email { color: rgba(255,255,255,0.7); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-sidebar-signout { color: rgba(255,255,255,0.4); font-size: 10px; cursor: pointer; background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px; }
  .dl-sidebar-signout:hover { color: #EF4444; }

  /* ── MAIN ──
     THE FIX:
     - flex: 1          → takes all remaining space after sidebar
     - margin-left: 220px → offsets past the fixed sidebar
     - min-width: 0     → CRITICAL: prevents flex child from overflowing
     - NO width: calc() → that fights with flex:1 and causes the blank gap
     - overflow-x: hidden → clips any accidental overflow
  ── */
  .dl-main {
    flex: 1;
    margin-left: 220px;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-width: 0;
    overflow-x: hidden;
  }

  /* ── TOP BAR ── */
  .dl-topbar { background: white; border-bottom: 1px solid #E2E8F0; padding: 0 20px; display: flex; align-items: center; min-height: 56px; gap: 16px; position: sticky; top: 0; z-index: 30; }
  .dl-topbar-greeting { flex: 1; min-width: 0; }
  .dl-topbar-title { font-size: clamp(12px, 1.1vw, 14px); font-weight: 700; color: #1E293B; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dl-topbar-subtitle { font-size: clamp(10px, 0.8vw, 11px); color: #94A3B8; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

  /* ── HAMBURGER ── */
  .dl-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 6px; flex-shrink: 0; }
  .dl-hamburger span { display: block; width: 20px; height: 2px; background: #475569; margin: 4px 0; border-radius: 2px; transition: all 0.2s; }
  .dl-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 35; }
  .dl-overlay.open { display: block; }

  /* ── RESPONSIVE ── */
  @media (max-width: 900px) {
    .dl-sidebar { width: 60px; min-width: 60px; }
    .dl-sidebar-logo-name, .dl-sidebar-logo-sub, .dl-nav-section,
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
    .dl-sidebar.mobile-open .dl-nav-section, .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
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

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email   = user.email || ''
  const initial = email.charAt(0).toUpperCase()

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const navItems = [
    { label: 'Dashboard',         icon: '📊', href: '/dashboard',          section: 'MAIN'      },
    { label: 'Chart of Accounts', icon: '📋', href: '/dashboard/accounts', section: 'MAIN'      },
    { label: 'Journal Entries',   icon: '📓', href: '/dashboard/journal',  section: 'MAIN'      },
    { label: 'Sales Invoices',    icon: '🧾', href: '/dashboard/invoices', section: 'MAIN'      },
    { label: 'Purchase Bills',    icon: '📦', href: '/dashboard/bills',    section: 'MAIN'      },
    { label: 'Receipts',          icon: '💰', href: '/dashboard/receipts', section: 'MAIN'      },
    { label: 'Payments',          icon: '💳', href: '/dashboard/payments', section: 'MAIN'      },
    { label: 'Customers',         icon: '👥', href: '/dashboard/customers',section: 'CRM'       },
    { label: 'Suppliers',         icon: '🚚', href: '/dashboard/suppliers',section: 'CRM'       },
    { label: 'Investors',         icon: '💼', href: '/dashboard/investors',section: 'CRM'       },
    { label: 'Products',          icon: '📦', href: '/dashboard/products', section: 'INVENTORY' },
    { label: 'All Reports',       icon: '📁', href: '/dashboard/reports',  section: 'REPORTS'   },
  ]

  const sections = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {} as Record<string, typeof navItems>)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="dl-shell">
        <SidebarClient />
        <aside className="dl-sidebar" id="dl-sidebar">
          <div className="dl-sidebar-logo">
            <img src="/logo.png" alt="OneAccounts" className="dl-sidebar-logo-img" />
            <div>
              <div className="dl-sidebar-logo-name">OneAccounts</div>
              <div className="dl-sidebar-logo-sub">by Siqbal</div>
            </div>
          </div>
          <nav className="dl-sidebar-nav">
            {Object.entries(sections).map(([section, items], secIdx) => (
              <div key={section}>
                <div className="dl-nav-section">{section}</div>
                {items.map((item) => (
                  <a key={item.href} href={item.href}
                    className={`dl-nav-item${item.href === '/dashboard' ? ' active' : ''}`}>
                    <span className="dl-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
                {secIdx < Object.keys(sections).length - 1 && <div className="dl-nav-divider" />}
              </div>
            ))}
          </nav>
          <div className="dl-sidebar-user">
            <div className="dl-sidebar-avatar">{initial}</div>
            <div style={{ overflow: 'hidden' }}>
              <div className="dl-sidebar-email">{email}</div>
              <form action="/auth/signout" method="post">
                <button type="submit" className="dl-sidebar-signout">Sign Out</button>
              </form>
            </div>
          </div>
        </aside>
        <div className="dl-main">
          <header className="dl-topbar">
            <button className="dl-hamburger" id="dl-hamburger" aria-label="Open menu">
              <span/><span/><span/>
            </button>
            <div className="dl-topbar-greeting">
              <div className="dl-topbar-title">👋 {getGreeting()}, {email.split('@')[0]}!</div>
              <div className="dl-topbar-subtitle">Here's what's happening with your business today</div>
            </div>
            <div className="dl-topbar-actions">
              <a href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice"><span>🧾</span> New Invoice</a>
              <a href="/dashboard/bills/new"    className="dl-action-btn dl-btn-bill"   ><span>📦</span> New Bill</a>
              <a href="/dashboard/receipts/new" className="dl-action-btn dl-btn-receipt"><span>💰</span> Receipt</a>
              <a href="/dashboard/payments/new" className="dl-action-btn dl-btn-payment"><span>💳</span> Payment</a>
            </div>
          </header>
          {children}
        </div>
      </div>
    </>
  )
}
