// components/DashboardTopBar.tsx
"use client"
import { useRouter } from "next/navigation"

export default function DashboardTopBar({
  email,
  greeting,
}: {
  email: string
  greeting: string
}) {
  return (
    <div className="dl-topbar">
      {/* Hamburger — only visible on mobile via CSS */}
      <button className="dl-hamburger" id="dl-hamburger" aria-label="Open menu">
        <span />
        <span />
        <span />
      </button>

      <div className="dl-topbar-greeting">
        <div className="dl-topbar-title">{greeting}</div>
        <div className="dl-topbar-subtitle">{email}</div>
      </div>

      <div className="dl-topbar-actions">
        <a href="/dashboard/invoices/new"  className="dl-action-btn dl-btn-invoice">＋ Invoice</a>
        <a href="/dashboard/bills/new"     className="dl-action-btn dl-btn-bill">＋ Bill</a>
        <a href="/dashboard/receipts/new"  className="dl-action-btn dl-btn-receipt">＋ Receipt</a>
        <a href="/dashboard/payments/new"  className="dl-action-btn dl-btn-payment">＋ Payment</a>
      </div>
    </div>
  )
}