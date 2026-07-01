// app/dashboard/layout.tsx
import { getUserCompany } from '@/lib/get-user-company'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import DashboardLayoutClient from '@/components/dashboard/DashboardLayoutClient'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font-family); }

  /* Shell */
  .dl-shell { display: flex; min-height: 100vh; background: var(--shell-bg); }

  /* ── Sidebar base – only structural rules, no visual overrides ── */
  .dl-sidebar {
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    overflow: hidden;
  }

  .dl-sidebar-logo-img { width: 34px; height: 34px; border-radius: 9px; object-fit: contain; flex-shrink: 0; }
  .dl-sidebar-nav { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .dl-sidebar-nav::-webkit-scrollbar { width: 4px; }
  .dl-sidebar-nav::-webkit-scrollbar-track { background: transparent; }
  .dl-sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
  .dl-nav-icon { width: 18px; text-align: center; flex-shrink: 0; font-size: 14px; }

  /* ── Main area ── */
  .dl-main {
    flex: 1;
    display: flex; flex-direction: column;
    min-height: 100vh; min-width: 0;
    overflow-x: hidden;
    background: var(--main-bg);
    /* Expanded: 240px (sidebar) + 6px (left margin) + 0px (right gap) = 246px */
    margin-left: 246px;
    transition: margin-left 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  /* Collapsed: 68px (sidebar) + 6px + 0px = 74px */
  html[data-sidebar-collapsed="true"] .dl-main {
    margin-left: 74px !important;
  }

  .dl-main-content { flex: 1; display: flex; flex-direction: column; }

  /* ── Hamburger ── */
  .dl-hamburger {
    display: none; background: none; border: none;
    cursor: pointer; padding: 6px; flex-shrink: 0; z-index: 100;
  }
  .dl-hamburger span {
    display: block; width: 20px; height: 2px;
    background: var(--text-muted); margin: 4px 0; border-radius: 2px;
    transition: all 0.25s;
  }
  .dl-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 35; }
  .dl-overlay.open { display: block; }
  .mobile-bottom-nav { display: none; }

  /* ════════════════════════════════
     RESPONSIVE BREAKPOINTS
  ════════════════════════════════ */

  @media (max-width: 960px) {
    .dl-sidebar { width: 68px !important; min-width: 68px !important; }
    .dl-main { margin-left: 74px; }
    .dl-sidebar-logo-name,
    .dl-sidebar-logo-sub,
    .dl-section-label,
    .dl-nav-group-label,
    .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar-email,
    .dl-sidebar-signout { display: none !important; }
    .dl-nav-item { justify-content: center; padding: 0; height: 44px; }
  }

  @media (max-width: 640px) {
    .dl-hamburger { display: block; }
    .dl-sidebar {
      width: 240px !important; min-width: 240px !important;
      transform: translateX(-100%);
    }
    .dl-sidebar.mobile-open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,0.5); }
    .dl-sidebar.mobile-open .dl-sidebar-logo-name,
    .dl-sidebar.mobile-open .dl-sidebar-logo-sub,
    .dl-sidebar.mobile-open .dl-section-label,
    .dl-sidebar.mobile-open .dl-nav-group-label,
    .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar.mobile-open .dl-sidebar-email,
    .dl-sidebar.mobile-open .dl-sidebar-signout { display: block !important; }
    .dl-main { margin-left: 0; padding-bottom: 64px; }
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

  // ✅ Server‑side trial check — uses the service‑role key to bypass RLS
  try {
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: settings } = await serviceSupabase
      .from("company_settings")
      .select("trial_ends_at, plan_id")
      .eq("company_id", tenant.companyId)
      .maybeSingle()

    if (settings) {
      const trialEnd = settings.trial_ends_at ? new Date(settings.trial_ends_at) : null
      const hasPlan = settings.plan_id !== null

      if (!hasPlan && trialEnd && trialEnd < new Date()) {
        // Read the pathname set by our middleware (must await headers())
        const heads = await headers()
        const pathname = heads.get('x-pathname') || ''
        if (pathname !== '/dashboard/upgrade') {
          redirect('/dashboard/upgrade')
        }
      }
    }
  } catch {
    // If the check fails, allow access — never lock users out due to a DB error
  }

  const email = tenant.email
  const initial = email.charAt(0).toUpperCase()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <DashboardLayoutClient tenant={tenant} email={email} initial={initial}>
        {children}
      </DashboardLayoutClient>
    </>
  )
}