"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Printer, Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useRouter } from "next/navigation"

function getCategory(account: any): string {
  if (account.category) return account.category
  const num = parseFloat(account.code)
  if (isNaN(num)) return "Other"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  return "Other"
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString("en-PK")
}

function sign(n: number) {
  return n < 0 ? "-" : ""
}

export default function ProfitLossPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0])

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  const revenueAccounts = accounts.filter(a => a.type === "Revenue")
  const expenseAccounts = accounts.filter(a => a.type === "Expense")
  const directExpenses = expenseAccounts.filter(a => getCategory(a) === "Direct Expenses")
  const operatingExpenses = expenseAccounts.filter(a => getCategory(a) === "Operating Expenses")
  const otherExpenses = expenseAccounts.filter(a => !["Direct Expenses", "Operating Expenses"].includes(getCategory(a)))

  const totalRevenue = revenueAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const totalDirect = directExpenses.reduce((s, a) => s + (a.balance || 0), 0)
  const totalOpEx = operatingExpenses.reduce((s, a) => s + (a.balance || 0), 0)
  const totalOther = otherExpenses.reduce((s, a) => s + (a.balance || 0), 0)
  const grossProfit = totalRevenue - totalDirect
  const netProfit = grossProfit - totalOpEx - totalOther
  const margin = totalRevenue !== 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0"

  const openLedger = (accountId: number) => {
    router.push(`/dashboard/reports/ledger?accountId=${accountId}&startDate=${startDate}&endDate=${endDate}`)
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#060D1A", color: "#64748B", fontFamily: "'DM Mono', monospace, sans-serif", gap: 12 }}>
      <div style={{ width: 20, height: 20, border: "2px solid #1E40AF", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Loading financial data…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ background: "#060D1A", minHeight: "100vh", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; }

        .pl-header {
          background: #0A1628;
          border-bottom: 1px solid #1E293B;
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
          position: sticky;
          top: 0;
          z-index: 10;
          backdrop-filter: blur(8px);
        }

        .pl-header-left { display: flex; align-items: center; gap: 16px; }

        .back-btn {
          background: transparent;
          border: 1px solid #1E293B;
          border-radius: 8px;
          padding: 7px 10px;
          cursor: pointer;
          color: #64748B;
          display: inline-flex;
          align-items: center;
          transition: all 0.15s;
        }
        .back-btn:hover { border-color: #334155; color: #CBD5E1; background: #111827; }

        .action-btn {
          background: #111827;
          border: 1px solid #1E293B;
          border-radius: 8px;
          padding: 7px 14px;
          cursor: pointer;
          color: #94A3B8;
          font-size: 12px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
          transition: all 0.15s;
        }
        .action-btn:hover { border-color: #334155; color: #E2E8F0; background: #1E293B; }

        .kpi-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          border-bottom: 1px solid #1E293B;
          background: #0A1628;
        }
        .kpi-cell {
          padding: 20px 32px;
          border-right: 1px solid #1E293B;
        }
        .kpi-cell:last-child { border-right: none; }
        .kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; margin-bottom: 6px; }
        .kpi-value { font-size: 26px; font-weight: 700; letter-spacing: -0.03em; font-family: 'DM Mono', monospace; }
        .kpi-sub { font-size: 11px; color: #475569; margin-top: 4px; }

        .date-bar {
          background: #0D1829;
          border-bottom: 1px solid #1E293B;
          padding: 12px 32px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .date-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
        .date-input {
          background: #111827;
          border: 1px solid #1E293B;
          border-radius: 6px;
          color: #CBD5E1;
          padding: 5px 10px;
          font-size: 12px;
          font-family: 'DM Mono', monospace;
          outline: none;
        }
        .date-input:focus { border-color: #3B82F6; }
        .date-sep { color: #334155; font-size: 12px; }

        .report-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          max-width: 100%;
        }

        .report-col {
          padding: 32px;
          border-right: 1px solid #0F1E35;
        }
        .report-col:last-child { border-right: none; }

        .section {
          margin-bottom: 28px;
        }

        .section-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
          padding-bottom: 8px;
          border-bottom: 1px solid #1E293B;
          cursor: pointer;
        }
        .section-head:hover .section-title-text { color: #60A5FA; }
        .section-badge {
          width: 3px;
          height: 16px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .section-title-text {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #64748B;
          transition: color 0.15s;
        }

        .account-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 9px 0 9px 11px;
          border-bottom: 1px solid #0F1E35;
          cursor: pointer;
          transition: background 0.1s;
          border-radius: 4px;
          margin: 1px 0;
        }
        .account-row:hover { background: #0D1829; }
        .account-row:hover .acc-code { color: #60A5FA; }
        .acc-code { font-size: 10px; font-family: 'DM Mono', monospace; color: #475569; min-width: 42px; }
        .acc-name { font-size: 13px; color: #94A3B8; flex: 1; padding: 0 10px; }
        .acc-amount { font-size: 13px; font-family: 'DM Mono', monospace; font-weight: 500; color: #CBD5E1; }

        .subtotal-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          margin-top: 2px;
          font-size: 13px;
          font-weight: 600;
          border-top: 1px solid #1E293B;
        }
        .subtotal-label { color: #94A3B8; padding-left: 11px; }
        .subtotal-amount { font-family: 'DM Mono', monospace; }

        .divider-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          font-size: 14px;
          font-weight: 700;
          border-top: 2px solid #1E293B;
          border-bottom: 2px solid #1E293B;
          margin: 8px 0;
        }
        .divider-label { color: #CBD5E1; padding-left: 11px; }
        .divider-amount { font-family: 'DM Mono', monospace; }

        .net-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #0F2040 0%, #0D1829 100%);
          border: 1px solid #1E3A5F;
          border-radius: 10px;
          margin-top: 20px;
        }
        .net-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .net-amount { font-size: 20px; font-family: 'DM Mono', monospace; font-weight: 700; }

        .zero-state {
          padding: 16px 11px;
          font-size: 12px;
          color: #334155;
          font-style: italic;
        }

        @media print {
          .pl-header, .date-bar { display: none; }
          .report-body { grid-template-columns: 1fr; }
          .kpi-strip { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* Sticky Header */}
      <div className="pl-header">
        <div className="pl-header-left">
          <button className="back-btn" onClick={() => router.push("/dashboard/reports")}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", display: "flex", alignItems: "center", gap: 8 }}>
              Profit &amp; Loss Statement
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#3B82F6", background: "#1E3A5F", padding: "2px 8px", borderRadius: 4 }}>
                FY {now.getFullYear()}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#475569" }}>Shahid Iqbal &amp; Co · Click any account to view ledger</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="action-btn" onClick={() => window.print()}>
            <Printer size={13} /> Print
          </button>
          <button className="action-btn">
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value" style={{ color: totalRevenue >= 0 ? "#10B981" : "#EF4444" }}>
            {sign(totalRevenue)}PKR {fmt(totalRevenue)}
          </div>
          <div className="kpi-sub">All income accounts</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Gross Profit</div>
          <div className="kpi-value" style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>
            {sign(grossProfit)}PKR {fmt(grossProfit)}
          </div>
          <div className="kpi-sub">After cost of goods</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Net Profit / Loss</div>
          <div className="kpi-value" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
            {sign(netProfit)}PKR {fmt(netProfit)}
          </div>
          <div className="kpi-sub" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {netProfit >= 0 ? <TrendingUp size={11} color="#10B981" /> : <TrendingDown size={11} color="#EF4444" />}
            Margin: {margin}%
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Total Expenses</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>
            PKR {fmt(totalDirect + totalOpEx + totalOther)}
          </div>
          <div className="kpi-sub">All expense accounts</div>
        </div>
      </div>

      {/* Date Range Bar */}
      <div className="date-bar">
        <Calendar size={13} color="#475569" />
        <span className="date-label">Period</span>
        <input className="date-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span className="date-sep">—</span>
        <input className="date-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>

      {/* Two-column Report Body */}
      <div className="report-body">
        {/* LEFT COL: Revenue + Gross Profit */}
        <div className="report-col">
          {/* Revenue */}
          <div className="section">
            <div className="section-head" onClick={() => router.push(`/dashboard/reports/trial-balance?type=Revenue`)}>
              <div className="section-badge" style={{ background: "#10B981" }} />
              <span className="section-title-text">Income / Revenue</span>
            </div>
            {revenueAccounts.length === 0 ? (
              <div className="zero-state">No revenue accounts found</div>
            ) : revenueAccounts.map(a => (
              <div key={a.id} className="account-row" onClick={() => openLedger(a.id)}>
                <span className="acc-code">{a.code}</span>
                <span className="acc-name">{a.name}</span>
                <span className="acc-amount" style={{ color: (a.balance || 0) >= 0 ? "#10B981" : "#EF4444" }}>
                  {sign(a.balance || 0)}PKR {fmt(a.balance || 0)}
                </span>
              </div>
            ))}
            <div className="subtotal-row">
              <span className="subtotal-label">Total Revenue</span>
              <span className="subtotal-amount" style={{ color: totalRevenue >= 0 ? "#10B981" : "#EF4444" }}>
                {sign(totalRevenue)}PKR {fmt(totalRevenue)}
              </span>
            </div>
          </div>

          {/* Direct Expenses */}
          {directExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => router.push(`/dashboard/reports/trial-balance?type=Expense&category=Direct Expenses`)}>
                <div className="section-badge" style={{ background: "#EF4444" }} />
                <span className="section-title-text">Cost of Goods Sold / Direct Expenses</span>
              </div>
              {directExpenses.map(a => (
                <div key={a.id} className="account-row" onClick={() => openLedger(a.id)}>
                  <span className="acc-code">{a.code}</span>
                  <span className="acc-name">{a.name}</span>
                  <span className="acc-amount" style={{ color: "#F87171" }}>
                    PKR {fmt(a.balance || 0)}
                  </span>
                </div>
              ))}
              <div className="subtotal-row">
                <span className="subtotal-label">Total Direct Expenses</span>
                <span className="subtotal-amount" style={{ color: "#EF4444" }}>PKR {fmt(totalDirect)}</span>
              </div>
            </div>
          )}

          {/* Gross Profit */}
          <div className="divider-row">
            <span className="divider-label">Gross Profit</span>
            <span className="divider-amount" style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>
              {sign(grossProfit)}PKR {fmt(grossProfit)}
            </span>
          </div>
        </div>

        {/* RIGHT COL: OpEx + Net Profit */}
        <div className="report-col">
          {/* Operating Expenses */}
          {operatingExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => router.push(`/dashboard/reports/trial-balance?type=Expense&category=Operating Expenses`)}>
                <div className="section-badge" style={{ background: "#F59E0B" }} />
                <span className="section-title-text">Operating Expenses</span>
              </div>
              {operatingExpenses.map(a => (
                <div key={a.id} className="account-row" onClick={() => openLedger(a.id)}>
                  <span className="acc-code">{a.code}</span>
                  <span className="acc-name">{a.name}</span>
                  <span className="acc-amount" style={{ color: "#FCD34D" }}>
                    PKR {fmt(a.balance || 0)}
                  </span>
                </div>
              ))}
              <div className="subtotal-row">
                <span className="subtotal-label">Total Operating Expenses</span>
                <span className="subtotal-amount" style={{ color: "#F59E0B" }}>PKR {fmt(totalOpEx)}</span>
              </div>
            </div>
          )}

          {/* Other Expenses */}
          {otherExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => router.push(`/dashboard/reports/trial-balance?type=Expense`)}>
                <div className="section-badge" style={{ background: "#8B5CF6" }} />
                <span className="section-title-text">Other Expenses</span>
              </div>
              {otherExpenses.map(a => (
                <div key={a.id} className="account-row" onClick={() => openLedger(a.id)}>
                  <span className="acc-code">{a.code}</span>
                  <span className="acc-name">{a.name}</span>
                  <span className="acc-amount" style={{ color: "#C4B5FD" }}>
                    PKR {fmt(a.balance || 0)}
                  </span>
                </div>
              ))}
              <div className="subtotal-row">
                <span className="subtotal-label">Total Other Expenses</span>
                <span className="subtotal-amount" style={{ color: "#8B5CF6" }}>PKR {fmt(totalOther)}</span>
              </div>
            </div>
          )}

          {operatingExpenses.length === 0 && otherExpenses.length === 0 && (
            <div className="zero-state">No operating expense accounts found</div>
          )}

          {/* Operating Profit line (before other) */}
          {operatingExpenses.length > 0 && (
            <div className="divider-row" style={{ marginTop: 0 }}>
              <span className="divider-label">Operating Profit</span>
              <span className="divider-amount" style={{ color: (grossProfit - totalOpEx) >= 0 ? "#10B981" : "#EF4444" }}>
                {sign(grossProfit - totalOpEx)}PKR {fmt(grossProfit - totalOpEx)}
              </span>
            </div>
          )}

          {/* Net Profit */}
          <div className="net-row">
            <div>
              <div className="net-label" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
                {netProfit >= 0 ? "✦ Net Profit" : "▼ Net Loss"}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>Profit margin: {margin}%</div>
            </div>
            <div className="net-amount" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
              {sign(netProfit)}PKR {fmt(netProfit)}
            </div>
          </div>

          {/* Watermark/footer note */}
          <div style={{ marginTop: 24, padding: "12px 0", borderTop: "1px solid #0F1E35", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155", fontFamily: "'DM Mono', monospace" }}>
            <span>Generated {new Date().toLocaleString("en-PK")}</span>
            <span>OneAccounts · Shahid Iqbal &amp; Co</span>
          </div>
        </div>
      </div>
    </div>
  )
}
