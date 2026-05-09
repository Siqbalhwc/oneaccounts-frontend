"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { createBrowserClient } from "@supabase/ssr"
import { User, LayoutDashboard, Users, Building2, ShoppingCart, FileText, 
  CreditCard, Banknote, ArrowLeftRight, Package, Settings, ChevronDown, 
  ChevronRight, Bell } from "lucide-react"

// ... (all existing interfaces and helper functions remain unchanged)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/"
  const router = useRouter()   // if already imported, keep it

  // ... (keep all existing state, useEffect, etc. completely unchanged)

  return (
    <div className="dl-shell">
      {/* ... (sidebar code unchanged) ... */}

      <div className="dl-main">
        <header className="dl-topbar">
          <button className="dl-hamburger" id="dl-hamburger" aria-label="Open menu">
            <span></span><span></span><span></span>
          </button>

          <img alt="Logo" src="data:image/png;base64,..." style={{ width: 24, height: 24, ... }} />

          <div className="dl-topbar-greeting">
            <div className="dl-topbar-title">👋 Good evening, siqbalhwc!</div>
            <div className="dl-topbar-subtitle">Here's what's happening with your business today</div>
          </div>

          {/* Notification bell (if any) */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <button style={{ ... }}><Bell size={16} /></button>
            </div>
          </div>

          {/* ── Action buttons – only shown when NOT on the main dashboard ── */}
          {!isDashboard && (
            <div className="dl-topbar-actions">
              <Link href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice">
                <span>🧾</span> New Invoice
              </Link>
              <Link href="/dashboard/bills/new" className="dl-action-btn dl-btn-bill">
                <span>📦</span> New Bill
              </Link>
              <Link href="/dashboard/receipts/new" className="dl-action-btn dl-btn-receipt">
                <span>💰</span> Receipt
              </Link>
              <Link href="/dashboard/payments/new" className="dl-action-btn dl-btn-payment">
                <span>💳</span> Payment
              </Link>
            </div>
          )}
        </header>

        <div className="dl-main-inner">
          {children}
        </div>
      </div>
    </div>
  )
}