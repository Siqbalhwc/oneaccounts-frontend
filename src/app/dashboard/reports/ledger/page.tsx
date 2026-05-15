"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import JournalEntryDrawer from "@/components/JournalEntryDrawer"

type SortField = "date" | "entry_no" | "description" | "debit" | "credit" | "balance"
type SortDir = "asc" | "desc"

export default function LedgerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Drill‑down drawer
  const [drawerEntryId, setDrawerEntryId] = useState<number | null>(null)

  // Pre‑select account from URL parameter
  useEffect(() => {
    const idFromUrl = searchParams.get("accountId")
    if (idFromUrl) {
      setAccountId(Number(idFromUrl))
    }
  }, [searchParams])

  // Default date range: current fiscal year
  useEffect(() => {
    const now = new Date()
    const year = now.getFullYear()
    const fiscalStart = `${year}-01-01`
    const today = now.toISOString().split("T")[0]
    setStartDate(fiscalStart)
    setEndDate(today)
  }, [])

  // Fetch accounts
  useEffect(() => {
    supabase
      .from("accounts")
      .select("id,code,name,type,balance")
      .order("code")
      .then((r) => r.data && setAccounts(r.data))
  }, [])

  // Load ledger
  const loadLedger = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    let query = supabase
      .from("journal_lines")
      .select("*, journal_entries!inner(date, entry_no, description, id, deleted_at)")
      .eq("account_id", accountId)
      .is("journal_entries.deleted_at", null)
      .order("journal_entries(date)")

    if (startDate) query = query.gte("journal_entries.date", startDate)
    if (endDate) query = query.lte("journal_entries.date", endDate)

    const { data } = await query
    if (data) {
      let balance = 0
      const acc = accounts.find((a) => a.id === accountId)
      const isDr = acc && ["Asset", "Expense"].includes(acc.type)
      const enriched = data.map((l: any) => {
        balance = isDr
          ? balance + l.debit - l.credit
          : balance + l.credit - l.debit
        return {
          ...l,
          balance,
          date: l.journal_entries?.date,
          entry_no: l.journal_entries?.entry_no,
          description: l.journal_entries?.description,
          entry_id: l.journal_entries?.id,
        }
      })
      setLines(enriched)
    } else {
      setLines([])
    }
    setLoading(false)
  }, [accountId, startDate, endDate, supabase, accounts])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  const acc = accounts.find((a) => a.id === accountId)

  // Sorting logic (client‑side on already fetched data)
  const sortedLines = useMemo(() => {
    const list = [...lines]
    list.sort((a, b) => {
      let valA, valB
      switch (sortField) {
        case "date":
          valA = a.date || ""
          valB = b.date || ""
          break
        case "entry_no":
          valA = a.entry_no || ""
          valB = b.entry_no || ""
          break
        case "description":
          valA = a.description || ""
          valB = b.description || ""
          break
        case "debit":
          valA = a.debit || 0
          valB = b.debit || 0
          break
        case "credit":
          valA = a.credit || 0
          valB = b.credit || 0
          break
        case "balance":
          valA = a.balance || 0
          valB = b.balance || 0
          break
        default:
          return 0
      }
      if (typeof valA === "number") {
        return sortDir === "asc" ? valA - valB : valB - valA
      }
      return sortDir === "asc"
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA))
    })
    return list
  }, [lines, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); overflow: hidden; }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: white; border-color: #334155; }
        .btn-outline:hover { background: #1E293B; }
        .input { height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; background: #1E293B; color: #F1F5F9; }
        .input:focus { border-color: #64748B; outline: none; }
        .clickable-entry { color: #93C5FD; font-weight: 600; text-decoration: underline; cursor: pointer; }
        .clickable-entry:hover { color: #2563EB; }
        .sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .sort-btn:hover { color: #93C5FD; }
        .header-row { display: grid; grid-template-columns: 100px 120px 1fr 100px 100px 100px; padding: 12px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
        .data-row { display: grid; grid-template-columns: 100px 120px 1fr 100px 100px 100px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; }
        .data-row:hover { background: #1E293B; }
        .data-row:last-child { border-bottom: none; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: #F1F5F9; }
        @media (max-width: 700px) {
          .header-row, .data-row { grid-template-columns: 80px 100px 1fr 80px 80px 80px; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📊 General Ledger</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Transaction history by account</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>Account</label>
          <select className="input" style={{ width: "100%" }} value={accountId || ""} onChange={e => setAccountId(Number(e.target.value) || null)}>
            <option value="">Select account...</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>Start Date</label>
          <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>End Date</label>
          <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
          <button className="btn btn-outline" onClick={loadLedger} disabled={!accountId}>
            View Ledger
          </button>
        </div>
      </div>

      {/* Summary Cards (account info) */}
      {acc && (
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Account</div>
            <div className="summary-value" style={{ fontSize: 18 }}>{acc.code} – {acc.name}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Type</div>
            <div className="summary-value" style={{ fontSize: 18 }}>{acc.type}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Closing Balance</div>
            <div className="summary-value" style={{ color: acc.balance >= 0 ? "#10B981" : "#EF4444" }}>
              PKR {(acc.balance || 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
      ) : sortedLines.length > 0 ? (
        <div className="card">
          <div className="header-row">
            <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
            <button className="sort-btn" onClick={() => handleSort("entry_no")}>Entry No {getSortIcon("entry_no")}</button>
            <button className="sort-btn" onClick={() => handleSort("description")}>Description {getSortIcon("description")}</button>
            <button className="sort-btn" onClick={() => handleSort("debit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Debit {getSortIcon("debit")}</button>
            <button className="sort-btn" onClick={() => handleSort("credit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Credit {getSortIcon("credit")}</button>
            <button className="sort-btn" onClick={() => handleSort("balance")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Balance {getSortIcon("balance")}</button>
          </div>
          {sortedLines.map((l, i) => (
            <div key={i} className="data-row">
              <span>{l.date || "—"}</span>
              <span className="clickable-entry" onClick={() => setDrawerEntryId(l.entry_id)} title="View journal entry">
                {l.entry_no}
              </span>
              <span style={{ color: "#94A3B8" }}>{l.description}</span>
              <span style={{ textAlign: "right", color: l.debit > 0 ? "#EF4444" : "#94A3B8" }}>{l.debit > 0 ? `PKR ${l.debit.toLocaleString()}` : "-"}</span>
              <span style={{ textAlign: "right", color: l.credit > 0 ? "#10B981" : "#94A3B8" }}>{l.credit > 0 ? `PKR ${l.credit.toLocaleString()}` : "-"}</span>
              <span style={{ textAlign: "right", fontWeight: 600 }}>PKR {l.balance.toLocaleString()}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
          No transactions found {accountId ? "for the selected period" : ""}. Select an account and date range.
        </div>
      )}

      {/* Drill‑down drawer */}
      {drawerEntryId && (
        <JournalEntryDrawer
          entryId={drawerEntryId}
          onClose={() => setDrawerEntryId(null)}
        />
      )}
    </div>
  )
}