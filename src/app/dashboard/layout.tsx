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

  /* ── Sidebar – slim 60px, expands on hover ── */
  .dl-sidebar {
    width: 60px; min-width: 60px;
    background: #0F172A;
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    transition: width 0.25s ease; overflow: hidden;
    border-right: 1px solid #1E293B;
  }
  .dl-sidebar:hover {
    width: 260px;
  }

  /* Hide text when collapsed */
  .dl-sidebar:not(:hover) .dl-sidebar-logo-name,
  .dl-sidebar:not(:hover) .dl-sidebar-logo-sub,
  .dl-sidebar:not(:hover) .dl-section-btn span,
  .dl-sidebar:not(:hover) .dl-nav-group-label,
  .dl-sidebar:not(:hover) .dl-nav-item span:not(.dl-nav-icon),
  .dl-sidebar:not(:hover) .dl-sidebar-email,
  .dl-sidebar:not(:hover) .dl-sidebar-signout {
    display: none;
  }

  /* Center icons when collapsed */
  .dl-sidebar:not(:hover) .dl-section-btn {
    justify-content: center;
    padding: 10px 0;
  }
  .dl-sidebar:not(:hover) .dl-sidebar-logo {
    justify-content: center;
    padding: 14px 0;
  }
  .dl-sidebar:not(:hover) .dl-nav-item {
    justify-content: center;
    padding: 10px 0;
  }
  .dl-sidebar:not(:hover) .dl-sidebar-user {
    justify-content: center;
  }

  /* Logo (expanded) */
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
  .dl-main { flex: 1; margin-left: 60px; display: flex; flex-direction: column; min-height: 100vh; min-width: 0; overflow-x: hidden; background: #0B1120; }
  .dl-main-content { flex: 1; }

  .dl-topbar { background: #0F172A; border-bottom: 1px solid #1E293B; padding: 0 24px; display: flex; align-items: center; min-height: 64px; gap: 16px; position: sticky; top: 0; z-index: 30; }
  .dl-topbar-greeting { flex: 1; min-width: 0; }
  .dl-topbar-title { font-size: 14px; font-weight: 700; color: #F1F5F9; line-height: 1.2; }
  .dl-topbar-subtitle { font-size: 11px; color: #64748B; line-height: 1.2; }
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
    .dl-sidebar { transform: translateX(-60px); width: 260px; min-width: 260px; }
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

  /* ── Global dark theme for all internal pages ── */
  /* These classes are used by your reports, forms, and lists. */
  .card {
    background: #111827 !important;
    border: 1px solid #1E293B !important;
    color: #E2E8F0 !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
  }
  .input, .filter-select, select.input, input.input, .pay-input, .inv-input, .ac-search {
    background: #1E293B !important;
    border-color: #334155 !important;
    color: #F1F5F9 !important;
  }
  .input:focus, .filter-select:focus, .pay-input:focus, .inv-input:focus, .ac-search:focus {
    border-color: #2563EB !important;
    outline: none !important;
  }
  .btn-primary {
    background: #2563EB !important;
    color: white !important;
  }
  .btn-outline {
    background: transparent !important;
    border: 1.5px solid #334155 !important;
    color: #CBD5E1 !important;
  }
  .label, .pay-label, .inv-label, .ac-label {
    color: #64748B !important;
  }
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
  }
  .row-header, .tb-table-header, .ac-header {
    background: #1E293B !important;
  }
  .row, .tb-row, .ac-row {
    background: #111827 !important;
    border-bottom: 1px solid #1E293B !important;
  }
  .row:hover, .tb-row:hover, .ac-row:hover {
    background: #1E293B !important;
  }
  /* Fix white backgrounds on summary cards */
  .tb-summary-item, .tb-card, .inv-card, .pay-card, .ac-card, .form-card {
    background: #111827 !important;
    border-color: #1E293B !important;
  }
  /* Ensure text inside these cards is visible */
  .tb-summary-item *, .tb-card *, .inv-card *, .pay-card *, .ac-card *, .form-card * {
    color: inherit !important;
  }
`

// ── Navigation structure (unchanged) ──
const navSections = [ /* ... keep exactly as before ... */ ]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  /* ... keep exactly as before ... */
}