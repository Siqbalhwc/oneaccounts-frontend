"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Printer } from "lucide-react"
import { useRouter } from "next/navigation"
import PremiumGuard from "@/components/PremiumGuard"
import * as XLSX from "xlsx"

// ── helpers ──
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
  if (num >= 3000 && num <= 3099) return "Equity"
  return "Other"
}

function fmt(n: number) { return Math.abs(n).toLocaleString("en-PK") }
function sign(n: number) { return n < 0 ? "-" : "" }
function fmtPos(n: number) { return Math.abs(n).toLocaleString("en-PK") }

const CURRENT_ASSET_CATS = ["Cash & Bank", "Accounts Receivable", "Inventory", "Other Current Assets"]
const FIXED_ASSET_CATS = ["Fixed Assets", "Vehicles"]
const LIABILITY_CATS = ["Accounts Payable", "Other Current Liabilities"]

function BalanceSheetContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])
  const [computedBalances, setComputedBalances] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const now = new Date()

  useEffect(() => {
    const fetchData = async () => {
      const { data: accts } = await supabase.from("accounts").select("*").order("code")
      if (!accts) { setLoading(false); return }

      const { data: lines } = await supabase.from("journal_lines").select("account_id, debit, credit")

      const balances: Record<number, number> = {}
      if (lines) {
        lines.forEach((l: any) => {
          balances[l.account_id] = (balances[l.account_id] || 0) + (l.debit || 0) - (l.credit || 0)
        })
      }
      setAccounts(accts)
      setComputedBalances(balances)
      setLoading(false)
    }
    fetchData()
  }, [])

  // use computed balance if available, else stored balance
  const getBalance = (account: any) =>
    computedBalances[account.id] !== undefined ? computedBalances[account.id] : (account.balance || 0)

  const grouped = accounts.reduce((acc: Record<string, any[]>, a) => {
    const cat = getCategory(a)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(a)
    return acc
  }, {})

  const catTotal = (cat: string) => (grouped[cat] || []).reduce((s, a) => s + getBalance(a), 0)

  const totalCurrentAssets = CURRENT_ASSET_CATS.reduce((s, c) => s + catTotal(c), 0)
  const totalFixedAssets = FIXED_ASSET_CATS.reduce((s, c) => s + catTotal(c), 0)
  const totalAssets = totalCurrentAssets + totalFixedAssets

  const totalCurrentLiabilities = Math.abs(LIABILITY_CATS.reduce((s, c) => s + catTotal(c), 0))

  const totalEquityAccounts = Math.abs(
    accounts.filter(a => a.type === "Equity").reduce((s, a) => s + getBalance(a), 0)
  )

  const revenue = accounts.filter(a => a.type === "Revenue").reduce((s, a) => s + Math.abs(getBalance(a)), 0)
  const expenses = accounts.filter(a => a.type === "Expense").reduce((s, a) => s + Math.abs(getBalance(a)), 0)
  const netProfit = revenue - expenses

  const totalEquity = totalEquityAccounts + Math.abs(netProfit)
  const totalLiabEquity = totalCurrentLiabilities + totalEquity
  const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 1

  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  const openLedger = (id: number) => {
    router.push(`/dashboard/reports/ledger?accountId=${id}&startDate=${now.getFullYear()}-01-01&endDate=${now.toISOString().split("T")[0]}`)
  }

  // ── Excel export ──
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    // sheet 1: detailed accounts
    const sheetData: any[][] = [
      ["Balance Sheet", "", ""],
      ["As at", now.toLocaleDateString("en-PK"), ""],
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
    sheetData.push(["Total Current Assets", "", `${sign(totalCurrentAssets)}PKR ${fmt(totalCurrentAssets)}`])
    sheetData.push(["", "", ""])
    addSection("Fixed Assets", FIXED_ASSET_CATS, false)
    sheetData.push(["Total Fixed Assets", "", `${sign(totalFixedAssets)}PKR ${fmt(totalFixedAssets)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["TOTAL ASSETS", "", `${sign(totalAssets)}PKR ${fmt(totalAssets)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["LIABILITIES & EQUITY", "", ""])
    addSection("Current Liabilities", LIABILITY_CATS, true)
    sheetData.push(["Total Current Liabilities", "", `PKR ${fmtPos(totalCurrentLiabilities)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["Equity", "", ""])
    const eqItems = grouped["Equity"] || []
    for (const a of eqItems) {
      sheetData.push([`  ${a.code} - ${a.name}`, "", `PKR ${fmtPos(getBalance(a))}`])
    }
    sheetData.push(["  Retained Earnings", "", `PKR ${fmtPos(netProfit)}`])
    sheetData.push(["Total Equity", "", `PKR ${fmtPos(totalEquity)}`])
    sheetData.push(["", "", ""])
    sheetData.push(["TOTAL LIABILITIES + EQUITY", "", `PKR ${fmtPos(totalLiabEquity)}`])

    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws["!cols"] = [{ wch: 40 }, { wch: 5 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet")
    XLSX.writeFile(wb, `Balance_Sheet_${now.toISOString().split("T")[0]}.xlsx`)
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--text-muted)", fontFamily: "'Inter', sans-serif", gap: 12 }}>
      <div style={{ width: 20, height: 20, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Loading balance sheet…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const CategorySection = ({ cat, type, showAbsolute }: { cat: string; type: string; showAbsolute: boolean }) => {
    const items = grouped[cat] || []
    if (items.length === 0) return null
    const total = catTotal(cat)
    return (
      <div style={{ marginBottom: 8 }}>
        <div
          className="cat-header"
          onClick={() => navigateToTrialBalance(type, cat)}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>{cat}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            {showAbsolute ? `PKR ${fmtPos(total)}` : `${sign(total)}PKR ${fmt(total)}`}
          </span>
        </div>
        {items.map((a: any) => {
          const bal = getBalance(a)
          return (
            <div key={a.id} className="acc-row" onClick={() => openLedger(a.id)}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 50 }}>{a.code}</span>
              <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 8 }}>{a.name}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {showAbsolute ? `PKR ${fmtPos(bal)}` : `${sign(bal)}PKR ${fmt(bal)}`}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        * { box-sizing: border-box; }

        .bs-header {
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

        /* summary cards – rounded, spaced */
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
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .kpi-label {
          font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .kpi-value {
          font-size: 24px; font-weight: 700; letter-spacing: -0.03em; font-family: 'Inter', sans-serif;
        }
        .kpi-sub {
          font-size: 11px; color: var(--text-soft); margin-top: 4px;
        }

        /* aligned grid */
        .bs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          padding: 0 32px;
        }
        .bs-row {
          display: contents;
        }
        .bs-cell {
          padding: 24px;
          border-bottom: 1px solid var(--border);
        }
        .bs-cell:first-child {
          border-right: 1px solid var(--border);
        }

        .cat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 0;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          transition: background 0.1s;
        }
        .cat-header:hover { background: var(--card-hover); }
        .acc-row {
          display: flex;
          align-items: center;
          padding: 5px 0 5px 12px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.1s;
        }
        .acc-row:hover { background: var(--card-hover); }

        .subtotal-band {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-radius: 6px;
          margin: 8px 0;
          font-size: 13px;
          font-weight: 600;
          background: var(--card-hover);
          color: var(--text);
        }
        .total-band {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-radius: 8px;
          margin-top: 16px;
          font-size: 15px;
          font-weight: 700;
          background: var(--card-hover);
          color: var(--text);
        }

        @media print {
          .bs-header, .back-btn, .action-btn { display: none !important; }
          .kpi-strip { grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 16px; }
          .bs-grid { padding: 0 16px; }
          .bs-cell { padding: 16px; }
          body { background: white !important; color: black !important; }
          .kpi-card, .subtotal-band, .total-band {
            box-shadow: none !important;
            border: 1px solid #ccc !important;
          }
        }
        @media (max-width: 900px) {
          .kpi-strip { grid-template-columns: repeat(2, 1fr); padding: 16px; }
          .bs-grid { grid-template-columns: 1fr; padding: 0 16px; }
          .bs-cell { border-right: none; }
          .bs-header { padding: 0 16px; }
        }
      `}</style>

      {/* Header */}
      <div className="bs-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="back-btn" onClick={() => router.push("/dashboard/reports")}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
              Balance Sheet
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", background: "var(--card-hover)", padding: "2px 8px", borderRadius: 4 }}>
                As at {now.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Shahid Iqbal &amp; Co · Click any row to drill down</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="action-btn" onClick={() => window.print()}><Printer size={13} /> Print</button>
          <button className="action-btn" onClick={handleExportExcel}><Download size={13} /> Export</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Total Assets</div>
          <div className="kpi-value" style={{ color: "#3B82F6" }}>PKR {fmt(totalAssets)}</div>
          <div className="kpi-sub">Current + Fixed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Liabilities</div>
          <div className="kpi-value" style={{ color: "#EF4444" }}>PKR {fmtPos(totalCurrentLiabilities)}</div>
          <div className="kpi-sub">AP + Other</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Equity</div>
          <div className="kpi-value" style={{ color: "#A78BFA" }}>PKR {fmtPos(totalEquity)}</div>
          <div className="kpi-sub">Incl. retained earnings</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Balanced?</div>
          <div className="kpi-value" style={{ color: isBalanced ? "#10B981" : "#EF4444", fontSize: 20 }}>
            {isBalanced ? "✓ In Balance" : "✗ Imbalance"}
          </div>
          <div className="kpi-sub" style={{ color: isBalanced ? "#10B981" : "#EF4444" }}>
            {isBalanced ? "Assets = Liabilities + Equity" : `Diff: PKR ${fmt(Math.abs(totalAssets - totalLiabEquity))}`}
          </div>
        </div>
      </div>

      {/* Report Body */}
      <div className="bs-grid">
        {/* Row 1: Current Assets ↔ Current Liabilities */}
        <div className="bs-row">
          <div className="bs-cell">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Current Assets</h3>
            {CURRENT_ASSET_CATS.map(cat => (
              <CategorySection key={cat} cat={cat} type="Asset" showAbsolute={false} />
            ))}
            <div className="subtotal-band">
              <span>Total Current Assets</span>
              <span>{sign(totalCurrentAssets)}PKR {fmt(totalCurrentAssets)}</span>
            </div>
          </div>
          <div className="bs-cell">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Current Liabilities</h3>
            {LIABILITY_CATS.map(cat => (
              <CategorySection key={cat} cat={cat} type="Liability" showAbsolute={true} />
            ))}
            <div className="subtotal-band">
              <span>Total Current Liabilities</span>
              <span>PKR {fmtPos(totalCurrentLiabilities)}</span>
            </div>
          </div>
        </div>

        {/* Row 2: Fixed Assets ↔ Equity */}
        <div className="bs-row">
          <div className="bs-cell">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Fixed Assets</h3>
            {FIXED_ASSET_CATS.map(cat => (
              <CategorySection key={cat} cat={cat} type="Asset" showAbsolute={false} />
            ))}
            <div className="subtotal-band">
              <span>Total Fixed Assets</span>
              <span>{sign(totalFixedAssets)}PKR {fmt(totalFixedAssets)}</span>
            </div>
          </div>
          <div className="bs-cell">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Equity</h3>
            {(grouped["Equity"] || []).map((a: any) => {
              const bal = getBalance(a)
              return (
                <div key={a.id} className="acc-row" onClick={() => openLedger(a.id)}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 50 }}>{a.code}</span>
                  <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 8 }}>{a.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>PKR {fmtPos(bal)}</span>
                </div>
              )
            })}
            <div className="acc-row" style={{ cursor: "default" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 50 }}>R/E</span>
              <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 8 }}>Retained Earnings (Net P&amp;L)</span>
              <span style={{ fontSize: 12, color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
                PKR {fmtPos(netProfit)}
              </span>
            </div>
            <div className="subtotal-band">
              <span>Total Equity</span>
              <span>PKR {fmtPos(totalEquity)}</span>
            </div>
          </div>
        </div>

        {/* Row 3: Grand Totals */}
        <div className="bs-row">
          <div className="bs-cell" style={{ borderBottom: "none" }}>
            <div className="total-band">
              <span>TOTAL ASSETS</span>
              <span>{sign(totalAssets)}PKR {fmt(totalAssets)}</span>
            </div>
          </div>
          <div className="bs-cell" style={{ borderBottom: "none" }}>
            <div className="total-band">
              <span>TOTAL LIABILITIES + EQUITY</span>
              <span>PKR {fmtPos(totalLiabEquity)}</span>
            </div>
          </div>
        </div>
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
    <PremiumGuard
      featureCode="balance_sheet"
      featureName="Balance Sheet"
      featureDesc="View your assets, liabilities, and equity."
    >
      <BalanceSheetContent />
    </PremiumGuard>
  )
}