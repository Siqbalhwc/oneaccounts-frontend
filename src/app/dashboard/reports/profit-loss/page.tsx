"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

// Category mapping for expense accounts
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

  const directExpenses = expenseAccounts.filter(a => getCategory(a) === "Direct Expenses")
  const operatingExpenses = expenseAccounts.filter(a => getCategory(a) === "Operating Expenses")
  const otherExpenses = expenseAccounts.filter(a => !["Direct Expenses", "Operating Expenses"].includes(getCategory(a)))

  const totalRevenue = revenueAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const totalDirectExpenses = directExpenses.reduce((s, a) => s + (a.balance || 0), 0)
  const totalOperatingExpenses = operatingExpenses.reduce((s, a) => s + (a.balance || 0), 0)
  const totalOtherExpenses = otherExpenses.reduce((s, a) => s + (a.balance || 0), 0)
  const totalExpenses = totalDirectExpenses + totalOperatingExpenses + totalOtherExpenses

  const grossProfit = totalRevenue - totalDirectExpenses
  const netProfit = grossProfit - totalOperatingExpenses - totalOtherExpenses

  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  const openLedger = (accountId: number) => {
    const now = new Date()
    router.push(`/dashboard/reports/ledger?accountId=${accountId}&startDate=${now.getFullYear()}-01-01&endDate=${now.toISOString().split("T")[0]}`)
  }

  // Row component
  const Row = ({ label, amount, bold, indent, color, onClick }: any) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1E293B", fontSize: 13, fontWeight: bold ? 700 : 400, cursor: onClick ? "pointer" : "default", paddingLeft: indent ? 24 : 0, color: color || "#E2E8F0" }}
         onClick={onClick} title={onClick ? "Drill down" : undefined}>
      <span>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400 }}>PKR {amount.toLocaleString()}</span>
    </div>
  )

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading…</div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .pandl-container {
          max-width: 1000px; margin: 0 auto;
          background: #111827; border: 1px solid #1E293B; border-radius: 12px;
          padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .section-title {
          font-size: 15px; font-weight: 700; color: #F1F5F9; margin: 16px 0 8px;
          cursor: pointer; display: inline-block;
        }
        .section-title:hover { color: #93C5FD; }
        .total-line {
          display: flex; justify-content: space-between; padding: 10px 0;
          font-weight: 700; font-size: 14px; border-top: 2px solid #1E293B;
        }
        .net-line {
          background: #1E293B; border-radius: 8px; padding: 14px 16px;
          margin-top: 20px; display: flex; justify-content: space-between;
          font-weight: 700; font-size: 16px;
        }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: #F1F5F9; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")} style={{ background: "transparent", border: "1.5px solid #334155", borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: "#CBD5E1", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📈 Profit & Loss Statement</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>For the period · Click any row to drill down</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Revenue</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalRevenue.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Gross Profit</div>
          <div className="summary-value" style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444" }}>PKR {grossProfit.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Net Profit</div>
          <div className="summary-value" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
            PKR {netProfit.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="pandl-container">
        {/* Revenue */}
        <div className="section-title" onClick={() => navigateToTrialBalance("Revenue")}>Revenue</div>
        {revenueAccounts.map(a => (
          <Row key={a.id} label={`${a.code} – ${a.name}`} amount={a.balance || 0} onClick={() => openLedger(a.id)} />
        ))}
        <div className="total-line" style={{ color: "#10B981" }}>
          <span>Total Revenue</span>
          <span>PKR {totalRevenue.toLocaleString()}</span>
        </div>

        {/* Direct Expenses */}
        {directExpenses.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }} onClick={() => navigateToTrialBalance("Expense", "Direct Expenses")}>Direct Expenses</div>
            {directExpenses.map(a => (
              <Row key={a.id} label={`${a.code} – ${a.name}`} amount={a.balance || 0} onClick={() => openLedger(a.id)} />
            ))}
            <div className="total-line" style={{ color: "#EF4444" }}>
              <span>Total Direct Expenses</span>
              <span>PKR {totalDirectExpenses.toLocaleString()}</span>
            </div>
          </>
        )}

        {/* Gross Profit */}
        <div className="total-line" style={{ color: grossProfit >= 0 ? "#10B981" : "#EF4444", borderTop: "1px solid #1E293B" }}>
          <span>Gross Profit</span>
          <span>PKR {grossProfit.toLocaleString()}</span>
        </div>

        {/* Operating Expenses */}
        {operatingExpenses.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }} onClick={() => navigateToTrialBalance("Expense", "Operating Expenses")}>Operating Expenses</div>
            {operatingExpenses.map(a => (
              <Row key={a.id} label={`${a.code} – ${a.name}`} amount={a.balance || 0} onClick={() => openLedger(a.id)} />
            ))}
            <div className="total-line" style={{ color: "#EF4444" }}>
              <span>Total Operating Expenses</span>
              <span>PKR {totalOperatingExpenses.toLocaleString()}</span>
            </div>
          </>
        )}

        {/* Other Expenses (if any) */}
        {otherExpenses.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }} onClick={() => navigateToTrialBalance("Expense")}>Other Expenses</div>
            {otherExpenses.map(a => (
              <Row key={a.id} label={`${a.code} – ${a.name}`} amount={a.balance || 0} onClick={() => openLedger(a.id)} />
            ))}
            <div className="total-line" style={{ color: "#EF4444" }}>
              <span>Total Other Expenses</span>
              <span>PKR {totalOtherExpenses.toLocaleString()}</span>
            </div>
          </>
        )}

        {/* Net Profit / Loss */}
        <div className="net-line" style={{ color: netProfit >= 0 ? "#10B981" : "#EF4444" }}>
          <span>{netProfit >= 0 ? "Net Profit" : "Net Loss"}</span>
          <span>PKR {Math.abs(netProfit).toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}