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

  // Comparative data – now account‑level
  const [comparativeData, setComparativeData] = useState<{
    projects: any[]
    revenueAccounts: any[]
    directExpenseAccounts: any[]
    operatingExpenseAccounts: any[]
    otherExpenseAccounts: any[]
  } | null>(null)
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

  // Fetch account‑level comparative data when compareMode is on
  useEffect(() => {
    if (!compareMode || projects.length === 0 || accounts.length === 0) {
      setComparativeData(null)
      return
    }

    setCompareLoading(true)

    const fetchComparative = async () => {
      // Identify which accounts are revenue / expense
      const revenueIds = accounts.filter(a => a.type === "Revenue").map(a => a.id)
      const expenseIds = accounts.filter(a => a.type === "Expense").map(a => a.id)

      // For each project, fetch all journal lines for revenue and expense accounts
      const projectResults = await Promise.all(
        projects.map(async (proj: any) => {
          const { data: lines } = await supabase
            .from("journal_lines")
            .select("account_id, debit, credit, journal_entries!inner(date)")
            .eq("project_id", proj.id)
            .gte("journal_entries.date", startDate)
            .lte("journal_entries.date", endDate)

          // Aggregate by account_id
          const accountAmounts: Record<number, number> = {}
          if (lines) {
            lines.forEach((l: any) => {
              const net = (l.credit || 0) - (l.debit || 0)
              accountAmounts[l.account_id] = (accountAmounts[l.account_id] || 0) + net
            })
          }
          return {
            projectId: proj.id,
            projectName: proj.name,
            accountAmounts,  // account_id → net amount
          }
        })
      )

      // Build the final data structure with all accounts listed (even if zero)
      const revenueAccts = accounts.filter(a => a.type === "Revenue")
      const directExpAccts = accounts.filter(a => a.type === "Expense" && getCategory(a) === "Direct Expenses")
      const opExAccts = accounts.filter(a => a.type === "Expense" && getCategory(a) === "Operating Expenses")
      const otherExpAccts = accounts.filter(a => a.type === "Expense" && !["Direct Expenses", "Operating Expenses"].includes(getCategory(a)))

      setComparativeData({
        projects: projectResults,
        revenueAccounts: revenueAccts,
        directExpenseAccounts: directExpAccts,
        operatingExpenseAccounts: opExAccts,
        otherExpenseAccounts: otherExpAccts,
      })
      setCompareLoading(false)
    }

    fetchComparative()
  }, [compareMode, projects, startDate, endDate, accounts])

  // Build matrix rows from comparative data
  const matrixSections: { title: string; color: string; accounts: any[]; isExpense: boolean }[] = comparativeData
    ? [
        { title: "Income / Revenue", color: "#10B981", accounts: comparativeData.revenueAccounts, isExpense: false },
        { title: "Direct Expenses", color: "#EF4444", accounts: comparativeData.directExpenseAccounts, isExpense: true },
        { title: "Operating Expenses", color: "#F59E0B", accounts: comparativeData.operatingExpenseAccounts, isExpense: true },
        { title: "Other Expenses", color: "#8B5CF6", accounts: comparativeData.otherExpenseAccounts, isExpense: true },
      ]
    : []

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

        /* Matrix table */
        .matrix-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        .matrix-table th {
          background: var(--card-hover);
          padding: 10px 12px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          text-align: right;
        }
        .matrix-table th:first-child { text-align: left; }
        .matrix-table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          text-align: right;
        }
        .matrix-table td:first-child { text-align: left; font-weight: 500; color: var(--text); }
        .matrix-table .section-header td {
          font-weight: 700; color: var(--text-muted); font-size: 11px; text-transform: uppercase;
          padding-top: 16px;
        }
        .matrix-table .subtotal-row td { font-weight: 700; border-top: 1px solid var(--border); }
        .matrix-table .bold-row td { font-weight: 700; border-top: 2px solid var(--border-strong); }

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

      {/* Report Body – single column OR matrix */}
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
          ) : !comparativeData || comparativeData.projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No projects found.</div>
          ) : (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Project‑wise Profit &amp; Loss</h3>
              {matrixSections.map((section, secIdx) => (
                <div key={section.title} style={{ marginBottom: 24 }}>
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th style={{ color: section.color }}>{section.title}</th>
                        {comparativeData.projects.map((proj: any) => (
                          <th key={proj.projectId}>{proj.projectName}</th>
                        ))}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Account rows */}
                      {section.accounts.map((acc: any) => {
                        const values = comparativeData.projects.map((proj: any) => {
                          const amt = proj.accountAmounts[acc.id]
                          // For revenue, we show credit amounts as positive; for expenses, debit amounts as positive
                          return section.isExpense ? Math.abs(amt || 0) : Math.abs(amt || 0)
                        })
                        const total = values.reduce((s: number, v: number) => s + v, 0)
                        return (
                          <tr key={acc.id}>
                            <td style={{ color: "var(--text)", fontSize: 12 }}>
                              {acc.code} – {acc.name}
                            </td>
                            {values.map((val, idx) => (
                              <td key={idx} style={{ color: section.color }}>
                                PKR {fmt(val)}
                              </td>
                            ))}
                            <td style={{ fontWeight: 600, color: section.color }}>PKR {fmt(total)}</td>
                          </tr>
                        )
                      })}
                      {/* Category subtotal */}
                      <tr className="subtotal-row">
                        <td style={{ fontWeight: 700, color: section.color }}>
                          Total {section.title}
                        </td>
                        {comparativeData.projects.map((proj: any, idx: number) => {
                          const total = section.accounts.reduce((sum: number, acc: any) => {
                            const amt = proj.accountAmounts[acc.id] || 0
                            return sum + (section.isExpense ? Math.abs(amt) : Math.abs(amt))
                          }, 0)
                          return (
                            <td key={idx} style={{ fontWeight: 700, color: section.color }}>
                              PKR {fmt(total)}
                            </td>
                          )
                        })}
                        <td style={{ fontWeight: 700, color: section.color }}>
                          PKR {fmt(section.accounts.reduce((sum: number, acc: any) => {
                            return sum + comparativeData.projects.reduce((s: number, proj: any) => {
                              const amt = proj.accountAmounts[acc.id] || 0
                              return s + (section.isExpense ? Math.abs(amt) : Math.abs(amt))
                            }, 0)
                          }, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}

              {/* Gross Profit + Net Profit summary rows */}
              <table className="matrix-table">
                <tbody>
                  {/* Gross Profit */}
                  <tr className="bold-row">
                    <td style={{ color: "#10B981", fontWeight: 700 }}>Gross Profit</td>
                    {comparativeData.projects.map((proj: any) => {
                      const rev = matrixSections[0]?.accounts.reduce((sum: number, acc: any) => sum + Math.abs(proj.accountAmounts[acc.id] || 0), 0) || 0
                      const dirExp = matrixSections[1]?.accounts.reduce((sum: number, acc: any) => sum + Math.abs(proj.accountAmounts[acc.id] || 0), 0) || 0
                      const gp = rev - dirExp
                      return <td key={proj.projectId} style={{ fontWeight: 700, color: gp >= 0 ? "#10B981" : "#EF4444" }}>{gp >= 0 ? "" : "-"}PKR {fmt(gp)}</td>
                    })}
                    <td style={{ fontWeight: 700, color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>
                      {grossProfit >= 0 ? "" : "-"}PKR {fmt(grossProfit)}
                    </td>
                  </tr>

                  {/* Net Profit */}
                  <tr className="bold-row">
                    <td style={{ color: "#10B981", fontWeight: 700 }}>Net Profit / Loss</td>
                    {comparativeData.projects.map((proj: any) => {
                      const rev = matrixSections[0]?.accounts.reduce((sum: number, acc: any) => sum + Math.abs(proj.accountAmounts[acc.id] || 0), 0) || 0
                      const allExp = matrixSections.slice(1).reduce((sum: number, sec: any) => {
                        return sum + sec.accounts.reduce((s: number, acc: any) => s + Math.abs(proj.accountAmounts[acc.id] || 0), 0)
                      }, 0)
                      const net = rev - allExp
                      return <td key={proj.projectId} style={{ fontWeight: 700, color: net >= 0 ? "#10B981" : "#EF4444" }}>{net >= 0 ? "" : "-"}PKR {fmt(net)}</td>
                    })}
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