"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Search, X, CheckCircle, RefreshCw } from "lucide-react"

export default function NewPaymentPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const supplierRef = useRef<HTMLDivElement>(null)
  const [refreshingSuppliers, setRefreshingSuppliers] = useState(false)

  const [banks, setBanks] = useState<any[]>([])
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)

  // Purchase bills
  const [bills, setBills] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Record<number, number>>({})

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentAmount, setPaymentAmount] = useState<number | "">("")
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

  const loadSuppliers = () => {
    if (!companyId) return
    setRefreshingSuppliers(true)
    // ✅ Removed "country_code" – column does not exist in the suppliers table
    supabase.from("suppliers").select("id, code, name, phone, balance")
      .eq("company_id", companyId).order("name")
      .then(r => { if (r.data) setSuppliers(r.data); setRefreshingSuppliers(false) })
  }

  useEffect(() => {
    if (!companyId) return
    supabase.from("bank_accounts").select("id, bank_name, accounts(code)")
      .eq("company_id", companyId).order("bank_name")
      .then(r => r.data && setBanks(r.data.map((b: any) => ({ id: b.id, name: b.bank_name, glCode: b.accounts?.code }))))
    loadSuppliers()
  }, [companyId])

  useEffect(() => {
    if (!companyId || !supplierId) return
    supabase.from("invoices")
      .select("id, invoice_no, date, due_date, total, paid")
      .eq("company_id", companyId).eq("party_id", supplierId).eq("status", "Unpaid")
      .eq("type", "purchase")
      .order("date")
      .then(r => {
        const invs = r.data || []
        setBills(invs)
        const initAlloc: Record<number, number> = {}
        invs.forEach(inv => { initAlloc[inv.id] = 0 })
        setAllocations(initAlloc)
      })
  }, [companyId, supplierId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

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
    setBills([])
    setAllocations({})
  }

  const toggleBill = (invId: number, due: number) => {
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
  const totalAmount = Number(paymentAmount || 0)
  const unallocated = totalAmount - totalAllocated

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!selectedBankId) { setError("Please select a bank account"); return }
    if (totalAmount <= 0) { setError("Enter a valid payment amount"); return }
    if (!supplierId) { setError("Please select a supplier"); return }

    setLoading(true); setError("")

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party_id: supplierId,
          amount: totalAmount,
          payment_method: "Bank Transfer",
          bank_account_id: selectedBankId,
          date: paymentDate,
          reference,
          notes,
          allocations: Object.entries(allocations).map(([billId, allocAmt]) => ({
            bill_id: parseInt(billId), amount: allocAmt
          })),
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed")
        setLoading(false)
        return
      }

      setFlash(`✅ Payment ${result.payment_no} saved!`)
      setSupplierId(null); setSelectedSupplier(null); setSupplierSearch("")
      setSelectedBankId(null)
      setBills([]); setAllocations({}); setPaymentAmount(""); setNotes(""); setReference("")
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
        .pay-shell { max-width: 1100px; margin: 0 auto; }
        .pay-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .pay-card {
          background: white; border-radius: 12px; border: 1px solid #E5EAF2;
          padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 12px;
        }
        .pay-label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .pay-input, .pay-select { width: 100%; height: 38px; border: 1.5px solid #E5EAF2; border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .pay-input:focus, .pay-select:focus { border-color: #1740C8; background: white; }
        .pay-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pay-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .pay-btn-primary { background: #1e3a8a; color: white; }
        .pay-btn-outline { background: white; border: 1.5px solid #E5EAF2; color: #475569; }
        .sup-wrap { position: relative; }
        .sup-input-row { position: relative; display: flex; align-items: center; }
        .sup-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white; border: 1.5px solid #C7D2FE; border-radius: 10px; max-height: 220px; overflow-y: auto; z-index: 100; box-shadow: 0 8px 24px rgba(30,58,138,0.12); }
        .sup-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; }
        .sup-option:last-child { border-bottom: none; }
        .sup-option:hover { background: #EEF2FF; }
        .sup-option-name { font-size: 13px; font-weight: 600; color: #1E293B; }
        .sup-option-meta { font-size: 11px; color: #94A3B8; }
        .sup-option-bal { font-size: 12px; font-weight: 600; color: #1E3A8A; white-space: nowrap; }
        .sup-selected-badge { display: inline-flex; align-items: center; gap: 6px; background: #EEF2FF; border: 1.5px solid #C7D2FE; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #1E3A8A; width: 100%; cursor: pointer; }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }
        .chk-box { width: 18px; height: 18px; cursor: pointer; accent-color: #1D4ED8; }
        .alloc-input { width: 80px; height: 28px; border: 1px solid #E2E8F0; border-radius: 4px; padding: 2px 6px; text-align: right; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 8px 6px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
      `}</style>

      <div className="pay-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="pay-btn pay-btn-outline" onClick={() => router.push("/dashboard/payments")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="pay-title">💳 New Payment</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>Pay a supplier and allocate to outstanding bills</div>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="header-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="pay-card">
              <div>
                <label className="pay-label">Supplier *</label>
                <div className="sup-wrap" ref={supplierRef}>
                  {selectedSupplier ? (
                    <div className="sup-selected-badge" onClick={clearSupplier} style={{ position: "relative", paddingRight: 40 }}>
                      <span>🚚</span><span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                      <span style={{ fontSize: 11, color: "#64748B" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                      <button className="sup-clear" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }} onClick={(e) => { e.stopPropagation(); clearSupplier(); }}><X size={14} /></button>
                      <button className="sup-clear" style={{ position: "absolute", right: 22, top: "50%", transform: "translateY(-50%)", color: "#1e3a8a" }} onClick={(e) => { e.stopPropagation(); loadSuppliers(); }} title="Refresh"><RefreshCw size={13} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="sup-input-row">
                        <Search size={14} style={{ position: "absolute", left: 10, color: "#94A3B8" }} />
                        <input className="pay-input" style={{ paddingLeft: 32, paddingRight: 32 }} placeholder="Search by name, code or phone..." value={supplierSearch}
                          onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true) }}
                          onFocus={() => setShowSupplierList(true)} autoComplete="off"
                        />
                        {supplierSearch && <button className="sup-clear" onClick={() => setSupplierSearch("")}><X size={13} /></button>}
                      </div>
                      {showSupplierList && (
                        <div className="sup-dropdown">
                          {filteredSuppliers.length === 0 ? (
                            <div style={{ padding: "10px 14px", color: "#94A3B8", fontSize: 13 }}>No suppliers found</div>
                          ) : (
                            filteredSuppliers.map(s => (
                              <div key={s.id} className="sup-option" onMouseDown={() => selectSupplier(s)}>
                                <div><div className="sup-option-name">{s.name}</div><div className="sup-option-meta">{s.code}{s.phone ? ` · ${s.phone}` : ""}</div></div>
                                <div className="sup-option-bal">PKR {(s.balance || 0).toLocaleString()}</div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label className="pay-label">Bank Account *</label>
                <select className="pay-select" value={selectedBankId ?? ""} onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Bank —</option>
                  {banks.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
                </select>
              </div>

              <div className="pay-row" style={{ marginTop: 10 }}>
                <div><label className="pay-label">Amount *</label><input className="pay-input" type="number" min="0" step="100" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value ? Number(e.target.value) : "")} placeholder="0" /></div>
                <div><label className="pay-label">Date</label><input className="pay-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></div>
              </div>
              <div className="pay-row" style={{ marginTop: 10 }}>
                <div><label className="pay-label">Reference</label><input className="pay-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" /></div>
                <div><label className="pay-label">Notes</label><input className="pay-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></div>
              </div>
            </div>

            {supplierId && bills.length > 0 && (
              <div className="pay-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px 0" }}>Allocate to Purchase Bills</h3>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
                      <th>Bill #</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Due</th>
                      <th style={{ textAlign: "right" }}>Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map(bill => {
                      const due = bill.total - (bill.paid || 0)
                      const alloc = allocations[bill.id] || 0
                      const checked = alloc > 0
                      return (
                        <tr key={bill.id}>
                          <td><input className="chk-box" type="checkbox" checked={checked} onChange={() => toggleBill(bill.id, due)} /></td>
                          <td>{bill.invoice_no}</td>
                          <td>{bill.total.toLocaleString()}</td>
                          <td>{(bill.paid || 0).toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{due.toLocaleString()}</td>
                          <td style={{ textAlign: "right" }}>
                            <input className="alloc-input" type="number" min="0" max={due} value={alloc} onChange={e => updateAllocation(bill.id, parseFloat(e.target.value) || 0, due)} />
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
                      <td colSpan={5} style={{ textAlign: "right" }}>Allocated</td>
                      <td style={{ textAlign: "right" }}>PKR {totalAllocated.toLocaleString()}</td>
                    </tr>
                    {unallocated > 0 && (
                      <tr style={{ fontSize: 12, color: "#64748B" }}>
                        <td colSpan={6} style={{ textAlign: "right", paddingTop: 4 }}>
                          Unallocated: PKR {unallocated.toLocaleString()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {supplierId && bills.length === 0 && (
              <div className="pay-card" style={{ textAlign: "center", color: "#94A3B8" }}>
                No unpaid purchase bills for this supplier. The full amount will be recorded as unallocated.
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
            <div className="pay-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Amount</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                <span>Allocated</span><span>PKR {totalAllocated.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: unallocated > 0 ? "#dc2626" : "#64748B" }}>
                <span>Unallocated</span><span>PKR {unallocated.toLocaleString()}</span>
              </div>
            </div>
            <div className="pay-card">
              <button className="pay-btn pay-btn-primary" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Posting..." : "💾 Save Payment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}