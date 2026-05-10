"use client"

import { useState, useEffect, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

export default function LedgerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

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
    supabase.from("accounts").select("id,code,name,type,balance").order("code").then(r => r.data && setAccounts(r.data))
  }, [])

  // Load ledger (auto when accountId changes, or on button click)
  const loadLedger = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    let query = supabase
      .from("journal_lines")
      .select("*, journal_entries!inner(date, entry_no, description)")
      .eq("account_id", accountId)
      .order("journal_entries(date)")

    if (startDate) query = query.gte("journal_entries.date", startDate)
    if (endDate) query = query.lte("journal_entries.date", endDate)

    const { data } = await query
    if (data) {
      let balance = 0
      const acc = accounts.find(a => a.id === accountId)
      const isDr = acc && ["Asset", "Expense"].includes(acc.type)
      const enriched = data.map((l: any) => {
        balance = isDr ? balance + l.debit - l.credit : balance + l.credit - l.debit
        return {
          ...l,
          balance,
          date: l.journal_entries?.date,
          entry_no: l.journal_entries?.entry_no,
          description: l.journal_entries?.description,
        }
      })
      setLines(enriched)
    }
    setLoading(false)
  }, [accountId, startDate, endDate, supabase, accounts])

  // Auto‑load when accountId, startDate, endDate change
  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  const acc = accounts.find(a => a.id === accountId)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .input { height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📊 General Ledger</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Transaction history by account</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Account</label>
          <select className="input" style={{ width: "100%" }} value={accountId || ""} onChange={e => setAccountId(Number(e.target.value) || null)}>
            <option value="">Select account...</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Start Date</label>
          <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>End Date</label>
          <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
          <button className="btn btn-primary" onClick={loadLedger} disabled={!accountId}>View Ledger</button>
        </div>
      </div>

      {acc && (
        <div style={{ background: "#F0F7FF", borderRadius: 10, padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span><strong>{acc.code} - {acc.name}</strong> ({acc.type})</span>
          <span style={{ fontWeight: 700 }}>Closing Balance: PKR {(acc.balance || 0).toLocaleString()}</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading...</div>
      ) : lines.length > 0 ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 100px 1fr 100px 100px 100px", padding: "10px 14px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
            <span>Date</span><span>Entry No</span><span>Description</span><span style={{ textAlign: "right" }}>Debit</span><span style={{ textAlign: "right" }}>Credit</span><span style={{ textAlign: "right" }}>Balance</span>
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 100px 1fr 100px 100px 100px", padding: "8px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 12, alignItems: "center" }}>
              <span>{l.date || "—"}</span>
              <span style={{ color: "#1E3A8A", fontWeight: 600 }}>{l.entry_no}</span>
              <span style={{ color: "#64748B" }}>{l.description}</span>
              <span style={{ textAlign: "right", color: "#EF4444" }}>{l.debit > 0 ? `PKR ${l.debit.toLocaleString()}` : "-"}</span>
              <span style={{ textAlign: "right", color: "#10B981" }}>{l.credit > 0 ? `PKR ${l.credit.toLocaleString()}` : "-"}</span>
              <span style={{ textAlign: "right", fontWeight: 600 }}>PKR {l.balance.toLocaleString()}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", color: "#94A3B8", padding: 24 }}>
          No transactions found {accountId ? "for the selected period" : ""}. Select an account and date range.
        </div>
      )}
    </div>
  )
}