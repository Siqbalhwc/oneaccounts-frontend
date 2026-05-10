"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, Search, X, Download, CheckCircle } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"

export default function NewInvoicePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Lookups
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [allAccounts, setAllAccounts] = useState<any[]>([])

  // Global tags (applied to all items)
  const [globalLocationId, setGlobalLocationId] = useState<string>("")
  const [globalActivityId, setGlobalActivityId] = useState<string>("")
  const [globalAccountId, setGlobalAccountId] = useState<number | null>(null)

  // ── Load master data ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Fetch customers
      supabase.from("customers")
        .select("id,code,name,phone,balance,country_code")
        .eq("company_id", cid)
        .order("name")
        .then(r => {
          if (r.data) setCustomers(r.data)
          else setCustomers([])
        })

      // Fetch accounts (Revenue type for invoices)
      supabase.from("accounts")
        .select("id,code,name,type")
        .eq("company_id", cid)
        .eq("type", "Revenue")
        .order("code")
        .then(r => r.data && setAllAccounts(r.data))

      // Fetch locations
      supabase.from("locations")
        .select("id,name")
        .eq("company_id", cid)
        .order("name")
        .then(r => r.data && setLocations(r.data))

      setLoading(false)
    })
  }, [])

  // ── Fetch activities when a location is selected (optional) ──
  useEffect(() => {
    if (!companyId || !globalLocationId) {
      setActivities([])
      return
    }
    supabase.from("budgets")
      .select("activity_id, activities!inner(id,name)")
      .eq("company_id", companyId)
      .eq("location_id", globalLocationId)
      .eq("fiscal_year", new Date().getFullYear())
      .is("month", null)
      .then(({ data }) => {
        if (data) {
          const unique = new Map<number, string>()
          data.forEach((d: any) => {
            if (d.activity_id && d.activities) unique.set(d.activity_id, d.activities.name)
          })
          setActivities(Array.from(unique.entries()).map(([id, name]) => ({ id, name })))
        } else {
          setActivities([])
        }
      })
  }, [companyId, globalLocationId])

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
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setSelectedCustomer(null)
    setCustomerSearch("")
    setShowCustomerList(true)
    setGlobalLocationId("")
    setGlobalActivityId("")
    setGlobalAccountId(null)
  }

  // ── Item management ──
  const addItem = () => {
    setItems([...items, {
      description: "",
      qty: 1,
      unit_price: 0,
      total: 0,
      account_id: globalAccountId,
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

  // ── Invoice number generation ──
  const getNextInvoiceNo = async (custCode: string): Promise<string> => {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_no")
      .like("invoice_no", `${custCode}-%`)
      .eq("type", "sale")
      .order("invoice_no", { ascending: false })
      .limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const last = data[0].invoice_no
      const match = last.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    return `${custCode}-${String(nextNum).padStart(2, "0")}`
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (!customerId) { setError("Please select a customer"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    setSaving(true); setError("")
    const custCode = selectedCustomer?.code || "CUST"
    const invoiceNo = await getNextInvoiceNo(custCode)

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_no: invoiceNo,
          party_id: customerId,
          invoice_date: invoiceDate,
          due_date: dueDate,
          items: items.map(i => ({
            description: i.description,
            qty: i.qty,
            unit_price: i.unit_price,
            account_id: i.account_id || globalAccountId,
          })),
          reference,
          notes,
          location_id: globalLocationId || null,
          activity_id: globalActivityId || null,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to create invoice")
        setSaving(false)
        return
      }

      setFlash(`✅ Invoice ${invoiceNo} saved successfully!`)
      setItems([])
      clearCustomer()
      setSaving(false)
      setTimeout(() => setFlash(null), 4000)
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  // ── PDF Preview (fixed) ──
  const handleBeforeSavePdf = () => {
    if (!selectedCustomer) return
    getNextInvoiceNo(selectedCustomer.code || "CUST").then(invoiceNo => {
      const pdfData = {
        companyName: "OneAccounts",
        invoiceNo: invoiceNo,
        date: invoiceDate,
        dueDate: dueDate,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || "",
        items: items.map(i => ({
          description: i.description || "",
          qty: i.qty || 0,
          unit_price: i.unit_price || 0,
          total: i.total || 0,
        })),
        subtotal: totalAmount,
        total: totalAmount,
      }
      const doc = generateInvoicePDF(pdfData)
      doc.save(`invoice-preview-${invoiceNo}.pdf`)
    })
  }

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center" }}>Loading invoice form…</div>
  }

  return (
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width:1000px; margin:0 auto; }
        .inv-title { font-size:18px; font-weight:700; color:#1E293B; }
        .inv-card { background:white; border-radius:12px; border:1px solid #E5EAF2; padding:16px 20px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
        .inv-label { font-size:10px; font-weight:600; color:#6B7280; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; display:block; }
        .inv-input, .inv-select { width:100%; height:38px; border:1.5px solid #E5EAF2; border-radius:8px; padding:0 12px; font-size:13px; font-family:inherit; background:#FAFBFF; outline:none; box-sizing:border-box; }
        .inv-input:focus, .inv-select:focus { border-color:#1740C8; background:white; }
        .inv-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .inv-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; font-family:inherit; transition:all 0.15s; white-space:nowrap; }
        .inv-btn-primary { background:linear-gradient(135deg,#1740C8,#071352); color:white; }
        .inv-btn-outline { background:white; border:1.5px solid #E5EAF2; color:#475569; }
        .inv-item-row { display:grid; grid-template-columns:1fr 80px 100px 120px 70px 30px; gap:6px; align-items:center; padding:6px 0; border-bottom:1px solid #F1F5F9; }
        .inv-item-header { display:grid; grid-template-columns:1fr 80px 100px 120px 70px 30px; gap:6px; font-size:9px; font-weight:700; text-transform:uppercase; color:#94A3B8; padding-bottom:6px; }
        .cust-wrap { position:relative; }
        .cust-input-row { position:relative; display:flex; align-items:center; }
        .cust-dropdown { position:absolute; top:calc(100% + 4px); left:0; right:0; background:white; border:1.5px solid #C7D2FE; border-radius:10px; max-height:220px; overflow-y:auto; z-index:100; box-shadow:0 8px 24px rgba(30,58,138,0.12); }
        .cust-option { padding:8px 12px; cursor:pointer; border-bottom:1px solid #F1F5F9; display:flex; justify-content:space-between; align-items:center; }
        .cust-option:last-child { border-bottom:none; }
        .cust-option:hover { background:#EEF2FF; }
        .cust-option-name { font-size:13px; font-weight:600; color:#1E293B; }
        .cust-option-meta { font-size:11px; color:#94A3B8; margin-top:2px; }
        .cust-option-bal { font-size:12px; font-weight:600; color:#1E3A8A; white-space:nowrap; }
        .cust-selected-badge { display:inline-flex; align-items:center; gap:6px; background:#EEF2FF; border:1.5px solid #C7D2FE; border-radius:8px; padding:6px 12px; font-size:13px; font-weight:600; color:#1E3A8A; width:100%; cursor:pointer; }
        .inv-grid { display:grid; grid-template-columns:1fr 280px; gap:16px; align-items:start; }
        @media (max-width:800px) {
          .inv-grid { grid-template-columns:1fr; }
          .inv-item-row, .inv-item-header { grid-template-columns:1fr 60px 60px 80px 50px 20px; }
        }
      `}</style>

      <div className="inv-shell">
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/invoices")}><ArrowLeft size={16} /></button>
          <div style={{ flex:1 }}>
            <div className="inv-title">🧾 New Sales Invoice</div>
            <div style={{ fontSize:12, color:"#94A3B8", marginTop:1 }}>Select customer → add items</div>
          </div>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/invoices")}>View List</button>
        </div>

        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", color:"#B91C1C", padding:"10px 14px", borderRadius:8, marginBottom:12, fontSize:13 }}>{error}</div>}
        {flash && <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", color:"#15803D", padding:"10px 14px", borderRadius:8, marginBottom:12, fontSize:13, display:"flex", alignItems:"center", gap:8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="inv-grid">
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* Customer card */}
            <div className="inv-card">
              <label className="inv-label">Customer *</label>
              <div className="cust-wrap" ref={customerRef}>
                {selectedCustomer ? (
                  <div className="cust-selected-badge" onClick={clearCustomer}>
                    <span>👤</span><span style={{ flex:1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                    <span style={{ fontSize:11, color:"#64748B" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                    <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearCustomer(); }}><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} style={{ position:"absolute", left:10, color:"#94A3B8" }} />
                      <input className="inv-input" style={{ paddingLeft:32, paddingRight:32 }} placeholder="Search by name, code or phone..." value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }} onFocus={() => setShowCustomerList(true)} onClick={() => setShowCustomerList(true)} autoComplete="off" />
                      {customerSearch && <button className="cust-clear" onClick={() => setCustomerSearch("")}><X size={13} /></button>}
                    </div>
                    {showCustomerList && (
                      <div className="cust-dropdown">
                        {filteredCustomers.length === 0 ? (
                          <div style={{ padding:"10px 14px", color:"#94A3B8", fontSize:13 }}>No customers found</div>
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

              {/* Optional: location/activity/account */}
              <div style={{ marginTop:10, display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label className="inv-label">Location (optional)</label>
                  <select className="inv-select" value={globalLocationId} onChange={e => setGlobalLocationId(e.target.value)}>
                    <option value="">— None —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label className="inv-label">Activity (optional)</label>
                  <select className="inv-select" value={globalActivityId} onChange={e => setGlobalActivityId(e.target.value)}>
                    <option value="">— None —</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop:10 }}>
                <label className="inv-label">Default Revenue Account (for new items)</label>
                <select className="inv-select" value={globalAccountId ?? ""} onChange={e => setGlobalAccountId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Optional —</option>
                  {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                </select>
              </div>

              <div className="inv-row" style={{ marginTop:10 }}>
                <div><label className="inv-label">Invoice Date *</label><input className="inv-input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
                <div><label className="inv-label">Due Date</label><input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              </div>
              <div className="inv-row" style={{ marginTop:10 }}>
                <div><label className="inv-label">Reference</label><input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Customer PO #" /></div>
                <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" /></div>
              </div>
            </div>

            {/* Add item & items table */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:14, fontWeight:600, color:"#1E293B" }}>Items</span>
              <button className="inv-btn inv-btn-outline" onClick={addItem}><Plus size={14} /> Add Item</button>
            </div>

            {items.length > 0 && (
              <div className="inv-card" style={{ overflowX:"auto" }}>
                <div className="inv-item-header">
                  <span>Description</span><span>Qty</span><span>Price</span><span>Revenue Account</span><span>Total</span><span></span>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="inv-item-row">
                    <input className="inv-input" style={{ height:34, fontSize:12 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Item" />
                    <input className="inv-input" style={{ height:34, fontSize:12, textAlign:"center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                    <input className="inv-input" style={{ height:34, fontSize:12, textAlign:"right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                    <select className="inv-select" style={{ height:34, fontSize:11 }} value={item.account_id ?? ""} onChange={e => updateItem(idx, "account_id", e.target.value ? Number(e.target.value) : null)}>
                      <option value="">—</option>
                      {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
                    </select>
                    <span style={{ textAlign:"right", fontWeight:600, fontSize:13 }}>PKR {item.total.toLocaleString()}</span>
                    <button className="inv-btn inv-btn-outline" style={{ padding:2 }} onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right summary */}
          <div style={{ display:"flex", flexDirection:"column", gap:12, position:"sticky", top:16 }}>
            <div className="inv-card">
              <h3 style={{ fontSize:15, fontWeight:700, color:"#1E293B", marginBottom:10 }}>Summary</h3>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:600 }}>
                <span>Total</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button className="inv-btn inv-btn-primary" style={{ justifyContent:"center", padding:10, width:"100%" }} onClick={handleSubmit} disabled={saving}>
                {saving ? "Posting..." : "💾 POST Invoice"}
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