"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Search, X, CheckCircle } from "lucide-react"

export default function NewReceiptPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")   // ✅ NEW

  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)

  const [invoices, setInvoices] = useState<any[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)

  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [amount, setAmount] = useState(0)
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // ── 1. Get real company ID ──────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── 2. Load customers only after companyId is known ──
  useEffect(() => {
    if (!companyId) return
    supabase.from("customers")
      .select("id,code,name,phone,balance")
      .eq("company_id", companyId)
      .order("name")
      .then(r => r.data && setCustomers(r.data))
  }, [companyId])

  // ── Load unpaid invoices for the selected customer ──
  useEffect(() => {
    if (!companyId || !customerId) return
    supabase.from("invoices")
      .select("id,invoice_no,date,total,paid")
      .eq("company_id", companyId)             // ✅
      .eq("party_id", customerId)
      .eq("status", "Unpaid")
      .order("date")
      .then(r => setInvoices(r.data || []))
  }, [companyId, customerId])

  // Close dropdown on outside click
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
    setSelectedInvoiceId(null)   // reset invoice selection
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setSelectedCustomer(null)
    setCustomerSearch("")
    setShowCustomerList(true)
    setSelectedInvoiceId(null)
  }

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded yet."); return }
    if (!customerId) { setError("Please select a customer"); return }
    if (amount <= 0) { setError("Enter a receipt amount"); return }

    setLoading(true); setError("")

    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          invoice_id: selectedInvoiceId,
          date: receiptDate,
          amount,
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
      setAmount(0)
      setNotes("")
      setLoading(false)
      setTimeout(() => setFlash(null), 4000)
    } catch (e) {
      setError("Network error")
      setLoading(false)
    }
  }

  if (!companyId) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading company data…</div>
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <h2>📥 New Receipt</h2>
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}
      {flash && <div style={{ color: "green", marginBottom: 12 }}>{flash}</div>}

      <div style={{ marginBottom: 12 }}>
        <label>Customer *</label>
        <div ref={customerRef} style={{ position: "relative" }}>
          {selectedCustomer ? (
            <div onClick={clearCustomer} style={{ cursor: "pointer", padding: 6, border: "1px solid #ccc", borderRadius: 4 }}>
              {selectedCustomer.code} - {selectedCustomer.name}
            </div>
          ) : (
            <>
              <input
                placeholder="Search customer..."
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                onFocus={() => setShowCustomerList(true)}
                style={{ width: "100%", padding: 6 }}
              />
              {showCustomerList && (
                <div style={{ position: "absolute", background: "white", border: "1px solid #ccc", maxHeight: 200, overflowY: "auto", zIndex: 10, width: "100%" }}>
                  {filteredCustomers.length === 0 ? (
                    <div style={{ padding: 8 }}>No customers found</div>
                  ) : (
                    filteredCustomers.map(c => (
                      <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: 6, cursor: "pointer", borderBottom: "1px solid #eee" }}>
                        {c.code} - {c.name}
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
        <div style={{ marginBottom: 12 }}>
          <label>Apply to Invoice (optional)</label>
          <select value={selectedInvoiceId ?? ""} onChange={e => setSelectedInvoiceId(e.target.value ? Number(e.target.value) : null)} style={{ width: "100%", padding: 6 }}>
            <option value="">-- No specific invoice --</option>
            {invoices.map(inv => (
              <option key={inv.id} value={inv.id}>{inv.invoice_no} — PKR {inv.total.toLocaleString()} (Paid: PKR {inv.paid?.toLocaleString() || 0})</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label>Amount *</label>
        <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ width: "100%", padding: 6 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>Date</label>
        <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} style={{ width: "100%", padding: 6 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>Notes</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={{ width: "100%", padding: 6 }} />
      </div>
      <button onClick={handleSubmit} disabled={loading} style={{ padding: "8px 16px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 6 }}>
        {loading ? "Saving..." : "Save Receipt"}
      </button>
    </div>
  )
}