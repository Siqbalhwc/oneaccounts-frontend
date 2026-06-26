"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Search, X, CheckCircle, RefreshCw } from "lucide-react"

// ── WHT math helpers ──────────────────────────────────────────────
// A bill carries ONE flat WHT rate (set at invoice time). At payment time we
// either (a) auto-fill the NET amount that fully settles the bill, or
// (b) let the user type a NET amount and back-solve the gross allocation.
//
//   net  = gross - wht                = gross * (1 - rate/100)
//   gross = net / (1 - rate/100)
//   wht   = gross - net  (rounded the same way the backend rounds it)

function whtFromGross(gross: number, rate: number) {
  return Math.round(gross * (rate / 100))
}

function netFromGross(gross: number, rate: number) {
  return gross - whtFromGross(gross, rate)
}

function grossFromNet(net: number, rate: number) {
  if (rate <= 0) return net
  // First pass estimate, then nudge so netFromGross(gross) reconciles exactly
  // with what the backend will compute (avoids 1-rupee drift from rounding).
  let gross = Math.round(net / (1 - rate / 100))
  // Correct rounding drift: adjust gross by ±1 until net matches exactly,
  // bounded so we never loop more than a couple of rupees either side.
  for (let i = 0; i < 3; i++) {
    const impliedNet = netFromGross(gross, rate)
    if (impliedNet === net) break
    gross += impliedNet < net ? 1 : -1
  }
  return gross
}

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

  const [isDonation, setIsDonation] = useState(false)
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([])
  const [selectedExpenseAccountId, setSelectedExpenseAccountId] = useState<number | null>(null)

  const [bills, setBills] = useState<any[]>([])
  // allocations now store the NET amount the user wants to pay against each bill.
  // Gross + WHT are always derived from this via grossFromNet().
  const [netAllocations, setNetAllocations] = useState<Record<string, number>>({})

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentAmount, setPaymentAmount] = useState<number | "">("")
  const [notes, setNotes] = useState("")
  const [reference, setReference] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const [supplierOpeningBalance, setSupplierOpeningBalance] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const loadSuppliers = async () => {
    if (!companyId) return
    setRefreshingSuppliers(true)
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, code, name, phone, balance, opening_balance")
        .eq("company_id", companyId)
        .order("name")
      if (data) {
        setSuppliers(data)
        if (selectedSupplier) {
          const updated = data.find((s: any) => s.id === selectedSupplier.id)
          if (updated) {
            setSelectedSupplier(updated)
            setSupplierOpeningBalance(updated.opening_balance || 0)
          }
        }
      }
    } catch (err) {
      console.error("Refresh failed", err)
    } finally {
      setRefreshingSuppliers(false)
    }
  }

  useEffect(() => {
    if (!companyId) return
    supabase.from("bank_accounts").select("id, bank_name, accounts(code)")
      .eq("company_id", companyId).order("bank_name")
      .then(r => r.data && setBanks(r.data.map((b: any) => ({ id: b.id, name: b.bank_name, glCode: b.accounts?.code }))))
    loadSuppliers()
    supabase.from("accounts").select("id, code, name")
      .in("type", ["Expense", "Asset"]).eq("company_id", companyId).order("code")
      .then(r => r.data && setExpenseAccounts(r.data))
  }, [companyId])

  useEffect(() => {
    if (!companyId || !supplierId || isDonation) {
      setBills([])
      setNetAllocations(prev => {
        const copy = { ...prev }
        delete copy["opening"]
        return copy
      })
      return
    }
    // Fetch unpaid/partial bills + their WHT data (rate stored at invoice time)
    supabase.from("invoices")
      .select("id, invoice_no, date, due_date, total, paid, status")
      .eq("company_id", companyId).eq("party_id", supplierId)
      .eq("type", "purchase")
      .in("status", ["Unpaid", "Partial"])
      .order("date")
      .then(async (r) => {
        const invs = r.data || []
        const billIds = invs.map(b => b.id)
        const { data: whtData } = await supabase
          .from("bill_withholding")
          .select("bill_id, wht_tax_code_id, wht_rate, wht_amount")
          .in("bill_id", billIds)
          .eq("company_id", companyId)

        const whtMap: Record<number, any> = {}
        if (whtData) {
          whtData.forEach((w: any) => { whtMap[w.bill_id] = w })
        }

        const enriched = invs.map(inv => ({
          ...inv,
          wht_rate: whtMap[inv.id]?.wht_rate || 0,
          wht_tax_code_id: whtMap[inv.id]?.wht_tax_code_id || null,
        }))

        setBills(enriched)
        const initAlloc: Record<string, number> = { opening: 0 }
        enriched.forEach(inv => { initAlloc[String(inv.id)] = 0 })
        setNetAllocations(prev => ({ ...initAlloc, ...prev }))
      })
  }, [companyId, supplierId, isDonation])

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
    setSupplierOpeningBalance(s.opening_balance || 0)
  }

  const clearSupplier = () => {
    setSupplierId(null)
    setSelectedSupplier(null)
    setSupplierSearch("")
    setShowSupplierList(true)
    setBills([])
    setNetAllocations({})
    setSupplierOpeningBalance(0)
  }

  // Checkbox click = shortcut for "fully settle this bill now" → auto-fill NET amount.
  // Unchecking clears it back to 0.
  const toggleBill = (bill: any) => {
    const due = bill.total - (bill.paid || 0)
    const key = String(bill.id)
    setNetAllocations(prev => {
      const current = prev[key] || 0
      const fullNet = netFromGross(due, bill.wht_rate || 0)
      const newVal = current > 0 ? 0 : fullNet
      return { ...prev, [key]: newVal }
    })
  }

  // Manual edit of the NET field = partial (or custom) payment against this bill.
  // We clamp in GROSS terms (can't allocate more gross than is due), then re-derive
  // the net figure from the clamped gross so the displayed numbers always agree.
  const updateNetAllocation = (bill: any, typedNet: number) => {
    const due = bill.total - (bill.paid || 0)
    const rate = bill.wht_rate || 0
    const safeNet = Math.max(typedNet, 0)
    let gross = grossFromNet(safeNet, rate)
    gross = Math.min(gross, due)
    const clampedNet = netFromGross(gross, rate)
    setNetAllocations(prev => ({ ...prev, [String(bill.id)]: clampedNet }))
  }

  const toggleOpeningAllocation = () => {
    setNetAllocations(prev => {
      const current = prev["opening"] || 0
      const newVal = current > 0 ? 0 : supplierOpeningBalance
      return { ...prev, opening: newVal }
    })
  }

  // ── Derived totals (all reconciled from netAllocations) ──────────
  const billRows = bills.map(bill => {
    const due = bill.total - (bill.paid || 0)
    const rate = bill.wht_rate || 0
    const net = netAllocations[String(bill.id)] || 0
    const gross = net > 0 ? Math.min(grossFromNet(net, rate), due) : 0
    const wht = whtFromGross(gross, rate)
    const remainingGross = due - gross
    const remainingWht = whtFromGross(remainingGross, rate)
    const isFullySettled = gross >= due && due > 0
    return { ...bill, due, rate, net, gross, wht, remainingGross, remainingWht, isFullySettled }
  })

  const openingNet = netAllocations["opening"] || 0 // opening balance has no WHT

  const totalGrossAllocated = billRows.reduce((s, b) => s + b.gross, 0) + openingNet
  const totalWhtDeducted = billRows.reduce((s, b) => s + b.wht, 0)
  const totalNetAllocated = billRows.reduce((s, b) => s + b.net, 0) + openingNet

  const totalAmount = Number(paymentAmount || 0)
  const difference = totalAmount - totalNetAllocated

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!selectedBankId) { setError("Please select a bank account"); return }
    if (totalAmount <= 0) { setError("Enter a valid payment amount"); return }
    if (!supplierId && !isDonation) {
      setError("Please select a supplier or enable Donation / Other Expense.")
      return
    }
    if (isDonation && !selectedExpenseAccountId) {
      setError("Please select an expense account for the donation / other expense.")
      return
    }

    setLoading(true); setError("")

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party_id: supplierId,
          amount: totalAmount, // net amount paid from bank
          payment_method: "Bank Transfer",
          bank_account_id: selectedBankId,
          expense_account_id: isDonation ? selectedExpenseAccountId : null,
          date: paymentDate,
          reference,
          notes,
          // Send GROSS allocation per bill — the backend computes WHT itself
          // from bill_withholding, proportional to gross/total. Our gross here
          // is already back-solved so it reconciles with the net figure shown.
          allocations: billRows
            .filter(b => b.gross > 0)
            .map(b => ({
              bill_id: b.id,
              amount: b.gross,
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
      setSelectedBankId(null); setSelectedExpenseAccountId(null); setIsDonation(false)
      setBills([]); setNetAllocations({}); setPaymentAmount(""); setNotes(""); setReference("")
      setSupplierOpeningBalance(0)
      setLoading(false)
      setTimeout(() => loadSuppliers(), 500)
      setTimeout(() => setFlash(null), 4000)
    } catch {
      setError("Network error")
      setLoading(false)
    }
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data…</div>

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .pay-shell { width: 100%; }
        .pay-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .pay-card {
          background: var(--card); border-radius: 12px; border: 1px solid var(--border);
          padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px;
        }
        .pay-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .pay-input, .pay-select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text);
          outline: none; box-sizing: border-box;
        }
        .pay-input:focus, .pay-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        input[type="date"] { color-scheme: dark; }
        .pay-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pay-btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s; white-space: nowrap; text-decoration: none;
        }
        .pay-btn:hover { background: var(--card-hover); }
        .pay-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .pay-btn-primary:hover { background: var(--primary-hover); }
        .sup-wrap { position: relative; }
        .sup-input-row { position: relative; display: flex; align-items: center; }
        .sup-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--card); border: 1.5px solid var(--border); border-radius: 10px;
          max-height: 220px; overflow-y: auto; z-index: 100;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        .sup-option {
          padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
        }
        .sup-option:last-child { border-bottom: none; }
        .sup-option:hover { background: var(--card-hover); }
        .sup-option-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .sup-option-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .sup-option-bal { font-size: 12px; font-weight: 600; color: var(--primary); white-space: nowrap; }
        .sup-selected-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--card); border: 1.5px solid var(--border);
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
          font-weight: 600; color: var(--text); width: 100%; cursor: pointer;
        }
        .header-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .header-grid {
            grid-template-columns: 1fr;
          }
        }
        .chk-box { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }
        .alloc-input { width: 96px; height: 28px; border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; text-align: right; background: var(--bg); color: var(--text); }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--border); }
        td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .hint-text { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .badge-full { font-size: 10px; font-weight: 700; color: #10B981; background: rgba(16,185,129,0.12); padding: 2px 6px; border-radius: 4px; }
        .badge-partial { font-size: 10px; font-weight: 700; color: #F59E0B; background: rgba(245,158,11,0.12); padding: 2px 6px; border-radius: 4px; }
        .derived-cell { font-size: 11px; color: var(--text-muted); }
      `}</style>

      <div className="pay-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="pay-btn" onClick={() => router.push("/dashboard/payments")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="pay-title">💳 New Payment</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>Pay a supplier or record other expense</div>
          </div>
        </div>

        {error && <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="header-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="pay-card">
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--text)" }}>
                  <input type="checkbox" checked={isDonation} onChange={e => { setIsDonation(e.target.checked); clearSupplier(); }} />
                  Donation / Other Expense
                </label>
              </div>

              {!isDonation ? (
                <>
                  <label className="pay-label">Supplier *</label>
                  <div className="sup-wrap" ref={supplierRef}>
                    {selectedSupplier ? (
                      <div className="sup-selected-badge" onClick={clearSupplier}>
                        <span>🚚</span><span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                        <button style={{ marginLeft: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clearSupplier(); }}><X size={14} /></button>
                        <button
                          style={{ marginLeft: 2, background: "none", border: "none", color: "var(--primary)", cursor: "pointer", opacity: refreshingSuppliers ? 0.5 : 1 }}
                          onClick={(e) => { e.stopPropagation(); loadSuppliers(); }}
                          disabled={refreshingSuppliers}
                          title="Refresh supplier list"
                        >
                          <RefreshCw size={13} style={{ animation: refreshingSuppliers ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="sup-input-row">
                          <Search size={14} style={{ position: "absolute", left: 10, color: "var(--text-muted)" }} />
                          <input className="pay-input" style={{ paddingLeft: 32, paddingRight: 32 }} placeholder="Search by name, code or phone..." value={supplierSearch}
                            onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true) }}
                            onFocus={() => setShowSupplierList(true)} autoComplete="off"
                          />
                          {supplierSearch && <button onClick={() => setSupplierSearch("")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={13} /></button>}
                        </div>
                        {showSupplierList && (
                          <div className="sup-dropdown">
                            {filteredSuppliers.length === 0 ? (
                              <div style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 13 }}>No suppliers found</div>
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
                </>
              ) : (
                <div>
                  <label className="pay-label">Expense Account <span style={{ color: "#EF4444" }}>*</span></label>
                  <select className="pay-select" value={selectedExpenseAccountId ?? ""} onChange={e => setSelectedExpenseAccountId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Select Expense Account —</option>
                    {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <label className="pay-label">Bank Account *</label>
                <select className="pay-select" value={selectedBankId ?? ""} onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Bank —</option>
                  {banks.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
                </select>
              </div>

              <div className="pay-row" style={{ marginTop: 10 }}>
                <div>
                  <label className="pay-label">Amount *</label>
                  <input className="pay-input" type="number" min="0" step="100" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value ? Number(e.target.value) : "")} placeholder="0" />
                  {!isDonation && totalNetAllocated > 0 && (
                    <div className="hint-text">
                      Net payable after WHT: <strong>PKR {totalNetAllocated.toLocaleString()}</strong>
                    </div>
                  )}
                </div>
                <div><label className="pay-label">Date</label><input className="pay-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></div>
              </div>
              <div className="pay-row" style={{ marginTop: 10 }}>
                <div><label className="pay-label">Reference</label><input className="pay-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" /></div>
                <div><label className="pay-label">Notes</label><input className="pay-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></div>
              </div>
            </div>

            {supplierId && !isDonation && (
              <div className="pay-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 4px 0" }}>Allocate to Bills & Opening</h3>
                <div className="hint-text" style={{ marginBottom: 10 }}>
                  Tick a bill to auto-fill the net amount that fully settles it, or type a net amount yourself for a partial payment — gross and WHT are calculated automatically.
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}></th>
                        <th>Bill</th>
                        <th>Gross Due</th>
                        <th>WHT Rate</th>
                        <th style={{ textAlign: "right" }}>Net to Pay</th>
                        <th style={{ textAlign: "right" }}>Gross / WHT Applied</th>
                        <th style={{ textAlign: "right" }}>Balance After</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierOpeningBalance > 0 && (
                        <tr style={{ background: "var(--bg-soft)" }}>
                          <td>
                            <input className="chk-box" type="checkbox"
                              checked={openingNet > 0}
                              onChange={toggleOpeningAllocation}
                            />
                          </td>
                          <td colSpan={3}>
                            <span style={{ fontWeight: 600 }}>Opening Balance</span>
                            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>
                              (no WHT applies)
                            </span>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>
                            PKR {supplierOpeningBalance.toLocaleString()}
                          </td>
                          <td style={{ textAlign: "right" }} className="derived-cell">—</td>
                          <td style={{ textAlign: "right" }} className="derived-cell">
                            PKR {(supplierOpeningBalance - openingNet).toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                      )}
                      {billRows.map(bill => (
                        <tr key={bill.id}>
                          <td><input className="chk-box" type="checkbox" checked={bill.gross > 0} onChange={() => toggleBill(bill)} /></td>
                          <td>{bill.invoice_no}</td>
                          <td style={{ fontWeight: 600 }}>{bill.due.toLocaleString()}</td>
                          <td>{bill.rate > 0 ? `${bill.rate}%` : "—"}</td>
                          <td style={{ textAlign: "right" }}>
                            <input
                              className="alloc-input"
                              type="number"
                              min="0"
                              value={bill.net}
                              onChange={e => updateNetAllocation(bill, parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td style={{ textAlign: "right" }} className="derived-cell">
                            {bill.gross.toLocaleString()} / {bill.wht.toLocaleString()}
                          </td>
                          <td style={{ textAlign: "right" }} className="derived-cell">
                            {bill.remainingGross.toLocaleString()}
                            {bill.rate > 0 ? ` (WHT ${bill.remainingWht.toLocaleString()})` : ""}
                          </td>
                          <td>
                            {bill.gross > 0 && (
                              bill.isFullySettled
                                ? <span className="badge-full">Full</span>
                                : <span className="badge-partial">Partial</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                        <td colSpan={5} style={{ textAlign: "right" }}>Allocated (Gross)</td>
                        <td colSpan={3} style={{ textAlign: "right" }}>PKR {totalGrossAllocated.toLocaleString()}</td>
                      </tr>
                      {totalWhtDeducted > 0 && (
                        <tr style={{ color: "var(--text-muted)" }}>
                          <td colSpan={5} style={{ textAlign: "right" }}>WHT → Withholding Tax Payable</td>
                          <td colSpan={3} style={{ textAlign: "right" }}>PKR {totalWhtDeducted.toLocaleString()}</td>
                        </tr>
                      )}
                      <tr style={{ fontWeight: 600 }}>
                        <td colSpan={5} style={{ textAlign: "right" }}>Net Payment from Bank</td>
                        <td colSpan={3} style={{ textAlign: "right", color: "#10B981" }}>PKR {totalNetAllocated.toLocaleString()}</td>
                      </tr>
                      {totalAmount > 0 && Math.abs(difference) > 0.5 && (
                        <tr style={{ fontSize: 12, color: "#EF4444" }}>
                          <td colSpan={5} style={{ textAlign: "right", paddingTop: 4 }}>
                            ⚠️ Payment amount {difference > 0 ? `exceeds net payable by` : `is short by`} PKR {Math.abs(difference).toLocaleString()}
                          </td>
                          <td colSpan={3} style={{ textAlign: "right", paddingTop: 4, fontWeight: 600 }}>
                            {difference > 0 ? `Overpaid` : `Underpaid`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {bills.length === 0 && supplierOpeningBalance === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No unpaid purchase bills or opening balance for this supplier. The full amount will be recorded as unallocated.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
            <div className="pay-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Payment Entered</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
              {!isDonation && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                    <span>Bills/Opening Settled (Gross)</span><span>PKR {totalGrossAllocated.toLocaleString()}</span>
                  </div>
                  {totalWhtDeducted > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)" }}>
                      <span>→ WHT to Tax Payable</span><span>PKR {totalWhtDeducted.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span>→ Net from Bank</span><span>PKR {totalNetAllocated.toLocaleString()}</span>
                  </div>
                  {totalAmount > 0 && Math.abs(difference) > 0.5 && (
                    <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>
                      ⚠️ {difference > 0 ? `Overpaid by PKR ${difference.toLocaleString()}` : `Underpaid by PKR ${Math.abs(difference).toLocaleString()}`}
                    </div>
                  )}
                </>
              )}
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