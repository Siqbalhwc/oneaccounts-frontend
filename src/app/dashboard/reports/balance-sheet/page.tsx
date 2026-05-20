"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Printer, Scale } from "lucide-react"
import { useRouter } from "next/navigation"
import PremiumGuard from "@/components/PremiumGuard"

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
// For liabilities & equity, we always show the absolute value (positive)
function fmtPos(n: number) { return Math.abs(n).toLocaleString("en-PK") }

const ASSET_CATS = ["Cash & Bank", "Accounts Receivable", "Inventory", "Other Current Assets", "Fixed Assets", "Vehicles"]
const LIABILITY_CATS = ["Accounts Payable", "Other Current Liabilities"]
const CURRENT_ASSET_CATS = ["Cash & Bank", "Accounts Receivable", "Inventory", "Other Current Assets"]
const FIXED_ASSET_CATS = ["Fixed Assets", "Vehicles"]

const CAT_COLORS: Record<string, string> = {
  "Cash & Bank": "#10B981",
  "Accounts Receivable": "#3B82F6",
  "Inventory": "#8B5CF6",
  "Other Current Assets": "#6366F1",
  "Fixed Assets": "#F59E0B",
  "Vehicles": "#F97316",
  "Accounts Payable": "#EF4444",
  "Other Current Liabilities": "#F87171",
  "Equity": "#A78BFA",
}

function BalanceSheetContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  const grouped = accounts.reduce((acc: Record<string, any[]>, a) => {
    const cat = getCategory(a)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(a)
    return acc
  }, {})

  const catTotal = (cat: string) => (grouped[cat] || []).reduce((s, a) => s + (a.balance || 0), 0)

  const totalCurrentAssets = CURRENT_ASSET_CATS.reduce((s, c) => s + catTotal(c), 0)
  const totalFixedAssets = FIXED_ASSET_CATS.reduce((s, c) => s + catTotal(c), 0)
  const totalAssets = accounts.filter(a => a.type === "Asset").reduce((s, a) => s + (a.balance || 0), 0)
  const totalLiabilities = accounts.filter(a => a.type === "Liability").reduce((s, a) => s + (a.balance || 0), 0)
  const totalEquityAccounts = accounts.filter(a => a.type === "Equity").reduce((s, a) => s + (a.balance || 0), 0)

  // Net Profit (same as P&L)
  const revenue = accounts.filter(a => a.type === "Revenue").reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const expenses = accounts.filter(a => a.type === "Expense").reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const netProfit = revenue - expenses

  const totalEquity = totalEquityAccounts + netProfit
  const totalLiabEquity = totalLiabilities + totalEquity
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

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--text-muted)", fontFamily: "'Inter', sans-serif", gap: 12 }}>
      <div style={{ width: 20, height: 20, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Loading balance sheet…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const CategorySection = ({ cat, type, isLiabilityOrEquity }: { cat: string; type: string; isLiabilityOrEquity: boolean }) => {
    const items = grouped[cat] || []
    if (items.length === 0) return null
    const total = catTotal(cat)
    const color = CAT_COLORS[cat] || "#94A3B8"
    return (
      <div style={{ marginBottom: 16 }}>
        <div className="cat-header" onClick={() => navigateToTrialBalance(type, cat)}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color, flex: 1 }}>{cat}</span>
          <span style={{ fontSize: 12, fontFamily: "'Inter', sans-serif", fontWeight: 600, color }}>
            {isLiabilityOrEquity ? `PKR ${fmtPos(total)}` : `${sign(total)}PKR ${fmt(total)}`}
          </span>
        </div>
        {items.map((a: any) => (
          <div key={a.id} className="acc-row" onClick={() => openLedger(a.id)}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 40 }}>{a.code}</span>
            <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 10 }}>{a.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {isLiabilityOrEquity
                ? `PKR ${fmtPos(a.balance || 0)}`
                : `${sign(a.balance || 0)}PKR ${fmt(a.balance || 0)}`
              }
            </span>
          </div>
        ))}
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

        .kpi-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }
        .kpi-cell { padding: 20px 32px; border-right: 1px solid var(--border); }
        .kpi-cell:last-child { border-right: none; }
        .kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 6px; }
        .kpi-value { font-size: 24px; font-weight: 700; letter-spacing: -0.03em; font-family: 'Inter', sans-serif; }
        .kpi-sub { font-size: 11px; color: var(--text-soft); margin-top: 4px; }

        .bs-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
        }

        .bs-col {
          padding: 28px 32px;
          border-right: 1px solid var(--border);
        }
        .bs-col:last-child { border-right: none; }

        .col-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          padding-bottom: 14px;
          border-bottom: 2px solid var(--border);
        }
        .col-head-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          background: var(--card-hover);
        }
        .col-title { font-size: 16px; font-weight: 700; color: var(--text); }
        .col-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

        .sub-section-head {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
          padding: 10px 0 6px;
          margin-top: 4px;
          border-top: 1px solid var(--border);
        }
        .sub-section-head:first-child { border-top: none; margin-top: 0; }

        .cat-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 0;
          cursor: pointer;
          transition: opacity 0.15s;
          border-bottom: 1px dashed var(--border);
        }
        .cat-header:hover { opacity: 0.8; }

        .acc-row {
          display: flex;
          align-items: center;
          padding: 7px 0 7px 14px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          border-radius: 4px;
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
        }

        .balance-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          margin: 20px 32px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
        }

        @media (max-width: 900px) {
          .kpi-strip { grid-template-columns: repeat(2, 1fr); }
          .bs-body { grid-template-columns: 1fr; }
          .bs-col { border-right: none; padding: 20px; }
          .bs-header { padding: 0 16px; }
        }

        @media print {
          .bs-header { display: none; }
          .bs-body { grid-template-columns: 1fr; }
          .kpi-strip { grid-template-columns: repeat(4, 1fr); }
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
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#C4B5FD", background: "#2D1B69", padding: "2px 8px", borderRadius: 4 }}>
                As at {now.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Shahid Iqbal &amp; Co · Assets = Liabilities + Equity · Click to drill down</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="action-btn" onClick={() => window.print()}><Printer size={13} /> Print</button>
          <button className="action-btn"><Download size={13} /> Export</button>
        </div>
      </div>

      {/* KPI Strip – 4 summary cards */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-label">Total Assets</div>
          <div className="kpi-value" style={{ color: "#3B82F6" }}>PKR {fmt(totalAssets)}</div>
          <div className="kpi-sub">Current + Fixed</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Total Liabilities</div>
          <div className="kpi-value" style={{ color: "#EF4444" }}>PKR {fmtPos(totalLiabilities)}</div>
          <div className="kpi-sub">AP + Other</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Total Equity</div>
          <div className="kpi-value" style={{ color: "#A78BFA" }}>PKR {fmtPos(totalEquity)}</div>
          <div className="kpi-sub">Incl. retained earnings</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Balanced?</div>
          <div className="kpi-value" style={{ color: isBalanced ? "#10B981" : "#EF4444", fontSize: 20 }}>
            {isBalanced ? "✓ In Balance" : "✗ Imbalance"}
          </div>
          <div className="kpi-sub" style={{ color: isBalanced ? "#10B981" : "#EF4444" }}>
            {isBalanced ? "Assets = Liabilities + Equity" : `Diff: PKR ${fmt(Math.abs(totalAssets - totalLiabEquity))}`}
          </div>
        </div>
      </div>

      {/* Two‑column body */}
      <div className="bs-body">
        {/* ASSETS */}
        <div className="bs-col">
          <div className="col-head">
            <div className="col-head-icon">🏦</div>
            <div>
              <div className="col-title">Assets</div>
              <div className="col-subtitle">What the business owns</div>
            </div>
          </div>

          <div className="sub-section-head">Current Assets</div>
          {CURRENT_ASSET_CATS.map(cat => (
            <CategorySection key={cat} cat={cat} type="Asset" isLiabilityOrEquity={false} />
          ))}
          <div className="subtotal-band" style={{ color: "#60A5FA" }}>
            <span>Total Current Assets</span>
            <span>{sign(totalCurrentAssets)}PKR {fmt(totalCurrentAssets)}</span>
          </div>

          <div className="sub-section-head" style={{ marginTop: 16 }}>Fixed Assets</div>
          {FIXED_ASSET_CATS.map(cat => (
            <CategorySection key={cat} cat={cat} type="Asset" isLiabilityOrEquity={false} />
          ))}
          <div className="subtotal-band" style={{ color: "#FCD34D" }}>
            <span>Total Fixed Assets</span>
            <span>{sign(totalFixedAssets)}PKR {fmt(totalFixedAssets)}</span>
          </div>

          <div className="total-band" style={{ background: "#1E3A8A", color: "#93C5FD" }}>
            <span>TOTAL ASSETS</span>
            <span>{sign(totalAssets)}PKR {fmt(totalAssets)}</span>
          </div>
        </div>

        {/* LIABILITIES + EQUITY */}
        <div className="bs-col">
          <div className="col-head">
            <div className="col-head-icon">⚖️</div>
            <div>
              <div className="col-title">Liabilities &amp; Equity</div>
              <div className="col-subtitle">How the business is financed</div>
            </div>
          </div>

          <div className="sub-section-head">Current Liabilities</div>
          {LIABILITY_CATS.map(cat => (
            <CategorySection key={cat} cat={cat} type="Liability" isLiabilityOrEquity={true} />
          ))}
          <div className="subtotal-band" style={{ color: "#F87171" }}>
            <span>Total Liabilities</span>
            <span>PKR {fmtPos(totalLiabilities)}</span>
          </div>

          <div className="sub-section-head" style={{ marginTop: 16 }}>Equity</div>
          {(grouped["Equity"] || []).map((a: any) => (
            <div key={a.id} className="acc-row" onClick={() => openLedger(a.id)}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 40 }}>{a.code}</span>
              <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 10 }}>{a.name}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>PKR {fmtPos(a.balance || 0)}</span>
            </div>
          ))}
          {/* Retained Earnings */}
          <div className="acc-row" style={{ cursor: "default" }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 40 }}>R/E</span>
            <span style={{ fontSize: 12, color: "var(--text)", flex: 1, paddingLeft: 10 }}>Retained Earnings (Net P&amp;L)</span>
            <span style={{ fontSize: 12, color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
              PKR {fmtPos(netProfit)}
            </span>
          </div>
          <div className="subtotal-band" style={{ color: "#C4B5FD", marginTop: 4 }}>
            <span>Total Equity</span>
            <span>PKR {fmtPos(totalEquity)}</span>
          </div>

          <div className="total-band" style={{ background: "#2D1B69", color: "#C4B5FD" }}>
            <span>TOTAL LIABILITIES + EQUITY</span>
            <span>PKR {fmtPos(totalLiabEquity)}</span>
          </div>

          <div style={{ marginTop: 24, padding: "12px 0", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-soft)" }}>
            <span>Generated {new Date().toLocaleString("en-PK")}</span>
            <span>OneAccounts · Shahid Iqbal &amp; Co</span>
          </div>
        </div>
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