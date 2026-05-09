"use client"

import { usePathname } from "next/navigation"

export default function TopBarContent({ email, greeting }: { email: string; greeting: string }) {
  const pathname = usePathname()
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/"

  return (
    <>
      {!isDashboard && (
        <>
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
        </>
      )}
    </>
  )
}