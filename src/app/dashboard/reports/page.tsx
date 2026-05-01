"use client"

import { useRouter } from "next/navigation"
import { Scale, TrendingUp, BarChart3, BookOpen, Users, Truck, Calendar, FileText } from "lucide-react"

export default function ReportsPage() {
  const router = useRouter()

  const reports = [
    { title: "Trial Balance",        desc: "Debits must equal Credits",           icon: <Scale size={24} />,       href: "/dashboard/reports/trial-balance",  color: "#1D4ED8" },
    { title: "General Ledger",       desc: "Transaction history by account",       icon: <BookOpen size={24} />,     href: "/dashboard/reports/ledger",          color: "#0EA5E9" },
    { title: "Profit & Loss",        desc: "Revenue - Expenses = Net Profit",      icon: <TrendingUp size={24} />,    href: "/dashboard/reports/profit-loss",     color: "#10B981" },
    { title: "Balance Sheet",        desc: "Assets = Liabilities + Equity",        icon: <BarChart3 size={24} />,     href: "/dashboard/reports/balance-sheet",   color: "#8B5CF6" },
    { title: "Customer Ledger",      desc: "Full transaction history by customer", icon: <Users size={24} />,         href: "/dashboard/reports/customer-ledger", color: "#1D4ED8" },
    { title: "Supplier Ledger",      desc: "Full transaction history by supplier", icon: <Truck size={24} />,         href: "/dashboard/reports/supplier-ledger", color: "#8B5CF6" },
    { title: "AR Aging Report",      desc: "Accounts Receivable aging analysis",   icon: <Calendar size={24} />,      href: "/dashboard/reports/ar-aging",        color: "#F59E0B" },
    { title: "AP Aging Report",      desc: "Accounts Payable aging analysis",     icon: <Calendar size={24} />,      href: "/dashboard/reports/ap-aging",        color: "#EF4444" },
    { title: "Invoice Print",        desc: "Print or share invoice via WhatsApp",  icon: <FileText size={24} />,      href: "/dashboard/invoices",               color: "#10B981" },
  ]

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: "0 0 4px" }}>📈 Reports</h1>
      <p style={{ color: "#94A3B8", fontSize: 13, marginBottom: 24 }}>Financial reports and analysis</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {reports.map(r => (
          <div key={r.title} onClick={() => router.push(r.href)}
            style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", borderTop: `3px solid ${r.color}`, padding: "20px 18px", cursor: "pointer", transition: "box-shadow 0.15s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 18px rgba(0,0,0,0.08)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "none"}>
            <div style={{ color: r.color, marginBottom: 12 }}>{r.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", margin: "0 0 4px" }}>{r.title}</h3>
            <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>{r.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}