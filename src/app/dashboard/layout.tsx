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

  /* ── Sidebar – 208 px, fixed, no hover expansion ── */
  .dl-sidebar {
    width: 208px; min-width: 208px;
    background: #0F172A;
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    transition: none; overflow: hidden;
    border-right: 1px solid #1E293B;
  }
  .dl-sidebar:hover { width: 208px; }

  .dl-sidebar-logo { display: flex; align-items: center; gap: 10px; padding: 20px 18px; border-bottom: 1px solid #1E293B; min-height: 68px; }
  .dl-sidebar-logo-img { width: 40px; height: 40px; border-radius: 12px; object-fit: contain; flex-shrink: 0; }
  .dl-sidebar-logo-name { color: white; font-size: 15px; font-weight: 700; line-height: 1.2; }
  .dl-sidebar-logo-sub { color: #64748B; font-size: 10px; }

  .dl-section-btn {
    display: flex; align-items: center; gap: 8px; padding: 10px 16px;
    background: none; border: none; color: #94A3B8; font-size: 12px;
    font-weight: 600; cursor: pointer; width: 100%; text-align: left;
    font-family: inherit; border-radius: 10px; transition: all 0.2s;
  }
  .dl-section-btn:hover { background: rgba(255,255,255,0.04); color: white; }
  .dl-section-content { padding-left: 12px; margin-top: 4px; margin-bottom: 8px; }

  .dl-sidebar-nav { flex: 1; padding: 12px 10px; overflow-y: auto; }

  .dl-nav-section {
    padding: 12px 16px 6px; color: #64748B;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em;
  }
  .dl-nav-group-label {
    padding: 6px 16px 2px; color: #475569;
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .dl-nav-item {
    display: flex; align-items: center; gap: 10px; padding: 9px 16px;
    border-radius: 10px; color: #94A3B8; font-size: 13px; font-weight: 500;
    text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
  }
  .dl-nav-item:hover { background: rgba(255,255,255,0.04); color: white; }
  .dl-nav-item.active { background: rgba(37,99,235,0.15); color: white; font-weight: 600; border-left: 3px solid #2563EB; }
  .dl-nav-icon { width: 20px; text-align: center; flex-shrink: 0; }
  .dl-nav-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 8px 16px; }

  .dl-sidebar-user { padding: 16px; border-top: 1px solid #1E293B; display: flex; align-items: center; gap: 10px; }
  .dl-sidebar-avatar { width: 36px; height: 36px; border-radius: 50%; background: #1E293B; color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
  .dl-sidebar-email { color: #94A3B8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-sidebar-signout { color: #64748B; font-size: 10px; cursor: pointer; background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px; }
  .dl-sidebar-signout:hover { color: #EF4444; }

  /* ── Main area ── */
  .dl-main { flex: 1; margin-left: 208px; display: flex; flex-direction: column; min-height: 100vh; min-width: 0; overflow-x: hidden; background: #0B1120; }
  .dl-main-content { flex: 1; background: #0B1120; }

  /* Top bar — force dark background and correct text colors */
  .dl-topbar {
    background: #0F172A !important;
    border-bottom: 1px solid #1E293B !important;
    padding: 0 24px; display: flex; align-items: center; min-height: 64px; gap: 16px;
    position: sticky; top: 0; z-index: 30;
  }
  .dl-topbar * {
    color: #E2E8F0 !important;
  }
  /* Keep the greeting title and subtitle exactly as we want */
  .dl-topbar .dl-topbar-title {
    color: #F1F5F9 !important;
  }
  .dl-topbar .dl-topbar-subtitle {
    color: #94A3B8 !important;
  }
  /* Fix filter headings (like "Filter") inside top bar */
  .dl-topbar .filter-heading,
  .dl-topbar .filter-label,
  .dl-topbar label {
    color: #64748B !important;
  }
  .dl-topbar input, .dl-topbar select {
    background: #1E293B !important;
    border-color: #334155 !important;
    color: #F1F5F9 !important;
  }
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

  @media (max-width: 640px) {
    .dl-sidebar { transform: translateX(-208px); width: 260px; min-width: 260px; }
    .dl-sidebar.mobile-open { transform: translateX(0); }
    .dl-sidebar.mobile-open .dl-sidebar-logo-name, .dl-sidebar.mobile-open .dl-sidebar-logo-sub,
    .dl-sidebar.mobile-open .dl-nav-section, .dl-sidebar.mobile-open .dl-nav-group-label,
    .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar.mobile-open .dl-sidebar-email, .dl-sidebar.mobile-open .dl-sidebar-signout { display: block; }
    .dl-sidebar.mobile-open .dl-sidebar-logo { justify-content: flex-start; padding: 20px 18px; }
    .dl-sidebar.mobile-open .dl-nav-item { justify-content: flex-start; padding: 9px 16px; }
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

  /* ══════════════════ GLOBAL DARK THEME – FINAL OVERRIDES ══════════════════ */

  /* 1. Absolute base */
  body, .dl-shell, .dl-main, .dl-main-content,
  .dl-main-content > div {
    background: #0B1120 !important;
  }

  /* 2. Remove ALL white/light backgrounds */
  [style*="background: white"],
  [style*="background: #fff"],
  [style*="background: #ffffff"],
  [style*="background: #f8f9fa"],
  [style*="background: #f1f5f9"],
  [style*="background: #EFF4FB"],
  [style*="background: #F8FAFC"],
  [style*="background: #F4F6FB"],
  [style*="background: #FAFBFF"],
  [style*="background: rgb(255, 255, 255)"],
  [style*="background: rgba(255, 255, 255"] {
    background: #111827 !important;
  }

  /* 3. Cards & containers */
  .card, .tb-card, .inv-card, .pay-card, .ac-card, .form-card,
  .log-table, .tb-summary-item,
  .kpi-card, [class*="kpi-card"],
  .crm-card, .crm-section, .crm-item {
    background: #111827 !important;
    border: 1px solid #1E293B !important;
    color: #E2E8F0 !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
  }

  /* 4. All inputs, selects, textareas */
  input, select, textarea,
  .input, .filter-select, .pay-input, .inv-input, .ac-search,
  .inv-select, .pay-select, .filter-select, .input-budget {
    background: #1E293B !important;
    border-color: #334155 !important;
    color: #F1F5F9 !important;
  }
  input:focus, select:focus, textarea:focus,
  .input:focus, .filter-select:focus, .pay-input:focus, .inv-input:focus,
  .ac-search:focus, .inv-select:focus, .pay-select:focus {
    border-color: #2563EB !important;
    outline: none !important;
  }
  ::placeholder { color: #64748B !important; }

  /* 5. Buttons */
  button, .btn {
    font-family: inherit;
  }
  .btn-primary, a.btn-primary, button.btn-primary {
    background: #2563EB !important;
    color: white !important;
    border: 1px solid #2563EB !important;
  }
  .btn-outline {
    background: transparent !important;
    border: 1.5px solid #334155 !important;
    color: #CBD5E1 !important;
  }
  .btn-primary:hover, a.btn-primary:hover, button.btn-primary:hover {
    background: #1D4ED8 !important;
  }

  /* 6. Labels */
  .label, .pay-label, .inv-label, .ac-label, .tb-label {
    color: #64748B !important;
  }

  /* 7. Tables */
  table, .table {
    background: #111827 !important;
    color: #E2E8F0 !important;
  }
  table th, .table th {
    background: #1E293B !important;
    color: #94A3B8 !important;
    border-color: #1E293B !important;
  }
  table td, .table td {
    border-color: #1E293B !important;
    background: #111827 !important;
    color: #E2E8F0 !important;
  }
  .row-header, .tb-table-header, .ac-header, .journal-header,
  .log-row-header {
    background: #1E293B !important;
  }
  .row, .tb-row, .ac-row, .journal-row {
    background: #111827 !important;
    border-bottom: 1px solid #1E293B !important;
  }
  .row:hover, .tb-row:hover, .ac-row:hover, .journal-row:hover {
    background: #1E293B !important;
  }

  /* 8. Headings – all pages */
  .dl-main-content h1, .dl-main-content h2, .dl-main-content h3,
  .dl-main-content h4, .dl-main-content h5, .dl-main-content h6,
  h1, h2, h3, h4, h5, h6 {
    color: #F1F5F9 !important;
  }

  /* 9. Alert / Overspent Banner – ensure dark background + themed button */
  .overspent-banner, .alert-banner, [class*="alert-banner"] {
    background: #1E293B !important;
    border-left: 4px solid #2563EB !important;
    color: #FCA5A5 !important; /* red text for overspent */
  }
  .overspent-banner a, .overspent-banner button,
  .alert-banner a, .alert-banner button,
  .view-overspent-btn, a.view-overspent {
    background: #2563EB !important;
    color: white !important;
    border-radius: 8px;
    padding: 8px 16px;
    border: none !important;
    font-weight: 600;
    text-decoration: none;
  }

  /* 10. KPI cards – fix sub‑texts */
  .kpi-card .kpi-title, .kpi-card .kpi-label,
  .kpi-card h4, .kpi-card span,
  .kpi-value, .kpi-amount {
    color: #E2E8F0 !important;
  }
  .kpi-card .kpi-subtext,
  .kpi-card .kpi-hint,
  .kpi-card .minor-text,
  .kpi-card .small-text {
    color: #94A3B8 !important;
  }
  /* Ensure red/green colors for percentages */
  .kpi-card .kpi-value[style*="color: #EF4444"] {
    color: #EF4444 !important;
  }
  .kpi-card .kpi-value[style*="color: #10B981"] {
    color: #10B981 !important;
  }

  /* 11. Project Utilization & Donor Balance inner rows */
  .project-row, .donor-row, .utilization-row,
  .project-table tr, .donor-table tr,
  .utilization-table tr {
    background: #111827 !important;
    color: #E2E8F0 !important;
  }
  .project-row td, .donor-row td,
  .project-table td, .donor-table td,
  .utilization-table td {
    background: #111827 !important;
    border-bottom: 1px solid #1E293B !important;
  }

  /* 12. CRM heading & inner cards */
  .crm-heading, .crm-section-heading,
  .crm-card .crm-heading {
    color: #F1F5F9 !important;
    background: #111827 !important;
    border-bottom: 1px solid #1E293B;
  }
  .crm-card .crm-item, .crm-card .customer-row,
  .crm-card .supplier-row, .crm-card .investor-row {
    background: #111827 !important;
    color: #E2E8F0 !important;
    border: 1px solid #1E293B !important;
  }

  /* 13. Bottom bar (portfolio health / summary) */
  .mobile-bottom-nav,
  .dashboard-summary,
  .portfolio-summary,
  .bottom-summary {
    background: #0F172A !important;
    border-top: 1px solid #1E293B !important;
    color: #E2E8F0 !important;
  }
  .mobile-bottom-nav a, .mobile-bottom-nav span,
  .dashboard-summary a, .dashboard-summary span,
  .portfolio-summary a, .portfolio-summary span,
  .bottom-summary a, .bottom-summary span {
    color: #E2E8F0 !important;
  }
  /* Specific text like “⚠️ Portfolio Health: Needs Attention” */
  .portfolio-status-text,
  .health-status-text,
  .summary-text {
    color: #FCA5A5 !important; /* red for warning */
  }

  /* 14. List view status columns – dark background, preserve badge colors */
  .status-badge, .badge {
    background: #1E293B !important;
    color: #F1F5F9 !important;
  }

  /* 15. All action links (new invoice, etc.) already covered by btn-primary */

  /* 16. Remove any remaining old dark text that is unreadable */
  span, p, a, li, td, th, label {
    color: inherit;
  }

  /* 17. Ensure all icons and generic text inside cards is light */
  .card *, .card *::before, .card *::after,
  .kpi-card *, .crm-card * {
    color: inherit !important;
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