"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function SupplierLedgerPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from("suppliers").select("id,code,name,balance").order("name").then(r => r.data && setSuppliers(r.data))
  }, [])

  const loadLedger = async () => {
    if (!supplierId) return
    setLoading(true)
    const supp = suppliers.find(s => s.id === supplierId)

    const { data: bills } = await supabase.from("invoices").select("*").eq("type", "purchase").eq("party_id", supplierId).order("date")
    const { data: payments } = await supabase.from("journal_entries").select("*, journal_lines(debit,credit)").like("description", `%${supp?.name}%`).order("date")

    const txns: any[] = []
    let balance = 0

    if (bills) bills.forEach((b: any) => { balance += (b.total || 0) - (b.paid || 0); txns.push({ date: b.date, type: "Bill", ref: b.invoice_no, desc: "Purchase Bill", debit: 0, credit: b.total, balance }) })
    if (payments) payments.forEach((p: any) => {
      const debit = p.journal_lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) || 0
      balance -= debit
      txns.push({ date: p.date, type: "Payment", ref: p.entry_no, desc: p.description, debit, credit: 0, balance })
    })

    txns.sort((a, b) => a.date.localeCompare(b.date))
    setEntries(txns)
    setLoading(false)
  }

  const supp = suppliers.find(s => s.id === supplierId)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📒 Supplier Ledger</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Transaction history by supplier</p>
        </div>
      </div>

      <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Supplier</label>
            <select value={supplierId || ""} onChange={e => setSupplierId(Number(e.target.value) || null)}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
            </select>
          </div>
          <button onClick={loadLedger}
            style={{ padding: "10px 20px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Generate Ledger
          </button>
        </div>
      </div>

      {supp && <div style={{ background: "#FEF2F2", borderRadius: 10, padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <span><strong>{supp.name}</strong> ({supp.code})</span>
        <span style={{ fontWeight: 700, color: "#EF4444" }}>Balance: PKR {(supp.balance || 0).toLocaleString()}</span>
      </div>}

      {loading ? <div style={{ textAlign: "center", padding: 40 }}>Loading...</div> :
        entries.length > 0 && (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 100px 1fr 90px 90px 90px", padding: "10px 14px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
              <span>Date</span><span>Type</span><span>Ref</span><span>Description</span><span>Debit</span><span>Credit</span><span>Balance</span>
            </div>
            {entries.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 80px 100px 1fr 90px 90px 90px", padding: "8px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 12, alignItems: "center" }}>
                <span>{e.date}</span><span>{e.type}</span><span style={{ color: "#1E3A8A" }}>{e.ref}</span>
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