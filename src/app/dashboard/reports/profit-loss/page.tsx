"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function ProfitLossPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  const revenue = accounts.filter(a => a.type === "Revenue")
  const expenses = accounts.filter(a => a.type === "Expense")
  const cogs = expenses.filter(a => a.code?.startsWith("5000"))
  const opex = expenses.filter(a => !a.code?.startsWith("5000"))

  const totalRevenue = revenue.reduce((s, a) => s + (a.balance || 0), 0)
  const totalCOGS = cogs.reduce((s, a) => s + (a.balance || 0), 0)
  const totalOpex = opex.reduce((s, a) => s + (a.balance || 0), 0)
  const grossProfit = totalRevenue - totalCOGS
  const netProfit = grossProfit - totalOpex

  const Row = ({ label, value, bold, color }: any) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F1F5F9", fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: color || "#1E293B" }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || "#1E293B" }}>PKR {value.toLocaleString()}</span>
    </div>
  )

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📈 Profit & Loss</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Revenue - Expenses = Net Profit</p>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <h3 style={{ color: "#10B981", marginBottom: 8 }}>Revenue</h3>
          {revenue.map(a => <Row key={a.id} label={`${a.code} - ${a.name}`} value={a.balance || 0} />)}
          <Row label="Total Revenue" value={totalRevenue} bold />
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <h3 style={{ color: "#EF4444", marginBottom: 8 }}>Cost of Sales</h3>
          {cogs.map(a => <Row key={a.id} label={`${a.code} - ${a.name}`} value={a.balance || 0} />)}
          <Row label="Total COGS" value={totalCOGS} bold />
        </div>

        <div style={{ background: "#F0FDF4", borderRadius: 10, padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
          <span>Gross Profit</span>
          <span style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>PKR {grossProfit.toLocaleString()}</span>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <h3 style={{ color: "#F59E0B", marginBottom: 8 }}>Operating Expenses</h3>
          {opex.map(a => <Row key={a.id} label={`${a.code} - ${a.name}`} value={a.balance || 0} />)}
          <Row label="Total Operating Expenses" value={totalOpex} bold />
        </div>

        <div style={{ background: netProfit >= 0 ? "#F0FDF4" : "#FEF2F2", borderRadius: 12, padding: 20, border: `2px solid ${netProfit >= 0 ? "#10B981" : "#EF4444"}`, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Net Profit (Loss)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>PKR {netProfit.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}