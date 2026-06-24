"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Search, X, CheckCircle, RefreshCw } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"

export default function NewReceiptPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark" || themeMode === "oneaccounts"

  const [companyId, setCompanyId] = useState("")
  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)
  const [refreshingCustomers, setRefreshingCustomers] = useState(false)

  const [banks, setBanks] = useState<any[]>([])
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)

  const [incomeAccounts, setIncomeAccounts] = useState<any[]>([])
  const [selectedIncomeAccountId, setSelectedIncomeAccountId] = useState<number | null>(null)
  const [isDonation, setIsDonation] = useState(false)

  const [invoices, setInvoices] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Record<string, number>>({})

  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [receiptAmount, setReceiptAmount] = useState<number | "">("")
  const [notes, setNotes] = useState("")
  const [reference, setReference] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const [customerOpeningBalance, setCustomerOpeningBalance] = useState(0)

  // ── Load company ID and master data ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const loadCustomers = async () => {
    if (!companyId) return
    setRefreshingCustomers(true)
    try {
      const { data } = await supabase
        .from("customers")
        .select("id, code, name, phone, balance, opening_balance, country_code")
        .eq("company_id", companyId)
        .order("name")
      if (data) {
        setCustomers(data)
        if (selectedCustomer) {
          const updated = data.find((c: any) => c.id === selectedCustomer.id)
          if (updated) {
            setSelectedCustomer(updated)
            setCustomerOpeningBalance(updated.opening_balance || 0)
          }
        }
      }
    } catch (err) {
      console.error("Refresh failed", err)
    } finally {
      setRefreshingCustomers(false)
    }
  }

  useEffect(() => {
    if (!companyId) return
    supabase.from("bank_accounts").select("id, bank_name, accounts(code)")
      .eq("company_id", companyId).order("bank_name")
      .then(r => r.data && setBanks(r.data.map((b: any) => ({ id: b.id, name: b.bank_name, glCode: b.accounts?.code }))))
    loadCustomers()
    supabase.from("accounts").select("id, code, name")
      .in("type", ["Revenue","Income"]).eq("company_id", companyId).order("code")
      .then(r => r.data && setIncomeAccounts(r.data))
  }, [companyId])

  // ── Load existing receipt data when editing ──
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.from("receipts")
      .select("*, receipt_allocations(invoice_id, amount)")
      .eq("id", editId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setReceiptAmount(data.amount)
        setReceiptDate(data.date)
        setReference(data.reference || "")
        setNotes(data.notes || "")
        setSelectedBankId(data.bank_account_id)
        setSelectedIncomeAccountId(data.income_account_id)
        setIsDonation(!!data.income_account_id)

        if (data.party_id) {
          setCustomerId(data.party_id)
          supabase.from("customers")
            .select("id,code,name,phone,balance,opening_balance,country_code")
            .eq("id", data.party_id)
            .single()
            .then(({ data: cust }) => {
              if (cust) {
                setSelectedCustomer(cust)
                setCustomerSearch(cust.name)
                setCustomerOpeningBalance(cust.opening_balance || 0)
              }
            })
        }

        const allocs: Record<string, number> = {}
        data.receipt_allocations?.forEach((a: any) => {
          allocs[String(a.invoice_id)] = a.amount
        })
        setAllocations(allocs)
      })
  }, [editId, companyId])

  // ── Fetch invoices when customer is selected ──
  useEffect(() => {
    if (!companyId || !customerId || isDonation) {
      setInvoices([])
      setAllocations(prev => {
        const copy = { ...prev }
        delete copy["opening"]
        return copy
      })
      return
    }

    const fetchInvoicesWithPaid = async () => {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, invoice_no, date, due_date, total, paid, status")
        .eq("company_id", companyId)
        .eq("party_id", customerId)
        .eq("type", "sale")
        .in("status", ["Unpaid", "Partial"])
        .neq("status", "Returned")
        .order("date")

      if (!invs || invs.length === 0) {
        setInvoices([])
        setAllocations(prev => {
          const copy = { ...prev }
          delete copy["opening"]
          return copy
        })
        return
      }

      const invoiceIds = invs.map(inv => inv.id)
      const { data: allocationsData } = await supabase
        .from("receipt_allocations")
        .select("invoice_id, amount")
        .in("invoice_id", invoiceIds)

      const paidMap: Record<number, number> = {}
      if (allocationsData) {
        allocationsData.forEach((a: any) => {
          paidMap[a.invoice_id] = (paidMap[a.invoice_id] || 0) + (a.amount || 0)
        })
      }

      const enriched = invs.map(inv => ({
        ...inv,
        paid: Math.max(inv.paid || 0, paidMap[inv.id] || 0),
      }))

      const stillDue = enriched.filter(inv => inv.total - inv.paid > 0.001)

      if (!editId) {
        const initAlloc: Record<string, number> = { opening: 0 }
        stillDue.forEach(inv => { initAlloc[String(inv.id)] = 0 })
        setAllocations(prev => ({ ...initAlloc, ...prev }))
      }

      setInvoices(stillDue)
    }

    fetchInvoicesWithPaid()
  }, [companyId, customerId, isDonation, editId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── Customer selection ──
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
    setCustomerOpeningBalance(c.opening_balance || 0)
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setSelectedCustomer(null)
    setCustomerSearch("")
    setShowCustomerList(true)
    setInvoices([])
    setAllocations({})
    setCustomerOpeningBalance(0)
  }

  // ── Allocation helpers ──
  const toggleInvoice = (invId: number, due: number) => {
    const key = String(invId)
    setAllocations(prev => {
      const current = prev[key] || 0
      const newVal = current > 0 ? 0 : due
      return { ...prev, [key]: newVal }
    })
  }

  const updateAllocation = (invId: number, value: number, due: number) => {
    const clamped = Math.min(Math.max(value, 0), due)
    setAllocations(prev => ({ ...prev, [String(invId)]: clamped }))
  }

  const toggleOpeningAllocation = () => {
    setAllocations(prev => {
      const current = prev["opening"] || 0
      const newVal = current > 0 ? 0 : customerOpeningBalance
      return { ...prev, opening: newVal }
    })
  }

  const totalAllocatedToInvoices = Object.entries(allocations)
    .filter(([key]) => key !== "opening")
    .reduce((s, [_, v]) => s + v, 0)

  const openingAllocation = allocations["opening"] || 0
  const totalAllocated = totalAllocatedToInvoices + openingAllocation
  const totalAmount = Number(receiptAmount || 0)
  const unallocated = totalAmount - totalAllocated

  // ── Save / Update using RPC (optimized) ──
  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!selectedBankId) { setError("Please select a bank account"); return }
    if (totalAmount <= 0) { setError("Enter a valid receipt amount"); return }
    if (!customerId && !isDonation) {
      setError("Please select a customer. To record a donation, enable the Donation / Other Income checkbox.")
      return
    }
    if (isDonation && !selectedIncomeAccountId) {
      setError("Please select an income account for the donation.")
      return
    }

    setLoading(true); setError("")

    // Build allocations array for RPC (excluding opening)
    const allocationsArray = Object.entries(allocations)
      .filter(([key, amount]) => key !== "opening" && amount > 0)
      .map(([invId, amount]) => ({
        invoice_id: parseInt(invId),
        amount: amount,
      }))

    const openingAllocAmount = allocations["opening"] || 0

    try {
      // ── Call the RPC instead of the API ──
      const { data, error: rpcError } = await supabase.rpc('create_receipt_transaction', {
        p_company_id: companyId,
        p_party_id: customerId,
        p_receipt_date: receiptDate,
        p_amount: totalAmount,
        p_bank_account_id: selectedBankId,
        p_income_account_id: isDonation ? selectedIncomeAccountId : null,
        p_reference: reference || null,
        p_notes: notes || null,
        p_allocations: allocationsArray,
        p_user_email: 'system',
        p_is_donation: isDonation,
        p_opening_allocation: openingAllocAmount,
      })

      if (rpcError) {
        setError(rpcError.message || "Failed to save receipt")
        setLoading(false)
        return
      }

      if (!data || !data.success) {
        setError(data?.error || "Failed to save receipt")
        setLoading(false)
        return
      }

      setFlash(`✅ Receipt ${editId ? "updated" : "saved"} successfully!`)

      if (editId) {
        setTimeout(() => router.push("/dashboard/receipts"), 1500)
      } else {
        // Reset form
        setCustomerId(null)
        setSelectedCustomer(null)
        setCustomerSearch("")
        setShowCustomerList(false)
        setSelectedBankId(null)
        setSelectedIncomeAccountId(null)
        setIsDonation(false)
        setInvoices([])
        setAllocations({})
        setReceiptAmount("")
        setNotes("")
        setReference("")
        setCustomerOpeningBalance(0)
        setLoading(false)
        setTimeout(() => loadCustomers(), 500)
      }
      setTimeout(() => setFlash(null), 4000)

    } catch (err: any) {
      setError(err.message || "Network error")
      setLoading(false)
    }
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data…</div>

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { width: 100%; margin: 0; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card {
          background: var(--card); border-radius: 12px; border: 1px solid var(--border);
          padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px;
        }
        .inv-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; font-family: inherit;
          background: var(--bg); color: var(--text); outline: none; box-sizing: border-box;
        }
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s; white-space: nowrap; text-decoration: none;
        }
        .inv-btn:hover { background: var(--card-hover); }
        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--card); border: 1.5px solid var(--border); border-radius: 10px;
          max-height: 220px; overflow-y: auto; z-index: 100;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        .cust-option {
          padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
        }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: var(--card-hover); }
        .cust-option-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .cust-option-meta { font-size: 11px; color: var(--text-muted); }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: var(--primary); white-space: nowrap; }
        .cust-selected-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--card); border: 1.5px solid var(--border);
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
          font-weight: 600; color: var(--text); width: 100%; cursor: pointer;
        }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }
        .chk-box { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }
        .alloc-input { width: 90px; height: 28px; border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; text-align: right; background: var(--bg); color: var(--text); }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--border); }
        td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        input[type="date"].inv-input { color-scheme: ${isDark ? 'dark' : 'light'}; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/receipts")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">{editId ? "✏️ Edit Receipt" : "📥 New Receipt"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
              {editId ? "Modify receipt details and allocations" : "Record customer payment or donation"}
            </div>
          </div>
        </div>

        {error && <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="header-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--text)" }}>
                  <input type="checkbox" checked={isDonation} onChange={e => { setIsDonation(e.target.checked); clearCustomer(); }} />
                  Donation / Other Income
                </label>
              </div>

              {!isDonation ? (
                <>
                  <label className="inv-label">Customer <span style={{ color: "#EF4444" }}>*</span></label>
                  <div className="cust-wrap" ref={customerRef}>
                    {selectedCustomer ? (
                      <div className="cust-selected-badge" onClick={clearCustomer}>
                        <span>👤</span><span style={{ flex: 1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                        <button style={{ marginLeft: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clearCustomer(); }}><X size={14} /></button>
                        <button
                          style={{ marginLeft: 2, background: "none", border: "none", color: "var(--primary)", cursor: "pointer", opacity: refreshingCustomers ? 0.5 : 1 }}
                          onClick={(e) => { e.stopPropagation(); loadCustomers(); }}
                          disabled={refreshingCustomers}
                          title="Refresh customer list"
                        >
                          <RefreshCw size={13} style={{ animation: refreshingCustomers ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="cust-input-row">
                          <Search size={14} style={{ position: "absolute", left: 10, color: "var(--text-muted)" }} />
                          <input className="inv-input" style={{ paddingLeft: 32, paddingRight: 32 }} placeholder="Search by name, code or phone..." value={customerSearch}
                            onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                            onFocus={() => setShowCustomerList(true)} autoComplete="off"
                          />
                          {customerSearch && <button onClick={() => setCustomerSearch("")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={13} /></button>}
                        </div>
                        {showCustomerList && (
                          <div className="cust-dropdown">
                            {filteredCustomers.length === 0 ? (
                              <div style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 13 }}>No customers found</div>
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
                  <label className="inv-label">Income Account <span style={{ color: "#EF4444" }}>*</span></label>
                  <select className="inv-select" value={selectedIncomeAccountId ?? ""} onChange={e => setSelectedIncomeAccountId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Select Income Account —</option>
                    {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <label className="inv-label">Bank Account <span style={{ color: "#EF4444" }}>*</span></label>
                <select className="inv-select" value={selectedBankId ?? ""} onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Bank —</option>
                  {banks.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
                </select>
              </div>

              <div className="inv-row" style={{ marginTop: 10 }}>
                <div>
                  <label className="inv-label">Amount <span style={{ color: "#EF4444" }}>*</span></label>
                  <input className="inv-input" type="number" min="0" step="100" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value ? Number(e.target.value) : "")} placeholder="0" />
                </div>
                <div>
                  <label className="inv-label">Date</label>
                  <input className="inv-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
                </div>
              </div>
              <div className="inv-row" style={{ marginTop: 10 }}>
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

            {customerId && !isDonation && (
              <div className="inv-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 12px 0" }}>Allocate to Invoices & Opening</h3>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
                      <th>Description</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Due</th>
                      <th style={{ textAlign: "right" }}>Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOpeningBalance > 0 && (
                      <tr style={{ background: "var(--bg-soft)" }}>
                        <td>
                          <input className="chk-box" type="checkbox"
                            checked={(allocations["opening"] || 0) > 0}
                            onChange={toggleOpeningAllocation}
                          />
                        </td>
                        <td colSpan={4}>
                          <span style={{ fontWeight: 600 }}>Opening Balance</span>
                          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>
                            (PKR {customerOpeningBalance.toLocaleString()})
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          PKR {customerOpeningBalance.toLocaleString()}
                        </td>
                      </tr>
                    )}
                    {invoices.map(inv => {
                      const due = inv.total - (inv.paid || 0)
                      const alloc = allocations[String(inv.id)] || 0
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
                    <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                      <td colSpan={5} style={{ textAlign: "right" }}>Allocated</td>
                      <td style={{ textAlign: "right" }}>PKR {totalAllocated.toLocaleString()}</td>
                    </tr>
                    {unallocated > 0 && (
                      <tr style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        <td colSpan={6} style={{ textAlign: "right", paddingTop: 4 }}>
                          Unallocated (advance): PKR {unallocated.toLocaleString()}
                        </td>
                      </tr>
                    )}
                    {totalAmount > 0 && unallocated === 0 && (
                      <tr style={{ fontSize: 12, color: "#10B981" }}>
                        <td colSpan={6} style={{ textAlign: "right", paddingTop: 4 }}>
                          ✅ Fully allocated
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {invoices.length === 0 && customerOpeningBalance === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No unpaid invoices or opening balance for this customer. The full amount will be recorded as an advance.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Amount</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
              {!isDonation && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                    <span>Allocated</span><span>PKR {totalAllocated.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: unallocated > 0 ? "#EF4444" : "var(--text-muted)" }}>
                    <span>Advance</span><span>PKR {unallocated.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
            <div className="inv-card">
              <button className="inv-btn" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Posting..." : editId ? "💾 Update Receipt" : "💾 Save Receipt"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}