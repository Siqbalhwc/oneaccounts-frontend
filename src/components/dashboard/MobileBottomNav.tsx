"use client"

import { usePathname, useRouter } from "next/navigation"
import { Home, FileText, ShoppingCart, CreditCard, Menu } from "lucide-react"

interface MobileBottomNavProps {
  onMenuClick: () => void
}

export default function MobileBottomNav({ onMenuClick }: MobileBottomNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const navItems = [
    { label: "Dashboard", icon: Home, href: "/dashboard" },
    { label: "Invoices", icon: FileText, href: "/dashboard/invoices" },
    { label: "Bills", icon: ShoppingCart, href: "/dashboard/bills" },
    { label: "Payments", icon: CreditCard, href: "/dashboard/payments" },
    { label: "Menu", icon: Menu, onClick: onMenuClick },
  ]

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--card)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        padding: "8px 12px",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        zIndex: 900,
      }}
    >
      {navItems.map((item) => {
        const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + "/") : false
        const Icon = item.icon
        const color = isActive ? "var(--primary)" : "var(--text-muted)"

        return (
          <div
            key={item.label}
            onClick={() => {
              if (item.onClick) item.onClick()
              else if (item.href) router.push(item.href)
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2px",
              cursor: "pointer",
              padding: "4px 12px",
              borderRadius: "8px",
              transition: "background 0.15s",
            }}
          >
            <Icon size={20} color={color} strokeWidth={isActive ? 2 : 1.5} />
            <span style={{ fontSize: "10px", fontWeight: isActive ? 600 : 400, color }}>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}