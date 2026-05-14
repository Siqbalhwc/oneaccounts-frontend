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

  // Other pages: normal top bar – now dark themed
  return (
    <header
      className="dl-topbar"
      style={{
        background: "#0F172A",   // dark sidebar colour
        borderBottom: "1px solid #1E293B",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        minHeight: "64px",
        gap: "16px",
      }}
    >
      <button
        className="dl-hamburger"
        id="dl-hamburger"
        aria-label="Open menu"
        style={{ marginRight: 8 }}
      >
        <span /><span /><span />
      </button>

      <img
        src="/logo.png"
        alt="Logo"
        style={{ width: 28, height: 28, borderRadius: 8, objectFit: "contain", marginRight: 8 }}
      />
      <div className="dl-topbar-greeting" style={{ flex: 1, minWidth: 0 }}>
        <div className="dl-topbar-title" style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", lineHeight: 1.2 }}>
          👋 {greeting}, {email.split("@")[0]}!
        </div>
        <div className="dl-topbar-subtitle" style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.2 }}>
          Here's what's happening with your business today
        </div>
      </div>
      <div className="dl-topbar-actions" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <a href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice"
          style={{ background: "#1E293B", borderColor: "#334155", color: "#93C5FD" }}>
          <span>🧾</span> New Invoice
        </a>
        <a href="/dashboard/bills/new" className="dl-action-btn dl-btn-bill"
          style={{ background: "#1E293B", borderColor: "#334155", color: "#FCD34D" }}>
          <span>📦</span> New Bill
        </a>
        <a href="/dashboard/receipts/new" className="dl-action-btn dl-btn-receipt"
          style={{ background: "#1E293B", borderColor: "#334155", color: "#6EE7B7" }}>
          <span>💰</span> Receipt
        </a>
        <a href="/dashboard/payments/new" className="dl-action-btn dl-btn-payment"
          style={{ background: "#1E293B", borderColor: "#334155", color: "#FCA5A5" }}>
          <span>💳</span> Payment
        </a>
      </div>
    </header>
  )
}