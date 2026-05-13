"use client"

import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, FileText, Receipt, CreditCard, Menu,
} from "lucide-react"

const links = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Invoices",  href: "/dashboard/invoices",  icon: FileText },
  { label: "Bills",     href: "/dashboard/bills",     icon: Receipt },
  { label: "Payments",  href: "/dashboard/payments",  icon: CreditCard },
  { label: "More",      href: "#more",                icon: Menu },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        background: "white",
        borderTop: "1px solid #d6e0eb",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        zIndex: 50,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {links.map((link) => {
        const isActive = link.href === "#more"
          ? ["/dashboard/settings", "/dashboard/admin", "/dashboard/accounts", "/dashboard/journal"].some((p) => pathname.startsWith(p))
          : pathname.startsWith(link.href) || (link.href === "/dashboard" && pathname === "/dashboard")
        return (
          <button
            key={link.label}
            onClick={() => {
              if (link.href === "#more") {
                router.push("/dashboard/settings") // fallback to settings
              } else {
                router.push(link.href)
              }
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              color: isActive ? "#1e3a8a" : "#64748b",
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
            }}
          >
            <link.icon size={20} />
            <span>{link.label}</span>
          </button>
        )
      })}
    </nav>
  )
}