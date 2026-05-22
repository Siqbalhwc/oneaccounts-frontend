"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Printer, Calendar, TrendingUp, TrendingDown } from "lucide-react"
import { useRouter } from "next/navigation"

function getCategory(account: any): string {
  if (account.category) return account.category
  const num = parseFloat(account.code)
  if (isNaN(num)) return "Other"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  return "Other"
}

function fmt(n: number) { return Math.abs(n).toLocaleString("en-PK") }

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

  // Project filter
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [compareMode, setCompareMode] = useState(false)

  // Compare data – account rows with per‑project amounts
  const [compareRows, setCompareRows] = useState<any[]>([])
  const [compareLoading, setCompareLoading] = useState(false)

  // Standard P&L from account balances (used when compare mode is off)
  const revenueAccounts = accounts.filter(a => a.type === "Revenue")
  const expenseAccounts = accounts.filter(a => a.type === "Expense")
  const directExpenses = expenseAccounts.filter(a => getCategory(a) === "Direct Expenses")
  const operatingExpenses = expenseAccounts.filter(a => getCategory(a) === "Operating Expenses")
  const otherExpenses = expenseAccounts.filter(a => !["Direct Expenses", "Operating Expenses"].includes(getCategory(a)))

  const totalRevenue = revenueAccounts.reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const totalDirect = directExpenses.reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const totalOpEx = operatingExpenses.reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const totalOther = otherExpenses.reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const totalExpenses = totalDirect + totalOpEx + totalOther
  const grossProfit = totalRevenue - totalDirect
  const netProfit = grossProfit - totalOpEx - totalOther
  const margin = totalRevenue !== 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0"

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
    supabase.from("projects").select("id, name").is("deleted_at", null).order("name")
      .then(r => r.data && setProjects(r.data))
  }, [])

  // Fetch per‑account, per‑project amounts when compareMode is on
  useEffect(() => {
    if (!compareMode || accounts.length === 0) {
      setCompareRows([])
      return
    }

    setCompareLoading(true)

    const fetchCompare = async () => {
      const revenueIds = accounts.filter(a => a.type === "Revenue").map(a => a.id)
      const expenseIds = accounts.filter(a => a.type === "Expense").map(a => a.id)
      const allRelIds = [...revenueIds, ...expenseIds]

      // Fetch all journal lines for these accounts within date range
      const { data: lines } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, project_id")
        .in("account_id", allRelIds)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)
        .not("journal_entries", "is", null)

      // Aggregate per account and per project
      const accountTotals: Record<number, number> = {}
      const accountProject: Record<number, Record<string, number>> = {}   // account_id → { project_id : amount }

      if (lines) {
        lines.forEach((l: any) => {
          const net = (l.credit || 0) - (l.debit || 0)
          accountTotals[l.account_id] = (accountTotals[l.account_id] || 0) + net
          if (!accountProject[l.account_id]) accountProject[l.account_id] = {}
          const pid = l.project_id || "unallocated"
          accountProject[l.account_id][pid] = (accountProject[l.account_id][pid] || 0) + net
        })
      }

      // Build rows for each revenue/expense account
      const rows = accounts
        .filter(a => a.type === "Revenue" || a.type === "Expense")
        .map(a => {
          const signedTotal = accountTotals[a.id] || 0
          const displayTotal = Math.abs(signedTotal)
          const projAmounts: Record<string, number> = {}
          let allocatedTotal = 0
          projects.forEach(p => {
            const amt = accountProject[a.id]?.[p.id] || 0
            const displayAmt = Math.abs(amt)
            projAmounts[p.id] = displayAmt
            allocatedTotal += displayAmt
          })
          const unallocated = Math.max(0, displayTotal - allocatedTotal)
          return {
            id: a.id,
            code: a.code,
            name: a.name,
            type: a.type,
            category: getCategory(a),
            total: displayTotal,
            projectAmounts: projAmounts,
            unallocated,
          }
        })

      setCompareRows(rows)
      setCompareLoading(false)
    }

    fetchCompare()
  }, [compareMode, accounts, projects, startDate, endDate])

  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    if (selectedProjectId) params.set("project", selectedProjectId)
    if (startDate) params.set("startDate", startDate)
    if (endDate) params.set("endDate", endDate)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  const openTrialForAccount = (account: any) => {
    if (account.type === "Revenue") navigateToTrialBalance("Revenue")
    else navigateToTrialBalance("Expense", getCategory(account))
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--text-muted)", fontFamily: "'Inter', sans-serif", gap: 12 }}>
      <div style={{ width: 20, height: 20, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Loading financial data…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        * { box-sizing: border-box; }

        .pl-header {
          background: var(--topbar-bg);
          border-bottom: 1px solid var(--border);
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .back-btn {
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 7px 10px;
          cursor: pointer;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          transition: all 0.15s;
        }
        .back-btn:hover { border-color: var(--border-strong); color: var(--text); background: var(--card-hover); }

        .action-btn {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 7px 14px;
          cursor: pointer;
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
          transition: all 0.15s;
        }
        .action-btn:hover { border-color: var(--border-strong); color: var(--text); background: var(--card-hover); }

        .kpi-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          padding: 24px 32px;
          border-bottom: 1px solid var(--border);
        }
        .kpi-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          box-shadow: var(--shadow-sm);
        }
        .kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 6px; }
        .kpi-value { font-size: 26px; font-weight: 700; letter-spacing: -0.03em; font-family: 'Inter', sans-serif; }
        .kpi-sub { font-size: 11px; color: var(--text-soft); margin-top: 4px; }

        .date-bar {
          background: var(--card);
          border-bottom: 1px solid var(--border);
          padding: 12px 32px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .date-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .date-input, .project-select, .compare-toggle {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          padding: 5px 10px;
          font-size: 12px;
          font-family: inherit;
          outline: none;
        }
        .date-input:focus, .project-select:focus { border-color: var(--primary); }
        .date-sep { color: var(--text-muted); font-size: 12px; }
        .date-actions { margin-left: auto; display: flex; gap: 8px; }

        /* Single‑column P&L */
        .report-body {
          padding: 32px;
          max-width: 900px;
        }

        .section { margin-bottom: 28px; }

        .section-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
        }
        .section-head:hover .section-title-text { color: var(--primary); }
        .section-badge { width: 3px; height: 16px; border-radius: 2px; flex-shrink: 0; }
        .section-title-text {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted); transition: color 0.15s;
        }

        .account-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 9px 0 9px 11px; border-bottom: 1px solid var(--border);
          cursor: pointer; transition: background 0.1s; border-radius: 4px; margin: 1px 0;
        }
        .account-row:hover { background: var(--card-hover); }
        .acc-code { font-size: 10px; color: var(--text-muted); min-width: 42px; }
        .acc-name { font-size: 13px; color: var(--text); flex: 1; padding: 0 10px; }
        .acc-amount { font-size: 13px; font-weight: 500; }

        .subtotal-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 0; margin-top: 2px; font-size: 13px; font-weight: 600;
          border-top: 1px solid var(--border);
        }
        .subtotal-label { color: var(--text); padding-left: 11px; }
        .subtotal-amount { font-weight: 600; }

        .divider-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 0; font-size: 14px; font-weight: 700;
          border-top: 2px solid var(--border-strong); border-bottom: 2px solid var(--border-strong);
          margin: 8px 0;
        }
        .divider-label { color: var(--text); padding-left: 11px; }
        .divider-amount { font-weight: 700; }

        .net-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px; background: var(--card-hover); border: 1px solid var(--primary);
          border-radius: 10px; margin-top: 20px;
        }
        .net-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .net-amount { font-size: 20px; font-weight: 700; }

        .zero-state { padding: 16px 11px; font-size: 12px; color: var(--text-soft); font-style: italic; }

        /* Compare table */
        .compare-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        .compare-table th {
          background: var(--card-hover);
          padding: 10px 12px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          text-align: right;
        }
        .compare-table th:first-child { text-align: left; }
        .compare-table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          text-align: right;
        }
        .compare-table td:first-child { text-align: left; font-weight: 500; color: var(--text); }
        .compare-table .section-header td {
          font-weight: 700; color: var(--text-muted); font-size: 11px; text-transform: uppercase;
          padding-top: 16px; background: var(--bg-soft);
        }
        .compare-table .subtotal-row td { font-weight: 700; border-top: 1px solid var(--border); }
        .compare-table .bold-row td { font-weight: 700; border-top: 2px solid var(--border-strong); }

        @media (max-width: 900px) {
          .kpi-strip { grid-template-columns: repeat(2, 1fr); }
          .pl-header { padding: 0 16px; }
          .date-bar, .report-body { padding: 16px; }
        }
        @media print {
          .pl-header, .date-bar { display: none; }
          .kpi-strip { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* Sticky Header */}
      <div className="pl-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/reports")}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
              Profit &amp; Loss Statement
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#93C5FD", background: "#1E3A5F", padding: "2px 8px", borderRadius: 4 }}>
                FY {now.getFullYear()}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Click any row to drill into Trial Balance</div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>PKR {fmt(totalRevenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Gross Profit</div>
          <div className="kpi-value" style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>
            {grossProfit < 0 ? "-" : ""}PKR {fmt(grossProfit)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Net Profit / Loss</div>
          <div className="kpi-value" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
            {netProfit < 0 ? "-" : ""}PKR {fmt(netProfit)}
          </div>
          <div className="kpi-sub" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {netProfit >= 0 ? <TrendingUp size={11} color="#10B981" /> : <TrendingDown size={11} color="#EF4444" />}
            Margin: {margin}%
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Expenses</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>PKR {fmt(totalExpenses)}</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="date-bar">
        <Calendar size={13} color="var(--text-muted)" />
        <span className="date-label">Period</span>
        <input className="date-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span className="date-sep">—</span>
        <input className="date-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <span className="date-label" style={{ marginLeft: 16 }}>Project</span>
        <select className="project-select" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} />
          Compare Projects
        </label>
        <div className="date-actions">
          <button className="action-btn" onClick={() => window.print()}><Printer size={13} /> Print</button>
          <button className="action-btn"><Download size={13} /> Export</button>
        </div>
      </div>

      {/* Report Body – single column OR compare table */}
      {!compareMode ? (
        <div className="report-body">
          {/* Revenue */}
          <div className="section">
            <div className="section-head" onClick={() => navigateToTrialBalance("Revenue")}>
              <div className="section-badge" style={{ background: "#10B981" }} />
              <span className="section-title-text">Income / Revenue</span>
            </div>
            {revenueAccounts.length === 0 ? (
              <div className="zero-state">No revenue accounts found</div>
            ) : (
              revenueAccounts.map(a => (
                <div key={a.id} className="account-row" onClick={() => openTrialForAccount(a)}>
                  <span className="acc-code">{a.code}</span>
                  <span className="acc-name">{a.name}</span>
                  <span className="acc-amount" style={{ color: "#10B981" }}>
                    PKR {fmt(a.balance || 0)}
                  </span>
                </div>
              ))
            )}
            <div className="subtotal-row">
              <span className="subtotal-label">Total Revenue</span>
              <span className="subtotal-amount" style={{ color: "#10B981" }}>PKR {fmt(totalRevenue)}</span>
            </div>
          </div>

          {/* Direct Expenses */}
          {directExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => navigateToTrialBalance("Expense", "Direct Expenses")}>
                <div className="section-badge" style={{ background: "#EF4444" }} />
                <span className="section-title-text">Cost of Goods Sold / Direct Expenses</span>
              </div>
              {directExpenses.map(a => (
                <div key={a.id} className="account-row" onClick={() => openTrialForAccount(a)}>
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
              {grossProfit < 0 ? "-" : ""}PKR {fmt(grossProfit)}
            </span>
          </div>

          {/* Operating Expenses */}
          {operatingExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => navigateToTrialBalance("Expense", "Operating Expenses")}>
                <div className="section-badge" style={{ background: "#F59E0B" }} />
                <span className="section-title-text">Operating Expenses</span>
              </div>
              {operatingExpenses.map(a => (
                <div key={a.id} className="account-row" onClick={() => openTrialForAccount(a)}>
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
              <div className="section-head" onClick={() => navigateToTrialBalance("Expense")}>
                <div className="section-badge" style={{ background: "#8B5CF6" }} />
                <span className="section-title-text">Other Expenses</span>
              </div>
              {otherExpenses.map(a => (
                <div key={a.id} className="account-row" onClick={() => openTrialForAccount(a)}>
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

          {/* Net Profit */}
          <div className="net-row">
            <div>
              <div className="net-label" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
                {netProfit >= 0 ? "✦ Net Profit" : "▼ Net Loss"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 3 }}>Profit margin: {margin}%</div>
            </div>
            <div className="net-amount" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
              {netProfit < 0 ? "-" : ""}PKR {fmt(netProfit)}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 32, overflowX: "auto" }}>
          {compareLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading project comparison…</div>
          ) : compareRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No transactions found for this period.</div>
          ) : (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Project‑wise Profit &amp; Loss</h3>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    {projects.map(p => (
                      <th key={p.id}>{p.name}</th>
                    ))}
                    <th>Unallocated</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue section */}
                  <tr className="section-header"><td colSpan={projects.length + 3} style={{ color: "#10B981" }}>Income / Revenue</td></tr>
                  {compareRows.filter(r => r.type === "Revenue").map(row => (
                    <tr key={row.id}>
                      <td>{row.code} – {row.name}</td>
                      {projects.map(p => (
                        <td key={p.id} style={{ color: "#10B981" }}>
                          PKR {fmt(row.projectAmounts[p.id] || 0)}
                        </td>
                      ))}
                      <td style={{ color: "#10B981" }}>PKR {fmt(row.unallocated)}</td>
                      <td style={{ fontWeight: 600, color: "#10B981" }}>PKR {fmt(row.total)}</td>
                    </tr>
                  ))}
                  <tr className="subtotal-row">
                    <td style={{ fontWeight: 700 }}>Total Revenue</td>
                    {projects.map(p => {
                      const total = compareRows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      return <td key={p.id} style={{ color: "#10B981", fontWeight: 700 }}>PKR {fmt(total)}</td>
                    })}
                    <td style={{ fontWeight: 700, color: "#10B981" }}>
                      PKR {fmt(compareRows.filter(r => r.type === "Revenue").reduce((s, r) => s + r.unallocated, 0))}
                    </td>
                    <td style={{ fontWeight: 700, color: "#10B981" }}>PKR {fmt(totalRevenue)}</td>
                  </tr>

                  {/* Direct Expenses */}
                  <tr className="section-header"><td colSpan={projects.length + 3} style={{ color: "#EF4444" }}>Cost of Goods Sold / Direct Expenses</td></tr>
                  {compareRows.filter(r => r.category === "Direct Expenses").map(row => (
                    <tr key={row.id}>
                      <td>{row.code} – {row.name}</td>
                      {projects.map(p => (
                        <td key={p.id} style={{ color: "#EF4444" }}>
                          PKR {fmt(row.projectAmounts[p.id] || 0)}
                        </td>
                      ))}
                      <td style={{ color: "#EF4444" }}>PKR {fmt(row.unallocated)}</td>
                      <td style={{ fontWeight: 600, color: "#EF4444" }}>PKR {fmt(row.total)}</td>
                    </tr>
                  ))}
                  <tr className="subtotal-row">
                    <td style={{ fontWeight: 700 }}>Total Direct Expenses</td>
                    {projects.map(p => {
                      const total = compareRows.filter(r => r.category === "Direct Expenses").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      return <td key={p.id} style={{ color: "#EF4444", fontWeight: 700 }}>PKR {fmt(total)}</td>
                    })}
                    <td style={{ fontWeight: 700, color: "#EF4444" }}>
                      PKR {fmt(compareRows.filter(r => r.category === "Direct Expenses").reduce((s, r) => s + r.unallocated, 0))}
                    </td>
                    <td style={{ fontWeight: 700, color: "#EF4444" }}>PKR {fmt(totalDirect)}</td>
                  </tr>

                  {/* Gross Profit */}
                  <tr className="bold-row">
                    <td style={{ fontWeight: 700 }}>Gross Profit</td>
                    {projects.map(p => {
                      const rev = compareRows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      const dir = compareRows.filter(r => r.category === "Direct Expenses").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      const gp = rev - dir
                      return <td key={p.id} style={{ color: gp >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                        {gp >= 0 ? "" : "-"}PKR {fmt(gp)}
                      </td>
                    })}
                    <td style={{ fontWeight: 700 }}></td>
                    <td style={{ fontWeight: 700, color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>
                      {grossProfit >= 0 ? "" : "-"}PKR {fmt(grossProfit)}
                    </td>
                  </tr>

                  {/* Operating Expenses */}
                  <tr className="section-header"><td colSpan={projects.length + 3} style={{ color: "#F59E0B" }}>Operating Expenses</td></tr>
                  {compareRows.filter(r => r.category === "Operating Expenses").map(row => (
                    <tr key={row.id}>
                      <td>{row.code} – {row.name}</td>
                      {projects.map(p => (
                        <td key={p.id} style={{ color: "#F59E0B" }}>
                          PKR {fmt(row.projectAmounts[p.id] || 0)}
                        </td>
                      ))}
                      <td style={{ color: "#F59E0B" }}>PKR {fmt(row.unallocated)}</td>
                      <td style={{ fontWeight: 600, color: "#F59E0B" }}>PKR {fmt(row.total)}</td>
                    </tr>
                  ))}
                  <tr className="subtotal-row">
                    <td style={{ fontWeight: 700 }}>Total Operating Expenses</td>
                    {projects.map(p => {
                      const total = compareRows.filter(r => r.category === "Operating Expenses").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      return <td key={p.id} style={{ color: "#F59E0B", fontWeight: 700 }}>PKR {fmt(total)}</td>
                    })}
                    <td style={{ fontWeight: 700, color: "#F59E0B" }}>
                      PKR {fmt(compareRows.filter(r => r.category === "Operating Expenses").reduce((s, r) => s + r.unallocated, 0))}
                    </td>
                    <td style={{ fontWeight: 700, color: "#F59E0B" }}>PKR {fmt(totalOpEx)}</td>
                  </tr>

                  {/* Other Expenses */}
                  <tr className="section-header"><td colSpan={projects.length + 3} style={{ color: "#8B5CF6" }}>Other Expenses</td></tr>
                  {compareRows.filter(r => r.category === "Other" && r.type === "Expense").map(row => (
                    <tr key={row.id}>
                      <td>{row.code} – {row.name}</td>
                      {projects.map(p => (
                        <td key={p.id} style={{ color: "#8B5CF6" }}>
                          PKR {fmt(row.projectAmounts[p.id] || 0)}
                        </td>
                      ))}
                      <td style={{ color: "#8B5CF6" }}>PKR {fmt(row.unallocated)}</td>
                      <td style={{ fontWeight: 600, color: "#8B5CF6" }}>PKR {fmt(row.total)}</td>
                    </tr>
                  ))}
                  <tr className="subtotal-row">
                    <td style={{ fontWeight: 700 }}>Total Other Expenses</td>
                    {projects.map(p => {
                      const total = compareRows.filter(r => r.category === "Other" && r.type === "Expense").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      return <td key={p.id} style={{ color: "#8B5CF6", fontWeight: 700 }}>PKR {fmt(total)}</td>
                    })}
                    <td style={{ fontWeight: 700, color: "#8B5CF6" }}>
                      PKR {fmt(compareRows.filter(r => r.category === "Other" && r.type === "Expense").reduce((s, r) => s + r.unallocated, 0))}
                    </td>
                    <td style={{ fontWeight: 700, color: "#8B5CF6" }}>PKR {fmt(totalOther)}</td>
                  </tr>

                  {/* Net Profit */}
                  <tr className="bold-row">
                    <td style={{ fontWeight: 700 }}>Net Profit / Loss</td>
                    {projects.map(p => {
                      const rev = compareRows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      const allExp = compareRows.filter(r => r.type === "Expense").reduce((s, r) => s + (r.projectAmounts[p.id] || 0), 0)
                      const net = rev - allExp
                      return <td key={p.id} style={{ color: net >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                        {net >= 0 ? "" : "-"}PKR {fmt(net)}
                      </td>
                    })}
                    <td style={{ fontWeight: 700 }}></td>
                    <td style={{ fontWeight: 700, color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
                      {netProfit >= 0 ? "" : "-"}PKR {fmt(netProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}