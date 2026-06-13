"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"

function formatPKR(v: number): string {
  const sign = v < 0 ? "-" : ""
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}PKR ${(abs / 1_000).toFixed(1)}K`
  return `${sign}PKR ${abs.toLocaleString()}`
}

export default function MobileDashboard({ role, businessType }: { role: string; businessType: string }) {
  const router = useRouter()
  const { companyId } = useCompany()
  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark"

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [revenueTotal, setRevenueTotal] = useState(0)
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [cashBalance, setCashBalance] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)
  const [monthlyProfit, setMonthlyProfit] = useState<{ month: string; profit: number }[]>([])
  const [userDisplayName, setUserDisplayName] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserDisplayName(
        (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || user.email?.split("@")[0] || "User"
      )
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    const fetchData = async () => {
      try {
        const { data, error } = await supabase.rpc("get_dashboard_metrics", { p_company_id: companyId })
        if (!error && data) {
          setRevenueTotal(data.revenueTotal || 0)
          setExpenseTotal(data.expenseTotal || 0)
          setCashBalance(data.cashBalance || 0)
          setTotalReceivables(data.totalReceivables || 0)
          setTotalPayables(data.totalPayables || 0)
          setMonthlyProfit(data.monthlyProfit || [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [companyId])

  const grossProfit = revenueTotal - expenseTotal
  const last6Months = monthlyProfit.slice(-6)

  if (loading) {
    return <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  return (
    <div style={{ padding: "12px 12px 70px", background: "var(--bg)", minHeight: "100vh" }}>
      {/* Compact header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>👋 {userDisplayName}</h1>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
          Profit this month: <strong style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>{formatPKR(grossProfit)}</strong>
        </p>
      </div>

      {/* Compact KPI cards – 2 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: 20 }}>
        {[
          { label: "Revenue", value: revenueTotal, color: "#10B981" },
          { label: "Expenses", value: expenseTotal, color: "#EF4444" },
          { label: "Gross Profit", value: grossProfit, color: grossProfit >= 0 ? "#10B981" : "#EF4444" },
          { label: "Cash", value: cashBalance, color: "#A78BFA" },
          { label: "Receivables", value: totalReceivables, color: "#F97316" },
          { label: "Payables", value: totalPayables, color: "#EF4444" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: "var(--card)",
              borderRadius: 12,
              padding: "12px 10px",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
            onClick={() => {
              if (kpi.label === "Revenue" || kpi.label === "Expenses" || kpi.label === "Gross Profit")
                router.push("/dashboard/reports/profit-loss")
              else if (kpi.label === "Cash") router.push("/dashboard/banking/bank-accounts")
              else if (kpi.label === "Receivables") router.push("/dashboard/customers")
              else if (kpi.label === "Payables") router.push("/dashboard/suppliers")
            }}
          >
            <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: kpi.color }}>{formatPKR(kpi.value)}</div>
          </div>
        ))}
      </div>

      {/* Quick actions as 2×2 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: 20 }}>
        {[
          { label: "New Invoice", icon: "➕", href: "/dashboard/invoices/new" },
          { label: "New Bill", icon: "📦", href: "/dashboard/bills/new" },
          { label: "Receive Payment", icon: "💰", href: "/dashboard/receipts/new" },
          { label: "Record Payment", icon: "💳", href: "/dashboard/payments/new" },
        ].map((action) => (
          <div
            key={action.label}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 8px",
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => router.push(action.href)}
          >
            <div style={{ fontSize: "1.2rem", marginBottom: 2 }}>{action.icon}</div>
            <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)" }}>{action.label}</div>
          </div>
        ))}
      </div>

      {/* Chart – last 6 months */}
      {last6Months.length > 0 && (
        <div style={{ background: "var(--card)", borderRadius: 14, padding: "12px", border: "1px solid var(--border)", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: "0.8rem", marginBottom: 8 }}>📊 Profit Trend (last 6 months)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "100px" }}>
            {last6Months.map((m, i) => {
              const maxProfit = Math.max(...last6Months.map(x => Math.abs(x.profit)), 1)
              const height = (Math.abs(m.profit) / maxProfit) * 80 + 4
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  <div
                    style={{
                      width: "100%",
                      background: m.profit >= 0 ? "#6366F1" : "#EF4444",
                      height: `${height}px`,
                      borderRadius: "4px 4px 0 0",
                    }}
                  />
                  <div style={{ fontSize: "8px", color: "var(--text-muted)" }}>{m.month}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}