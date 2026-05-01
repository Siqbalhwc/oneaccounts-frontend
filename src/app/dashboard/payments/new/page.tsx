"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"

export default function NewPaymentPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentNo, setPaymentNo] = useState("PAY-0001")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    supabase.from("suppliers").select("id,code,name,balance").order("name").then(r => r.data && setSuppliers(r.data))
    supabase.from("journal_entries").select("entry_no").like("entry_no", "PAY-%").order("entry_no", { ascending: false }).limit(1).then(r => {
      if (r.data && r.data.length > 0) {
        const last = parseInt(r.data[0].entry_no.split("-")[1]) || 0
        setPaymentNo(`PAY-${String(last + 1).padStart(4, "0")}`)
      }
    })
  }, [])

  const handleSubmit = async () => {
    if (!supplierId) { setError("Select a supplier"); return }
    if (paymentAmount <= 0) { setError("Amount must be > 0"); return }
    setLoading(true); setError("")

    const supp = suppliers.find(s => s.id === supplierId)

    await supabase.from("suppliers").update({ balance: (supp?.balance || 0) - paymentAmount }).eq("id", supplierId)

    const { data: apAcc } = await supabase.from("accounts").select("id,balance").eq("code", "2000").single()
    const { data: cashAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1000").single()

    if (apAcc && cashAcc) {
      const { data: je } = await supabase.from("journal_entries").insert({
        entry_no: paymentNo, date: paymentDate,
        description: `Payment - ${supp?.name || "Supplier"}`
      }).select("id").single()

      if (je) {
        await supabase.from("journal_lines").insert([
          { entry_id: je.id, account_id: apAcc.id, debit: paymentAmount, credit: 0 },
          { entry_id: je.id, account_id: cashAcc.id, debit: 0, credit: paymentAmount }
        ])
      }
    }

    setSuccess(`Payment ${paymentNo} posted!`)
    setTimeout(() => router.push("/dashboard/payments"), 1500)
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.push("/dashboard/payments")}
            style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>💳 New Payment</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Record supplier payment</p>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: "#F0FDF4", color: "#15803D", padding: 12, borderRadius: 8, marginBottom: 16 }}>{success}</div>}

        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Supplier *</label>
            <select value={supplierId || ""} onChange={e => setSupplierId(Number(e.target.value) || null)}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name} (Bal: PKR {s.balance?.toLocaleString()})</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Payment No *</label>
              <input value={paymentNo} onChange={e => setPaymentNo(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Date *</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Amount Paid (PKR) *</label>
            <input type="number" value={paymentAmount || ""} onChange={e => setPaymentAmount(Number(e.target.value))}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
          </div>

          <button onClick={handleSubmit} disabled={loading}
            style={{ marginTop: 20, width: "100%", padding: 12, background: loading ? "#94A3B8" : "#1D4ED8", color: "white", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Posting..." : "💾 POST PAYMENT"}
          </button>
        </div>
      </div>
    </div>
  )
}