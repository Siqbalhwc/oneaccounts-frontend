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

  const [companyId, setCompanyId] = useState("")
  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)

  const [banks, setBanks] = useState<any[]>([])
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)

  // Donation mode: GL income account selector
  const [incomeAccounts, setIncomeAccounts] = useState<any[]>([])
  const [selectedIncomeAccountId, setSelectedIncomeAccountId] = useState<number | null>(null)
  const [isDonation, setIsDonation] = useState(false)

  const [invoices, setInvoices] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Record<number, number>>({})

  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [receiptAmount, setReceiptAmount] = useState<number | "">("")
  const [notes, setNotes] = useState("")
  const [reference, setReference] = useState("")
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
    supabase.from("bank_accounts").select("id, bank_name, accounts(code)")
      .eq("company_id", companyId).order("bank_name")
      .then(r => r.data && setBanks(r.data.map((b: any) => ({ id: b.id, name: b.bank_name, glCode: b.accounts?.code }))))
    supabase.from("customers").select("id, code, name, phone, balance")
      .eq("company_id", companyId).order("name")
      .then(r => r.data && setCustomers(r.data))
    // Income accounts for donation mode
    supabase.from("accounts").select("id, code, name")
      .in("type", ["Revenue","Income"]).eq("company_id", companyId).order("code")
      .then(r => r.data && setIncomeAccounts(r.data))
  }, [companyId])

  useEffect(() => {
    if (!companyId || !customerId || isDonation) return
    supabase.from("invoices")
      .select("id, invoice_no, date, due_date, total, paid")
      .eq("company_id", companyId).eq("party_id", customerId).eq("status", "Unpaid")
      .order("date")
      .then(r => {
        const invs = r.data || []
        setInvoices(invs)
        const initAlloc: Record<number, number> = {}
        invs.forEach(inv => { initAlloc[inv.id] = 0 })
        setAllocations(initAlloc)
      })
  }, [companyId, customerId, isDonation])

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

  const toggleInvoice = (invId: number, due: number) => {
    setAllocations(prev => {
      const current = prev[invId] || 0
      const newVal = current > 0 ? 0 : due
      return { ...prev, [invId]: newVal }
    })
  }

  const updateAllocation = (invId: number, value: number, due: number) => {
    const clamped = Math.min(Math.max(value, 0), due)
    setAllocations(prev => ({ ...prev, [invId]: clamped }))
  }

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0)

  const handleSubmit = async () => {
    const amt = Number(receiptAmount)
    if (!companyId) { setError("Company not loaded"); return }
    if (!selectedBankId) { setError("Please select a bank account"); return }
    if (amt <= 0) { setError("Enter a valid receipt amount"); return }
    if (!customerId && !isDonation) { setError("Please select a customer or enable donation mode"); return }

    setLoading(true); setError("")

    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party_id: customerId,
          amount: amt,
          payment_method: "Bank Transfer",
          bank_account_id: selectedBankId,
          income_account_id: isDonation ? selectedIncomeAccountId : null,
          date: receiptDate,
          reference,
          notes,
          allocations: Object.entries(allocations).map(([invId, allocAmt]) => ({
            invoice_id: parseInt(invId), amount: allocAmt
          })),
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed")
        setLoading(false)
        return
      }

      setFlash(`✅ Receipt ${result.receipt_no} saved!`)
      setCustomerId(null); setSelectedCustomer(null); setCustomerSearch("")
      setSelectedBankId(null); setSelectedIncomeAccountId(null); setIsDonation(false)
      setInvoices([]); setAllocations({}); setReceiptAmount(""); setNotes(""); setReference("")
      setLoading(false)
      setTimeout(() => setFlash(null), 4000)
    } catch {
      setError("Network error")
      setLoading(false)
    }
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company data…</div>

  return (
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 1100px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .inv-card {
          background: white; border-radius: 12px; border: 1px solid #E5EAF2;
          padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 12px;
        }
        .inv-label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select { width: 100%; height: 38px; border: 1.5px solid #E5EAF2; border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .inv-input:focus, .inv-select:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn-primary { background: #1e3a8a; color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E5EAF2; color: #475569; }
        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white; border: 1.5px solid #C7D2FE; border-radius: 10px; max-height: 220px; overflow-y: auto; z-index: 100; box-shadow: 0 8px 24px rgba(30,58,138,0.12); }
        .cust-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: #EEF2FF; }
        .cust-option-name { font-size: 13px; font-weight: 600; color: #1E293B; }
        .cust-option-meta { font-size: 11px; color: #94A3B8; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: #1E3A8A; white-space: nowrap; }
        .cust-selected-badge { display: inline-flex; align-items: center; gap: 6px; background: #EEF2FF; border: 1.5px solid #C7D2FE; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #1E3A8A; width: 100%; cursor: pointer; }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }
        .chk-box { width: 18px; height: 18px; cursor: pointer; accent-color: #1D4ED8; }
        .alloc-input { width: 80px; height: 28px; border: 1px solid #E2E8F0; border-radius: 4px; padding: 2px 6px; text-align: right; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 8px 6px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/receipts")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">📥 New Receipt</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>Record customer payment or donation</div>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="header-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              {/* Donation mode toggle */}
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={isDonation} onChange={e => { setIsDonation(e.target.checked); clearCustomer(); }} />
                  Donation / Other Income
                </label>
              </div>

              {/* Customer or Income GL */}
              {!isDonation ? (
                <>
                  <label className="inv-label">Customer *</label>
                  <div className="cust-wrap" ref={customerRef}>
                    {selectedCustomer ? (
                      <div className="cust-selected-badge" onClick={clearCustomer}>
                        <span>👤</span><span style={{ flex: 1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                        <span style={{ fontSize: 11, color: "#64748B" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                        <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearCustomer(); }}><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <div className="cust-input-row">
                          <Search size={14} style={{ position: "absolute", left: 10, color: "#94A3B8" }} />
                          <input className="inv-input" style={{ paddingLeft: 32, paddingRight: 32 }} placeholder="Search by name, code or phone..." value={customerSearch}
                            onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                            onFocus={() => setShowCustomerList(true)} autoComplete="off"
                          />
                          {customerSearch && <button className="cust-clear" onClick={() => setCustomerSearch("")}><X size={13} /></button>}
                        </div>
                        {showCustomerList && (
                          <div className="cust-dropdown">
                            {filteredCustomers.length === 0 ? (
                              <div style={{ padding: "10px 14px", color: "#94A3B8", fontSize: 13 }}>No customers found</div>
                            ) : (
                              filteredCustomers.map(c => (
                                <div key={c.id} className="cust-option" onMouseDown={() => selectCustomer(c)}>
                                  <div><div className="cust-option-name">{c.name}</div><div className="cust-option-meta">{c.code}{c.phone ? ` · ${c.phone}` : ""}</div></div>
                                  <div className="cust-option-bal">PKR {(c.balance || 0).toLocaleString()}</div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <label className="inv-label">Income Account *</label>
                  <select className="inv-select" value={selectedIncomeAccountId ?? ""} onChange={e => setSelectedIncomeAccountId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Select Income Account —</option>
                    {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                  </select>
                </div>
              )}

              {/* Bank & Amount */}
              <div style={{ marginTop: 10 }}>
                <label className="inv-label">Bank Account *</label>
                <select className="inv-select" value={selectedBankId ?? ""} onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Bank —</option>
                  {banks.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
                </select>
              </div>

              <div className="inv-row" style={{ marginTop: 10 }}>
                <div><label className="inv-label">Amount *</label><input className="inv-input" type="number" min="0" step="100" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value ? Number(e.target.value) : "")} placeholder="0" /></div>
                <div><label className="inv-label">Date</label><input className="inv-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></div>
              </div>
              <div className="inv-row" style={{ marginTop: 10 }}>
                <div><label className="inv-label">Reference</label><input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" /></div>
                <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></div>
              </div>
            </div>

            {/* Allocations to invoices (only for customer receipts) */}
            {customerId && !isDonation && invoices.length > 0 && (
              <div className="inv-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px 0" }}>Allocate to Invoices</h3>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
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
                      const alloc = allocations[inv.id] || 0
                      const checked = alloc > 0
                      return (
                        <tr key={inv.id}>
                          <td><input className="chk-box" type="checkbox" checked={checked} onChange={() => toggleInvoice(inv.id, due)} /></td>
                          <td>{inv.invoice_no}</td>
                          <td>{inv.total.toLocaleString()}</td>
                          <td>{(inv.paid || 0).toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{due.toLocaleString()}</td>
                          <td style={{ textAlign: "right" }}>
                            <input className="alloc-input" type="number" min="0" max={due} value={alloc} onChange={e => updateAllocation(inv.id, parseFloat(e.target.value) || 0, due)} />
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
                      <td colSpan={5} style={{ textAlign: "right" }}>Allocated</td>
                      <td style={{ textAlign: "right" }}>PKR {totalAllocated.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Amount</span><span>PKR {Number(receiptAmount || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button className="inv-btn inv-btn-primary" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Posting..." : "💾 Save Receipt"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}