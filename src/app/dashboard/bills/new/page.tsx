"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, Search, X, Download, CheckCircle } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"

export default function NewBillPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)   // initial loading state

  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const supplierRef = useRef<HTMLDivElement>(null)

  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Primary fields
  const [selectedLocationId, setSelectedLocationId] = useState("")
  const [selectedActivityId, setSelectedActivityId] = useState("")

  // Auto‑fetched badges
  const [fetchedProjectId, setFetchedProjectId] = useState<number | null>(null)
  const [fetchedProjectName, setFetchedProjectName] = useState("")
  const [fetchedDonorId, setFetchedDonorId] = useState<number | null>(null)
  const [fetchedDonorName, setFetchedDonorName] = useState("")

  // Header expense account (default)
  const [headerExpenseAccountId, setHeaderExpenseAccountId] = useState<number | null>(null)

  // Lookup data
  const [locations, setLocations] = useState<any[]>([])
  const [activitiesForLocation, setActivitiesForLocation] = useState<any[]>([])
  const [allAccounts, setAllAccounts] = useState<any[]>([])
  const [recommendedAccount, setRecommendedAccount] = useState<any>(null)

  const fiscalYear = new Date().getFullYear()

  // ── Load master data once ───────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))

      supabase.from("suppliers")
        .select("id,code,name,phone,balance,default_project_id,default_location_id,default_activity_id,default_donor_id,default_expense_account_id")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setSuppliers(r.data))

      supabase.from("accounts").select("id,code,name,type").eq("company_id", cid).eq("type","Expense").order("code")
        .then(r => r.data && setAllAccounts(r.data))

      supabase.from("locations").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))

      setLoading(false)
    })
  }, [])

  // ── Load activities for the chosen location (stable) ──
  useEffect(() => {
    if (!companyId || !selectedLocationId) {
      setActivitiesForLocation([])
      return
    }
    supabase.from("budgets")
      .select("activity_id, activities!inner(id,name)")
      .eq("company_id", companyId)
      .eq("location_id", selectedLocationId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .then(({ data }) => {
        if (data) {
          const unique = new Map<number, string>()
          data.forEach((d: any) => {
            if (d.activity_id && d.activities) unique.set(d.activity_id, d.activities.name)
          })
          setActivitiesForLocation(Array.from(unique.entries()).map(([id, name]) => ({ id, name })))
        } else {
          setActivitiesForLocation([])
        }
      })
  }, [companyId, selectedLocationId])

  // ── When activity changes, fetch project & donor ─────
  useEffect(() => {
    if (!companyId || !selectedActivityId || !selectedLocationId) {
      setFetchedProjectId(null); setFetchedProjectName("")
      setFetchedDonorId(null); setFetchedDonorName("")
      return
    }
    // Get project
    supabase.from("activities").select("project_id, projects(name)")
      .eq("id", selectedActivityId).single()
      .then(({ data }) => {
        if (data) {
          setFetchedProjectId(data.project_id)
          setFetchedProjectName((data.projects as any)?.name || "")
        }
      })
    // Get primary donor
    supabase.from("budgets")
      .select("donor_id, donors(name)")
      .eq("company_id", companyId)
      .eq("activity_id", selectedActivityId)
      .eq("location_id", selectedLocationId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .order("budgeted_amount", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFetchedDonorId(data[0].donor_id)
          setFetchedDonorName(data[0].donors?.name || "")
        } else {
          setFetchedDonorId(null)
          setFetchedDonorName("")
        }
      })
  }, [companyId, selectedActivityId, selectedLocationId])

  // Recommend account when supplier + activity + location exist
  useEffect(() => {
    if (!supplierId || !selectedActivityId || !selectedLocationId || !companyId || !fetchedProjectId) {
      setRecommendedAccount(null)
      return
    }
    if (allAccounts.length === 0) return
    supabase.from("journal_lines")
      .select("account_id, accounts(code,name)")
      .eq("company_id", companyId)
      .eq("activity_id", selectedActivityId)
      .eq("location_id", selectedLocationId)
      .eq("project_id", fetchedProjectId)
      .in("account_id", allAccounts.map(a => a.id))
      .order("debit", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setRecommendedAccount(data[0].accounts)
        } else {
          setRecommendedAccount(null)
        }
      })
  }, [supplierId, selectedActivityId, selectedLocationId, companyId, fetchedProjectId, allAccounts])

  // ── Close supplier dropdown on outside click ─────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── Supplier helpers ─────────────────────────────────
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
    // Pre‑fill from supplier defaults
    if (s.default_location_id) setSelectedLocationId(String(s.default_location_id))
    if (s.default_activity_id) setSelectedActivityId(String(s.default_activity_id))
    if (s.default_expense_account_id) setHeaderExpenseAccountId(s.default_expense_account_id)
    else setHeaderExpenseAccountId(null)
    setRecommendedAccount(null)
  }

  const clearSupplier = () => {
    setSupplierId(null)
    setSelectedSupplier(null)
    setSupplierSearch("")
    setShowSupplierList(true)
    setSelectedLocationId("")
    setSelectedActivityId("")
    setFetchedProjectId(null); setFetchedProjectName("")
    setFetchedDonorId(null); setFetchedDonorName("")
    setHeaderExpenseAccountId(null)
  }

  // ── Item management ──────────────────────────────────
  const addManualItem = () => {
    setItems([...items, {
      description: "", qty: 1, unit_price: 0, total: 0,
      activity_id: selectedActivityId || null,
      account_id: headerExpenseAccountId || null,
    }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === "qty" || field === "unit_price") {
      updated[idx].total = updated[idx].qty * updated[idx].unit_price
    }
    setItems(updated)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const totalAmount = items.reduce((s, i) => s + i.total, 0)

  // ── Submit ────────────────────────────────────────────
  const getNextBillNo = async (suppCode: string): Promise<string> => {
    const { data } = await supabase
      .from("invoices").select("invoice_no")
      .like("invoice_no", `${suppCode}-%`)
      .eq("type", "purchase")
      .order("invoice_no", { ascending: false }).limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const last = data[0].invoice_no
      const match = last.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    return `${suppCode}-${String(nextNum).padStart(2, "0")}`
  }

  const handleSubmit = async () => {
    if (!supplierId)       { setError("Please select a supplier"); return }
    if (items.length === 0) { setError("Add at least one item"); return }
    if (!selectedLocationId || !selectedActivityId) { setError("Location and Activity are required"); return }

    setSaving(true); setError("")
    const suppCode = selectedSupplier?.code || "BILL"
    const billNo = await getNextBillNo(suppCode)

    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_no: billNo,
          party_id:     supplierId,
          invoice_date: billDate,
          due_date:     dueDate,
          items: items.map(i => ({
            description: i.description,
            qty: i.qty,
            unit_price: i.unit_price,
            account_id: i.account_id || headerExpenseAccountId,
            activity_id: i.activity_id || selectedActivityId,
          })),
          reference, notes,
          expense_account_id: headerExpenseAccountId,
          project_id: fetchedProjectId,
          location_id: selectedLocationId,
          activity_id: selectedActivityId,
          donor_id: fetchedDonorId,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to create bill")
        setSaving(false)
        return
      }

      setFlash(`✅ Bill ${billNo} saved successfully!`)
      setItems([])
      clearSupplier()
      setSaving(false)
      setTimeout(() => setFlash(null), 4000)
    } catch (e) {
      setError("Network error")
      setSaving(false)
    }
  }

  const handleBeforeSavePdf = () => {
    getNextBillNo(selectedSupplier?.code || "BILL").then(billNo => {
      const tempBill = { invoice_no: billNo, date: billDate, due_date: dueDate, customers: selectedSupplier || {} }
      const doc = generateInvoicePDF(tempBill, items)
      doc.save(`bill-preview-${billNo}.pdf`)
    })
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center" }}>Loading bill form…</div>
  }

  return (
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width:1200px; margin:0 auto; }
        .inv-title { font-size:18px; font-weight:700; color:#1E293B; }
        .inv-card { background:white; border-radius:12px; border:1px solid #E5EAF2; padding:16px 20px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
        .inv-label { font-size:10px; font-weight:600; color:#6B7280; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; display:block; }
        .inv-input { width:100%; height:38px; border:1.5px solid #E5EAF2; border-radius:8px; padding:0 12px; font-size:13px; font-family:inherit; background:#FAFBFF; outline:none; box-sizing:border-box; }
        .inv-input:focus { border-color:#1740C8; background:white; }
        .inv-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .inv-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; font-family:inherit; transition:all 0.15s; white-space:nowrap; }
        .inv-btn-primary { background:linear-gradient(135deg,#1740C8,#071352); color:white; }
        .inv-btn-outline { background:white; border:1.5px solid #E5EAF2; color:#475569; }
        .inv-item-row { display:grid; grid-template-columns:1fr 80px 100px 100px 100px 60px 40px; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid #F1F5F9; }
        .inv-item-header { display:grid; grid-template-columns:1fr 80px 100px 100px 100px 60px 40px; gap:8px; font-size:9px; font-weight:700; text-transform:uppercase; color:#94A3B8; padding-bottom:6px; }
        .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600; margin-left:8px; }
        .badge-blue { background:#EEF2FF; color:#4338CA; }
        .badge-orange { background:#FFF7ED; color:#C2410C; }
        .cust-wrap { position:relative; }
        .cust-input-row { position:relative; display:flex; align-items:center; }
        .cust-search-icon { position:absolute; left:10px; color:#94A3B8; pointer-events:none; }
        .cust-clear { position:absolute; right:8px; background:none; border:none; cursor:pointer; color:#94A3B8; display:flex; align-items:center; padding:4px; border-radius:4px; }
        .cust-clear:hover { color:#EF4444; background:#FEF2F2; }
        .cust-dropdown { position:absolute; top:calc(100% + 4px); left:0; right:0; background:white; border:1.5px solid #C7D2FE; border-radius:10px; max-height:220px; overflow-y:auto; z-index:100; box-shadow:0 8px 24px rgba(30,58,138,0.12); }
        .cust-option { padding:8px 12px; cursor:pointer; border-bottom:1px solid #F1F5F9; display:flex; justify-content:space-between; align-items:center; transition:background 0.1s; }
        .cust-option:last-child { border-bottom:none; }
        .cust-option:hover { background:#EEF2FF; }
        .cust-option-name { font-size:13px; font-weight:600; color:#1E293B; }
        .cust-option-meta { font-size:11px; color:#94A3B8; margin-top:2px; }
        .cust-option-bal { font-size:12px; font-weight:600; color:#1E3A8A; white-space:nowrap; }
        .cust-selected-badge { display:inline-flex; align-items:center; gap:6px; background:#EEF2FF; border:1.5px solid #C7D2FE; border-radius:8px; padding:6px 12px; font-size:13px; font-weight:600; color:#1E3A8A; width:100%; }
        .inv-grid { display:grid; grid-template-columns:1fr 300px; gap:16px; align-items:start; }
        @media (max-width:900px) { .inv-grid { grid-template-columns:1fr; } }
        @media (max-width:600px) { .inv-item-row, .inv-item-header { grid-template-columns:1fr 60px 70px 40px; } }
      `}</style>

      <div className="inv-shell">
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/bills")}><ArrowLeft size={16} /></button>
          <div style={{ flex:1 }}>
            <div className="inv-title">📦 New Purchase Bill</div>
            <div style={{ fontSize:12, color:"#94A3B8", marginTop:1 }}>Location + Activity → auto‑fills remaining tags</div>
          </div>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/bills")}>View List</button>
        </div>

        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", color:"#B91C1C", padding:"10px 14px", borderRadius:8, marginBottom:12, fontSize:13 }}>{error}</div>}
        {flash && <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", color:"#15803D", padding:"10px 14px", borderRadius:8, marginBottom:12, fontSize:13, display:"flex", alignItems:"center", gap:8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="inv-grid">
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* Supplier card */}
            <div className="inv-card">
              <label className="inv-label">Supplier *</label>
              <div className="cust-wrap" ref={supplierRef}>
                {selectedSupplier ? (
                  <div className="cust-selected-badge" onClick={clearSupplier}>
                    <span>👤</span><span style={{ flex:1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                    <span style={{ fontSize:11, color:"#64748B" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                    <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearSupplier(); }}><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} style={{ position:"absolute", left:10, color:"#94A3B8" }} />
                      <input className="inv-input" style={{ paddingLeft:32, paddingRight:32 }} placeholder="Search by name, code or phone..." value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true) }} onFocus={() => setShowSupplierList(true)} autoComplete="off" />
                      {supplierSearch && <button className="cust-clear" onClick={() => setSupplierSearch("")}><X size={13} /></button>}
                    </div>
                    {showSupplierList && (
                      <div className="cust-dropdown">
                        {filteredSuppliers.length === 0 ? (
                          <div style={{ padding:"10px 14px", color:"#94A3B8", fontSize:13 }}>No suppliers found</div>
                        ) : (
                          filteredSuppliers.map(s => (
                            <div key={s.id} className="cust-option" onMouseDown={() => selectSupplier(s)}>
                              <div>
                                <div className="cust-option-name">{s.name}</div>
                                <div className="cust-option-meta">{s.code}{s.phone ? ` · ${s.phone}` : ""}</div>
                              </div>
                              <div className="cust-option-bal">PKR {(s.balance || 0).toLocaleString()}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Location + Activity */}
              <div style={{ marginTop:10, display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label className="inv-label">Location *</label>
                  <select className="inv-input" value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)}>
                    <option value="">— Select —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label className="inv-label">Activity *</label>
                  <select className="inv-input" value={selectedActivityId} onChange={e => setSelectedActivityId(e.target.value)}>
                    <option value="">— {selectedLocationId ? "Select" : "Pick Location first"} —</option>
                    {activitiesForLocation.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Auto‑filled Project & Donor badges */}
              {selectedActivityId && (
                <div style={{ marginTop:10, display:"flex", gap:12, alignItems:"center" }}>
                  <span><span style={{ fontSize:11, color:"#64748B" }}>Project:</span><span className="badge badge-blue">{fetchedProjectName || "?"}</span></span>
                  <span><span style={{ fontSize:11, color:"#64748B" }}>Donor:</span><span className="badge badge-orange">{fetchedDonorName || (businessType === "ngo" ? "⚠ Not found" : "N/A")}</span></span>
                </div>
              )}

              {/* Expense Account (with recommendation) */}
              <div style={{ marginTop:10 }}>
                <label className="inv-label">Expense Account</label>
                <select className="inv-input" value={headerExpenseAccountId ?? ""} onChange={e => setHeaderExpenseAccountId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select —</option>
                  {recommendedAccount && (
                    <option value={recommendedAccount.id}>⭐ {recommendedAccount.code} – {recommendedAccount.name} (Recommended)</option>
                  )}
                  {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                </select>
                {recommendedAccount && <p style={{ fontSize:11, color:"#64748B", marginTop:4 }}>💡 This account was used in previous bills for this supplier, activity and location.</p>}
              </div>

              <div className="inv-row" style={{ marginTop:10 }}>
                <div>
                  <label className="inv-label">Bill Date *</label>
                  <input className="inv-input" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
                </div>
                <div>
                  <label className="inv-label">Due Date</label>
                  <input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="inv-row" style={{ marginTop:10 }}>
                <div>
                  <label className="inv-label">Reference</label>
                  <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Supplier Invoice #" />
                </div>
                <div>
                  <label className="inv-label">Notes</label>
                  <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" />
                </div>
              </div>
            </div>

            {/* Add Item button */}
            <div className="inv-card" style={{ textAlign:"right" }}>
              <button className="inv-btn inv-btn-outline" onClick={addManualItem}><Plus size={14} /> Add Item</button>
            </div>

            {/* Items table */}
            {items.length > 0 && (
              <div className="inv-card">
                <div className="inv-item-header">
                  <span>Description</span><span>Qty</span><span>Price</span><span>Activity</span><span>Account</span><span>Total</span><span></span>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="inv-item-row">
                    <input className="inv-input" style={{ height:34, fontSize:12 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Item" />
                    <input className="inv-input" style={{ height:34, fontSize:12, textAlign:"center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                    <input className="inv-input" style={{ height:34, fontSize:12, textAlign:"right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                    <select className="inv-input" style={{ height:34, fontSize:11 }} value={item.activity_id || ""} onChange={e => updateItem(idx, "activity_id", e.target.value || null)}>
                      <option value="">— —</option>
                      {activitiesForLocation.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <select className="inv-input" style={{ height:34, fontSize:11 }} value={item.account_id || ""} onChange={e => updateItem(idx, "account_id", e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— —</option>
                      {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
                    </select>
                    <span style={{ textAlign:"right", fontWeight:600, fontSize:13 }}>PKR {item.total.toLocaleString()}</span>
                    <button className="inv-btn inv-btn-outline" style={{ padding:4 }} onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right summary */}
          <div style={{ display:"flex", flexDirection:"column", gap:12, position:"sticky", top:16 }}>
            <div className="inv-card">
              <h3 style={{ fontSize:15, fontWeight:700, color:"#1E293B", marginBottom:10 }}>Summary</h3>
              <div className="inv-summary-row bold">
                <span>Total</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button className="inv-btn inv-btn-primary" style={{ justifyContent:"center", padding:10, width:"100%" }} onClick={handleSubmit} disabled={saving}>
                {saving ? "Posting..." : "💾 POST Bill"}
              </button>
              <button className="inv-btn inv-btn-outline" style={{ justifyContent:"center", padding:9, marginTop:8, width:"100%" }} onClick={handleBeforeSavePdf}>
                <Download size={14} /> PDF Preview
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}