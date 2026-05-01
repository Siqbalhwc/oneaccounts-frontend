"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function LedgerPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from("accounts").select("id,code,name,type,balance").order("code").then(r => r.data && setAccounts(r.data))
  }, [])

  const loadLedger = async () => {
    if (!accountId) return
    setLoading(true)
    const { data } = await supabase.from("journal_lines").select("*, journal_entries!inner(date, entry_no, description)").eq("account_id", accountId).order("journal_entries(date)")
    if (data) {
      let balance = 0
      const acc = accounts.find(a => a.id === accountId)
      const isDr = acc && ["Asset", "Expense"].includes(acc.type)
      const enriched = data.map((l: any) => {
        balance = isDr ? balance + l.debit - l.credit : balance + l.credit - l.debit
        return { ...l, balance, date: l.journal_entries?.date, entry_no: l.journal_entries?.entry_no, description: l.journal_entries?.description }
      })
      setLines(enriched)
    }
    setLoading(false)
  }

  const acc = accounts.find(a => a.id === accountId)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📊 General Ledger</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Transaction history by account</p>
        </div>
      </div>

      <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Account</label>
            <select value={accountId || ""} onChange={e => setAccountId(Number(e.target.value) || null)}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>
              <option value="">Select account...</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
          </div>
          <button onClick={loadLedger}
            style={{ padding: "10px 20px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            View Ledger
          </button>
        </div>
      </div>

      {acc && <div style={{ background: "#F0F7FF", borderRadius: 10, padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <span><strong>{acc.code} - {acc.name}</strong> ({acc.type})</span>
        <span style={{ fontWeight: 700 }}>Closing Balance: PKR {(acc.balance || 0).toLocaleString()}</span>
      </div>}

      {loading ? <div style={{ textAlign: "center", padding: 40 }}>Loading...</div> :
        lines.length > 0 && (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 100px 1fr 80px 80px 90px", padding: "10px 14px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
              <span>Date</span><span>Entry No</span><span>Description</span><span>Debit</span><span>Credit</span><span>Balance</span>
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 100px 1fr 80px 80px 90px", padding: "8px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 11, alignItems: "center" }}>
                <span>{l.date}</span><span style={{ color: "#1E3A8A", fontWeight: 600 }}>{l.entry_no}</span>
                <span style={{ color: "#64748B" }}>{l.description}</span>
                <span style={{ color: "#EF4444" }}>{l.debit > 0 ? `PKR ${l.debit.toLocaleString()}` : "-"}</span>
                <span style={{ color: "#10B981" }}>{l.credit > 0 ? `PKR ${l.credit.toLocaleString()}` : "-"}</span>
                <span style={{ fontWeight: 600 }}>PKR {l.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}