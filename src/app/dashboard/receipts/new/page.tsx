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
      // 1. Create receipt record (uses party_id and bank_id)
      const { data: rec, error: recErr } = await supabase.from("receipts").insert({
        company_id: companyId,
        date: receiptDate,
        amount: amt,
        party_id: customerId,          // ✅ correct column
        bank_id: selectedBankId,       // ✅ correct column
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
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 1200px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .inv-card {
          background: white; border-radius: 12px;
          border: 1px solid #E5EAF2; padding: 16px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .inv-label {
          font-size: 10px; font-weight: 600; color: #6B7280;
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;
        }
        .inv-input {
          width: 100%; height: 38px; border: 1.5px solid #E5EAF2;
          border-radius: 8px; padding: 0 12px; font-size: 13px;
          font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box;
        }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; border: none;
          font-family: inherit; transition: all 0.15s; white-space: nowrap;
        }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E5EAF2; color: #475569; }
        .inv-grid {
          display: grid; grid-template-columns: 1fr 300px;
          gap: 16px; align-items: start;
        }
        @media (max-width: 900px) { .inv-grid { grid-template-columns: 1fr; } }
        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-search-icon { position: absolute; left: 10px; color: #94A3B8; pointer-events: none; }
        .cust-clear { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #94A3B8; display: flex; align-items: center; padding: 4px; border-radius: 4px; }
        .cust-clear:hover { color: #EF4444; background: #FEF2F2; }
        .cust-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: white; border: 1.5px solid #C7D2FE; border-radius: 10px;
          max-height: 220px; overflow-y: auto; z-index: 100;
          box-shadow: 0 8px 24px rgba(30,58,138,0.12);
        }
        .cust-option {
          padding: 8px 12px; cursor: pointer;
          border-bottom: 1px solid #F1F5F9;
          display: flex; justify-content: space-between; align-items: center;
          transition: background 0.1s;
        }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: #EEF2FF; }
        .cust-option-name { font-size: 13px; font-weight: 600; color: #1E293B; }
        .cust-option-meta { font-size: 11px; color: #94A3B8; margin-top: 2px; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: #1E3A8A; white-space: nowrap; }
        .cust-selected-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: #EEF2FF; border: 1.5px solid #C7D2FE;
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
          font-weight: 600; color: #1E3A8A; width: 100%;
        }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 8px 6px; border-bottom: 1px solid #F1F5F9; }
        .alloc-input { width: 80px; height: 28px; border: 1px solid #E2E8F0; border-radius: 4px; padding: 2px 6px; text-align: right; }
        .error-box { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
        .flash-box { background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/receipts")}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">📥 Receive Payment</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>Record a customer receipt and allocate to invoices</div>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}
        {flash && <div className="flash-box"><CheckCircle size={16} /> {flash}</div>}

        <div className="inv-grid">
          {/* LEFT COLUMN — Customer, Bank, Date, Notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <label className="inv-label">Customer *</label>
              <div className="cust-wrap" ref={customerRef}>
                {selectedCustomer ? (
                  <div className="cust-selected-badge" onClick={clearCustomer}>
                    <span>👤</span>
                    <span style={{ flex: 1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                    <span style={{ fontSize: 11, color: "#64748B" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                    <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearCustomer(); }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} className="cust-search-icon" style={{ position: "absolute", left: 10 }} />
                      <input
                        className="inv-input"
                        style={{ paddingLeft: 32, paddingRight: 32 }}
                        placeholder="Search by name, code or phone..."
                        value={customerSearch}
                        onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                        onFocus={() => setShowCustomerList(true)}
                        autoComplete="off"
                      />
                      {customerSearch && (
                        <button className="cust-clear" onClick={() => setCustomerSearch("")}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {showCustomerList && (
                      <div className="cust-dropdown">
                        {filteredCustomers.length === 0 ? (
                          <div style={{ padding: "10px 14px", color: "#94A3B8", fontSize: 13 }}>No customers found</div>
                        ) : (
                          filteredCustomers.map(c => (
                            <div key={c.id} className="cust-option" onMouseDown={() => selectCustomer(c)}>
                              <div>
                                <div className="cust-option-name">{c.name}</div>
                                <div className="cust-option-meta">{c.code}{c.phone ? ` · ${c.phone}` : ""}</div>
                              </div>
                              <div className="cust-option-bal">PKR {(c.balance || 0).toLocaleString()}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Bank (with GL code) */}
              <div style={{ marginTop: 10 }}>
                <label className="inv-label">Bank Account *</label>
                <select className="inv-input" value={selectedBankId ?? ""} onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Bank —</option>
                  {banks.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>
                  ))}
                </select>
              </div>

              <div className="inv-row" style={{ marginTop: 10 }}>
                <div>
                  <label className="inv-label">Receipt Date</label>
                  <input className="inv-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
                </div>
                <div>
                  <label className="inv-label">Notes</label>
                  <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — Invoice Allocation */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
            {customerId && invoices.length > 0 && (
              <div className="inv-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Allocate Amount to Invoices</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Due</th>
                      <th style={{ textAlign: "right" }}>Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => {
                      const due = inv.total - (inv.paid || 0)
                      return (
                        <tr key={inv.id}>
                          <td>{inv.invoice_no}</td>
                          <td>{inv.total.toLocaleString()}</td>
                          <td>{(inv.paid || 0).toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{due.toLocaleString()}</td>
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
                      <td colSpan={4} style={{ textAlign: "right" }}>Total Allocated</td>
                      <td style={{ textAlign: "right" }}>PKR {totalAllocated.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {customerId && invoices.length === 0 && (
              <div className="inv-card" style={{ textAlign: "center", color: "#94A3B8" }}>
                No unpaid invoices for this customer.
              </div>
            )}
            <button
              className="inv-btn inv-btn-primary"
              onClick={handleSubmit}
              disabled={loading}
              style={{ justifyContent: "center", padding: 10, width: "100%" }}
            >
              {loading ? "Posting..." : "💾 Save Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}