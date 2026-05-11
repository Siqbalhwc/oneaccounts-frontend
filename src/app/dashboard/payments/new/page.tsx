"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, CheckSquare, Square, CheckCircle, Search, X } from "lucide-react"

export default function NewPaymentPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const supplierRef = useRef<HTMLDivElement>(null)

  const [banks, setBanks] = useState<any[]>([])
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)

  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  const [unpaidBills, setUnpaidBills] = useState<any[]>([])
  const [selectedBills, setSelectedBills] = useState<Record<number, { amount: number; apply: boolean }>>({})
  const [totalAllocated, setTotalAllocated] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // ── 1. Company, banks, suppliers ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Suppliers
      supabase.from("suppliers").select("id, code, name, balance").eq("company_id", cid).order("name").then(r => r.data && setSuppliers(r.data))

      // Bank accounts (same as receipts)
      supabase.from("bank_accounts")
        .select("id, bank_name, accounts(code)")
        .eq("company_id", cid)
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
    })
  }, [])

  // ── 2. Load unpaid bills for selected supplier ──
  useEffect(() => {
    if (!supplierId || !companyId) return
    supabase.from("invoices")
      .select("id, invoice_no, total, paid, status, date")
      .eq("company_id", companyId)
      .eq("type", "purchase")
      .eq("party_id", supplierId)
      .neq("status", "Paid")
      .order("date", { ascending: true })
      .then(({ data }) => {
        setUnpaidBills(data || [])
        setSelectedBills({})
        setTotalAllocated(0)
      })
  }, [supplierId, companyId, refreshKey])

  // ── Supplier search / select ──
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.code.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone || "").includes(supplierSearch)
  )

  const selectSupplier = (s: any) => {
    setSupplierId(s.id)
    setSelectedSupplier(s)
    setSupplierSearch(s.name)
    setShowSupplierList(false)
  }

  const clearSupplier = () => {
    setSupplierId(null)
    setSelectedSupplier(null)
    setSupplierSearch("")
    setShowSupplierList(true)
    setUnpaidBills([])
    setSelectedBills({})
  }

  // Close supplier dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── Bill allocation helpers ──
  const toggleBill = (bill: any) => {
    setSelectedBills(prev => {
      const next = { ...prev }
      if (next[bill.id]) { delete next[bill.id] }
      else { next[bill.id] = { amount: bill.total - (bill.paid || 0), apply: true } }
      return next
    })
  }

  const updateAllocAmount = (billId: number, val: number) => {
    setSelectedBills(prev => ({ ...prev, [billId]: { ...prev[billId], amount: val } }))
  }

  useEffect(() => {
    const total = Object.values(selectedBills).reduce((sum, a) => sum + (a.apply ? a.amount : 0), 0)
    setTotalAllocated(total)
  }, [selectedBills])

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!supplierId) { setError("Please select a supplier"); return }
    if (!selectedBankId) { setError("Please select a bank account"); return }
    if (Object.keys(selectedBills).length === 0) { setError("Select at least one bill to apply payment to."); return }
    const total = Object.values(selectedBills).reduce((s, a) => s + a.amount, 0)
    if (total <= 0) { setError("Total amount must be > 0"); return }
    setLoading(true)

    const allocs = Object.entries(selectedBills).map(([billId, data]) => ({ bill_id: parseInt(billId), amount: data.amount }))

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ party_id: supplierId, amount: total, payment_method: paymentMethod, bank_id: selectedBankId, date, reference, notes, allocations: allocs }),
    })
    const data = await res.json()
    if (!data.success) { setError(data.error || "Failed to create payment"); setLoading(false); return }

    setFlash(`Payment ${data.payment_no} saved successfully!`)
    setSupplierId(null)
    setSelectedSupplier(null)
    setSupplierSearch("")
    setSelectedBankId(null)
    setAmount("")
    setReference("")
    setNotes("")
    setSelectedBills({})
    setTotalAllocated(0)
    setRefreshKey(k => k + 1)
    setLoading(false)
    setTimeout(() => setFlash(null), 4000)
  }

  return (
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 1200px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .inv-card { background: white; border-radius: 12px; border: 1px solid #E5EAF2; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .inv-label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select { width: 100%; height: 38px; border: 1.5px solid #E5EAF2; border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .inv-input:focus, .inv-select:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E5EAF2; color: #475569; }
        .alloc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .alloc-table th, .alloc-table td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: left; }
        .alloc-table th { background: #F8FAFC; font-weight: 600; color: #475569; }
        .inv-grid { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .inv-grid { grid-template-columns: 1fr; } }

        /* Supplier dropdown */
        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white; border: 1.5px solid #C7D2FE; border-radius: 10px; max-height: 220px; overflow-y: auto; z-index: 100; box-shadow: 0 8px 24px rgba(30,58,138,0.12); }
        .cust-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: #EEF2FF; }
        .cust-option-name { font-size: 13px; font-weight: 600; color: #1E293B; }
        .cust-option-meta { font-size: 11px; color: #94A3B8; margin-top: 2px; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: #1E3A8A; white-space: nowrap; }
        .cust-selected-badge { display: inline-flex; align-items: center; gap: 6px; background: #EEF2FF; border: 1.5px solid #C7D2FE; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #1E3A8A; width: 100%; cursor: pointer; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/payments")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">💳 New Payment</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Allocate payment across outstanding bills</div>
          </div>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/payments")}>View List</button>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 12 }}>{error}</div>}
        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <form onSubmit={handleSubmit}>
          <div className="inv-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="inv-card">
                {/* Supplier search */}
                <label className="inv-label">Supplier *</label>
                <div className="cust-wrap" ref={supplierRef}>
                  {selectedSupplier ? (
                    <div className="cust-selected-badge" onClick={clearSupplier}>
                      <span>👤</span><span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                      <span style={{ fontSize: 11, color: "#64748B" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                      <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearSupplier(); }}><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="cust-input-row">
                        <Search size={14} style={{ position: "absolute", left: 10, color: "#94A3B8" }} />
                        <input className="inv-input" style={{ paddingLeft: 32, paddingRight: 32 }} placeholder="Search by name, code or phone..." value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true) }} onFocus={() => setShowSupplierList(true)} onClick={() => setShowSupplierList(true)} autoComplete="off" />
                        {supplierSearch && <button className="cust-clear" onClick={() => setSupplierSearch("")}><X size={13} /></button>}
                      </div>
                      {showSupplierList && (
                        <div className="cust-dropdown">
                          {filteredSuppliers.length === 0 ? (
                            <div style={{ padding: "10px 14px", color: "#94A3B8", fontSize: 13 }}>No suppliers found</div>
                          ) : (
                            filteredSuppliers.map(s => (
                              <div key={s.id} className="cust-option" onMouseDown={() => selectSupplier(s)}>
                                <div><div className="cust-option-name">{s.name}</div><div className="cust-option-meta">{s.code}{s.phone ? ` · ${s.phone}` : ""}</div></div>
                                <div className="cust-option-bal">PKR {(s.balance || 0).toLocaleString()}</div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Bank account selection (NEW) */}
                <div style={{ marginTop: 14 }}>
                  <label className="inv-label">Bank Account *</label>
                  <select className="inv-select" value={selectedBankId ?? ""} onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : null)} required>
                    <option value="">— Select Bank —</option>
                    {banks.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>
                    ))}
                  </select>
                </div>

                {/* Unpaid bills allocation */}
                {unpaidBills.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <label className="inv-label">Apply to Bills</label>
                    <table className="alloc-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Bill</th><th>Total</th><th>Paid</th><th>Balance</th><th>Amount to Apply</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaidBills.map(bill => {
                          const sel = selectedBills[bill.id]
                          const balance = bill.total - (bill.paid || 0)
                          return (
                            <tr key={bill.id}>
                              <td><button type="button" onClick={() => toggleBill(bill)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: sel ? '#1740C8' : '#94A3B8' }}>{sel ? <CheckSquare size={16} /> : <Square size={16} />}</button></td>
                              <td>{bill.invoice_no} <span style={{ color: "#94A3B8", fontSize: 10 }}>({bill.date?.slice(0,10)})</span></td>
                              <td>{bill.total.toLocaleString()}</td>
                              <td>{(bill.paid || 0).toLocaleString()}</td>
                              <td>{balance.toLocaleString()}</td>
                              <td>
                                <input className="inv-input" style={{ width: 100, textAlign: 'right' }} type="number" step="0.01" max={balance} value={sel?.amount || ""} onChange={e => updateAllocAmount(bill.id, Number(e.target.value))} disabled={!sel} />
                                {sel && sel.amount > 0 && (
                                  <div style={{ fontSize: 10, color: balance - sel.amount >= 0 ? '#10B981' : '#EF4444', marginTop: 2 }}>Remaining: PKR {(balance - sel.amount).toLocaleString()}</div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 8, fontWeight: 600, textAlign: 'right' }}>Total Allocated: PKR {totalAllocated.toLocaleString()}</div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN – Summary & actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
              <div className="inv-card">
                <div className="inv-row" style={{ marginBottom: 14 }}>
                  <div>
                    <label className="inv-label">Payment Method</label>
                    <select className="inv-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
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
                <div className="inv-row">
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
              <div className="inv-card">
                <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ justifyContent: "center", padding: 10, width: "100%" }}>
                  <Save size={16} /> {loading ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}