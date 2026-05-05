"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save } from "lucide-react"

export default function NewPaymentPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentNo, setPaymentNo] = useState("PAY-0001")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // ── Get active company ────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      // Fetch suppliers belonging to this company
      supabase.from("suppliers")
        .select("id,code,name,balance")
        .eq("company_id", cid)
        .order("name")
        .then(r => r.data && setSuppliers(r.data))
    })
    // Auto‑generate next payment number
    supabase.from("journal_entries")
      .select("entry_no").like("entry_no", "PAY-%")
      .order("entry_no", { ascending: false }).limit(1)
      .then(r => {
        if (r.data && r.data.length > 0) {
          const last = parseInt(r.data[0].entry_no.split("-")[1]) || 0
          setPaymentNo(`PAY-${String(last + 1).padStart(4, "0")}`)
        }
      })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierId) { setError("Please select a supplier"); return }
    if (!paymentAmount || paymentAmount <= 0) { setError("Amount must be greater than zero"); return }
    setLoading(true); setError("")

    try {
      const supp = suppliers.find(s => s.id === supplierId)

      // Update supplier balance
      await supabase.from("suppliers")
        .update({ balance: (supp?.balance || 0) - paymentAmount })
        .eq("id", supplierId)
        .eq("company_id", companyId)

      // Post GL entries
      const apAcc = await supabase.from("accounts").select("id,balance").eq("code", "2000").eq("company_id", companyId).single()
      const cashAcc = await supabase.from("accounts").select("id,balance").eq("code", "1000").eq("company_id", companyId).single()

      if (apAcc.data && cashAcc.data) {
        const { data: je } = await supabase.from("journal_entries").insert({
          company_id: companyId,
          entry_no: paymentNo,
          date: paymentDate,
          description: `Payment - ${supp?.name || "Supplier"}`
        }).select("id").single()

        if (je) {
          await supabase.from("journal_lines").insert([
            { company_id: companyId, entry_id: je.id, account_id: apAcc.data.id, debit: paymentAmount, credit: 0 },
            { company_id: companyId, entry_id: je.id, account_id: cashAcc.data.id, debit: 0, credit: paymentAmount }
          ])
        }
      }

      setSuccess(`✅ Payment ${paymentNo} posted!`)
      setTimeout(() => router.push("/dashboard/payments"), 1500)
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    }
    setLoading(false)
  }

  // ── UI ────────────────────────────────────────────────────
  return (
    <div style={{ padding: "clamp(16px,2.5vw,24px)", background: "#EFF4FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 700px; margin: 0 auto; }
        .inv-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 20px 24px; margin-bottom: 16px; }
        .inv-title { font-size: 20px; font-weight: 800; color: #1E293B; }
        .inv-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: block; }
        .inv-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/payments")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="inv-title">💳 New Payment</div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>Record a supplier payment</div>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: "#F0FDF4", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16 }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="inv-card">
            <div style={{ marginBottom: 14 }}>
              <label className="inv-label">Supplier *</label>
              <select
                className="inv-input"
                value={supplierId ?? ""}
                onChange={e => setSupplierId(Number(e.target.value) || null)}
                required
              >
                <option value="">Select supplier…</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.code} – {s.name} (Bal: PKR {s.balance?.toLocaleString()})</option>
                ))}
              </select>
            </div>

            <div className="inv-row">
              <div>
                <label className="inv-label">Payment No *</label>
                <input className="inv-input" value={paymentNo} onChange={e => setPaymentNo(e.target.value)} required />
              </div>
              <div>
                <label className="inv-label">Date *</label>
                <input className="inv-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="inv-label">Amount Paid (PKR) *</label>
              <input
                className="inv-input"
                type="number"
                step="0.01"
                value={paymentAmount || ""}
                onChange={e => setPaymentAmount(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 12 }}>
            <Save size={16} /> {loading ? "Posting…" : "Post Payment"}
          </button>
        </form>
      </div>
    </div>
  )
}