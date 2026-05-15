"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Wallet, Landmark } from "lucide-react"
import { useRouter } from "next/navigation"
import PremiumGuard from "@/components/PremiumGuard"

// Fallback category mapper
function getCategory(account: any): string {
  if (account.category) return account.category
  const code = account.code
  const num = parseFloat(code)
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

function BalanceSheetContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => r.data && setAccounts(r.data))
  }, [])

  // Group accounts by category
  const grouped = accounts.reduce((acc: Record<string, any[]>, a) => {
    const cat = getCategory(a)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(a)
    return acc
  }, {})

  const assetCategories = ["Cash & Bank", "Accounts Receivable", "Inventory", "Other Current Assets", "Fixed Assets", "Vehicles"]
  const liabilityCategories = ["Accounts Payable", "Other Current Liabilities"]
  const equityCategories = ["Equity"]

  const totalAssets = accounts.filter(a => a.type === "Asset").reduce((s, a) => s + (a.balance || 0), 0)
  const totalLiabilities = accounts.filter(a => a.type === "Liability").reduce((s, a) => s + (a.balance || 0), 0)
  const totalEquityAccounts = accounts.filter(a => a.type === "Equity").reduce((s, a) => s + (a.balance || 0), 0)

  // Compute net profit (same as P&L) to show as retained earnings
  const revenue = accounts.filter(a => a.type === "Revenue").reduce((s, a) => s + (a.balance || 0), 0)
  const expenses = accounts.filter(a => a.type === "Expense").reduce((s, a) => s + (a.balance || 0), 0)
  const netProfit = revenue - expenses

  // Total equity = existing equity accounts + net profit (retained earnings)
  const totalEquity = totalEquityAccounts + netProfit

  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  const openLedger = (accountId: number) => {
    const now = new Date()
    const start = `${now.getFullYear()}-01-01`
    const end = now.toISOString().split("T")[0]
    router.push(`/dashboard/reports/ledger?accountId=${accountId}&startDate=${start}&endDate=${end}`)
  }

  const CategoryBlock = ({ title, categories, type, color }: any) => (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: color || "#F1F5F9", marginBottom: 12, cursor: "pointer" }}
          onClick={() => navigateToTrialBalance(type)}>
        {title}
      </h3>
      {categories.map((cat: string) => {
        const items = grouped[cat] || []
        const catTotal = items.reduce((s, a) => s + (a.balance || 0), 0)
        return items.length > 0 ? (
          <div key={cat} style={{ marginBottom: 8 }}>
            <div className="clickable-cat" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 600, fontSize: 13, color: "#E2E8F0", cursor: "pointer" }}
                 onClick={() => navigateToTrialBalance(type, cat)}>
              <span>{cat}</span>
              <span>PKR {catTotal.toLocaleString()}</span>
            </div>
            {items.map((a: any) => (
              <div key={a.id} className="clickable-row" style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", paddingLeft: 16, fontSize: 12, color: "#94A3B8", borderBottom: "1px solid #1E293B", cursor: "pointer" }}
                   onClick={() => openLedger(a.id)} title={`Ledger for ${a.code}`}>
                <span>{a.code} – {a.name}</span>
                <span style={{ fontWeight: 500 }}>PKR {(a.balance || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : null
      })}
    </div>
  )

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 14px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
        .clickable-cat:hover { color: #93C5FD; }
        .clickable-row:hover { background: #1E293B; }
        .total-band {
          border-radius: 8px; padding: 14px 20px; color: white; font-weight: 700; font-size: 16px;
          margin-top: 20px; text-align: center;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")} style={{ background: "transparent", border: "1.5px solid #334155", borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: "#CBD5E1", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📊 Balance Sheet</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Assets = Liabilities + Equity · Click any item to drill down</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 1000, margin: "0 auto" }}>
        {/* Assets */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <Wallet size={20} color="#1E3A8A" />
            <span style={{ fontWeight: 700, fontSize: 18, color: "#F1F5F9" }}>Assets</span>
          </div>
          <CategoryBlock title="" categories={assetCategories} type="Asset" color="#1E3A8A" />
          <div className="total-band" style={{ background: "#1E3A8A" }}>
            TOTAL ASSETS: PKR {totalAssets.toLocaleString()}
          </div>
        </div>

        {/* Liabilities + Equity */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <Landmark size={20} color="#8B5CF6" />
            <span style={{ fontWeight: 700, fontSize: 18, color: "#F1F5F9" }}>Liabilities & Equity</span>
          </div>
          <CategoryBlock title="Liabilities" categories={liabilityCategories} type="Liability" color="#EF4444" />
          
          {/* Equity section with retained earnings */}
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#8B5CF6", marginBottom: 12, cursor: "pointer" }}
              onClick={() => navigateToTrialBalance("Equity")}>
            Equity
          </h3>
          {grouped["Equity"]?.map((a: any) => (
            <div key={a.id} className="clickable-row" style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", paddingLeft: 16, fontSize: 12, color: "#94A3B8", borderBottom: "1px solid #1E293B", cursor: "pointer" }}
                 onClick={() => openLedger(a.id)}>
              <span>{a.code} – {a.name}</span>
              <span style={{ fontWeight: 500 }}>PKR {(a.balance || 0).toLocaleString()}</span>
            </div>
          ))}
          {/* Retained Earnings (Net Profit) */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 600, fontSize: 13, color: "#E2E8F0", cursor: "pointer" }}
               onClick={() => navigateToTrialBalance("Revenue")}>
            <span>Retained Earnings</span>
            <span style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
              PKR {netProfit.toLocaleString()}
            </span>
          </div>
          <div className="total-band" style={{ background: "#8B5CF6" }}>
            TOTAL EQUITY: PKR {totalEquity.toLocaleString()}
          </div>
          <div className="total-band" style={{ background: "#8B5CF6", marginTop: 0 }}>
            TOTAL LIABILITIES + EQUITY: PKR {(totalLiabilities + totalEquity).toLocaleString()}
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