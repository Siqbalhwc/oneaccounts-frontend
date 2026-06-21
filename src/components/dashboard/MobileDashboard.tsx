"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"

function formatPKR(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `PKR ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `PKR ${(abs / 1_000).toFixed(1)}K`
  return `PKR ${abs.toLocaleString()}`
}

export default function MobileDashboard({
  role,
  businessType,
}: {
  role: string
  businessType: string
}) {
  const router = useRouter()
  const { companyId } = useCompany()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [greeting, setGreeting] = useState("")
  const [userName, setUserName] = useState("")
  const [loading, setLoading] = useState(true)
  const [revenueTotal, setRevenueTotal] = useState(0)
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [cashBalance, setCashBalance] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening")

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName(
          (user.user_metadata as any)?.full_name ||
            (user.user_metadata as any)?.name ||
            user.email?.split("@")[0] ||
            "User"
        )
      }
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    const fetchData = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase.rpc("get_dashboard_metrics", {
          p_company_id: companyId,
          p_date_from: null,
          p_date_to: null,
        })

        if (!error && data) {
          setRevenueTotal(data.revenueTotal || 0)
          setExpenseTotal(data.expenseTotal || 0)
          setCashBalance(data.cashBalance || 0)
          setTotalReceivables(data.totalReceivables || 0)
          setTotalPayables(data.totalPayables || 0)
        }
      } catch (err) {
        console.error("Mobile dashboard fetch error:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [companyId])

  const grossProfit = revenueTotal - expenseTotal

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--text-muted)",
          background: "var(--bg)",
          minHeight: "100vh",
        }}
      >
        Loading dashboard…
      </div>
    )
  }

  return (
    <div
      style={{
        background: "var(--bg)",
        minHeight: "100vh",
        padding: "16px",
        paddingBottom: "80px",
        fontFamily: "'Inter', sans-serif",
        color: "var(--text)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text)" }}>
          {greeting}, {userName}
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {businessType === "trading" ? "Trading Dashboard" : "Service Dashboard"}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          marginBottom: 16,
        }}
      >
        {[
          { label: "Revenue", value: formatPKR(revenueTotal), color: "#10B981" },
          { label: "Expenses", value: formatPKR(expenseTotal), color: "#EF4444" },
          {
            label: "Gross Profit",
            value: formatPKR(grossProfit),
            color: grossProfit >= 0 ? "#10B981" : "#EF4444",
          },
          { label: "Cash & Bank", value: formatPKR(cashBalance), color: "#A78BFA" },
          { label: "Receivables", value: formatPKR(totalReceivables), color: "#F97316" },
          { label: "Payables", value: formatPKR(totalPayables), color: "#EF4444" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "12px 10px",
            }}
          >
            <div
              style={{
                fontSize: "0.6rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 2,
              }}
            >
              {kpi.label}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick actions as 3×2 grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "10px",
          marginBottom: 20,
        }}
      >
        {[
          { label: "New Invoice", icon: "➕", href: "/dashboard/invoices/new" },
          { label: "New Bill", icon: "📦", href: "/dashboard/bills/new" },
          { label: "Receive Payment", icon: "💰", href: "/dashboard/receipts/new" },
          { label: "Record Payment", icon: "💳", href: "/dashboard/payments/new" },
          { label: "Add Customer", icon: "👤", href: "/dashboard/customers/new" },
          { label: "Add Supplier", icon: "🚚", href: "/dashboard/suppliers/new" },
        ].map((action) => (
          <div
            key={action.label}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 6px",
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => router.push(action.href)}
          >
            <div style={{ fontSize: "1.1rem", marginBottom: 2 }}>{action.icon}</div>
            <div
              style={{
                fontSize: "0.62rem",
                fontWeight: 600,
                color: "var(--text)",
                lineHeight: 1.2,
              }}
            >
              {action.label}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Note */}
      <div
        style={{
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          textAlign: "center",
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}
      >
        OneAccounts · {businessType === "trading" ? "Trading" : "Service"} Dashboard
      </div>
    </div>
  )
}