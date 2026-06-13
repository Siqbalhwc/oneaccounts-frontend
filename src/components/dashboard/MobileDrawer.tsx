"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const router = useRouter()
  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark"

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  if (!isOpen) return null

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: "🏠" },
    { label: "Customers", href: "/dashboard/customers", icon: "👥" },
    { label: "Sales Invoices", href: "/dashboard/invoices", icon: "🧾" },
    { label: "Receipts", href: "/dashboard/receipts", icon: "💰" },
    { label: "Suppliers", href: "/dashboard/suppliers", icon: "🚚" },
    { label: "Purchase Bills", href: "/dashboard/bills", icon: "📦" },
    { label: "Purchase Orders", href: "/dashboard/purchase-orders", icon: "📋" },
    { label: "Payments", href: "/dashboard/payments", icon: "💳" },
    { label: "Bank Accounts", href: "/dashboard/banking/bank-accounts", icon: "🏦" },
    { label: "Bank Transfers", href: "/dashboard/banking/bank-transfers", icon: "↔️" },
    { label: "Products", href: "/dashboard/products", icon: "📦" },
    { label: "Stock Register", href: "/dashboard/reports/stock-register", icon: "📊" },
    { label: "Inventory Adjustments", href: "/dashboard/inventory/adjustments", icon: "⚖️" },
    { label: "Journal Entries", href: "/dashboard/journal", icon: "📓" },
    { label: "Trial Balance", href: "/dashboard/reports/trial-balance", icon: "⚖️" },
    { label: "General Ledger", href: "/dashboard/reports/general-ledger", icon: "📒" },
    { label: "Profit & Loss", href: "/dashboard/reports/profit-loss", icon: "📈" },
    { label: "Balance Sheet", href: "/dashboard/reports/balance-sheet", icon: "📋" },
    { label: "Settings", href: "/dashboard/settings", icon: "⚙️" },
  ]

  const handleNavigation = (href: string) => {
    onClose()
    router.push(href)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1000,
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "280px",
          background: "var(--card)",
          zIndex: 1001,
          boxShadow: "4px 0 20px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 800, fontSize: "1.2rem", color: "var(--text)" }}>☰ OneAccounts</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={20} />
          </button>
        </div>
        {/* Navigation items */}
        <div style={{ padding: "8px 0" }}>
          {navItems.map((item) => (
            <div
              key={item.href}
              onClick={() => handleNavigation(item.href)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                cursor: "pointer",
                transition: "background 0.15s",
                fontSize: "0.9rem",
                color: "var(--text)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: "1.2rem" }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}