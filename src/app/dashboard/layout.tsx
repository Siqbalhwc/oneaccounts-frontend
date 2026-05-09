"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { createBrowserClient } from "@supabase/ssr"
import { Bell } from "lucide-react"

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/"

  const [userEmail, setUserEmail] = useState("")
  const [greetingTime, setGreetingTime] = useState("Good evening")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email) setUserEmail(user.email)
    })
  }, [])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreetingTime("Good morning")
    else if (hour < 18) setGreetingTime("Good afternoon")
    else setGreetingTime("Good evening")
  }, [])

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="dl-shell">
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="dl-overlay open" onClick={closeSidebar} />
      )}

      {/* Sidebar (always visible) */}
      <aside className={`dl-sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
        <div className="dl-sidebar-logo">
          <img src="/logo.png" alt="OneAccounts" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div>
            <div className="dl-sidebar-logo-name">OneAccounts</div>
            <div className="dl-sidebar-logo-sub">by Siqbal</div>
          </div>
        </div>

        <nav className="dl-sidebar-nav">
          <div className="dl-nav-section">MAIN</div>
          <Link href="/dashboard" className={`dl-nav-item ${pathname === "/dashboard" ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">📊</span><span>Dashboard</span>
          </Link>

          <div className="dl-nav-section">CRM</div>
          <Link href="/dashboard/customers" className={`dl-nav-item ${pathname.startsWith("/dashboard/customers") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">👥</span><span>Customers</span>
          </Link>
          <Link href="/dashboard/suppliers" className={`dl-nav-item ${pathname.startsWith("/dashboard/suppliers") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">🚚</span><span>Suppliers</span>
          </Link>

          <div className="dl-nav-section">BANKING</div>
          <Link href="/dashboard/bank-accounts" className={`dl-nav-item ${pathname.startsWith("/dashboard/bank-accounts") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">🏦</span><span>Bank Accounts</span>
          </Link>

          <div className="dl-nav-section">INVENTORY</div>
          <Link href="/dashboard/products" className={`dl-nav-item ${pathname.startsWith("/dashboard/products") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">📦</span><span>Stock Register</span>
          </Link>

          <div className="dl-nav-section">ACCOUNTING</div>
          <Link href="/dashboard/chart-of-accounts" className={`dl-nav-item ${pathname.startsWith("/dashboard/chart-of-accounts") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">📊</span><span>Chart of Accounts</span>
          </Link>
          <Link href="/dashboard/settings/budgets" className={`dl-nav-item ${pathname.startsWith("/dashboard/settings/budgets") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">💰</span><span>Budget vs Actual</span>
          </Link>
          <Link href="/dashboard/settings/projects" className={`dl-nav-item ${pathname.startsWith("/dashboard/settings/projects") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">📁</span><span>Projects & Activities</span>
          </Link>

          <div className="dl-nav-section">SYSTEM</div>
          <Link href="/dashboard/upgrade" className={`dl-nav-item ${pathname.startsWith("/dashboard/upgrade") ? "active" : ""}`} onClick={closeSidebar}>
            <span className="dl-nav-icon">⬆️</span><span>Upgrade Plan</span>
          </Link>
        </nav>

        <div className="dl-sidebar-user">
          <div className="dl-sidebar-avatar">{userEmail?.charAt(0)?.toUpperCase() || "U"}</div>
          <div>
            <div className="dl-sidebar-email">{userEmail}</div>
            <form action="/auth/signout" method="post">
              <button type="submit" className="dl-sidebar-signout">Sign Out</button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="dl-main">
        <header className="dl-topbar">
          {/* Hamburger always visible (needed to open sidebar) */}
          <button className="dl-hamburger" aria-label="Open menu" onClick={toggleSidebar}>
            <span></span><span></span><span></span>
          </button>

          {/* The rest of the top bar is hidden ONLY on the dashboard */}
          {!isDashboard && (
            <>
              <img src="/logo.png" alt="Logo" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "contain", marginRight: 8 }} />
              <div className="dl-topbar-greeting">
                <div className="dl-topbar-title">{greetingTime}, {userEmail?.split("@")[0] || "User"}!</div>
                <div className="dl-topbar-subtitle">Here's what's happening with your business today</div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "white" }}>
                  <Bell size={16} />
                </button>
              </div>
              <div className="dl-topbar-actions">
                <Link href="/dashboard/invoices/new" className="dl-action-btn dl-btn-invoice">🧾 New Invoice</Link>
                <Link href="/dashboard/bills/new" className="dl-action-btn dl-btn-bill">📦 New Bill</Link>
                <Link href="/dashboard/receipts/new" className="dl-action-btn dl-btn-receipt">💰 Receipt</Link>
                <Link href="/dashboard/payments/new" className="dl-action-btn dl-btn-payment">💳 Payment</Link>
              </div>
            </>
          )}
        </header>

        <div className="dl-main-inner" style={{ padding: isDashboard ? 0 : undefined }}>
          {children}
        </div>
      </div>
    </div>
  )
}