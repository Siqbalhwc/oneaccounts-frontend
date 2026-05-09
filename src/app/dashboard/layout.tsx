"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { createBrowserClient } from "@supabase/ssr"
import { Bell } from "lucide-react"
import SidebarClient from "./sidebar-client"

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/"

  const [userEmail, setUserEmail] = useState("")
  const [greetingTime, setGreetingTime] = useState("Good evening")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email) {
        setUserEmail(user.email)
      }
    })
  }, [])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreetingTime("Good morning")
    else if (hour < 18) setGreetingTime("Good afternoon")
    else setGreetingTime("Good evening")
  }, [])

  return (
    <div className="dl-shell">
      {/* Sidebar – takes no props, handles everything internally */}
      <SidebarClient />

      <div className="dl-main">
        <header className="dl-topbar">
          <img
            alt="Logo"
            src="/logo.png"
            style={{ width: 28, height: 28, borderRadius: 8, objectFit: "contain", marginRight: 8 }}
          />

          <div className="dl-topbar-greeting">
            <div className="dl-topbar-title">👋 {greetingTime}, {userEmail?.split("@")[0] || "User"}!</div>
            <div className="dl-topbar-subtitle">Here's what's happening with your business today</div>
          </div>

          {/* Notification bell */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "white" }}>
                <Bell size={16} />
              </button>
            </div>
          </div>

          {/* Action buttons – only shown when NOT on the dashboard */}
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