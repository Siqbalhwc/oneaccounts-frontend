"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"

export default function NewReceiptPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [receiptAmount, setReceiptAmount] = useState(0)
  const [receiptNo, setReceiptNo] = useState("RCP-0001")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    supabase.from("customers").select("id,code,name,balance").order("name").then(r => r.data && setCustomers(r.data))
  }, [])

  const handleSubmit = async () => {
    if (!customerId) { setError("Select a customer"); return }
    if (receiptAmount <= 0) { setError("Amount must be > 0"); return }
    setLoading(true); setError("")

    const cust = customers.find(c => c.id === customerId)

    // Update customer balance
    await supabase.from("customers").update({ balance: (cust?.balance || 0) - receiptAmount }).eq("id", customerId)

    // GL Entry: DR Cash / CR AR
    const { data: cashAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1000").single()
    const { data: arAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1100").single()

    if (cashAcc && arAcc) {
      const { data: je } = await supabase.from("journal_entries").insert({
        entry_no: receiptNo, date: receiptDate,
        description: `Receipt - ${cust?.name || "Customer"}`
      }).select("id").single()

      if (je) {
        await supabase.from("journal_lines").insert([
          { entry_id: je.id, account_id: cashAcc.id, debit: receiptAmount, credit: 0 },
          { entry_id: je.id, account_id: arAcc.id, debit: 0, credit: receiptAmount }
        ])
      }
    }

    setSuccess(`Receipt ${receiptNo} posted!`)
    setTimeout(() => router.push("/dashboard/receipts"), 1500)
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.push("/dashboard/receipts")}
            style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>💰 New Receipt</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Record customer payment</p>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: "#F0FDF4", color: "#15803D", padding: 12, borderRadius: 8, marginBottom: 16 }}>{success}</div>}

        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Customer *</label>
            <select value={customerId || ""} onChange={e => setCustomerId(Number(e.target.value) || null)}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name} (Bal: PKR {c.balance?.toLocaleString()})</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Receipt No *</label>
              <input value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Date *</label>
              <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Amount Received (PKR) *</label>
            <input type="number" value={receiptAmount || ""} onChange={e => setReceiptAmount(Number(e.target.value))}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
          </div>

          <button onClick={handleSubmit} disabled={loading}
            style={{ marginTop: 20, width: "100%", padding: 12, background: loading ? "#94A3B8" : "#1D4ED8", color: "white", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Posting..." : "💾 POST RECEIPT"}
          </button>
        </div>
      </div>
    </div>
  )
}