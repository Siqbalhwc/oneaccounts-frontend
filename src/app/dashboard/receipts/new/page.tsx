"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, CheckSquare, Square } from "lucide-react"

export default function NewReceiptPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")
  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  // Multi‑allocation state
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([])
  const [selectedInvoices, setSelectedInvoices] = useState<Record<number, { amount: number; apply: boolean }>>({})
  const [totalAllocated, setTotalAllocated] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      supabase.from("customers")
        .select("id, code, name, balance")
        .eq("company_id", cid)
        .order("name")
        .then(r => r.data && setCustomers(r.data))
    })
  }, [])

  // Fetch unpaid invoices when customer changes
  useEffect(() => {
    if (!customerId || !companyId) return
    supabase.from("invoices")
      .select("id, invoice_no, total, paid, status, date")
      .eq("company_id", companyId)
      .eq("type", "sale")
      .eq("party_id", customerId)
      .neq("status", "Paid")
      .order("date", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to fetch invoices:", error)
          setUnpaidInvoices([])
        } else {
          setUnpaidInvoices(data || [])
        }
        setSelectedInvoices({})
        setTotalAllocated(0)
      })
  }, [customerId, companyId])
  const toggleInvoice = (inv: any) => {
    setSelectedInvoices(prev => {
      const next = { ...prev }
      if (next[inv.id]) {
        delete next[inv.id]
      } else {
        next[inv.id] = { amount: inv.total - (inv.paid || 0), apply: true }
      }
      return next
    })
  }

  const updateAllocAmount = (invId: number, val: number) => {
    setSelectedInvoices(prev => ({
      ...prev,
      [invId]: { ...prev[invId], amount: val },
    }))
  }

  // Recalculate total allocated
  useEffect(() => {
    const total = Object.values(selectedInvoices).reduce((sum, a) => sum + (a.apply ? a.amount : 0), 0)
    setTotalAllocated(total)
  }, [selectedInvoices])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!customerId) { setError("Please select a customer"); return }
    if (Object.keys(selectedInvoices).length === 0) {
      setError("Select at least one invoice to apply payment to.")
      return
    }
    const total = Object.values(selectedInvoices).reduce((s, a) => s + a.amount, 0)
    if (total <= 0) { setError("Total amount must be > 0"); return }
    setLoading(true)

    const allocs = Object.entries(selectedInvoices).map(([invId, data]) => ({
      invoice_id: parseInt(invId),
      amount: data.amount,
    }))

    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        party_id: customerId,
        amount: total,
        payment_method: paymentMethod,
        date,
        reference,
        notes,
        allocations: allocs,
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
      <div style={{ padding: "clamp(16px,2.5vw,24px)", background: "#EFF4FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div className="inv-shell" style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
          <h2>✅ Receipt Created</h2>
          <p>Receipt No: <strong>{success}</strong></p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button className="inv-btn inv-btn-primary" onClick={() => router.push("/dashboard/receipts")}>View Receipts List</button>
            <button className="inv-btn inv-btn-outline" onClick={() => setSuccess(null)}>Create Another</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "clamp(16px,2.5vw,24px)", background: "#EFF4FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 900px; margin: 0 auto; }
        .inv-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 20px 24px; margin-bottom: 16px; }
        .inv-title { font-size: 20px; font-weight: 800; color: #1E293B; }
        .inv-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: block; }
        .inv-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .alloc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .alloc-table th, .alloc-table td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: left; }
        .alloc-table th { background: #F8FAFC; font-weight: 600; color: #475569; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/receipts")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="inv-title">💰 New Receipt</div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>Allocate payment across outstanding invoices</div>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="inv-card">
            <div style={{ marginBottom: 14 }}>
              <label className="inv-label">Customer *</label>
              <select
                className="inv-input"
                value={customerId ?? ""}
                onChange={(e) => setCustomerId(Number(e.target.value) || null)}
                required
              >
                <option value="">Select customer</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name} (Bal: {c.balance?.toLocaleString()})</option>
                ))}
              </select>
            </div>

            {unpaidInvoices.length > 0 && (
              <div>
                <label className="inv-label">Apply to Invoices</label>
                <table className="alloc-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Invoice</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Amount to Apply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidInvoices.map(inv => {
                      const sel = selectedInvoices[inv.id]
                      const balance = inv.total - (inv.paid || 0)
                      return (
                        <tr key={inv.id}>
                          <td>
                            <button
                              type="button"
                              onClick={() => toggleInvoice(inv)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: sel ? '#1740C8' : '#94A3B8' }}
                            >
                              {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                          </td>
                          <td>{inv.invoice_no} <span style={{ color: "#94A3B8", fontSize: 10 }}>({inv.date?.slice(0,10)})</span></td>
                          <td>{inv.total.toLocaleString()}</td>
                          <td>{inv.paid.toLocaleString()}</td>
                          <td>{balance.toLocaleString()}</td>
                          <td>
                            <input
                              className="inv-input"
                              style={{ width: 100, textAlign: 'right' }}
                              type="number"
                              step="0.01"
                              max={balance}
                              value={sel?.amount || ""}
                              onChange={e => updateAllocAmount(inv.id, Number(e.target.value))}
                              disabled={!sel}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, fontWeight: 600, textAlign: 'right' }}>
                  Total Allocated: PKR {totalAllocated.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          <div className="inv-card">
            <div className="inv-row">
              <div>
                <label className="inv-label">Payment Method</label>
                <select className="inv-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div>
                <label className="inv-label">Date</label>
                <input className="inv-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div className="inv-row" style={{ marginTop: 14 }}>
              <div>
                <label className="inv-label">Reference</label>
                <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="inv-label">Notes</label>
                <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>

          <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 12 }}>
            <Save size={16} /> {loading ? "Saving..." : "Save Receipt"}
          </button>
        </form>
      </div>
    </div>
  )
}