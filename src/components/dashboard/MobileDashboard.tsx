"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"

interface MonthlyProfit {
  month: string
  profit: number
}

function formatPKR(v: number): string {
  const sign = v < 0 ? "-" : ""
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}PKR ${(abs / 1_000).toFixed(1)}K`
  return `${sign}PKR ${abs.toLocaleString()}`
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
  const [monthlyProfit, setMonthlyProfit] = useState<MonthlyProfit[]>([])

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
          setMonthlyProfit(data.monthlyProfit || [])
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
  const maxProfit = Math.max(...monthlyProfit.map((m) => Math.abs(m.profit)), 1)

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
      {/* ── Header ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text)" }}>
          {greeting}, {userName}
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {businessType === "trading" ? "Trading Dashboard" : "Service Dashboard"}
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
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

      {/* ── Monthly Profit Trend Graph ── */}
      {monthlyProfit.length > 0 ? (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 12px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>
              📊 Monthly Profit Trend
            </span>
            <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
              {monthlyProfit.length} months
            </span>
          </div>

          <div style={{ overflowX: "auto", paddingBottom: 4 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "10px",
                height: "140px",
                padding: "0 4px",
                minWidth: `${Math.max(monthlyProfit.length * 50, 280)}px`,
              }}
            >
              {monthlyProfit.map((m, i) => {
                const barHeight = maxProfit > 0 ? (Math.abs(m.profit) / maxProfit) * 110 + 6 : 6
                const isNegative = m.profit < 0

                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      minWidth: "36px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.55rem",
                        fontWeight: 700,
                        color: isNegative ? "#EF4444" : "#10B981",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatPKR(m.profit)}
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: `${barHeight}px`,
                        background: isNegative
                          ? "linear-gradient(180deg, #EF4444, #F87171)"
                          : "linear-gradient(180deg, #6366f1, #818cf8)",
                        borderRadius: "4px 4px 0 0",
                        minHeight: "4px",
                        transition: "height 0.3s ease",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "0.55rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      {m.month}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Summary Stats ── */}
          {monthlyProfit.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px solid var(--border)",
                fontSize: "0.6rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                flexWrap: "wrap",
                gap: "4px",
              }}
            >
              <span>
                📈 Best:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {
                    monthlyProfit.reduce((a, b) => (a.profit > b.profit ? a : b))
                      .month
                  }
                </strong>
              </span>
              <span>
                📉 Worst:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {
                    monthlyProfit.reduce((a, b) => (a.profit < b.profit ? a : b))
                      .month
                  }
                </strong>
              </span>
              <span>
                📊 Avg:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {formatPKR(
                    monthlyProfit.reduce((s, m) => s + m.profit, 0) /
                      monthlyProfit.length
                  )}
                </strong>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "24px 12px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "0.75rem",
            marginBottom: 16,
          }}
        >
          No profit data available yet.
          <br />
          <span style={{ fontSize: "0.6rem" }}>
            Create your first invoice to see your profit trend.
          </span>
        </div>
      )}

      {/* ── Bottom Note ── */}
      <div
        style={{
          fontSize: "0.6rem",
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