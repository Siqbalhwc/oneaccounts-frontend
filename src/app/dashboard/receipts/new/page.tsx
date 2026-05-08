"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Search, X, CheckCircle } from "lucide-react"

export default function NewReceiptPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")
  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)

  const [invoices, setInvoices] = useState<any[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)

  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [amount, setAmount] = useState<number | "">("")       // ✅ no default 0
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase.from("customers")
      .select("id,code,name,phone,balance")
      .eq("company_id", companyId)
      .order("name")
      .then(r => r.data && setCustomers(r.data))
  }, [companyId])

  useEffect(() => {
    if (!companyId || !customerId) return
    supabase.from("invoices")
      .select("id,invoice_no,date,total,paid")
      .eq("company_id", companyId)
      .eq("party_id", customerId)
      .eq("status", "Unpaid")
      .order("date")
      .then(r => setInvoices(r.data || []))
  }, [companyId, customerId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.code.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone || "").includes(customerSearch)
  )

  const selectCustomer = (c: any) => {
    setCustomerId(c.id)
    setSelectedCustomer(c)
    setCustomerSearch(c.name)
    setShowCustomerList(false)
    setSelectedInvoiceId(null)
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setSelectedCustomer(null)
    setCustomerSearch("")
    setShowCustomerList(true)
    setSelectedInvoiceId(null)
  }

  const handleSubmit = async () => {
    const amt = Number(amount)
    if (!companyId) { setError("Company not loaded yet."); return }
    if (!customerId) { setError("Please select a customer"); return }
    if (amt <= 0) { setError("Enter a valid receipt amount"); return }

    setLoading(true); setError("")

    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          invoice_id: selectedInvoiceId,
          date: receiptDate,
          amount: amt,
          notes,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to create receipt")
        setLoading(false)
        return
      }
      setFlash("✅ Receipt saved!")
      setCustomerId(null)
      setSelectedCustomer(null)
      setCustomerSearch("")
      setSelectedInvoiceId(null)
      setAmount("")
      setNotes("")
      setLoading(false)
      setTimeout(() => setFlash(null), 4000)
    } catch (e) {
      setError("Network error")
      setLoading(false)
    }
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 12px; }
        .label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: block; }
        .input { width: 100%; height: 38px; border: 1.5px solid #E5EAF2; border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .error-box { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
        .flash-box { background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/receipts")} style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <ArrowLeft size={16} />
        </button>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📥 New Receipt</h2>
      </div>

      {error && <div className="error-box">{error}</div>}
      {flash && <div className="flash-box"><CheckCircle size={16} /> {flash}</div>}

      <div className="card">
        <label className="label">Customer *</label>
        <div ref={customerRef} style={{ position: "relative" }}>
          {selectedCustomer ? (
            <div style={{ padding: 8, border: "1px solid #E5EAF2", borderRadius: 8, cursor: "pointer", display: "flex", justifyContent: "space-between" }} onClick={clearCustomer}>
              <span>{selectedCustomer.code} — {selectedCustomer.name}</span>
              <X size={14} />
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Search customer..."
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                onFocus={() => setShowCustomerList(true)}
                autoComplete="off"
              />
              {showCustomerList && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #E2E8F0", borderRadius: 6, maxHeight: 200, overflowY: "auto", zIndex: 10 }}>
                  {filteredCustomers.length === 0 ? (
                    <div style={{ padding: 8 }}>No customers found</div>
                  ) : (
                    filteredCustomers.map(c => (
                      <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid #F1F5F9" }}>
                        {c.code} — {c.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {customerId && (
        <div className="card">
          <label className="label">Invoice (optional)</label>
          <select className="input" value={selectedInvoiceId ?? ""} onChange={e => setSelectedInvoiceId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">-- No specific invoice --</option>
            {invoices.map(inv => (
              <option key={inv.id} value={inv.id}>{inv.invoice_no} — PKR {inv.total.toLocaleString()} (Paid: PKR {inv.paid?.toLocaleString() || 0})</option>
            ))}
          </select>
        </div>
      )}

      <div className="card">
        <label className="label">Amount *</label>
        <input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value ? Number(e.target.value) : "")} placeholder="0" />
      </div>

      <div className="card">
        <label className="label">Date</label>
        <input className="input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
      </div>

      <div className="card">
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ justifyContent: "center", width: "100%", padding: 10 }}>
        {loading ? "Saving..." : "💾 Save Receipt"}
      </button>
    </div>
  )
}