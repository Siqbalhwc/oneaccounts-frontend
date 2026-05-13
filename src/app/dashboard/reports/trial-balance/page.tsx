"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

// Fallback category for accounts without a stored category
function getFallbackCategory(code?: string): string {
  if (!code) return "Other"
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
  if (num >= 4000 && num <= 4099) return "Revenue"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  if (num >= 1000 && num <= 1999) return "Other Assets"
  if (num >= 2000 && num <= 2999) return "Other Liabilities"
  return "Other"
}

type SortField = "code" | "name" | "type" | "category"
type SortDir = "asc" | "desc"

export default function TrialBalancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>("code")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Read filter parameters from URL
  const filterType = searchParams.get("type") || ""
  const filterCategory = searchParams.get("category") || ""

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  // Apply filters + calculate debit/credit for trial balance
  const filteredAccounts = useMemo(() => {
    let list = accounts.map(a => ({
      ...a,
      category: a.category || getFallbackCategory(a.code),
    }))

    if (filterType) {
      list = list.filter(a => a.type === filterType)
    }
    if (filterCategory) {
      list = list.filter(a => a.category === filterCategory)
    }

    return list
  }, [accounts, filterType, filterCategory])

  const tb = useMemo(() => {
    let totalDebit = 0, totalCredit = 0
    const rows = filteredAccounts.map(a => {
      const bal = a.balance || 0
      let debit = 0, credit = 0
      if (["Asset", "Expense"].includes(a.type)) {
        debit = Math.max(bal, 0)
        credit = Math.max(-bal, 0)
      } else {
        credit = Math.max(bal, 0)
        debit = Math.max(-bal, 0)
      }
      totalDebit += debit
      totalCredit += credit
      return { ...a, debit, credit }
    })
    return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 }
  }, [filteredAccounts])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // Sort the tb rows
  const sortedTb = useMemo(() => {
    const list = [...tb.rows]
    list.sort((a, b) => {
      let valA = (a[sortField] || "").toString().toLowerCase()
      let valB = (b[sortField] || "").toString().toLowerCase()
      if (sortField === "code") {
        const numA = parseFloat(a.code)
        const numB = parseFloat(b.code)
        if (!isNaN(numA) && !isNaN(numB)) {
          valA = numA.toString().padStart(10, "0")
          valB = numB.toString().padStart(10, "0")
        }
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return list
  }, [tb.rows, sortField, sortDir])

  const openLedger = (accountId: number) => {
    const now = new Date()
    router.push(
      `/dashboard/reports/ledger?accountId=${accountId}&startDate=${now.getFullYear()}-01-01&endDate=${now.toISOString().split("T")[0]}`
    )
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .tb-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .tb-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .tb-summary-item { background: white; border-radius: 12px; padding: 18px 20px; border: 1px solid #E2E8F0; display: flex; align-items: center; gap: 14px; }
        .tb-table-header { display: grid; grid-template-columns: 80px 1fr 80px 100px 100px; padding: 10px 20px; background: #F8FAFC; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #E2E8F0; }
        .tb-row { display: grid; grid-template-columns: 80px 1fr 80px 100px 100px; padding: 10px 20px; border-bottom: 1px solid #F1F5F9; font-size: 13px; align-items: center; transition: background 0.15s; cursor: pointer; }
        .tb-row:hover { background: #FAFBFF; }
        .tb-row:last-child { border-bottom: none; }
        .tb-sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .tb-sort-btn:hover { color: #1E3A8A; }
        @media (max-width: 640px) {
          .tb-table-header, .tb-row { grid-template-columns: 60px 1fr 70px 70px; }
          .tb-table-header span:nth-child(3), .tb-row span:nth-child(3) { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>⚖️ Trial Balance</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>
            {filterType || filterCategory ? `Filtered: ${filterType || ""} ${filterCategory || ""}` : "All accounts"}
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="tb-summary-grid">
        <div className="tb-summary-item">
          <div style={{ background: "#FEE2E2", borderRadius: 10, padding: 10 }}>📊</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Total Debits</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4444" }}>PKR {tb.totalDebit.toLocaleString()}</div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div style={{ background: "#D1FAE5", borderRadius: 10, padding: 10 }}>💰</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Total Credits</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10B981" }}>PKR {tb.totalCredit.toLocaleString()}</div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div style={{ background: tb.balanced ? "#D1FAE5" : "#FEE2E2", borderRadius: 10, padding: 10 }}>⚖️</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Status</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: tb.balanced ? "#10B981" : "#EF4444" }}>{tb.balanced ? "✅ Balanced" : "❌ Not Balanced"}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading accounts…</div>
      ) : sortedTb.length === 0 ? (
        <div className="tb-card" style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No accounts match the selected filter.</div>
      ) : (
        <div className="tb-card" style={{ padding: 0, overflowX: "auto" }}>
          <div className="tb-table-header">
            <button className="tb-sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
            <button className="tb-sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
            <span>Type</span>
            <span style={{ textAlign: "right" }}>Debit</span>
            <span style={{ textAlign: "right" }}>Credit</span>
          </div>
          {sortedTb.map((a, i) => (
            <div key={a.id} className="tb-row" onClick={() => openLedger(a.id)} title={`View ledger for ${a.code}`}>
              <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{a.code}</span>
              <span style={{ color: "#334155" }}>{a.name}</span>
              <span style={{ fontSize: 10, color: "#64748B" }}>{a.type}</span>
              <span style={{ textAlign: "right", color: a.debit > 0 ? "#EF4444" : "#94A3B8", fontWeight: a.debit > 0 ? 600 : 400 }}>
                {a.debit > 0 ? `PKR ${a.debit.toLocaleString()}` : "-"}
              </span>
              <span style={{ textAlign: "right", color: a.credit > 0 ? "#10B981" : "#94A3B8", fontWeight: a.credit > 0 ? 600 : 400 }}>
                {a.credit > 0 ? `PKR ${a.credit.toLocaleString()}` : "-"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}