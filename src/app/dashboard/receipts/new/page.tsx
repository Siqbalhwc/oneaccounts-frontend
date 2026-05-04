"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save } from "lucide-react"

export default function NewReceiptPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    supabase.from("customers").select("id, code, name, balance").order("name")
      .then(r => r.data && setCustomers(r.data))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!customerId || !amount || parseFloat(amount) <= 0) {
      setError("Please select a customer and enter a valid amount.")
      return
    }
    setLoading(true)

    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        party_id: customerId,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        date,
        reference,
        notes,
      }),
    })
    const data = await res.json()
    if (!data.success) {
      setError(data.error || "Failed to create receipt")
      setLoading(false)
      return
    }
    setSuccess(data.receipt_no)
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ padding: 24, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <h2>✅ Receipt Created</h2>
        <p>Receipt No: <strong>{success}</strong></p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button className="inv-btn inv-btn-primary" onClick={() => router.push("/dashboard/receipts")}>
            View Receipts List
          </button>
          <button className="inv-btn inv-btn-outline" onClick={() => setSuccess(null)}>
            Create Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/receipts")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>💰 New Receipt</h1>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Record a customer payment</p>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 12, padding: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>Customer *</label>
            <select
              className="inv-input"
              value={customerId ?? ""}
              onChange={(e) => setCustomerId(Number(e.target.value))}
              required
            >
              <option value="">Select customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.name} (Bal: {c.balance?.toLocaleString()})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>Amount (PKR) *</label>
            <input className="inv-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>Payment Method</label>
            <select className="inv-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Online">Online</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Date</label>
              <input className="inv-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Reference</label>
              <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>Notes</label>
            <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", padding: 12 }}>
            <Save size={16} /> {loading ? "Saving..." : "Save Receipt"}
          </button>
        </form>
      </div>
    </div>
  )
}