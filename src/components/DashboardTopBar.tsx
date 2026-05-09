"use client"

import { usePathname } from "next/navigation"

export default function DashboardTopBar({ email, greeting }: { email: string; greeting: string }) {
  const pathname = usePathname()
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/"

  // On the dashboard: only a floating hamburger – no white space
  if (isDashboard) {
    return (
      <div style={{ position: "fixed", top: 8, left: 8, zIndex: 50 }}>
        <button
          className="dl-hamburger"
          id="dl-hamburger"
          aria-label="Open menu"
          style={{ padding: 8, margin: 0 }}
        >
          <span /><span /><span />
        </button>
      </div>
    )
  }

  // Other pages: normal top bar
  return (
    <header className="dl-topbar">
      <button className="dl-hamburger" id="dl-hamburger" aria-label="Open menu" style={{ marginRight: 8 }}>
        <span /><span /><span />
      </button>

      <img
        src="/logo.png"
        alt="Logo"
        style={{ width: 28, height: 28, borderRadius: 8, objectFit: "contain", marginRight: 8 }}
      />
      <div className="dl-topbar-greeting">
        <div className="dl-topbar-title">
          👋 {greeting}, {email.split("@")[0]}!
        </div>
        <div className="dl-topbar-subtitle">
          Here's what's happening with your business today
        </div>
      </div>
      <div className="dl-topbar-actions">
        <a href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice">
          <span>🧾</span> New Invoice
        </a>
        <a href="/dashboard/bills/new" className="dl-action-btn dl-btn-bill">
          <span>📦</span> New Bill
        </a>
        <a href="/dashboard/receipts/new" className="dl-action-btn dl-btn-receipt">
          <span>💰</span> Receipt
        </a>
        <a href="/dashboard/payments/new" className="dl-action-btn dl-btn-payment">
          <span>💳</span> Payment
        </a>
      </div>
    </header>
  )
}