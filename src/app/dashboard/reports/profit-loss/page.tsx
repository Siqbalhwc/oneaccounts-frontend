"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { useRouter } from "next/navigation"

// Fallback category mapper
function getCategory(account: any): string {
  if (account.category) return account.category
  const code = account.code
  const num = parseFloat(code)
  if (isNaN(num)) return "Other"
  if (num >= 4000 && num <= 4099) return "Revenue"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  return "Other"
}

export default function ProfitLossPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  const revenueAccounts = accounts.filter(a => a.type === "Revenue")
  const expenseAccounts = accounts.filter(a => a.type === "Expense")

  // Group expenses into categories
  const expenseByCategory = expenseAccounts.reduce((acc: Record<string, any[]>, a) => {
    const cat = getCategory(a)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(a)
    return acc
  }, {})

  const totalRevenue = revenueAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const totalExpenses = expenseAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const netProfit = totalRevenue - totalExpenses

  // Navigate to Trial Balance filtered by type/category
  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  // Navigate to Ledger for a single account
  const openLedger = (accountId: number) => {
    const now = new Date()
    const start = `${now.getFullYear()}-01-01`
    const end = now.toISOString().split("T")[0]
    router.push(`/dashboard/reports/ledger?accountId=${accountId}&startDate=${start}&endDate=${end}`)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .card {
          background: white; border-radius: 14px; border: 1px solid #E5EAF2;
          padding: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); margin-bottom: 16px;
        }
        .section-header {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 0; margin-bottom: 12px;
          cursor: pointer; transition: color 0.15s;
        }
        .section-header:hover { color: #1D4ED8; }
        .clickable-row {
          display: flex; justify-content: space-between; padding: 8px 0;
          border-bottom: 1px solid #F1F5F9; font-size: 13px;
          cursor: pointer; transition: background 0.15s;
        }
        .clickable-row:hover { background: #FAFBFF; }
        .clickable-row:last-child { border-bottom: none; }
        .total-row {
          display: flex; justify-content: space-between; padding: 12px 0;
          font-weight: 700; font-size: 15px; border-top: 2px solid #E2E8F0;
        }
        .net-profit-card {
          border-radius: 14px; padding: 24px; text-align: center;
          border: 2px solid; margin-top: 8px;
        }
        .hint { font-size: 10px; color: #94A3B8; margin-top: 2px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📈 Profit & Loss Statement</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Revenue – Expenses = Net Profit · Click any row to drill down</p>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Revenue Section */}
        <div className="card">
          <div className="section-header" onClick={() => navigateToTrialBalance("Revenue")}>
            <TrendingUp size={18} color="#10B981" />
            <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0, flex: 1 }}>Revenue</h3>
            <span style={{ fontSize: 14, fontWeight: 700 }}>PKR {totalRevenue.toLocaleString()}</span>
          </div>
          {revenueAccounts.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94A3B8", padding: 12 }}>No revenue accounts</div>
          ) : (
            revenueAccounts.map(a => (
              <div key={a.id} className="clickable-row" onClick={() => openLedger(a.id)} title={`View ledger for ${a.code}`}>
                <span>{a.code} – {a.name}</span>
                <span style={{ fontWeight: 600 }}>PKR {(a.balance || 0).toLocaleString()}</span>
              </div>
            ))
          )}
          <div className="total-row">
            <span>Total Revenue</span>
            <span>PKR {totalRevenue.toLocaleString()}</span>
          </div>
        </div>

        {/* Expenses Section */}
        <div className="card">
          <div className="section-header" onClick={() => navigateToTrialBalance("Expense")}>
            <TrendingDown size={18} color="#EF4444" />
            <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0, flex: 1 }}>Expenses</h3>
            <span style={{ fontSize: 14, fontWeight: 700 }}>PKR {totalExpenses.toLocaleString()}</span>
          </div>
          {Object.entries(expenseByCategory).map(([cat, items]) => {
            const catTotal = items.reduce((s, a) => s + (a.balance || 0), 0)
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div className="section-header" style={{ padding: "4px 0", marginBottom: 4, fontSize: 13 }}
                     onClick={() => navigateToTrialBalance("Expense", cat)}>
                  <span style={{ fontWeight: 600 }}>{cat}</span>
                  <span style={{ fontWeight: 700 }}>PKR {catTotal.toLocaleString()}</span>
                </div>
                {items.map(a => (
                  <div key={a.id} className="clickable-row" style={{ paddingLeft: 16 }} onClick={() => openLedger(a.id)} title={`View ledger for ${a.code}`}>
                    <span style={{ color: "#475569" }}>{a.code} – {a.name}</span>
                    <span style={{ fontWeight: 500 }}>PKR {(a.balance || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )
          })}
          <div className="total-row">
            <span>Total Expenses</span>
            <span>PKR {totalExpenses.toLocaleString()}</span>
          </div>
        </div>

        {/* Net Profit Card */}
        <div className="net-profit-card" style={{
          background: netProfit >= 0 ? "#F0FDF4" : "#FEF2F2",
          borderColor: netProfit >= 0 ? "#10B981" : "#EF4444",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#64748B", letterSpacing: 0.06 }}>
            Net Profit (Loss)
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: netProfit >= 0 ? "#10B981" : "#EF4444", marginTop: 4 }}>
            PKR {netProfit.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
            {netProfit >= 0 ? "Your business is profitable" : "Loss for the period"}
          </div>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>Loading…</div>}
      </div>
    </div>
  )
}