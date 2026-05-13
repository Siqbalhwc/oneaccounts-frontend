"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
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

  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  const CategoryBlock = ({ title, items, total, category, type }: any) => (
    <div style={{ marginBottom: 16 }}>
      <div className="clickable" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
           onClick={() => navigateToTrialBalance(type, category)}>
        <span>{title}</span>
        <span>PKR {total.toLocaleString()}</span>
      </div>
      {items.map((a: any) => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", paddingLeft: 16, fontSize: 12, color: "#64748B", borderBottom: "1px solid #F1F5F9" }}>
          <span>{a.code} – {a.name}</span>
          <span>PKR {(a.balance || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 16px; }
        .clickable { cursor: pointer; transition: color 0.15s; }
        .clickable:hover { color: #1D4ED8; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📈 Profit & Loss</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Revenue – Expenses = Net Profit</p>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* Revenue */}
        <div className="card">
          <h3 className="clickable" style={{ color: "#10B981", marginBottom: 12, fontSize: 16, fontWeight: 700 }}
              onClick={() => navigateToTrialBalance("Revenue")}>
            Revenue
          </h3>
          {revenueAccounts.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}>
              <span>{a.code} – {a.name}</span>
              <span>PKR {(a.balance || 0).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 700, fontSize: 15, marginTop: 4 }}>
            <span>Total Revenue</span>
            <span>PKR {totalRevenue.toLocaleString()}</span>
          </div>
        </div>

        {/* Expenses */}
        <div className="card">
          <h3 className="clickable" style={{ color: "#EF4444", marginBottom: 12, fontSize: 16, fontWeight: 700 }}
              onClick={() => navigateToTrialBalance("Expense")}>
            Expenses
          </h3>
          {Object.entries(expenseByCategory).map(([cat, items]) => {
            const catTotal = items.reduce((s, a) => s + (a.balance || 0), 0)
            return (
              <CategoryBlock
                key={cat}
                title={cat}
                items={items}
                total={catTotal}
                category={cat}
                type="Expense"
              />
            )
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 700, fontSize: 15, borderTop: "2px solid #E2E8F0" }}>
            <span>Total Expenses</span>
            <span>PKR {totalExpenses.toLocaleString()}</span>
          </div>
        </div>

        {/* Net Profit */}
        <div style={{ background: netProfit >= 0 ? "#F0FDF4" : "#FEF2F2", borderRadius: 12, padding: 20, border: `2px solid ${netProfit >= 0 ? "#10B981" : "#EF4444"}`, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Net Profit (Loss)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>PKR {netProfit.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}