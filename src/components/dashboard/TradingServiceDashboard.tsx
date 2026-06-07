"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useTheme } from "@/contexts/ThemeContext"
import { useCompany } from "@/contexts/CompanyContext"

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
  const isDark = themeMode === "dark"

  const { companyId, companyName } = useCompany()
  const companyError = !companyId

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [userDisplayName, setUserDisplayName] = useState("")
  const [businessType, setBusinessType] = useState("")

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
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    const fetchAll = async () => {
      const startDate = `${fiscalYear}-01-01`
      const endDate   = `${fiscalYear}-12-31`

      const [
        { data: bankAccounts },
        { data: cashAcc },
        { data: customers },
        { data: suppliers },
        { data: overdueInvoices },
        { data: overdueBills },
        { data: revAccs },
        { data: expAccs },
        { data: topCustRows },
      ] = await Promise.all([
        supabase.from("bank_accounts").select("current_balance").eq("company_id", companyId),
        supabase.from("accounts").select("balance").eq("company_id", companyId).eq("code", "1000").maybeSingle(),
        supabase.from("customers").select("balance").eq("company_id", companyId),
        supabase.from("suppliers").select("balance").eq("company_id", companyId),
        supabase.from("invoices").select("id").eq("company_id", companyId).eq("type", "sale").eq("status", "Unpaid").lt("due_date", new Date().toISOString().split("T")[0]),
        supabase.from("invoices").select("id").eq("company_id", companyId).eq("type", "purchase").in("status", ["Unpaid","Partial"]).lt("due_date", new Date().toISOString().split("T")[0]),
        supabase.from("accounts").select("id").eq("company_id", companyId).eq("type", "Revenue"),
        supabase.from("accounts").select("id").eq("company_id", companyId).eq("type", "Expense"),
        // Top customers by revenue
        supabase.from("invoices").select("party_id, customers(name), total").eq("company_id", companyId).eq("type", "sale").gte("date", startDate).lte("date", endDate),
      ])

      // Cash & bank
      const bankCash = bankAccounts?.reduce((s: number, b: any) => s + (b.current_balance || 0), 0) || 0
      const cash = cashAcc?.balance || 0
      setCashBalance(bankCash + cash)

      // Receivables / Payables
      const receivables = customers?.reduce((s: number, c: any) => s + (c.balance || 0), 0) || 0
      const payables = suppliers?.reduce((s: number, s2: any) => s + (s2.balance || 0), 0) || 0
      setTotalReceivables(receivables)
      setTotalPayables(payables)

      setOverdueInvoicesCount(overdueInvoices?.length || 0)
      setOverdueBillsCount(overdueBills?.length || 0)

      // Revenue & expense totals
      const revIds = (revAccs || []).map(a => a.id)
      const expIds = (expAccs || []).map(a => a.id)

      const { data: revLines } = await supabase.from("journal_lines")
        .select("debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .in("account_id", revIds)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)
      const rev = (revLines || []).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0)

      const { data: expLines } = await supabase.from("journal_lines")
        .select("debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .in("account_id", expIds)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)
      const exp = (expLines || []).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)

      setRevenueTotal(Math.abs(rev))
      setExpenseTotal(Math.abs(exp))

      // Monthly profit
      const monthNames = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"]
      const monthly: MonthlyProfit[] = []
      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(fiscalYear, i, 1).toISOString().split("T")[0]
        const monthEnd   = new Date(fiscalYear, i + 1, 0).toISOString().split("T")[0]
        const { data: mRev } = await supabase.from("journal_lines")
          .select("debit, credit, journal_entries!inner(date)")
          .eq("company_id", companyId)
          .in("account_id", revIds)
          .gte("journal_entries.date", monthStart)
          .lte("journal_entries.date", monthEnd)
        const { data: mExp } = await supabase.from("journal_lines")
          .select("debit, credit, journal_entries!inner(date)")
          .eq("company_id", companyId)
          .in("account_id", expIds)
          .gte("journal_entries.date", monthStart)
          .lte("journal_entries.date", monthEnd)
        const mRevTot = (mRev || []).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0)
        const mExpTot = (mExp || []).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
        monthly.push({ month: monthNames[i], profit: mRevTot - mExpTot })
      }
      setMonthlyProfit(monthly)

      // Top customers
      const custMap: Record<number, { name: string; revenue: number; outstanding: number }> = {}
      ;(topCustRows || []).forEach((inv: any) => {
        const pid = inv.party_id
        if (!custMap[pid]) custMap[pid] = { name: inv.customers?.name || "Unknown", revenue: 0, outstanding: 0 }
        custMap[pid].revenue += inv.total || 0
      })
      // Outstanding from customer balances
      const custBalances = await supabase.from("customers").select("id, balance").eq("company_id", companyId)
      ;(custBalances.data || []).forEach((c: any) => {
        if (custMap[c.id]) custMap[c.id].outstanding = c.balance || 0
      })
      setTopCustomers(
        Object.values(custMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      )

      setLoading(false)
    }
    fetchAll()
  }, [companyId, fiscalYear])

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
  const animProfit  = useAnimatedNumber(grossProfit, 600)
  const animCash    = useAnimatedNumber(cashBalance, 600)
  const animRecv    = useAnimatedNumber(totalReceivables, 600)
  const animPay     = useAnimatedNumber(totalPayables, 600)

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
    <div style={{ background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)", padding: "0.8rem 1.2rem" }}>
      <style>{`
        .tsd * { box-sizing: border-box; }
        .tsd .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 14px;
          padding: 20px; box-shadow: var(--shadow-sm);
        }
        .tsd .hero {
          background: var(--card); border: 1px solid var(--border); border-radius: 14px;
          padding: 1rem 1.5rem; margin-bottom: 1.5rem; display: flex;
          justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.8rem;
        }
        .tsd .kpi-row {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;
        }
        .tsd .kpi-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 6px; }
        .tsd .kpi-value { font-size: 1.7rem; font-weight: 800; }
        .tsd .two-col { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 24px; }
        .tsd table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .tsd th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 600; font-size: 0.65rem; text-transform: uppercase; }
        .tsd td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
        .tsd .quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
        .tsd .quick-action-btn {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          padding: 14px; text-align: center; font-size: 0.8rem; font-weight: 600;
          color: var(--text); cursor: pointer; transition: 0.15s;
        }
        .tsd .quick-action-btn:hover { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .tsd .alert-row {
          background: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #f97316;
          border-radius: 8px; padding: 10px 16px; margin-bottom: 8px; font-size: 0.8rem;
          display: flex; align-items: center; gap: 12px;
        }
        .tsd .alert-row strong { color: #c2410c; }
        .tsd .alert-btn {
          background: white; border: 1px solid #cbd5e1; border-radius: 6px;
          padding: 4px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .tsd .alert-btn.primary { background: #f97316; color: white; border-color: #f97316; }
        .tsd .bar-chart { display: flex; align-items: flex-end; gap: 12px; height: 180px; padding: 0 8px; }
        .tsd .bar-column { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .tsd .bar { width: 100%; background: linear-gradient(180deg, #6366f1, #818cf8); border-radius: 6px 6px 0 0; transition: height 0.3s; min-height: 4px; }
        .tsd .bar.negative { background: linear-gradient(180deg, #ef4444, #f87171); }
        .tsd .bar-label { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
        .tsd .bar-value { font-size: 10px; font-weight: 700; color: var(--text); }
        .tsd .trend-summary { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 0.75rem; font-weight: 600; }
        @media (max-width: 1024px) {
          .tsd .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .tsd .two-col { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .tsd .kpi-row { grid-template-columns: 1fr; }
          .tsd .hero { flex-direction: column; align-items: flex-start; }
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
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginRight: 8 }}>Period:</label>
            <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
              style={{ padding: "6px 12px", borderRadius: "20px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontFamily: "inherit" }}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y}</option>)}
            </select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="kpi-row">
          {[
            { label: "💰 Total Revenue",  value: formatPKR(animRevenue), color: "#10B981" },
            { label: "📤 Total Expenses", value: formatPKR(animExpense), color: "#EF4444" },
            { label: "📈 Gross Profit",   value: formatPKR(animProfit),  color: grossProfit >= 0 ? "#10B981" : "#EF4444" },
            { label: "🏦 Cash & Bank",    value: formatPKR(animCash),    color: "#A78BFA" },
            { label: "🧾 Receivables",   value: formatPKR(animRecv),    color: "#F97316" },
            { label: "📋 Payables",      value: formatPKR(animPay),     color: "#EF4444" },
            { label: "⚠️ Overdue Inv.",   value: overdueInvoicesCount.toString(), color: "#EF4444" },
            { label: "⚠️ Overdue Bills",  value: overdueBillsCount.toString(), color: "#EF4444" },
          ].map(kpi => (
            <div key={kpi.label} className="card">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Overdue alerts */}
        {overdueInvoicesCount > 0 && (
          <div className="alert-row">
            <span>⚠️ <strong>{overdueInvoicesCount} overdue invoices</strong> – total PKR {formatPKR(totalReceivables)}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="alert-btn" onClick={() => router.push("/dashboard/invoices?status=Unpaid&overdue=true")}>View All</button>
            </div>
          </div>
        )}
        {overdueBillsCount > 0 && (
          <div className="alert-row">
            <span>⚠️ <strong>{overdueBillsCount} overdue bills</strong> – total PKR {formatPKR(totalPayables)}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="alert-btn" onClick={() => router.push("/dashboard/bills?status=Unpaid&overdue=true")}>View All</button>
            </div>
          </div>
        )}

        {/* Two columns */}
        <div className="two-col">
          {/* Monthly Profit Trend */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>📊 Monthly Profit Trend</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>FY {fiscalYear}</span>
            </div>
            <div className="bar-chart">
              {monthlyProfit.map((m, i) => (
                <div key={i} className="bar-column">
                  <div className={`bar ${m.profit < 0 ? "negative" : ""}`}
                    style={{ height: `${(Math.abs(m.profit) / maxProfit) * 160 + 4}px` }} />
                  <div className="bar-value">{formatPKR(m.profit)}</div>
                  <div className="bar-label">{m.month}</div>
                </div>
              ))}
            </div>
            <div className="trend-summary">
              <span>📈 Best month: <strong>{monthlyProfit.reduce((a,b) => a.profit > b.profit ? a : b).month}</strong></span>
              <span>📉 Worst month: <strong>{monthlyProfit.reduce((a,b) => a.profit < b.profit ? a : b).month}</strong></span>
              <span>📊 Average: <strong>{formatPKR(monthlyProfit.reduce((s,m) => s + m.profit, 0) / 12)}</strong></span>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 12 }}>⚡ Quick Actions</div>
              <div className="quick-actions">
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/invoices/new")}>➕ New Invoice</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/bills/new")}>📦 New Bill</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/receipts/new")}>💰 Receive Payment</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/payments/new")}>💳 Record Payment</div>
              </div>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>🏆 Top 5 Customers</span>
                <button onClick={() => router.push("/dashboard/customers")} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", fontSize: "0.8rem" }}>View All →</button>
              </div>
              <table>
                <thead>
                  <tr><th>Customer</th><th>Revenue</th><th>Outstanding</th></tr>
                </thead>
                <tbody>
                  {topCustomers.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)" }}>No customer data</td></tr>
                  ) : (
                    topCustomers.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td style={{ color: "#10B981" }}>{formatPKR(c.revenue)}</td>
                        <td style={{ color: c.outstanding > 0 ? "#EF4444" : "#10B981" }}>{c.outstanding > 0 ? formatPKR(c.outstanding) : "0"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}