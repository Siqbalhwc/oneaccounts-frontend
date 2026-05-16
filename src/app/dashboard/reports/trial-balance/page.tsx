"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

type SortField = "code" | "name" | "type" | "category"
type SortDir = "asc" | "desc"

// Fallback category for accounts without stored category
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

export default function TrialBalancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Date range – default to current fiscal year
  const now = new Date()
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0])

  const [trialData, setTrialData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>("code")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Read type/category filters from URL
  const filterType = searchParams.get("type") || ""
  const filterCategory = searchParams.get("category") || ""

  // Fetch period‑based trial balance
  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }

      // 1. Get all accounts for company (for type, name, category info)
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code, name, type, category")
        .eq("company_id", cid)
        .order("code")

      if (!accounts) { setLoading(false); return }

      // 2. Fetch journal lines within the period (exclude soft‑deleted)
      let query = supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(date, deleted_at, company_id)")
        .eq("company_id", cid)
        .is("journal_entries.deleted_at", null)
        .eq("journal_entries.company_id", cid)

      if (startDate) query = query.gte("journal_entries.date", startDate)
      if (endDate)   query = query.lte("journal_entries.date", endDate)

      const { data: lines } = await query

      // 3. Aggregate by account: net = sum(debit) - sum(credit)
      const agg: Record<number, number> = {}
      ;(lines || []).forEach((l: any) => {
        const aid = l.account_id
        agg[aid] = (agg[aid] || 0) + (l.debit || 0) - (l.credit || 0)
      })

      // 4. Build rows with universal rule: positive → Debit, negative → Credit
      const rows = accounts.map(acc => {
        const net = agg[acc.id] || 0
        let debit = 0, credit = 0
        if (net > 0) debit = net
        else if (net < 0) credit = -net

        const category = acc.category || getFallbackCategory(acc.code)
        return {
          id: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          category,
          debit,
          credit,
        }
      })

      // Apply filters from URL
      let filtered = rows
      if (filterType) {
        filtered = filtered.filter(r => r.type.toLowerCase() === filterType.toLowerCase())
      }
      if (filterCategory) {
        filtered = filtered.filter(r => r.category === filterCategory)
      }

      setTrialData(filtered)
      setLoading(false)
    }

    fetchData()
  }, [startDate, endDate])  // re‑fetch when dates change

  // Sorting
  const sortedData = useMemo(() => {
    const list = [...trialData]
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
  }, [trialData, sortField, sortDir])

  const totalDebit = sortedData.reduce((s, r) => s + r.debit, 0)
  const totalCredit = sortedData.reduce((s, r) => s + r.credit, 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

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

  // Open Ledger with the same date range
  const openLedger = (accountId: number) => {
    router.push(
      `/dashboard/reports/ledger?accountId=${accountId}&startDate=${startDate}&endDate=${endDate}`
    )
  }

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .tb-card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .tb-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .tb-summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; }
        .tb-table-header { display: grid; grid-template-columns: 80px 1fr 80px 100px 100px; padding: 10px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
        .tb-row { display: grid; grid-template-columns: 80px 1fr 80px 100px 100px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; cursor: pointer; }
        .tb-row:hover { background: #1E293B; }
        .tb-row:last-child { border-bottom: none; }
        .tb-sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .tb-sort-btn:hover { color: #93C5FD; }
        .date-input {
          height: 38px; border: 1.5px solid #334155; border-radius: 8px;
          padding: 0 12px; font-size: 13px; background: #1E293B; color: #F1F5F9;
          outline: none; font-family: inherit; width: 150px;
        }
        .date-input:focus { border-color: #64748B; }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: white; border-color: #334155; }
        .btn-outline:hover { background: #1E293B; }
        @media (max-width: 640px) {
          .tb-table-header, .tb-row { grid-template-columns: 60px 1fr 70px 70px; }
          .tb-table-header span:nth-child(3), .tb-row span:nth-child(3) { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>⚖️ Trial Balance</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>
            {filterType || filterCategory ? `Filtered: ${filterType || ""} ${filterCategory || ""}` : "All accounts · Select period"}
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="date"
          className="date-input"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
        <span style={{ color: "#94A3B8" }}>to</span>
        <input
          type="date"
          className="date-input"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
        <button
          className="btn btn-outline"
          onClick={() => {
            // Trigger re‑fetch by toggling loading (the useEffect depends on startDate/endDate)
            setLoading(true)
            // The actual fetch is handled by the useEffect
          }}
        >
          Refresh
        </button>
      </div>

      {/* Summary tiles */}
      <div className="tb-summary-grid">
        <div className="tb-summary-item">
          <div style={{ background: "#FEE2E2", borderRadius: 10, padding: 10 }}>📊</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Total Debits</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4444" }}>PKR {totalDebit.toLocaleString()}</div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div style={{ background: "#D1FAE5", borderRadius: 10, padding: 10 }}>💰</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Total Credits</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10B981" }}>PKR {totalCredit.toLocaleString()}</div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div style={{ background: isBalanced ? "#D1FAE5" : "#FEE2E2", borderRadius: 10, padding: 10 }}>⚖️</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Status</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: isBalanced ? "#10B981" : "#EF4444" }}>{isBalanced ? "✅ Balanced" : "❌ Not Balanced"}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading accounts…</div>
      ) : sortedData.length === 0 ? (
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
          {sortedData.map((a, i) => (
            <div key={a.id} className="tb-row" onClick={() => openLedger(a.id)} title={`View ledger for ${a.code}`}>
              <span style={{ fontWeight: 600, color: "#93C5FD" }}>{a.code}</span>
              <span style={{ color: "#E2E8F0" }}>{a.name}</span>
              <span style={{ fontSize: 10, color: "#94A3B8" }}>{a.type}</span>
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