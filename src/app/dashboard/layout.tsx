// app/dashboard/layout.tsx
import { redirect } from 'next/navigation'
import { getUserCompany } from '@/lib/get-user-company'
import SidebarClient from './sidebar-client'
import DashboardTopBar from "@/components/DashboardTopBar"
import BottomNav from "@/components/BottomNav"
import DashboardSidebar from "@/components/DashboardSidebar"

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font-family); }

  /* Shell */
  .dl-shell { display: flex; min-height: 100vh; background: var(--shell-bg); }

  /* Sidebar */
  .dl-sidebar {
    width: 220px; min-width: 220px;
    background: var(--sidebar-bg);
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    border-right: 1px solid var(--sidebar-border);
    transition: transform 0.28s cubic-bezier(.4,0,.2,1), width 0.25s ease;
    overflow: hidden;
  }

  /* Logo */
  .dl-sidebar-logo {
    display: flex; align-items: center; gap: 10px;
    padding: 18px 16px; border-bottom: 1px solid var(--sidebar-border);
    min-height: 64px; flex-shrink: 0;
  }
  .dl-sidebar-logo-img { width: 34px; height: 34px; border-radius: 9px; object-fit: contain; flex-shrink: 0; }
  .dl-sidebar-logo-name { color: var(--text); font-size: 13px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
  .dl-sidebar-logo-sub  { color: var(--text-muted); font-size: 9px; white-space: nowrap; }

  /* Nav */
  .dl-sidebar-nav { flex: 1; padding: 10px 8px; overflow-y: auto; overflow-x: hidden; }
  .dl-sidebar-nav::-webkit-scrollbar { width: 4px; }
  .dl-sidebar-nav::-webkit-scrollbar-track { background: transparent; }
  .dl-sidebar-nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  .dl-section-label {
    padding: 10px 14px 4px;
    color: var(--text-muted); font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    white-space: nowrap;
  }
  .dl-nav-group-label {
    padding: 6px 14px 2px; color: var(--text-muted);
    font-size: 8px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .dl-nav-item {
    display: flex; align-items: center; gap: 9px;
    padding: 8px 14px; border-radius: 8px;
    color: var(--text-muted); font-size: 13px; font-weight: 500;
    text-decoration: none; transition: all 0.15s;
    margin-bottom: 1px; white-space: nowrap;
    position: relative;
  }
  .dl-nav-item:hover { background: var(--card-hover); color: var(--text); }
  .dl-nav-item.active {
    background: var(--card-hover);
    color: var(--text); font-weight: 600;
  }
  .dl-nav-item.active::before {
    content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
    width: 3px; border-radius: 0 3px 3px 0;
    background: var(--primary);
  }
  .dl-nav-icon { width: 18px; text-align: center; flex-shrink: 0; font-size: 14px; }

  /* User footer */
  .dl-sidebar-user {
    padding: 14px 16px; border-top: 1px solid var(--sidebar-border);
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .dl-sidebar-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--card); color: var(--text);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; flex-shrink: 0;
  }
  .dl-sidebar-email { color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-sidebar-signout {
    color: var(--text-muted); font-size: 10px; cursor: pointer;
    background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px;
    transition: color 0.15s;
  }
  .dl-sidebar-signout:hover { color: var(--danger); }

  /* Main area */
  .dl-main {
    flex: 1; margin-left: 220px;
    display: flex; flex-direction: column;
    min-height: 100vh; min-width: 0;
    overflow-x: hidden; background: var(--main-bg);
    transition: margin-left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Collapsible sidebar – main area resizes smoothly */
  html[data-sidebar-collapsed="true"] .dl-main {
    margin-left: 62px !important;
  }

  .dl-main-content { flex: 1; display: flex; flex-direction: column; }

  /* Topbar */
  .dl-topbar {
    background: var(--topbar-bg); border-bottom: 1px solid var(--topbar-border);
    padding: 0 24px; display: flex; align-items: center;
    min-height: 60px; gap: 14px;
    position: sticky; top: 0; z-index: 30;
  }
  .dl-topbar-greeting { flex: 1; min-width: 0; }
  .dl-topbar-title    { font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.2; }
  .dl-topbar-subtitle { font-size: 11px; color: var(--text-muted); }
  .dl-topbar-actions  { display: flex; gap: 8px; flex-shrink: 0; }

  .dl-action-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 9px;
    font-size: 11px; font-weight: 600;
    text-decoration: none; cursor: pointer; border: 1px solid var(--border);
    font-family: inherit; transition: all 0.15s; white-space: nowrap; height: 34px;
    background: var(--card); color: var(--text-muted);
  }
  .dl-btn-invoice:hover { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
  .dl-btn-bill:hover    { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
  .dl-btn-receipt:hover { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
  .dl-btn-payment:hover { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }

  /* Hamburger */
  .dl-hamburger {
    display: none; background: none; border: none;
    cursor: pointer; padding: 6px; flex-shrink: 0; z-index: 100;
  }
  .dl-hamburger span {
    display: block; width: 20px; height: 2px;
    background: var(--text-muted); margin: 4px 0; border-radius: 2px;
    transition: all 0.25s;
  }

  /* Overlay */
  .dl-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.65); z-index: 35;
  }
  .dl-overlay.open { display: block; }

  /* Mobile bottom nav */
  .mobile-bottom-nav { display: none; }

  /* ════════════════════════════════
     RESPONSIVE BREAKPOINTS
  ════════════════════════════════ */

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

  @media (max-width: 640px) {
    .dl-hamburger { display: block; }

    .dl-sidebar {
      width: 240px; min-width: 240px;
      transform: translateX(-100%);
    }
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

  @media (max-width: 380px) {
    .dl-sidebar { width: 100vw; min-width: unset; }
  }

  /* ════════════════════════════════════
     SMART THEME INJECTION
     ════════════════════════════════════ */
  .dl-main-content {
    background: var(--main-bg);
    color: var(--text);
  }

  .dl-main-content [style*="background: #fff"],
  .dl-main-content [style*="background: white"],
  .dl-main-content [style*="background:#fff"],
  .dl-main-content [style*="background:white"],
  .dl-main-content [style*="background: rgb(255,255,255)"],
  .dl-main-content [style*="background: #ffffff"],
  .dl-main-content [style*="background:#ffffff"],
  .dl-main-content [style*="background-color: #fff"],
  .dl-main-content [style*="background-color: white"],
  .dl-main-content [style*="background-color:#fff"],
  .dl-main-content [style*="background-color:white"],
  .dl-main-content .bg-white {
    background-color: var(--card) !important;
    box-shadow: var(--shadow-sm);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .dl-main-content [style*="color: #000"],
  .dl-main-content [style*="color: black"],
  .dl-main-content [style*="color:#000"],
  .dl-main-content [style*="color:black"],
  .dl-main-content [style*="color: rgb(0,0,0)"],
  .dl-main-content [style*="color: #111"],
  .dl-main-content [style*="color:#111"] {
    color: var(--text) !important;
  }

  .dl-main-content input,
  .dl-main-content select,
  .dl-main-content textarea {
    background: var(--card) !important;
    border: 1px solid var(--border) !important;
    color: var(--text) !important;
  }
  .dl-main-content input:focus,
  .dl-main-content select:focus,
  .dl-main-content textarea:focus {
    border-color: var(--primary) !important;
    outline: none !important;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
  }

  .dl-main-content table {
    background: var(--card) !important;
    color: var(--text) !important;
    border-collapse: separate;
    border-spacing: 0;
  }
  .dl-main-content table th {
    background: var(--bg-soft) !important;
    color: var(--text-muted) !important;
    border-bottom: 1px solid var(--border) !important;
    padding: 12px 16px;
  }
  .dl-main-content table td {
    border-bottom: 1px solid var(--border) !important;
    background: var(--card) !important;
    color: var(--text) !important;
    padding: 12px 16px;
  }
  .dl-main-content tr:hover td {
    background: var(--card-hover) !important;
  }

  .dl-main-content button:not([class*="dl-"]):not([class*="oa-"]) {
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 16px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .dl-main-content button:not([class*="dl-"]):not([class*="oa-"]):hover {
    background: var(--primary);
    color: var(--primary-text);
    border-color: var(--primary);
  }

  .dl-main-content label {
    color: var(--text-muted);
    font-weight: 500;
  }
`

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getUserCompany()

  if (!tenant) {
    return (
      <html lang="en">
        <body style={{ margin: 0, background: '#0B1120', color: '#E2E8F0', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>No Company Linked</h1>
            <p style={{ color: '#94A3B8', marginBottom: 16 }}>Your account is not linked to a company. Please contact your administrator.</p>
            <a href="/login" style={{ color: '#60A5FA', fontSize: 14 }}>← Back to login</a>
          </div>
        </body>
      </html>
    )
  }

  const email   = tenant.email
  const initial = email.charAt(0).toUpperCase()

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

        {/* ── Feature‑aware Sidebar ── */}
        <DashboardSidebar
          email={email}
          initial={initial}
          logoUrl={tenant.companyLogo}
          companyName={tenant.companyName}
          companyTagline={tenant.companyTagline}
        />

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