"use client"

import React, { useState, useEffect } from "react"
import { ArrowLeft, Download } from "lucide-react"
import { useRouter } from "next/navigation"
import PremiumGuard from "@/components/PremiumGuard"
import * as XLSX from "xlsx"
import { generateBalanceSheetPDF } from "@/lib/pdf/balanceSheetPDF"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"

// ── helpers ────────────────────────────────────────────────────────
function getCategory(account: any): string {
  if (account.category) return account.category
  const num = parseFloat(account.code)
  if (isNaN(num)) return "Other"
  if (num >= 1000 && num <= 1099) return "Cash & Bank"
  if (num >= 1100 && num <= 1199) return "Accounts Receivable"
  if (num >= 1200 && num <= 1299) return "Inventory"
  if (num >= 1300 && num <= 1399) return "Other Current Assets"
  if (num >= 1400 && num <= 1499) return "Fixed Assets"
  if (num >= 1500 && num <= 1599) return "Vehicles"
  if (num >= 2000 && num <= 2099) return "Accounts Payable"
  if (num >= 2100 && num <= 2199) return "Other Current Liabilities"
  if (num >= 3000 && num <= 3999) return "Equity"
  return "Other"
}

function fmt(n: number) { return Math.abs(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function sign(n: number) { return n < 0 ? "-" : "" }
function fmtPos(n: number) { return Math.abs(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtSigned(n: number) { return (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const CURRENT_ASSET_CATS = ["Cash & Bank", "Accounts Receivable", "Inventory", "Other Current Assets"]
const FIXED_ASSET_CATS = ["Fixed Assets", "Vehicles"]
const LIABILITY_CATS = ["Accounts Payable", "Other Current Liabilities"]

function PlaceholderRow() {
  return <div style={{ height: 40, opacity: 0, pointerEvents: "none" }}>&nbsp;</div>
}

function AccountRow({ account, showAbsolute, getBalance, onClick }: {
  account: any
  showAbsolute: boolean
  getBalance: (a: any) => number
  onClick: (id: number) => void
}) {
  const bal = getBalance(account)
  const rounded = Math.round(bal)
  return (
    <div className="acc-row" onClick={() => onClick(account.id)}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 50 }}>{account.code}</span>
      <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 8 }}>{account.name}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {showAbsolute ? `PKR ${fmtPos(rounded)}` : `${sign(rounded)}PKR ${fmt(rounded)}`}
      </span>
    </div>
  )
}

function CategoryHeader({ cat, total, showAbsolute, onClick }: {
  cat: string
  total: number
  showAbsolute: boolean
  onClick: () => void
}) {
  const rounded = Math.round(total)
  return (
    <div className="cat-header" onClick={onClick}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>{cat}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
        {showAbsolute ? `PKR ${fmtPos(rounded)}` : `${sign(rounded)}PKR ${fmt(rounded)}`}
      </span>
    </div>
  )
}

function SubtotalBand({ label, value, showAbsolute }: { label: string; value: number; showAbsolute: boolean }) {
  const rounded = Math.round(value)
  return (
    <div className="subtotal-band">
      <span>{label}</span>
      <span>{showAbsolute ? `PKR ${fmtPos(rounded)}` : `${sign(rounded)}PKR ${fmt(rounded)}`}</span>
    </div>
  )
}

function TotalBand({ label, value, showAbsolute }: { label: string; value: number; showAbsolute: boolean }) {
  const rounded = Math.round(value)
  return (
    <div className="total-band">
      <span>{label}</span>
      <span>{showAbsolute ? `PKR ${fmtPos(rounded)}` : `${sign(rounded)}PKR ${fmt(rounded)}`}</span>
    </div>
  )
}

function buildSection(
  leftMainRows: React.ReactElement[],
  rightMainRows: React.ReactElement[],
  leftTotal: React.ReactElement,
  rightTotal: React.ReactElement
): React.ReactElement[] {
  const max = Math.max(leftMainRows.length, rightMainRows.length)
  const paddedLeft = [...leftMainRows]
  const paddedRight = [...rightMainRows]
  while (paddedLeft.length < max) paddedLeft.push(<PlaceholderRow key={`pl-${paddedLeft.length}`} />)
  while (paddedRight.length < max) paddedRight.push(<PlaceholderRow key={`pr-${paddedRight.length}`} />)
  const rows: React.ReactElement[] = []
  for (let i = 0; i < max; i++) {
    rows.push(
      <React.Fragment key={`row-${i}`}>
        <div style={{ borderRight: "1px solid var(--border)", padding: "0 24px" }}>{paddedLeft[i]}</div>
        <div style={{ padding: "0 24px" }}>{paddedRight[i]}</div>
      </React.Fragment>
    )
  }
  rows.push(
    <React.Fragment key="subtotal-row">
      <div style={{ borderRight: "1px solid var(--border)", padding: "0 24px" }}>{leftTotal}</div>
      <div style={{ padding: "0 24px" }}>{rightTotal}</div>
    </React.Fragment>
  )
  return rows
}

function BalanceSheetContent() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const asOfDate = now.toISOString().split("T")[0]

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

  const fetchBalanceSheet = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/balance-sheet?asOfDate=${encodeURIComponent(asOfDate)}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      const mapped = (json || []).map((row: any) => ({
        id: row.account_id,
        code: row.code,
        name: row.name,
        type: row.type,
        category: row.category || getCategory({ code: row.code }),
        net: Number(row.net),
      }))
      setAccounts(mapped)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBalanceSheet()
  }, [])

  const getBalance = (account: any) => account.net

  const grouped = accounts.reduce((acc: Record<string, any[]>, a) => {
    const cat = getCategory(a)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(a)
    return acc
  }, {})

  const catTotal = (cat: string) => (grouped[cat] || []).reduce((s, a) => s + getBalance(a), 0)

  const totalCurrentAssets = CURRENT_ASSET_CATS.reduce((s, c) => s + catTotal(c), 0)
  const totalFixedAssets = FIXED_ASSET_CATS.reduce((s, c) => s + catTotal(c), 0)
  const otherAssetAccounts = accounts.filter(a => a.type === "Asset" && ![...CURRENT_ASSET_CATS, ...FIXED_ASSET_CATS].includes(getCategory(a)))
  const totalOtherAssets = otherAssetAccounts.reduce((s, a) => s + getBalance(a), 0)
  const totalAssets = totalCurrentAssets + totalFixedAssets + totalOtherAssets

  const totalCurrentLiabilities = Math.abs(LIABILITY_CATS.reduce((s, c) => s + catTotal(c), 0))
  const otherLiabilityAccounts = accounts.filter(a => a.type === "Liability" && !LIABILITY_CATS.includes(getCategory(a)))
  const totalOtherLiabilities = Math.abs(otherLiabilityAccounts.reduce((s, a) => s + getBalance(a), 0))
  const totalLiabilities = totalCurrentLiabilities + totalOtherLiabilities

  const equityAccounts = accounts.filter(a => a.type === "Equity")
  const retainedEarningsAccount = equityAccounts.find(a => a.code === "3100")
  const otherEquityAccounts = equityAccounts.filter(a => a.code !== "3100")
  const totalOtherEquity = Math.abs(otherEquityAccounts.reduce((s, a) => s + getBalance(a), 0))

  const revenue = accounts.filter(a => a.type === "Revenue").reduce((s, a) => s + Math.abs(getBalance(a)), 0)
  const expenses = accounts.filter(a => a.type === "Expense").reduce((s, a) => s + Math.abs(getBalance(a)), 0)
  const netProfit = revenue - expenses
  const totalEquity = totalOtherEquity + netProfit
  const totalEquityAbs = Math.abs(totalEquity)
  const totalLiabEquity = totalLiabilities + totalEquityAbs
  const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 1

  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  const openLedger = (id: number) => {
    router.push(`/dashboard/reports/ledger?accountId=${id}&startDate=${now.getFullYear()}-01-01&endDate=${asOfDate}`)
  }

  const openProfitLoss = () => {
    router.push(`/dashboard/reports/profit-loss?startDate=${now.getFullYear()}-01-01&endDate=${asOfDate}`)
  }

  const handleExportPDF = async () => {
    const buildSections = (cats: string[], showAbsolute: boolean) => {
      const sections: any[] = []
      cats.forEach(cat => {
        const items = grouped[cat] || []
        if (items.length === 0) return
        const total = catTotal(cat)
        sections.push({ text: cat, amount: total, isHeader: true, indent: 0 })
        items.forEach(a => {
          sections.push({ text: `${a.code} – ${a.name}`, amount: getBalance(a), isHeader: false, indent: 8 })
        })
      })
      return sections
    }

    const pdfData = {
      companyName: companyName || "OneAccounts",
      companyTagline: companyTagline || "",
      logoUrl: logoUrl || null,
      asOfDate,
      currentAssetSections: buildSections(CURRENT_ASSET_CATS, false),
      totalCurrentAssets,
      fixedAssetSections: buildSections(FIXED_ASSET_CATS, false),
      totalFixedAssets,
      totalAssets,
      liabilitySections: buildSections(LIABILITY_CATS, true),
      totalLiabilities,
      equitySections: [
  { text: "Equity", amount: totalEquityAbs, isHeader: true, indent: 0 },
  ...otherEquityAccounts.map(a => ({ text: `${a.code} – ${a.name}`, amount: getBalance(a), isHeader: false, indent: 8 })),
  { text: retainedEarningsAccount ? `${retainedEarningsAccount.code} – ${retainedEarningsAccount.name}` : "Retained Earnings (Net P&L)", amount: netProfit, isHeader: false, indent: 8 },
],
      netProfit,
      totalEquity,
      totalLiabEquity,
    }

    const doc = await generateBalanceSheetPDF(pdfData)
    doc.save(`Balance_Sheet_${asOfDate}.pdf`)
  }

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()
    const sheetData: any[][] = [
      ["Balance Sheet", "", ""],
      ["As at", asOfDate, ""],
      ["", "", ""],
      ["ASSETS", "", ""],
    ]
    const addSection = (title: string, cats: string[], showAbsolute: boolean) => {
      sheetData.push([title, "", ""])
      for (const cat of cats) {
        const items = grouped[cat] || []
        if (items.length === 0) continue
        sheetData.push([`  ${cat}`, "", `PKR ${fmt(catTotal(cat))}`])
        for (const a of items) {
          const bal = getBalance(a)
          sheetData.push([`    ${a.code} - ${a.name}`, "", `${sign(bal)}PKR ${fmt(bal)}`])
        }
      }
    }
    addSection("Current Assets", CURRENT_ASSET_CATS, false)
    if (otherAssetAccounts.length > 0) {
      sheetData.push(["Other Assets", "", ""])
      otherAssetAccounts.forEach(a => {
        sheetData.push([`  ${a.code} - ${a.name}`, "", `${sign(getBalance(a))}PKR ${fmt(getBalance(a))}`])
      })
    }
    sheetData.push(["Total Current Assets", "", `${sign(totalCurrentAssets)}PKR ${fmt(totalCurrentAssets)}`])
    sheetData.push(["", "", ""])
    addSection("Fixed Assets", FIXED_ASSET_CATS, false)
    sheetData.push(["Total Fixed Assets", "", `${sign(totalFixedAssets)}PKR ${fmt(totalFixedAssets)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["TOTAL ASSETS", "", `${sign(totalAssets)}PKR ${fmt(totalAssets)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["LIABILITIES & EQUITY", "", ""])
    addSection("Current Liabilities", LIABILITY_CATS, true)
    if (otherLiabilityAccounts.length > 0) {
      sheetData.push(["Other Liabilities", "", ""])
      otherLiabilityAccounts.forEach(a => {
        sheetData.push([`  ${a.code} - ${a.name}`, "", `PKR ${fmtPos(getBalance(a))}`])
      })
    }
    sheetData.push(["Total Liabilities", "", `PKR ${fmtPos(totalLiabilities)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["Equity", "", ""])
    otherEquityAccounts.forEach(a => {
      sheetData.push([`  ${a.code} - ${a.name}`, "", `PKR ${fmtPos(getBalance(a))}`])
    })
    sheetData.push([retainedEarningsAccount ? `  ${retainedEarningsAccount.code} - ${retainedEarningsAccount.name}` : "  Retained Earnings (Net P&L)", "", `PKR ${fmtPos(netProfit)}`])
    sheetData.push(["Total Equity", "", `PKR ${fmtPos(totalEquityAbs)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["TOTAL LIABILITIES + EQUITY", "", `PKR ${fmtPos(totalLiabEquity)}`])

    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws["!cols"] = [{ wch: 40 }, { wch: 5 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet")
    XLSX.writeFile(wb, `Balance_Sheet_${asOfDate}.xlsx`)
  }

  // ── Build rows for UI ──────────────────────────────────────────
  const currentAssetRows: React.ReactElement[] = [
    <h3 key="h3ca" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Current Assets</h3>
  ]
  CURRENT_ASSET_CATS.forEach(cat => {
    const items = grouped[cat] || []
    if (items.length === 0) return
    const total = catTotal(cat)
    currentAssetRows.push(
      <CategoryHeader key={`ca-${cat}`} cat={cat} total={total} showAbsolute={false} onClick={() => navigateToTrialBalance("Asset", cat)} />
    )
    items.forEach(a => {
      currentAssetRows.push(
        <AccountRow key={a.id} account={a} showAbsolute={false} getBalance={getBalance} onClick={openLedger} />
      )
    })
  })
  if (otherAssetAccounts.length > 0) {
    currentAssetRows.push(
      <CategoryHeader key="other-assets" cat="Other Assets" total={totalOtherAssets} showAbsolute={false} onClick={() => navigateToTrialBalance("Asset")} />
    )
    otherAssetAccounts.forEach(a => {
      currentAssetRows.push(
        <AccountRow key={a.id} account={a} showAbsolute={false} getBalance={getBalance} onClick={openLedger} />
      )
    })
  }

  const currentLiabilityRows: React.ReactElement[] = [
    <h3 key="h3cl" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Current Liabilities</h3>
  ]
  LIABILITY_CATS.forEach(cat => {
    const items = grouped[cat] || []
    if (items.length === 0) return
    const total = catTotal(cat)
    currentLiabilityRows.push(
      <CategoryHeader key={`cl-${cat}`} cat={cat} total={total} showAbsolute={true} onClick={() => navigateToTrialBalance("Liability", cat)} />
    )
    items.forEach(a => {
      currentLiabilityRows.push(
        <AccountRow key={a.id} account={a} showAbsolute={true} getBalance={getBalance} onClick={openLedger} />
      )
    })
  })
  if (otherLiabilityAccounts.length > 0) {
    currentLiabilityRows.push(
      <CategoryHeader key="other-liab" cat="Other Liabilities" total={totalOtherLiabilities} showAbsolute={true} onClick={() => navigateToTrialBalance("Liability")} />
    )
    otherLiabilityAccounts.forEach(a => {
      currentLiabilityRows.push(
        <AccountRow key={a.id} account={a} showAbsolute={true} getBalance={getBalance} onClick={openLedger} />
      )
    })
  }

  const otherAssetIdx = currentAssetRows.findIndex(el => el.type === CategoryHeader && (el.props as any)?.cat === "Other Current Assets")
  const otherLiabilityIdx = currentLiabilityRows.findIndex(el => el.type === CategoryHeader && (el.props as any)?.cat === "Other Current Liabilities")
  if (otherAssetIdx !== -1 && otherLiabilityIdx !== -1) {
    const maxIdx = Math.max(otherAssetIdx, otherLiabilityIdx)
    if (otherAssetIdx < maxIdx) {
      const diff = maxIdx - otherAssetIdx
      for (let i = 0; i < diff; i++) currentAssetRows.splice(otherAssetIdx, 0, <PlaceholderRow key={`oca-pad-${i}`} />)
    }
    if (otherLiabilityIdx < maxIdx) {
      const diff = maxIdx - otherLiabilityIdx
      for (let i = 0; i < diff; i++) currentLiabilityRows.splice(otherLiabilityIdx, 0, <PlaceholderRow key={`ocl-pad-${i}`} />)
    }
  }

  const currentSection = buildSection(
    currentAssetRows, currentLiabilityRows,
    <SubtotalBand label="Total Current Assets" value={totalCurrentAssets} showAbsolute={false} />,
    <SubtotalBand label="Total Current Liabilities" value={totalCurrentLiabilities} showAbsolute={true} />
  )

  const fixedAssetRows: React.ReactElement[] = [
    <h3 key="h3fa" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Fixed Assets</h3>
  ]
  FIXED_ASSET_CATS.forEach(cat => {
    const items = grouped[cat] || []
    if (items.length === 0) return
    const total = catTotal(cat)
    fixedAssetRows.push(
      <CategoryHeader key={`fa-${cat}`} cat={cat} total={total} showAbsolute={false} onClick={() => navigateToTrialBalance("Asset", cat)} />
    )
    items.forEach(a => {
      fixedAssetRows.push(
        <AccountRow key={a.id} account={a} showAbsolute={false} getBalance={getBalance} onClick={openLedger} />
      )
    })
  })

  const equityRows: React.ReactElement[] = [
    <h3 key="h3eq" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Equity</h3>
  ]
  otherEquityAccounts.forEach(a => {
    equityRows.push(
      <AccountRow key={a.id} account={a} showAbsolute={true} getBalance={getBalance} onClick={openLedger} />
    )
  })
  equityRows.push(
    <div key="re" className="acc-row" onClick={openProfitLoss} style={{ cursor: "pointer" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 50 }}>
        {retainedEarningsAccount ? retainedEarningsAccount.code : "R/E"}
      </span>
      <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 8 }}>
        {retainedEarningsAccount ? retainedEarningsAccount.name : "Retained Earnings (Net P&L)"}
      </span>
      <span style={{ fontSize: 12, color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
        {sign(netProfit)}PKR {fmt(netProfit)}
      </span>
    </div>
  )

  const fixedVsEquitySection = buildSection(
    fixedAssetRows, equityRows,
    <SubtotalBand label="Total Fixed Assets" value={totalFixedAssets} showAbsolute={false} />,
    <SubtotalBand label="Total Equity" value={totalEquityAbs} showAbsolute={true} />
  )

  const grandTotals = (
    <React.Fragment key="gt">
      <div style={{ borderRight: "1px solid var(--border)", padding: "0 24px" }}>
        <TotalBand label="TOTAL ASSETS" value={totalAssets} showAbsolute={false} />
      </div>
      <div style={{ padding: "0 24px" }}>
        <TotalBand label="TOTAL LIABILITIES + EQUITY" value={totalLiabEquity} showAbsolute={true} />
      </div>
    </React.Fragment>
  )

  const syncedRows = [...currentSection, ...fixedVsEquitySection, grandTotals]

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--text-muted)", fontFamily: "'Inter', sans-serif", gap: 12 }}>
      <div style={{ width: 20, height: 20, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Loading balance sheet…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        * { box-sizing: border-box; }

        /* ── Report Header (same as Trial Balance / P&L) ── */
        .report-header {
          background: var(--card);
          border-bottom: 1px solid var(--border);
          padding: 20px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .report-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .report-logo {
          width: 34px; height: 34px;
          border-radius: 9px; object-fit: contain;
        }
        .report-company-name {
          font-size: 16px; font-weight: 700;
        }
        .report-company-tagline {
          font-size: 11px;
        }
        .report-header-right {
          text-align: right;
        }
        .report-title {
          font-size: 24px; font-weight: 800;
        }
        .report-period {
          font-size: 12px;
        }

        /* ── KPI cards ── */
        .kpi-row {
          display: flex; gap: 16px;
          padding: 24px 32px; flex-wrap: wrap;
        }
        .kpi-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px; padding: 18px 24px;
          min-width: 170px; box-shadow: var(--shadow-sm); flex: 1;
        }
        .kpi-label {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-muted); margin-bottom: 6px;
        }
        .kpi-value { font-size: 26px; font-weight: 800; }

        /* ── Filter bar ── */
        .filter-bar {
          display: flex; align-items: center; gap: 12px;
          padding: 0 32px 20px; flex-wrap: wrap;
        }
        .btn {
          padding: 8px 16px; border-radius: 8px;
          border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          font-family: inherit;
        }
        .btn-outline {
          background: transparent; color: var(--text-muted);
          border-color: var(--border);
        }
        .btn-outline:hover { background: var(--card-hover); }
        .date-input {
          height: 34px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 10px; font-size: 12px;
          background: var(--card); color: var(--text);
          outline: none; font-family: inherit; width: 140px;
        }
        .date-input:focus { border-color: var(--primary); }

        /* ── Report body (same as P&L) ── */
        .section { margin: 0 32px 16px; }
        .section-head {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 4px; padding: 8px 0; cursor: pointer;
        }
        .section-head:hover .section-title-text { color: var(--primary); }
        .section-title-text {
          font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted);
          transition: color 0.15s;
        }
        .acc-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 12px; border-bottom: 1px solid var(--border);
          cursor: pointer; transition: background 0.1s;
        }
        .acc-row:hover { background: var(--card-hover); }
        .subtotal-band {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 12px; border-radius: 6px; margin: 8px 0;
          font-size: 13px; font-weight: 600;
          background: var(--card-hover); color: var(--text);
        }
        .total-band {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 16px; border-radius: 8px; margin-top: 16px;
          font-size: 15px; font-weight: 700;
          background: var(--card-hover); color: var(--text);
        }

        /* ── Grid for paired sections ── */
        .bs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          padding: 0 32px;
        }

        @media print {
          .report-header, .kpi-row, .filter-bar { display: none !important; }
          body { background: white !important; color: black !important; }
          .kpi-card, .subtotal-band, .total-band {
            box-shadow: none !important;
            border: 1px solid #ccc !important;
          }
        }
        @media (max-width: 900px) {
          .bs-grid { grid-template-columns: 1fr; padding: 0 16px; }
          .report-header, .kpi-row, .filter-bar { padding-left: 16px; padding-right: 16px; }
          .section { margin-left: 16px; margin-right: 16px; }
        }
      `}</style>

      {/* ── Report Header (same as Trial Balance / P&L) ── */}
      <div className="report-header">
        <div className="report-header-left">
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}>
            <ArrowLeft size={16} />
          </button>
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="report-logo" width={34} height={34} />
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "var(--primary)", display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "white", fontWeight: 700,
            }}>
              {(companyName || "O")[0]}
            </div>
          )}
          <div>
            <div className="report-company-name" style={{ color: reportTextColor }}>
              {companyName || "OneAccounts"}
            </div>
            <div className="report-company-tagline" style={{ color: reportMutedColor }}>
              {companyTagline || ""}
            </div>
          </div>
        </div>
        <div className="report-header-right">
          <div className="report-title" style={{ color: reportTextColor }}>Balance Sheet</div>
          <div className="report-period" style={{ color: reportMutedColor }}>As at {now.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Assets</div>
          <div className="kpi-value" style={{ color: "#3B82F6" }}>PKR {fmt(totalAssets)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Liabilities</div>
          <div className="kpi-value" style={{ color: "#EF4444" }}>PKR {fmtPos(totalLiabilities)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Equity</div>
          <div className="kpi-value" style={{ color: "#A78BFA" }}>PKR {fmtPos(totalEquityAbs)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Balanced?</div>
          <div className="kpi-value" style={{ color: isBalanced ? "#10B981" : "#EF4444", fontSize: 20 }}>
            {isBalanced ? "✓ In Balance" : "✗ Imbalance"}
          </div>
        </div>
      </div>

      {/* ── Filter bar (just buttons) ── */}
      <div className="filter-bar">
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExportExcel}><Download size={13} /> Excel</button>
          <button className="btn btn-outline" onClick={handleExportPDF}><Download size={13} /> PDF</button>
        </div>
      </div>

      {/* ── Synchronized Report Body ── */}
      <div className="bs-grid">
        {syncedRows}
      </div>

      <div style={{ padding: "12px 32px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-soft)" }}>
        <span>Generated {new Date().toLocaleString("en-PK")}</span>
        <span>OneAccounts · Shahid Iqbal &amp; Co</span>
      </div>
    </div>
  )
}

export default function BalanceSheetPage() {
  return (
    <PremiumGuard featureCode="balance_sheet" featureName="Balance Sheet" featureDesc="View your assets, liabilities, and equity.">
      <BalanceSheetContent />
    </PremiumGuard>
  )
}