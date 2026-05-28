"use client"

import { useState, useEffect, useMemo } from "react"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

type SortField = "code" | "name" | "type" | "category"
type SortDir = "asc" | "desc"

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
  return "Other"
}

export default function TrialBalancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const now = new Date()
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0])

  const [trialData, setTrialData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>("code")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [errorMsg, setErrorMsg] = useState("")

  const filterType = searchParams.get("type") || ""
  const filterCategory = searchParams.get("category") || ""

  const fetchTrial = async () => {
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await fetch(`/api/trial-balance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      // json is an array of { account_id, code, name, type, category, debit, credit }
      const rows = (json || []).map((row: any) => ({
        id: row.account_id,
        code: row.code,
        name: row.name,
        type: row.type,
        category: row.category || getFallbackCategory(row.code),
        debit: Number(row.debit),
        credit: Number(row.credit),
      }))

      let filtered = rows
      if (filterType) {
        filtered = filtered.filter(r => r.type.toLowerCase() === filterType.toLowerCase())
      }
      if (filterCategory) {
        filtered = filtered.filter(r => r.category === filterCategory)
      }

      setTrialData(filtered)
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load trial balance")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrial()
  }, [startDate, endDate, filterType, filterCategory])

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

  const openLedger = (accountId: number) => {
    router.push(
      `/dashboard/reports/ledger?accountId=${accountId}&startDate=${startDate}&endDate=${endDate}`
    )
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .tb-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; box-shadow: var(--shadow-sm); }
        .tb-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .tb-summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; }
        .tb-table-header {
          display: grid;
          grid-template-columns: 80px 1fr 80px 100px 100px;
          padding: 14px 24px;
          background: var(--card);
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .tb-row {
          display: grid;
          grid-template-columns: 80px 1fr 80px 100px 100px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 13px; align-items: center;
          transition: background 0.15s; cursor: pointer;
        }
        .tb-row:hover { background: var(--card-hover); }
        .tb-row:last-child { border-bottom: none; }
        .tb-sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .tb-sort-btn:hover { color: var(--primary); }
        .date-input {
          height: 34px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 10px; font-size: 12px; background: var(--card); color: var(--text);
          outline: none; font-family: inherit; width: 140px;
        }
        .date-input:focus { border-color: var(--primary); }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        @media (max-width: 640px) {
          .tb-table-header, .tb-row { grid-template-columns: 60px 1fr 70px 70px; }
          .tb-table-header span:nth-child(3), .tb-row span:nth-child(3) { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>⚖️ Trial Balance</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {filterType || filterCategory ? `Filtered: ${filterType || ""} ${filterCategory || ""}` : "All accounts"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="date"
            className="date-input"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
          <input
            type="date"
            className="date-input"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
          <button className="btn btn-outline" onClick={fetchTrial}>
            Refresh
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>
          {errorMsg}
        </div>
      )}

      <div className="tb-summary-grid">
        <div className="tb-summary-item">
          <div style={{ background: "#FEE2E2", borderRadius: 10, padding: 10 }}>📊</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Total Debits</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4444" }}>PKR {totalDebit.toLocaleString()}</div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div style={{ background: "#D1FAE5", borderRadius: 10, padding: 10 }}>💰</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Total Credits</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10B981" }}>PKR {totalCredit.toLocaleString()}</div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div style={{ background: isBalanced ? "#D1FAE5" : "#FEE2E2", borderRadius: 10, padding: 10 }}>⚖️</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Status</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: isBalanced ? "#10B981" : "#EF4444" }}>{isBalanced ? "✅ Balanced" : "❌ Not Balanced"}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading accounts…</div>
      ) : sortedData.length === 0 ? (
        <div className="tb-card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No accounts match the selected filter or date range.</div>
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
              <span style={{ fontWeight: 600, color: "var(--primary)" }}>{a.code}</span>
              <span style={{ color: "var(--text)" }}>{a.name}</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{a.type}</span>
              <span style={{ textAlign: "right", color: a.debit > 0 ? "#EF4444" : "var(--text-muted)", fontWeight: a.debit > 0 ? 600 : 400 }}>
                {a.debit > 0 ? `PKR ${a.debit.toLocaleString()}` : "-"}
              </span>
              <span style={{ textAlign: "right", color: a.credit > 0 ? "#10B981" : "var(--text-muted)", fontWeight: a.credit > 0 ? 600 : 400 }}>
                {a.credit > 0 ? `PKR ${a.credit.toLocaleString()}` : "-"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}