"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useTheme } from "@/contexts/ThemeContext"
import { useCompany } from "@/contexts/CompanyContext"
import { Bell } from "lucide-react"

function useAnimatedNumber(target: number, duration = 500) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const start = prev.current
    const diff = target - start
    if (diff === 0) return
    const startTime = performance.now()
    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + diff * ease)
      if (progress < 1) requestAnimationFrame(tick)
      else prev.current = target
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return display
}

interface MonthlyProfit {
  month: string
  profit: number
}

interface TopCustomer {
  name: string
  revenue: number
  outstanding: number
}

export default function TradingServiceDashboard({ role }: { role: string }) {
  const router = useRouter()
  const { theme: themeMode } = useTheme()
  const { companyId, companyName } = useCompany()
  const companyError = !companyId

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [userDisplayName, setUserDisplayName] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)

  // Reporting period states (similar to NGO dashboard)
  const [periodType, setPeriodType] = useState<"last12" | "fiscal" | "custom">("last12")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [customStartDate, setCustomStartDate] = useState(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 12)
    return date.toISOString().split("T")[0]
  })
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split("T")[0])

  // KPI states
  const [revenueTotal, setRevenueTotal] = useState(0)
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [cashBalance, setCashBalance] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)
  const [overdueInvoicesCount, setOverdueInvoicesCount] = useState(0)
  const [overdueBillsCount, setOverdueBillsCount] = useState(0)
  const [monthlyProfit, setMonthlyProfit] = useState<MonthlyProfit[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])

  // For bell notifications (overdue items)
  const [overdueInvoicesList, setOverdueInvoicesList] = useState<any[]>([])
  const [overdueBillsList, setOverdueBillsList] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const fullName = (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || user.email?.split("@")[0] || "User"
      setUserDisplayName(fullName)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase.from("companies").select("business_type").eq("id", companyId).single()
      .then(({ data }) => { if (data) setBusinessType(data.business_type || "") })
  }, [companyId])

  // Fetch overdue items for notification badges
  useEffect(() => {
    if (!companyId) return
    const fetchOverdueItems = async () => {
      const todayISO = new Date().toISOString().split("T")[0]
      const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_no, party_id, total, due_date")
        .eq("company_id", companyId)
        .eq("type", "sale")
        .eq("status", "Unpaid")
        .lt("due_date", todayISO)
        .order("due_date", { ascending: true })
        .limit(10)
      const { data: overdueBills } = await supabase
        .from("invoices")
        .select("id, invoice_no, party_id, total, due_date")
        .eq("company_id", companyId)
        .eq("type", "purchase")
        .in("status", ["Unpaid", "Partial"])
        .lt("due_date", todayISO)
        .order("due_date", { ascending: true })
        .limit(10)
      setOverdueInvoicesList(overdueInvoices || [])
      setOverdueBillsList(overdueBills || [])
    }
    fetchOverdueItems()
  }, [companyId])

  // One RPC call for all metrics (we need to pass date range)
  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    // Determine start and end dates based on period type
    let startDate: string, endDate: string
    const today = new Date()
    if (periodType === "last12") {
      const start = new Date(today)
      start.setMonth(today.getMonth() - 11)
      start.setDate(1)
      startDate = start.toISOString().split("T")[0]
      endDate = today.toISOString().split("T")[0]
    } else if (periodType === "fiscal") {
      // Fiscal year July 1 – June 30
      if (today.getMonth() + 1 >= 7) {
        startDate = `${fiscalYear}-07-01`
        endDate = `${fiscalYear + 1}-06-30`
      } else {
        startDate = `${fiscalYear - 1}-07-01`
        endDate = `${fiscalYear}-06-30`
      }
    } else {
      startDate = customStartDate
      endDate = customEndDate
    }

    const fetchDashboard = async () => {
      try {
        // Call the RPC with date range (we need to update the RPC function to accept date range)
        // For now, we'll use the existing RPC which uses fiscal year. To support dynamic dates,
        // we'll keep the same RPC but note that the chart will adjust later.
        const { data, error } = await supabase.rpc("get_dashboard_metrics", {
          p_company_id: companyId,
        })

        if (error) {
          console.error("RPC error:", error)
          setLoading(false)
          return
        }

        if (!data) {
          console.error("No data returned")
          setLoading(false)
          return
        }

        setRevenueTotal(data.revenueTotal || 0)
        setExpenseTotal(data.expenseTotal || 0)
        setCashBalance(data.cashBalance || 0)
        setTotalReceivables(data.totalReceivables || 0)
        setTotalPayables(data.totalPayables || 0)
        setOverdueInvoicesCount(data.overdueInvoicesCount || 0)
        setOverdueBillsCount(data.overdueBillsCount || 0)
        setMonthlyProfit(data.monthlyProfit || [])
        setTopCustomers(data.topCustomers || [])
      } catch (err) {
        console.error("Dashboard fetch exception:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [companyId, periodType, fiscalYear, customStartDate, customEndDate])

  const getGreeting = (): string => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const formatPKR = (v: number): string => {
    const sign = v < 0 ? "-" : ""
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}PKR ${(abs / 1_000).toFixed(1)}K`
    return `${sign}PKR ${abs.toLocaleString()}`
  }

  const grossProfit = revenueTotal - expenseTotal
  const animRevenue = useAnimatedNumber(revenueTotal, 600)
  const animExpense = useAnimatedNumber(expenseTotal, 600)
  const animProfit = useAnimatedNumber(grossProfit, 600)
  const animCash = useAnimatedNumber(cashBalance, 600)
  const animRecv = useAnimatedNumber(totalReceivables, 600)
  const animPay = useAnimatedNumber(totalPayables, 600)

  const maxProfit = Math.max(...monthlyProfit.map(m => Math.abs(m.profit)), 1)

  if (companyError) {
    return <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
      <div style={{ fontSize: "1.2rem", marginBottom: 8, color: "#F87171" }}>Could not load dashboard</div>
    </div>
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--border)", borderTop: "3px solid #A78BFA", animation: "spin 1.2s linear infinite" }} />
      <div>Loading your dashboard…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)", padding: "1rem 1.5rem" }}>
      <style>{`
        .tsd * { box-sizing: border-box; }
        .tsd .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 14px;
          padding: 20px; box-shadow: var(--shadow-sm);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          cursor: pointer;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .tsd .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
          border-color: var(--primary);
        }
        .tsd .hero {
          background: var(--card); border: 1px solid var(--border); border-radius: 14px;
          padding: 1rem 1.5rem; margin-bottom: 1.5rem; display: flex;
          justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 0.8rem;
        }
        .tsd .kpi-row {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;
        }
        .tsd .kpi-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 6px; }
        .tsd .kpi-value { font-size: 1.7rem; font-weight: 800; }
        .tsd .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .tsd .full-width {
          margin-bottom: 20px;
        }
        .tsd table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .tsd th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 600; font-size: 0.65rem; text-transform: uppercase; }
        .tsd td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
        .tsd .quick-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          flex: 1;
          align-items: stretch;
        }
        .tsd .quick-action-btn {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px 8px;
          text-align: center;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text);
          cursor: pointer;
          transition: 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .tsd .quick-action-btn:hover {
          background: var(--primary);
          color: var(--primary-text);
          border-color: var(--primary);
        }
        .tsd .alert-row {
          background: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #f97316;
          border-radius: 8px; padding: 10px 16px; margin-bottom: 12px; font-size: 0.8rem;
          display: flex; align-items: center; gap: 12px;
        }
        .tsd .alert-row strong { color: #c2410c; }
        .tsd .alert-btn {
          background: white; border: 1px solid #cbd5e1; border-radius: 6px;
          padding: 4px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .tsd .alert-btn.primary { background: #f97316; color: white; border-color: #f97316; }
        .tsd .chart-container {
          margin-top: 0;
          padding: 8px 0 12px 0;
          overflow-x: auto;
        }
        .tsd .bar-chart {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          height: 200px;
          padding: 0 8px;
          min-width: 600px;
        }
        .tsd .bar-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .tsd .bar {
          width: 100%;
          background: linear-gradient(180deg, #6366f1, #818cf8);
          border-radius: 6px 6px 0 0;
          transition: height 0.3s;
          min-height: 4px;
        }
        .tsd .bar.negative {
          background: linear-gradient(180deg, #ef4444, #f87171);
        }
        .tsd .bar-value {
          font-size: 10px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
        }
        .tsd .bar-label {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
        }
        .tsd .trend-summary {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid var(--border);
          font-size: 0.75rem;
          font-weight: 600;
        }
        .customer-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .period-selector {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .period-btn {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: 0.15s;
          color: var(--text-muted);
        }
        .period-btn.active {
          background: var(--primary);
          color: var(--primary-text);
          border-color: var(--primary);
        }
        .period-btn:hover:not(.active) {
          background: var(--card-hover);
        }
        .date-input {
          height: 32px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 10px;
          font-size: 12px;
          background: var(--card);
          color: var(--text);
          outline: none;
          font-family: inherit;
        }
        .filter-pill {
          background: var(--card);
          border: 1px solid var(--border);
          padding: 0.2rem 0.5rem;
          border-radius: 20px;
          font-size: 0.78rem;
          font-weight: 500;
          color: var(--text);
          cursor: pointer;
          transition: 0.15s;
          font-family: inherit;
          max-width: 150px;
        }
        .filter-pill:focus { outline: none; border-color: var(--primary); }
        .notification-bell {
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
          transition: background 0.15s;
          position: relative;
        }
        .notification-bell:hover { background: var(--card-hover); }
        .notification-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background: #EF4444;
          color: white;
          font-size: 10px;
          font-weight: 700;
          border-radius: 10px;
          min-width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }
        @media (max-width: 1024px) {
          .tsd .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .tsd .two-col { grid-template-columns: 1fr; gap: 16px; }
          .customer-name { max-width: 140px; }
        }
        @media (max-width: 640px) {
          .tsd .kpi-row { grid-template-columns: 1fr; }
          .tsd .hero { flex-direction: column; align-items: flex-start; }
          .customer-name { max-width: 120px; }
          .tsd .quick-action-btn { padding: 12px 8px; font-size: 0.75rem; }
        }
      `}</style>

      <div className="tsd">
        {/* Hero */}
        <div className="hero">
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>{getGreeting()}, {userDisplayName}</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {businessType === "trading" ? "Trading Dashboard" : "Service Dashboard"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {/* Period Selector */}
            <div className="period-selector">
              <button
                className={`period-btn ${periodType === "last12" ? "active" : ""}`}
                onClick={() => setPeriodType("last12")}
              >
                Last 12 Months
              </button>
              <button
                className={`period-btn ${periodType === "fiscal" ? "active" : ""}`}
                onClick={() => setPeriodType("fiscal")}
              >
                Fiscal Year
              </button>
              <button
                className={`period-btn ${periodType === "custom" ? "active" : ""}`}
                onClick={() => setPeriodType("custom")}
              >
                Custom Range
              </button>
            </div>
            {periodType === "fiscal" && (
              <select
                className="filter-pill"
                value={fiscalYear}
                onChange={e => setFiscalYear(Number(e.target.value))}
              >
                {[2023, 2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>FY {y}–{y + 1}</option>
                ))}
              </select>
            )}
            {periodType === "custom" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="date"
                  className="date-input"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>to</span>
                <input
                  type="date"
                  className="date-input"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                />
              </div>
            )}

            {/* Bell Notifications */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Overdue Invoices Bell */}
              <div style={{ textAlign: "center" }}>
                <div
                  className="notification-bell"
                  onClick={() => router.push("/dashboard/invoices?status=Unpaid&overdue=true")}
                >
                  <Bell size={20} color="var(--text-muted)" />
                  {overdueInvoicesCount > 0 && (
                    <span className="notification-badge">
                      {overdueInvoicesCount > 9 ? "9+" : overdueInvoicesCount}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, marginTop: 2, color: "var(--text-muted)" }}>Invoices</div>
              </div>
              {/* Overdue Bills Bell */}
              <div style={{ textAlign: "center" }}>
                <div
                  className="notification-bell"
                  onClick={() => router.push("/dashboard/bills?status=Unpaid&overdue=true")}
                >
                  <Bell size={20} color="var(--text-muted)" />
                  {overdueBillsCount > 0 && (
                    <span className="notification-badge">
                      {overdueBillsCount > 9 ? "9+" : overdueBillsCount}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, marginTop: 2, color: "var(--text-muted)" }}>Bills</div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="kpi-row">
          {[
            { label: "💰 Total Revenue", value: formatPKR(animRevenue), color: "#10B981", onClick: () => router.push("/dashboard/reports/profit-loss") },
            { label: "📤 Total Expenses", value: formatPKR(animExpense), color: "#EF4444", onClick: () => router.push("/dashboard/reports/profit-loss") },
            { label: "📈 Gross Profit", value: formatPKR(animProfit), color: grossProfit >= 0 ? "#10B981" : "#EF4444", onClick: () => router.push("/dashboard/reports/profit-loss") },
            { label: "🏦 Cash & Bank", value: formatPKR(animCash), color: "#A78BFA", onClick: () => router.push("/dashboard/banking/bank-accounts") },
            { label: "🧾 Receivables", value: formatPKR(animRecv), color: "#F97316", onClick: () => router.push("/dashboard/customers") },
            { label: "📋 Payables", value: formatPKR(animPay), color: "#EF4444", onClick: () => router.push("/dashboard/suppliers") },
            { label: "⚠️ Overdue Inv.", value: overdueInvoicesCount.toString(), color: "#EF4444", onClick: () => router.push("/dashboard/invoices?status=Unpaid&overdue=true") },
            { label: "⚠️ Overdue Bills", value: overdueBillsCount.toString(), color: "#EF4444", onClick: () => router.push("/dashboard/bills?status=Unpaid&overdue=true") },
          ].map(kpi => (
            <div key={kpi.label} className="card" onClick={kpi.onClick}>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Two columns: Top 5 Customers + Quick Actions */}
        <div className="two-col">
          {/* Top 5 Customers Card */}
          <div className="card" style={{ cursor: "default", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>🏆 Top 5 Customers</span>
              <button onClick={() => router.push("/dashboard/customers")} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", fontSize: "0.75rem" }}>View All →</button>
            </div>
            <div style={{ overflowX: "auto", flex: 1 }}>
              <table style={{ width: "100%", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "6px 8px" }}>Customer</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.length === 0 ? (
                    <tr><td colSpan={2} style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)" }}>No customer data</td></tr>
                  ) : (
                    topCustomers.map((c, i) => (
                      <tr key={i}>
                        <td style={{ padding: "6px 8px" }}><span className="customer-name" title={c.name}>{c.name}</span></td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: c.outstanding > 0 ? "#EF4444" : "#10B981" }}>
                          {formatPKR(c.outstanding)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="card" style={{ cursor: "default" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 12 }}>⚡ Quick Actions</div>
            <div className="quick-actions">
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/invoices/new")}>➕ New Invoice</div>
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/bills/new")}>📦 New Bill</div>
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/receipts/new")}>💰 Receive Payment</div>
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/payments/new")}>💳 Record Payment</div>
            </div>
          </div>
        </div>

        {/* Monthly Profit Trend */}
        <div className="full-width">
          <div className="card" style={{ cursor: "default" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>📊 Monthly Profit Trend</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {periodType === "last12" && "Last 12 months"}
                {periodType === "fiscal" && `FY ${fiscalYear}–${fiscalYear + 1}`}
                {periodType === "custom" && `${customStartDate} to ${customEndDate}`}
              </span>
            </div>
            <div className="chart-container">
              <div className="bar-chart">
                {monthlyProfit.map((m, i) => (
                  <div key={i} className="bar-column">
                    <div className={`bar ${m.profit < 0 ? "negative" : ""}`}
                      style={{ height: `${(Math.abs(m.profit) / maxProfit) * 140 + 4}px` }} />
                    <div className="bar-value">{formatPKR(m.profit)}</div>
                    <div className="bar-label">{m.month}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="trend-summary">
              {monthlyProfit.length > 0 && (
                <>
                  <span>📈 Best: <strong>{monthlyProfit.reduce((a,b) => a.profit > b.profit ? a : b).month}</strong> ({formatPKR(Math.max(...monthlyProfit.map(m=>m.profit)))})</span>
                  <span>📉 Worst: <strong>{monthlyProfit.reduce((a,b) => a.profit < b.profit ? a : b).month}</strong> ({formatPKR(Math.min(...monthlyProfit.map(m=>m.profit)))})</span>
                  <span>📊 Avg: <strong>{formatPKR(monthlyProfit.reduce((s,m) => s + m.profit, 0) / 12)}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}