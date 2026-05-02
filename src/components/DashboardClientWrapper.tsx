"use client"

import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { PlanProvider, usePlan } from "@/contexts/PlanContext"
import SidebarClient from "@/app/dashboard/sidebar-client"

// This component is a client wrapper that provides the PlanContext
// and renders the entire dashboard layout.
export default function DashboardClientWrapper({
  children,
  enabledFeatures,
  email,
  initial,
}: {
  children: React.ReactNode
  enabledFeatures: string[]
  email: string
  initial: string
}) {
  return (
    <PlanProvider enabledFeatures={enabledFeatures}>
      <DashboardLayoutInner email={email} initial={initial}>
        {children}
      </DashboardLayoutInner>
    </PlanProvider>
  )
}

// The actual layout UI, now client component so we can use hooks
function DashboardLayoutInner({
  children,
  email,
  initial,
}: {
  children: React.ReactNode
  email: string
  initial: string
}) {
  const { hasFeature, features } = usePlan()
  const pathname = usePathname()

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // Full nav items
  const allNavItems = [
    { label: 'Dashboard',         icon: '📊', href: '/dashboard',                    section: 'MAIN',       feature: null },
    { label: 'Chart of Accounts', icon: '📋', href: '/dashboard/accounts',            section: 'MAIN',       feature: null },
    { label: 'Journal Entries',   icon: '📓', href: '/dashboard/journal',             section: 'MAIN',       feature: 'journal_entries' },
    { label: 'Sales Invoices',    icon: '🧾', href: '/dashboard/invoices',            section: 'MAIN',       feature: 'sales_invoices' },
    { label: 'Purchase Bills',    icon: '📦', href: '/dashboard/bills',               section: 'MAIN',       feature: 'purchase_bills' },
    { label: 'Receipts',          icon: '💰', href: '/dashboard/receipts',            section: 'MAIN',       feature: null },
    { label: 'Payments',          icon: '💳', href: '/dashboard/payments',            section: 'MAIN',       feature: null },
    { label: 'Bank Accounts',     icon: '🏦', href: '/dashboard/banking/bank-accounts', section: 'BANKING',  feature: null },
    { label: 'Bank Transfers',    icon: '🔄', href: '/dashboard/banking/bank-transfers', section: 'BANKING',  feature: null },
    { label: 'Customers',         icon: '👥', href: '/dashboard/customers',           section: 'CRM',         feature: null },
    { label: 'Suppliers',         icon: '🚚', href: '/dashboard/suppliers',           section: 'CRM',         feature: null },
    { label: 'Investors',         icon: '💼', href: '/dashboard/investors',           section: 'CRM',         feature: 'investors' },
    { label: 'Products',          icon: '📦', href: '/dashboard/products',            section: 'INVENTORY',   feature: null },
    { label: 'Inventory Adj.',    icon: '⚖️', href: '/dashboard/inventory/adjustments', section: 'INVENTORY', feature: 'inventory_adjustments' },
    { label: 'All Reports',       icon: '📁', href: '/dashboard/reports',             section: 'REPORTS',     feature: null },
    { label: 'Settings',          icon: '⚙️', href: '/dashboard/settings',            section: 'SYSTEM',      feature: null },
    { label: 'Admin Panel',       icon: '👑', href: '/dashboard/admin/users',         section: 'SYSTEM',      feature: null },
 { label: 'Feature Manage',    icon: '⚙️', href: '/dashboard/admin/features',      section: 'SYSTEM',      feature: null },
   { label: 'Upgrade Plan',     icon: '⭐', href: '/dashboard/upgrade',          section: 'SYSTEM',      feature: null },
  ]

  // Filter based on hasFeature (null means always visible)
  const navItems = allNavItems.filter(item => item.feature === null || hasFeature(item.feature))

  const sections = navItems.reduce((acc: Record<string, typeof navItems>, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {})

  return (
    <>
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
                    className={`dl-nav-item${item.href === pathname ? ' active' : ''}`}>
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
              {hasFeature('sales_invoices') && (
                <a href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice"><span>🧾</span> New Invoice</a>
              )}
              {hasFeature('purchase_bills') && (
                <a href="/dashboard/bills/new"    className="dl-action-btn dl-btn-bill"   ><span>📦</span> New Bill</a>
              )}
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