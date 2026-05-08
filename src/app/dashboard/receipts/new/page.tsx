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

  const [banks, setBanks] = useState<any[]>([])
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)

  const [invoices, setInvoices] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Record<number, number>>({})

  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // ── 1. Get company ID ─────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── 2. Load banks with linked GL account code ─────
  useEffect(() => {
    if (!companyId) return
    supabase.from("bank_accounts")
      .select("id, bank_name, accounts(code)")
      .eq("company_id", companyId)
      .order("bank_name")
      .then(r => {
        if (r.data) {
          setBanks(r.data.map((b: any) => ({
            id: b.id,
            name: b.bank_name,
            glCode: b.accounts?.code,
          })))
        }
      })
  }, [companyId])

  // ── 3. Load customers ─────────────────────────────
  useEffect(() => {
    if (!companyId) return
    supabase.from("customers")
      .select("id, code, name, phone, balance")
      .eq("company_id", companyId)
      .order("name")
      .then(r => r.data && setCustomers(r.data))
  }, [companyId])

  // ── 4. Load unpaid invoices for selected customer ──
  useEffect(() => {
    if (!companyId || !customerId) return
    supabase.from("invoices")
      .select("id, invoice_no, date, due_date, total, paid")
      .eq("company_id", companyId)
      .eq("party_id", customerId)
      .eq("status", "Unpaid")
      .order("date")
      .then(r => {
        const invs = r.data || []
        setInvoices(invs)
        const initAlloc: Record<number, number> = {}
        invs.forEach(inv => { initAlloc[inv.id] = 0 })
        setAllocations(initAlloc)
      })
  }, [companyId, customerId])

  // ── Close customer dropdown on outside click ──────
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
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setSelectedCustomer(null)
    setCustomerSearch("")
    setShowCustomerList(true)
    setInvoices([])
    setAllocations({})
  }

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0)

  const handleSubmit = async () => {
    const amt = totalAllocated
    if (!companyId) { setError("Company not loaded yet."); return }
    if (!customerId) { setError("Please select a customer"); return }
    if (!selectedBankId) { setError("Please select a bank account"); return }
    if (amt <= 0) { setError("Allocate at least PKR 1 to invoices"); return }

    setLoading(true); setError("")

    try {
      // 1. Create receipt record
      const { data: rec, error: recErr } = await supabase.from("receipts").insert({
        company_id: companyId,
        date: receiptDate,
        amount: amt,
        customer_id: customerId,
        bank_id: selectedBankId,
        notes,
      }).select("id").single()

      if (recErr || !rec) throw new Error(recErr?.message || "Receipt creation failed")

      // 2. Insert payment allocations & update invoice.paid
      for (const [invId, allocAmt] of Object.entries(allocations)) {
        if (allocAmt <= 0) continue
        const inv = invoices.find(i => i.id === parseInt(invId))
        if (!inv) continue

        await supabase.from("payment_allocations").insert({
          company_id: companyId,
          receipt_id: rec.id,
          invoice_id: parseInt(invId),
          amount: allocAmt,
        })

        const newPaid = (inv.paid || 0) + allocAmt
        const newStatus = newPaid >= inv.total ? "Paid" : "Partial"
        await supabase.from("invoices").update({
          paid: newPaid,
          status: newStatus,
        }).eq("id", inv.id).eq("company_id", companyId)
      }

      // 3. Update customer balance (reduce by receipt amount)
      if (selectedCustomer) {
        const newCustBal = (selectedCustomer.balance || 0) - amt
        await supabase.from("customers").update({ balance: newCustBal }).eq("id", customerId).eq("company_id", companyId)
      }

      // 4. Post journal entry (DR Bank, CR Accounts Receivable)
      const arAcc = await supabase.from("accounts").select("id").eq("code", "1100").eq("company_id", companyId).single()
      const bankAcc = await supabase.from("accounts").select("id").eq("id", selectedBankId).eq("company_id", companyId).single()
      if (arAcc.data && bankAcc.data) {
        const { data: entry } = await supabase.from("journal_entries").insert({
          company_id: companyId,
          entry_no: `JE-REC-${String(rec.id).padStart(4, "0")}`,
          date: receiptDate,
          description: `Customer Receipt - ${selectedCustomer?.name}`,
        }).select("id").single()

        if (entry) {
          await supabase.from("journal_lines").insert([
            { company_id: companyId, entry_id: entry.id, account_id: bankAcc.data.id, debit: amt, credit: 0 },
            { company_id: companyId, entry_id: entry.id, account_id: arAcc.data.id, debit: 0, credit: amt },
          ])
        }
      }

      setFlash("✅ Receipt saved & invoices updated!")
      setCustomerId(null)
      setSelectedCustomer(null)
      setCustomerSearch("")
      setSelectedBankId(null)
      setInvoices([])
      setAllocations({})
      setNotes("")
      setLoading(false)
      setTimeout(() => setFlash(null), 4000)
    } catch (e: any) {
      setError(e.message || "Posting failed")
      setLoading(false)
    }
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 12px; }
        .label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: block; }
        .input { width: 100%; height: 38px; border: 1.5px solid #E5EAF2; border-radius: 8px; padding: 0 12px; font-size: 13px; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .error-box { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
        .flash-box { background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 8px 6px; border-bottom: 1px solid #F1F5F9; }
        .alloc-input { width: 80px; height: 28px; border: 1px solid #E2E8F0; border-radius: 4px; padding: 2px 6px; text-align: right; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/receipts")}>
          <ArrowLeft size={16} />
        </button>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📥 Receive Payment</h2>
      </div>

      {error && <div className="error-box">{error}</div>}
      {flash && <div className="flash-box"><CheckCircle size={16} /> {flash}</div>}

      {/* Customer selection */}
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

      {/* Bank selection with GL code */}
      <div className="card">
        <label className="label">Bank Account *</label>
        <select className="input" value={selectedBankId ?? ""} onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— Select Bank —</option>
          {banks.map((b: any) => (
            <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div className="card">
        <label className="label">Receipt Date</label>
        <input className="input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
      </div>

      {/* Notes */}
      <div className="card">
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {/* Invoices allocation table */}
      {customerId && invoices.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Allocate Amount to Invoices</h3>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Due</th>
                <th style={{ textAlign: "right" }}>Allocate</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const due = inv.total - (inv.paid || 0)
                return (
                  <tr key={inv.id}>
                    <td>{inv.invoice_no}</td>
                    <td>{inv.date}</td>
                    <td style={{ textAlign: "right" }}>{inv.total.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{(inv.paid || 0).toLocaleString()}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{due.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        className="alloc-input"
                        type="number"
                        min="0"
                        max={due}
                        value={allocations[inv.id] || 0}
                        onChange={e => {
                          const val = Math.min(parseFloat(e.target.value) || 0, due)
                          setAllocations({ ...allocations, [inv.id]: val })
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
                <td colSpan={5} style={{ textAlign: "right" }}>Total Allocated</td>
                <td style={{ textAlign: "right" }}>PKR {totalAllocated.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={loading}
        style={{ width: "100%", justifyContent: "center", padding: 10, marginTop: 12 }}
      >
        {loading ? "Posting..." : "💾 Save Payment"}
      </button>
    </div>
  )
}