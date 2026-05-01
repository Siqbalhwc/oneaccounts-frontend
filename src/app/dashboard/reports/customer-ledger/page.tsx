"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function CustomerLedgerPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from("customers").select("id,code,name,balance").order("name").then(r => r.data && setCustomers(r.data))
  }, [])

  const loadLedger = async () => {
    if (!customerId) return
    setLoading(true)
    const cust = customers.find(c => c.id === customerId)

    // Get sales invoices
    const { data: invoices } = await supabase.from("invoices").select("*").eq("type", "sale").eq("party_id", customerId).order("date")
    // Get receipts (from journal entries with RCP- prefix matching customer name)
    const { data: receipts } = await supabase.from("journal_entries").select("*, journal_lines(debit,credit)").like("description", `%${cust?.name}%`).order("date")

    const txns: any[] = []
    let balance = 0

    // Add invoices as debits
    if (invoices) {
      invoices.forEach((inv: any) => {
        balance += (inv.total || 0) - (inv.paid || 0)
        txns.push({ date: inv.date, type: "Invoice", ref: inv.invoice_no, desc: `Sales Invoice`, debit: inv.total, credit: 0, balance })
      })
    }

    // Add receipts as credits
    if (receipts) {
      receipts.forEach((rec: any) => {
        const credit = rec.journal_lines?.reduce((s: number, l: any) => s + (l.credit || 0), 0) || 0
        balance -= credit
        txns.push({ date: rec.date, type: "Receipt", ref: rec.entry_no, desc: rec.description, debit: 0, credit, balance })
      })
    }

    txns.sort((a, b) => a.date.localeCompare(b.date))
    setEntries(txns)
    setLoading(false)
  }

  const cust = customers.find(c => c.id === customerId)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📒 Customer Ledger</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Full transaction history</p>
        </div>
      </div>

      <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Customer</label>
            <select value={customerId || ""} onChange={e => setCustomerId(Number(e.target.value) || null)}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </div>
          <button onClick={loadLedger}
            style={{ padding: "10px 20px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Generate Ledger
          </button>
        </div>
      </div>

      {cust && (
        <div style={{ background: "#F0F7FF", borderRadius: 10, border: "1px solid #BFDBFE", padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
          <span><strong>{cust.name}</strong> ({cust.code})</span>
          <span style={{ fontWeight: 700, color: "#F59E0B" }}>Balance: PKR {(cust.balance || 0).toLocaleString()}</span>
        </div>
      )}

      {loading ? <div style={{ textAlign: "center", padding: 40 }}>Loading...</div> :
        entries.length > 0 && (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 100px 1fr 90px 90px 90px", padding: "10px 14px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
              <span>Date</span><span>Type</span><span>Reference</span><span>Description</span><span>Debit</span><span>Credit</span><span>Balance</span>
            </div>
            {entries.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 80px 100px 1fr 90px 90px 90px", padding: "8px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 12, alignItems: "center" }}>
                <span>{e.date}</span>
                <span>{e.type}</span>
                <span style={{ color: "#1E3A8A" }}>{e.ref}</span>
                <span style={{ color: "#64748B" }}>{e.desc}</span>
                <span style={{ color: "#EF4444" }}>{e.debit > 0 ? `PKR ${e.debit.toLocaleString()}` : "-"}</span>
                <span style={{ color: "#10B981" }}>{e.credit > 0 ? `PKR ${e.credit.toLocaleString()}` : "-"}</span>
                <span style={{ fontWeight: 600 }}>PKR {e.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}