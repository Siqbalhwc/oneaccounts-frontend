"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { createBrowserClient } from "@supabase/ssr"
import { Bell } from "lucide-react"
import SidebarClient from "./sidebar-client"

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/"

  const [userEmail, setUserEmail] = useState("")
  const [greetingTime, setGreetingTime] = useState("Good evening")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

  // ── Get logged‑in user ──────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email) {
        setUserEmail(user.email)
      }
    })
  }, [])

  // ── Set greeting ────────────────────────────────────
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreetingTime("Good morning")
    else if (hour < 18) setGreetingTime("Good afternoon")
    else setGreetingTime("Good evening")
  }, [])

  // ── Hamburger menu ──────────────────────────────────
  const toggleSidebar = useCallback(() => {
    if (window.innerWidth <= 640) {
      setSidebarOpen(prev => !prev)
      setOverlayOpen(prev => !prev)
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 640) {
        setSidebarOpen(false)
        setOverlayOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const closeSidebar = () => {
    setSidebarOpen(false)
    setOverlayOpen(false)
  }

  return (
    <div className="dl-shell">
      {/* Sidebar */}
      <SidebarClient email={userEmail} sidebarOpen={sidebarOpen} closeSidebar={closeSidebar} />

      {/* Overlay for mobile */}
      <div className={`dl-overlay ${overlayOpen ? "open" : ""}`} onClick={closeSidebar} />

      <div className="dl-main">
        <header className="dl-topbar">
          <button className="dl-hamburger" id="dl-hamburger" aria-label="Open menu" onClick={toggleSidebar}>
            <span></span><span></span><span></span>
          </button>

          <img alt="Logo" src="/logo.png" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "contain", marginRight: 8 }} />

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