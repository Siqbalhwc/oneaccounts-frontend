"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Printer, Calendar, TrendingUp, TrendingDown } from "lucide-react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { generateProfitLossPDF } from "@/lib/pdf/profitLossPDF"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"

function getCategory(account: any): string {
  if (account.category) return account.category
  const num = parseFloat(account.code)
  if (isNaN(num)) return "Other"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  return "Other"
}

function fmt(n: number) { return Math.abs(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtOrDash(n: number) { return n === 0 ? "–" : fmt(n) }

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

  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [compareMode, setCompareMode] = useState(false)

  const [compareRows, setCompareRows] = useState<any[]>([])
  const [compareLoading, setCompareLoading] = useState(false)

  const { companyName, companyTagline, logoUrl } = useCompany()
  const { theme: themeMode } = useTheme()
  const isDarkTheme = themeMode === "dark"
  const isOneAccounts = themeMode === "oneaccounts"
  const isLightStyle = themeMode === "light" || isOneAccounts
  const headerBg = isOneAccounts ? "#07085B" : (isDarkTheme ? "#000000" : "#07085B")
  const rowLight = isLightStyle ? "#FFFFFF" : "#1E293B"
  const rowDark  = isLightStyle ? "#F8F9FC" : "#111827"
  const textMuted = isLightStyle ? "#64748B" : "#94A3B8"
  const reportTextColor = isOneAccounts ? "#1E293B" : "var(--text)"
  const reportMutedColor = isOneAccounts ? "#64748B" : "var(--text-muted)"

  // ── Fetch accounts (overall or filtered by project) ──
  const fetchAccounts = async () => {
    setLoading(true)
    try {
      let url = `/api/profit-loss?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      if (selectedProjectId) url += `&projectId=${encodeURIComponent(selectedProjectId)}`

      const res = await fetch(url)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      const mapped = (json || []).map((row: any) => ({
        id: row.account_id,
        code: row.code,
        name: row.name,
        type: row.type,
        category: row.category || getCategory({ code: row.code }),
        balance: Number(row.net),
      }))
      setAccounts(mapped)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").is("deleted_at", null).order("name")
    if (data) setProjects(data)
  }

  useEffect(() => {
    fetchAccounts()
    fetchProjects()
  }, [startDate, endDate, selectedProjectId])

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

  // ── Project comparison (unchanged) ──
  useEffect(() => {
    if (!compareMode || accounts.length === 0) { setCompareRows([]); return }
    setCompareLoading(true)

    const fetchCompare = async () => {
      const revenueIds = accounts.filter(a => a.type === "Revenue").map(a => a.id)
      const expenseIds = accounts.filter(a => a.type === "Expense").map(a => a.id)
      const allRelIds = [...revenueIds, ...expenseIds]

      const { data: lines, error } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, project_id, journal_entries!inner(date)")
        .in("account_id", allRelIds)

      if (error) { setCompareRows([]); setCompareLoading(false); return }

      const accountTotals: Record<number, number> = {}
      const accountProject: Record<number, Record<string, number>> = {}

      if (lines) {
        const filtered = lines.filter((l: any) => {
          const d = l.journal_entries?.date
          return d && d >= startDate && d <= endDate
        })

        filtered.forEach((l: any) => {
          const net = (l.credit || 0) - (l.debit || 0)
          accountTotals[l.account_id] = (accountTotals[l.account_id] || 0) + net
          if (!accountProject[l.account_id]) accountProject[l.account_id] = {}
          const pid = l.project_id || "unallocated"
          accountProject[l.account_id][pid] = (accountProject[l.account_id][pid] || 0) + net
        })
      }

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

  // ── Excel export (unchanged) ──
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()
    const companyNameLocal = companyName || "Shahid Iqbal & Co"
    const title = `Profit & Loss Statement`
    const period = `From ${startDate} to ${endDate}`

    if (!compareMode) {
      const sheetData: any[][] = [
        [companyNameLocal],
        [title],
        [period],
        [""],
        ["Account", "Amount (PKR)"],
      ]

      const addSection = (heading: string, accountsList: any[]) => {
        sheetData.push([heading, ""])
        accountsList.forEach(a => {
          sheetData.push([`${a.code} – ${a.name}`, fmt(a.balance || 0)])
        })
      }

      addSection("Income / Revenue", revenueAccounts)
      if (directExpenses.length > 0) addSection("Cost of Goods Sold / Direct Expenses", directExpenses)
      sheetData.push(["Gross Profit", fmt(grossProfit)])
      if (operatingExpenses.length > 0) addSection("Operating Expenses", operatingExpenses)
      if (otherExpenses.length > 0) addSection("Other Expenses", otherExpenses)
      sheetData.push(["Net Profit / Loss", fmt(netProfit)])

      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      ws["!cols"] = [{ wch: 50 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, ws, "Profit & Loss")
    } else {
      const headers = ["Account", ...projects.map(p => p.name), "Unallocated", "Total"]
      const sheetData: any[][] = [
        [companyNameLocal],
        [title],
        [period],
        [""],
        headers,
      ]

      const projSubtotal = (filter: (r: any) => boolean, pid: string) =>
        compareRows.filter(filter).reduce((s, r) => s + (r.projectAmounts[pid] || 0), 0)
      const projUnallocatedSubtotal = (filter: (r: any) => boolean) =>
        compareRows.filter(filter).reduce((s, r) => s + r.unallocated, 0)
      const projTotal = (filter: (r: any) => boolean) =>
        compareRows.filter(filter).reduce((s, r) => s + r.total, 0)

      const addSection = (heading: string, filter: (r: any) => boolean) => {
        sheetData.push([heading, ...projects.map(() => ""), "", ""])
        compareRows.filter(filter).forEach(row => {
          const vals = projects.map(p => fmtOrDash(row.projectAmounts[p.id] || 0))
          sheetData.push([`${row.code} – ${row.name}`, ...vals, fmtOrDash(row.unallocated), fmtOrDash(row.total)])
        })
        const subtotals = projects.map(p => fmt(projSubtotal(filter, p.id)))
        sheetData.push(["Total " + heading, ...subtotals, fmt(projUnallocatedSubtotal(filter)), fmt(projTotal(filter))])
      }

      addSection("Income / Revenue", r => r.type === "Revenue")
      if (directExpenses.length > 0) addSection("Cost of Goods Sold / Direct Expenses", r => r.category === "Direct Expenses")
      const gpRow = ["Gross Profit"]
      projects.forEach(p => {
        const rev = projSubtotal(r => r.type === "Revenue", p.id)
        const dir = projSubtotal(r => r.category === "Direct Expenses", p.id)
        gpRow.push(fmt(rev - dir))
      })
      gpRow.push("", fmt(grossProfit))
      sheetData.push(gpRow)

      if (operatingExpenses.length > 0) addSection("Operating Expenses", r => r.category === "Operating Expenses")
      if (otherExpenses.length > 0) addSection("Other Expenses", r => r.category === "Other" && r.type === "Expense")

      const netRow = ["Net Profit / Loss"]
      projects.forEach(p => {
        const rev = projSubtotal(r => r.type === "Revenue", p.id)
        const exp = projSubtotal(r => r.type === "Expense", p.id)
        netRow.push(fmt(rev - exp))
      })
      netRow.push("", fmt(netProfit))
      sheetData.push(netRow)

      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      ws["!cols"] = [{ wch: 40 }, ...projects.map(() => ({ wch: 18 })), { wch: 18 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, ws, "Profit & Loss")
    }

    XLSX.writeFile(wb, `Profit_Loss_${startDate}_to_${endDate}.xlsx`)
  }

  // ── PDF export handler (unchanged) ──────────────────────────────
  const handleExportPDF = async () => {
    if (compareMode) {
      const pdfData = {
        companyName: companyName || "OneAccounts",
        companyTagline: companyTagline || "",
        logoUrl: logoUrl || null,
        startDate,
        endDate,
        mode: "compare" as const,
        projects,
        compareRows,
        compareGrossProfit: grossProfit,
        compareNetProfit: netProfit,
      }
      const doc = await generateProfitLossPDF(pdfData)
      doc.save(`Profit_Loss_Compare_${startDate}_to_${endDate}.pdf`)
    } else {
      const pdfData = {
        companyName: companyName || "OneAccounts",
        companyTagline: companyTagline || "",
        logoUrl: logoUrl || null,
        startDate,
        endDate,
        mode: "overall" as const,
        revenueAccounts: revenueAccounts.map(a => ({ code: a.code, name: a.name, amount: Math.abs(a.balance || 0) })),
        directExpenses: directExpenses.map(a => ({ code: a.code, name: a.name, amount: Math.abs(a.balance || 0) })),
        operatingExpenses: operatingExpenses.map(a => ({ code: a.code, name: a.name, amount: Math.abs(a.balance || 0) })),
        otherExpenses: otherExpenses.map(a => ({ code: a.code, name: a.name, amount: Math.abs(a.balance || 0) })),
        grossProfit,
        netProfit,
        totalRevenue,
        totalDirect,
        totalOpEx,
        totalOther,
      }
      const doc = await generateProfitLossPDF(pdfData)
      doc.save(`Profit_Loss_${startDate}_to_${endDate}.pdf`)
    }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--text-muted)", fontFamily: "'Inter', sans-serif", gap: 12 }}>
      <div style={{ width: 20, height: 20, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Loading financial data…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const projSubtotal = (filter: (r: any) => boolean, pid: string) =>
    compareRows.filter(filter).reduce((s, r) => s + (r.projectAmounts[pid] || 0), 0)
  const projUnallocatedSubtotal = (filter: (r: any) => boolean) =>
    compareRows.filter(filter).reduce((s, r) => s + r.unallocated, 0)
  const projTotal = (filter: (r: any) => boolean) =>
    compareRows.filter(filter).reduce((s, r) => s + r.total, 0)

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        * { box-sizing: border-box; }
        .report-header {
          background: var(--card); border-bottom: 1px solid var(--border);
          padding: 20px 32px; display: flex; align-items: center;
          justify-content: space-between; flex-wrap: wrap; gap: 16px;
        }
        .report-header-left { display: flex; align-items: center; gap: 14px; }
        .report-logo { width: 34px; height: 34px; border-radius: 9px; object-fit: contain; }
        .report-company-name { font-size: 16px; font-weight: 700; }
        .report-company-tagline { font-size: 11px; }
        .report-header-right { text-align: right; }
        .report-title { font-size: 24px; font-weight: 800; }
        .report-period { font-size: 12px; }

        .kpi-row { display: flex; gap: 16px; padding: 24px 32px; flex-wrap: wrap; }
        .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 24px; flex: 1; min-width: 180px; box-shadow: var(--shadow-sm); }
        .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px; }
        .kpi-value { font-size: 26px; font-weight: 800; }

        .filter-bar { display: flex; align-items: center; gap: 12px; padding: 0 32px 20px; flex-wrap: wrap; }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .date-input, .project-select { height: 34px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 10px; font-size: 12px; background: var(--card); color: var(--text); outline: none; font-family: inherit; width: 140px; }
        .date-input:focus, .project-select:focus { border-color: var(--primary); }

        .section { margin: 0 32px 16px; }
        .section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 8px 0; cursor: pointer; }
        .section-head:hover .section-title-text { color: var(--primary); }
        .section-title-text { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); transition: color 0.15s; }
        .account-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
        .account-row:hover { background: var(--card-hover); }
        .subtotal-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 12px; font-weight: 700; font-size: 14px; border-top: 2px solid var(--border); }
        .net-row { background: var(--card-hover); border: 1px solid var(--primary); border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin: 0 32px 24px; }

        /* compare table */
        .compare-wrap { padding: 0 32px 32px; overflow-x: auto; }
        .compare-table { width: 100%; border-collapse: collapse; }
        .compare-table th { background: ${headerBg}; color: white; padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; text-align: right; white-space: nowrap; }
        .compare-table th.col-account { text-align: left; }
        .compare-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; text-align: right; white-space: nowrap; }
        .compare-table td.td-account { text-align: left; font-weight: 500; white-space: nowrap; }
        .compare-table tr.section-head td { font-weight: 700; font-size: 11px; text-transform: uppercase; padding-top: 18px; padding-bottom: 6px; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .compare-table tr.subtotal td { font-weight: 700; font-size: 13px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .compare-table tr.bold td { font-weight: 700; font-size: 13px; border-top: 2px solid var(--border-strong); border-bottom: 2px solid var(--border-strong); }

        @media (max-width: 900px) {
          .kpi-row { flex-direction: column; }
          .report-header, .kpi-row, .filter-bar, .section, .net-row, .compare-wrap { padding-left: 16px; padding-right: 16px; }
        }
      `}</style>

      {/* Report Header */}
      <div className="report-header">
        <div className="report-header-left">
          {/* ⬅ Back button */}
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}>
            <ArrowLeft size={16} />
          </button>
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="report-logo" width={34} height={34} />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>
              {(companyName || "O")[0]}
            </div>
          )}
          <div>
            <div className="report-company-name" style={{ color: reportTextColor }}>{companyName || "OneAccounts"}</div>
            <div className="report-company-tagline" style={{ color: reportMutedColor }}>{companyTagline || ""}</div>
          </div>
        </div>
        <div className="report-header-right">
          <div className="report-title" style={{ color: reportTextColor }}>Profit &amp; Loss</div>
          <div className="report-period" style={{ color: reportMutedColor }}>From {startDate} to {endDate}</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Income</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>PKR {fmt(totalRevenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Expenses</div>
          <div className="kpi-value" style={{ color: "#EF4444" }}>PKR {fmt(totalExpenses)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Net Profit / Loss</div>
          <div className="kpi-value" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
            {netProfit < 0 ? "-" : ""}PKR {fmt(netProfit)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <Calendar size={13} color="var(--text-muted)" />
        <input type="date" className="date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
        <input type="date" className="date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        {/* Project filter – now affects overall view */}
        <select className="project-select" style={{ width: 180 }} value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} />
          Compare Projects
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExportExcel}><Download size={13} /> Excel</button>
          <button className="btn btn-outline" onClick={handleExportPDF}><Download size={13} /> PDF</button>
        </div>
      </div>

      {/* Report Body */}
      {!compareMode ? (
        <>
          {/* Income Section */}
          <div className="section">
            <div className="section-head" onClick={() => navigateToTrialBalance("Revenue")}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: "#10B981" }} />
              <span className="section-title-text">Income / Revenue</span>
            </div>
            {revenueAccounts.map((a, i) => (
              <div key={a.id} className="account-row" style={{ background: i % 2 === 0 ? rowLight : rowDark, color: isOneAccounts ? "#1E293B" : "inherit" }} onClick={() => openTrialForAccount(a)}>
                <span style={{ fontSize: 12, color: textMuted, minWidth: 50 }}>{a.code}</span>
                <span style={{ fontSize: 13, flex: 1, paddingLeft: 8 }}>{a.name}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#10B981" }}>PKR {fmt(a.balance || 0)}</span>
              </div>
            ))}
            <div className="subtotal-row" style={{ background: headerBg, color: "white" }}>
              <span>Total Revenue</span>
              <span>PKR {fmt(totalRevenue)}</span>
            </div>
          </div>

          {/* Direct Expenses */}
          {directExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => navigateToTrialBalance("Expense", "Direct Expenses")}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: "#EF4444" }} />
                <span className="section-title-text">Cost of Goods Sold / Direct Expenses</span>
              </div>
              {directExpenses.map((a, i) => (
                <div key={a.id} className="account-row" style={{ background: i % 2 === 0 ? rowLight : rowDark, color: isOneAccounts ? "#1E293B" : "inherit" }} onClick={() => openTrialForAccount(a)}>
                  <span style={{ fontSize: 12, color: textMuted, minWidth: 50 }}>{a.code}</span>
                  <span style={{ fontSize: 13, flex: 1, paddingLeft: 8 }}>{a.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#EF4444" }}>PKR {fmt(a.balance || 0)}</span>
                </div>
              ))}
              <div className="subtotal-row" style={{ background: headerBg, color: "white" }}>
                <span>Total Direct Expenses</span>
                <span>PKR {fmt(totalDirect)}</span>
              </div>
            </div>
          )}

          {/* Gross Profit */}
          <div style={{ margin: "0 32px 16px", display: "flex", justifyContent: "space-between", padding: "14px 12px", background: headerBg, color: "white", borderRadius: 8, fontWeight: 700 }}>
            <span>Gross Profit</span>
            <span>{grossProfit < 0 ? "-" : ""}PKR {fmt(grossProfit)}</span>
          </div>

          {/* Operating Expenses */}
          {operatingExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => navigateToTrialBalance("Expense", "Operating Expenses")}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: "#F59E0B" }} />
                <span className="section-title-text">Operating Expenses</span>
              </div>
              {operatingExpenses.map((a, i) => (
                <div key={a.id} className="account-row" style={{ background: i % 2 === 0 ? rowLight : rowDark, color: isOneAccounts ? "#1E293B" : "inherit" }} onClick={() => openTrialForAccount(a)}>
                  <span style={{ fontSize: 12, color: textMuted, minWidth: 50 }}>{a.code}</span>
                  <span style={{ fontSize: 13, flex: 1, paddingLeft: 8 }}>{a.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#F59E0B" }}>PKR {fmt(a.balance || 0)}</span>
                </div>
              ))}
              <div className="subtotal-row" style={{ background: headerBg, color: "white" }}>
                <span>Total Operating Expenses</span>
                <span>PKR {fmt(totalOpEx)}</span>
              </div>
            </div>
          )}

          {/* Other Expenses */}
          {otherExpenses.length > 0 && (
            <div className="section">
              <div className="section-head" onClick={() => navigateToTrialBalance("Expense")}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: "#8B5CF6" }} />
                <span className="section-title-text">Other Expenses</span>
              </div>
              {otherExpenses.map((a, i) => (
                <div key={a.id} className="account-row" style={{ background: i % 2 === 0 ? rowLight : rowDark, color: isOneAccounts ? "#1E293B" : "inherit" }} onClick={() => openTrialForAccount(a)}>
                  <span style={{ fontSize: 12, color: textMuted, minWidth: 50 }}>{a.code}</span>
                  <span style={{ fontSize: 13, flex: 1, paddingLeft: 8 }}>{a.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#8B5CF6" }}>PKR {fmt(a.balance || 0)}</span>
                </div>
              ))}
              <div className="subtotal-row" style={{ background: headerBg, color: "white" }}>
                <span>Total Other Expenses</span>
                <span>PKR {fmt(totalOther)}</span>
              </div>
            </div>
          )}

          {/* Net Profit */}
          <div className="net-row" style={{ background: headerBg, color: "white" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{netProfit >= 0 ? "Net Profit" : "Net Loss"}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Margin: {margin}%</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              {netProfit < 0 ? "-" : ""}PKR {fmt(netProfit)}
            </div>
          </div>
        </>
      ) : (
        /* ── PROJECT COMPARISON VIEW (unchanged) ── */
        <div className="compare-wrap">
          {compareLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading project comparison…</div>
          ) : compareRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              No transactions found for this period.<br />
              <span style={{ fontSize: 12 }}>💡 Tag invoices, bills, or journal entries with a project to see data here.</span>
            </div>
          ) : (
            <table className="compare-table">
              <thead>
                <tr>
                  <th className="col-account">Account</th>
                  {projects.map(p => (
                    <th key={p.id}>{p.name}<br /><span style={{ fontSize: 9, fontWeight: 400 }}>(PKR)</span></th>
                  ))}
                  <th>Unallocated<br /><span style={{ fontSize: 9, fontWeight: 400 }}>(PKR)</span></th>
                  <th>Total<br /><span style={{ fontSize: 9, fontWeight: 400 }}>(PKR)</span></th>
                </tr>
              </thead>
              <tbody>
                {/* Revenue */}
                <tr className="section-head">
                  <td className="td-account" style={{ color: "#10B981" }}>Income / Revenue</td>
                  {projects.map(p => <td key={p.id} />)}
                  <td /><td />
                </tr>
                {compareRows.filter(r => r.type === "Revenue").map(row => (
                  <tr key={row.id} style={{ background: compareRows.indexOf(row) % 2 === 0 ? rowLight : rowDark }}>
                    <td className="td-account">{row.code} – {row.name}</td>
                    {projects.map(p => (
                      <td key={p.id} style={{ color: "#10B981" }}>{fmtOrDash(row.projectAmounts[p.id] || 0)}</td>
                    ))}
                    <td style={{ color: "#10B981" }}>{fmtOrDash(row.unallocated)}</td>
                    <td style={{ fontWeight: 600, color: "#10B981" }}>{fmtOrDash(row.total)}</td>
                  </tr>
                ))}
                <tr className="subtotal">
                  <td className="td-account" style={{ color: "#10B981" }}>Total Revenue</td>
                  {projects.map(p => (
                    <td key={p.id} style={{ color: "#10B981" }}>{fmt(projSubtotal(r => r.type === "Revenue", p.id))}</td>
                  ))}
                  <td style={{ color: "#10B981" }}>{fmt(projUnallocatedSubtotal(r => r.type === "Revenue"))}</td>
                  <td style={{ color: "#10B981" }}>{fmt(projTotal(r => r.type === "Revenue"))}</td>
                </tr>

                {/* Direct Expenses */}
                <tr className="section-head">
                  <td className="td-account" style={{ color: "#EF4444" }}>Cost of Goods Sold / Direct Expenses</td>
                  {projects.map(p => <td key={p.id} />)}
                  <td /><td />
                </tr>
                {compareRows.filter(r => r.category === "Direct Expenses").map(row => (
                  <tr key={row.id} style={{ background: compareRows.indexOf(row) % 2 === 0 ? rowLight : rowDark }}>
                    <td className="td-account">{row.code} – {row.name}</td>
                    {projects.map(p => (
                      <td key={p.id} style={{ color: "#EF4444" }}>{fmtOrDash(row.projectAmounts[p.id] || 0)}</td>
                    ))}
                    <td style={{ color: "#EF4444" }}>{fmtOrDash(row.unallocated)}</td>
                    <td style={{ fontWeight: 600, color: "#EF4444" }}>{fmtOrDash(row.total)}</td>
                  </tr>
                ))}
                <tr className="subtotal">
                  <td className="td-account" style={{ color: "#EF4444" }}>Total Direct Expenses</td>
                  {projects.map(p => (
                    <td key={p.id} style={{ color: "#EF4444" }}>{fmt(projSubtotal(r => r.category === "Direct Expenses", p.id))}</td>
                  ))}
                  <td style={{ color: "#EF4444" }}>{fmt(projUnallocatedSubtotal(r => r.category === "Direct Expenses"))}</td>
                  <td style={{ color: "#EF4444" }}>{fmt(projTotal(r => r.category === "Direct Expenses"))}</td>
                </tr>

                {/* Gross Profit */}
                <tr className="bold">
                  <td className="td-account">Gross Profit</td>
                  {projects.map(p => {
                    const rev = projSubtotal(r => r.type === "Revenue", p.id)
                    const dir = projSubtotal(r => r.category === "Direct Expenses", p.id)
                    const gp = rev - dir
                    return (
                      <td key={p.id} style={{ color: gp >= 0 ? "#10B981" : "#EF4444" }}>
                        {gp < 0 ? "-" : ""}{fmt(Math.abs(gp))}
                      </td>
                    )
                  })}
                  <td style={{ fontWeight: 700 }}>
                    {(() => {
                      const uRev = projUnallocatedSubtotal(r => r.type === "Revenue")
                      const uDir = projUnallocatedSubtotal(r => r.category === "Direct Expenses")
                      const uGP = uRev - uDir
                      return <span style={{ color: uGP >= 0 ? "#10B981" : "#EF4444" }}>{uGP < 0 ? "-" : ""}{fmt(Math.abs(uGP))}</span>
                    })()}
                  </td>
                  <td style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>
                    {grossProfit < 0 ? "-" : ""}{fmt(Math.abs(grossProfit))}
                  </td>
                </tr>

                {/* Operating Expenses */}
                <tr className="section-head">
                  <td className="td-account" style={{ color: "#F59E0B" }}>Operating Expenses</td>
                  {projects.map(p => <td key={p.id} />)}
                  <td /><td />
                </tr>
                {compareRows.filter(r => r.category === "Operating Expenses").map(row => (
                  <tr key={row.id} style={{ background: compareRows.indexOf(row) % 2 === 0 ? rowLight : rowDark }}>
                    <td className="td-account">{row.code} – {row.name}</td>
                    {projects.map(p => (
                      <td key={p.id} style={{ color: "#F59E0B" }}>{fmtOrDash(row.projectAmounts[p.id] || 0)}</td>
                    ))}
                    <td style={{ color: "#F59E0B" }}>{fmtOrDash(row.unallocated)}</td>
                    <td style={{ fontWeight: 600, color: "#F59E0B" }}>{fmtOrDash(row.total)}</td>
                  </tr>
                ))}
                <tr className="subtotal">
                  <td className="td-account" style={{ color: "#F59E0B" }}>Total Operating Expenses</td>
                  {projects.map(p => (
                    <td key={p.id} style={{ color: "#F59E0B" }}>{fmt(projSubtotal(r => r.category === "Operating Expenses", p.id))}</td>
                  ))}
                  <td style={{ color: "#F59E0B" }}>{fmt(projUnallocatedSubtotal(r => r.category === "Operating Expenses"))}</td>
                  <td style={{ color: "#F59E0B" }}>{fmt(projTotal(r => r.category === "Operating Expenses"))}</td>
                </tr>

                {/* Other Expenses */}
                <tr className="section-head">
                  <td className="td-account" style={{ color: "#8B5CF6" }}>Other Expenses</td>
                  {projects.map(p => <td key={p.id} />)}
                  <td /><td />
                </tr>
                {compareRows.filter(r => r.category === "Other" && r.type === "Expense").map(row => (
                  <tr key={row.id} style={{ background: compareRows.indexOf(row) % 2 === 0 ? rowLight : rowDark }}>
                    <td className="td-account">{row.code} – {row.name}</td>
                    {projects.map(p => (
                      <td key={p.id} style={{ color: "#8B5CF6" }}>{fmtOrDash(row.projectAmounts[p.id] || 0)}</td>
                    ))}
                    <td style={{ color: "#8B5CF6" }}>{fmtOrDash(row.unallocated)}</td>
                    <td style={{ fontWeight: 600, color: "#8B5CF6" }}>{fmtOrDash(row.total)}</td>
                  </tr>
                ))}
                <tr className="subtotal">
                  <td className="td-account" style={{ color: "#8B5CF6" }}>Total Other Expenses</td>
                  {projects.map(p => (
                    <td key={p.id} style={{ color: "#8B5CF6" }}>{fmt(projSubtotal(r => r.category === "Other" && r.type === "Expense", p.id))}</td>
                  ))}
                  <td style={{ color: "#8B5CF6" }}>{fmt(projUnallocatedSubtotal(r => r.category === "Other" && r.type === "Expense"))}</td>
                  <td style={{ color: "#8B5CF6" }}>{fmt(projTotal(r => r.category === "Other" && r.type === "Expense"))}</td>
                </tr>

                {/* Net Profit */}
                <tr className="bold">
                  <td className="td-account">Net Profit / Loss</td>
                  {projects.map(p => {
                    const rev = projSubtotal(r => r.type === "Revenue", p.id)
                    const exp = projSubtotal(r => r.type === "Expense", p.id)
                    const net = rev - exp
                    return (
                      <td key={p.id} style={{ color: net >= 0 ? "#10B981" : "#EF4444" }}>
                        {net < 0 ? "-" : ""}{fmt(Math.abs(net))}
                      </td>
                    )
                  })}
                  <td style={{ fontWeight: 700 }}>
                    {(() => {
                      const uRev = projUnallocatedSubtotal(r => r.type === "Revenue")
                      const uExp = projUnallocatedSubtotal(r => r.type === "Expense")
                      const uNet = uRev - uExp
                      return <span style={{ color: uNet >= 0 ? "#10B981" : "#EF4444" }}>{uNet < 0 ? "-" : ""}{fmt(Math.abs(uNet))}</span>
                    })()}
                  </td>
                  <td style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
                    {netProfit < 0 ? "-" : ""}{fmt(Math.abs(netProfit))}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}