"use client"

import { Suspense } from "react"
import { useState, useEffect, useRef, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Search, X, CheckCircle, ExternalLink, ImageIcon, RefreshCw,
} from "lucide-react"
import { usePlan } from "@/contexts/PlanContext"

function NewSalesReturnPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")
  const originalInvoiceIdFromQuery = searchParams.get("original_invoice_id") // ← read original invoice id from URL

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const showProducts = hasFeature("inventory")

  const [companyId, setCompanyId] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<any>(null)

  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Original invoice selection
  const [originalInvoiceId, setOriginalInvoiceId] = useState<number | null>(null)
  const [originalInvoiceSearch, setOriginalInvoiceSearch] = useState("")
  const [showOriginalList, setShowOriginalList] = useState(false)
  const [originalInvoices, setOriginalInvoices] = useState<any[]>([])
  const originalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(({ data }) => { if (data) setBusinessType(data.business_type || "") })

      supabase.from("customers")
        .select("id,code,name,phone,balance,country_code,payment_terms")
        .eq("company_id", cid)
        .order("name")
        .then(r => { if (r.data) setCustomers(r.data) })

      if (showProducts) {
        supabase.from("products")
          .select("id,code,name,sale_price,cost_price,qty_on_hand,image_path")
          .eq("company_id", cid)
          .is("deleted_at", null)
          .order("name")
          .then(r => r.data && setProducts(r.data))
      }

      supabase.from("company_settings")
        .select("*").eq("company_id", cid).single()
        .then(r => {
          if (r.data) setCompany(r.data)
          else {
            supabase.from("companies")
              .select("name, logo_url, tagline, address, business_type")
              .eq("id", cid).single()
              .then(r2 => r2.data && setCompany(r2.data))
          }
        })

      // Fetch original sales invoices for selection
      supabase.from("invoices")
        .select("id, invoice_no, date, party_id, total")
        .eq("company_id", cid)
        .eq("type", "sale")
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .then(r => { if (r.data) setOriginalInvoices(r.data) })

      setLoading(false)
    })
  }, [showProducts])

  // Pre‑select original invoice from URL
  useEffect(() => {
    if (originalInvoiceIdFromQuery && companyId) {
      const id = Number(originalInvoiceIdFromQuery)
      setOriginalInvoiceId(id)
      // The other useEffect will fetch its details
    }
  }, [originalInvoiceIdFromQuery, companyId])

  // When an original invoice is selected, auto‑fill customer and items
  useEffect(() => {
    if (!originalInvoiceId || !companyId) return
    supabase.from("invoices")
      .select("*, customers(name)")
      .eq("id", originalInvoiceId)
      .single()
      .then(async ({ data: inv }) => {
        if (!inv) return
        setCustomerId(inv.party_id)
        const cust = customers.find(c => c.id === inv.party_id)
        if (cust) { setSelectedCustomer(cust); setCustomerSearch(cust.name) }
        setInvoiceDate(inv.date)
        // load items
        const { data: invItems } = await supabase.from("invoice_items")
          .select("*")
          .eq("invoice_id", inv.id)
        if (invItems) {
          const mapped = invItems.map((item: any) => ({
            product_id: item.product_id,
            description: item.description,
            product_name: "",
            product_image: null,
            qty: item.qty,      // user can adjust
            unit_price: item.unit_price,
            cost_price: item.cost_price || 0,
            total: item.qty * item.unit_price,
          }))
          setItems(mapped)
        }
      })
  }, [originalInvoiceId, companyId, customers])

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
  }

  const addProductItem = (prod: any) => {
    setItems([...items, {
      product_id: prod.id,
      description: `${prod.code} - ${prod.name}`,
      product_name: prod.name,
      product_image: prod.image_path || null,
      qty: 1,
      unit_price: prod.sale_price,
      cost_price: prod.cost_price,
      total: prod.sale_price,
    }])
  }

  const addManualItem = () => {
    setItems([...items, {
      product_id: null,
      description: "",
      product_name: "",
      product_image: null,
      qty: 1,
      unit_price: 0,
      cost_price: 0,
      total: 0,
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

  const handleSubmit = async () => {
    if (!customerId) { setError("Please select a customer"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    setSaving(true); setError("")

    try {
      const res = await fetch("/api/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party_id: customerId,
          original_invoice_id: originalInvoiceId || null,
          invoice_date: invoiceDate,
          due_date: dueDate,
          items: items.map(i => ({
            product_id: i.product_id,
            description: i.description,
            qty: i.qty,
            unit_price: i.unit_price,
            cost_price: i.cost_price,
          })),
          reference, notes,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to save return")
        setSaving(false)
        return
      }

      const newId = result.return?.id
      setFlash("✅ Sales Return created successfully!")
      if (newId) {
        router.push(`/dashboard/sales-returns/${newId}`)
      } else {
        setSaving(false)
      }
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading form…</div>

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.code.toLowerCase().includes(customerSearch.toLowerCase())
  )

  const filteredOriginalInvoices = originalInvoices.filter(inv =>
    inv.invoice_no.toLowerCase().includes(originalInvoiceSearch.toLowerCase())
  )

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { width: 100%; margin: 0; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card {
          background: var(--card); border-radius: 12px; border: 1px solid var(--border);
          padding: 16px 20px; box-shadow: var(--shadow-sm);
          margin-bottom: 12px;
        }
        .inv-label {
          font-size: 10px; font-weight: 600; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;
        }
        .inv-input, .inv-select {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px; font-size: 13px;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box;
        }
        input[type="date"] { color-scheme: dark; }
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s; white-space: nowrap; text-decoration: none;
        }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn-success { background: #25D366; color: white; border-color: #25D366; }
        .inv-btn-success:hover { background: #22C55E; }
        .cust-wrap { position: relative; }
        .cust-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--card); border: 1.5px solid var(--border); border-radius: 10px;
          max-height: 220px; overflow-y: auto; z-index: 100;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        .cust-option {
          padding: 8px 12px; cursor: pointer;
          border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
        }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: var(--card-hover); }
        .cust-option-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .cust-option-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .cust-selected-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--card); border: 1.5px solid var(--border);
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
          font-weight: 600; color: var(--text); width: 100%; cursor: pointer;
        }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) {
          .header-grid { grid-template-columns: 1fr; }
        }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/sales-returns")}><ArrowLeft size={16} /></button>
          <div className="inv-title">↩️ New Sales Return</div>
        </div>

        {error && <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        <div className="header-grid">
          <div>
            <div className="inv-card">
              <label className="inv-label">Original Invoice (optional)</label>
              <div className="cust-wrap" ref={originalRef}>
                <input className="inv-input" placeholder="Search invoice no..." value={originalInvoiceSearch}
                  onChange={e => { setOriginalInvoiceSearch(e.target.value); setShowOriginalList(true) }}
                  onFocus={() => setShowOriginalList(true)}
                  onClick={() => setShowOriginalList(true)}
                />
                {showOriginalList && (
                  <div className="cust-dropdown">
                    {filteredOriginalInvoices.map(inv => (
                      <div key={inv.id} className="cust-option" onClick={() => { setOriginalInvoiceId(inv.id); setOriginalInvoiceSearch(inv.invoice_no); setShowOriginalList(false) }}>
                        <span className="cust-option-name">{inv.invoice_no}</span>
                        <span className="cust-option-meta">PKR {inv.total?.toLocaleString()}</span>
                      </div>
                    ))}
                    {filteredOriginalInvoices.length === 0 && <div style={{ padding: 12 }}>No invoices found</div>}
                  </div>
                )}
              </div>

              <label className="inv-label" style={{ marginTop: 14 }}>Customer *</label>
              <div className="cust-wrap" ref={customerRef}>
                {selectedCustomer ? (
                  <div className="cust-selected-badge" onClick={clearCustomer}>
                    <span>👤</span><span style={{ flex: 1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                    <button style={{ marginLeft: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clearCustomer(); }}><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input className="inv-input" placeholder="Search customer..." value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                      onFocus={() => setShowCustomerList(true)}
                      onClick={() => setShowCustomerList(true)}
                    />
                    {showCustomerList && (
                      <div className="cust-dropdown">
                        {filteredCustomers.map(c => (
                          <div key={c.id} className="cust-option" onMouseDown={() => selectCustomer(c)}>
                            <div>
                              <div className="cust-option-name">{c.name}</div>
                              <div className="cust-option-meta">{c.code}{c.phone ? ` · ${c.phone}` : ""}</div>
                            </div>
                            <div className="cust-option-bal">PKR {(c.balance || 0).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="inv-row" style={{ marginTop: 14 }}>
                <div><label className="inv-label">Return Date *</label><input className="inv-input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
                <div><label className="inv-label">Due Date</label><input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              </div>
              <div className="inv-row" style={{ marginTop: 10 }}>
                <div><label className="inv-label">Reference</label><input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Reason..." /></div>
                <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" /></div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="inv-label">Add Product</label>
                {showProducts ? (
                  <select className="inv-select" onChange={e => {
                    const prod = products.find(p => p.id === Number(e.target.value))
                    if (prod) addProductItem(prod)
                    e.target.value = ""
                  }}>
                    <option value="">— Select Product —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                ) : (
                  <button className="inv-btn" onClick={addManualItem}><Plus size={14} /> Manual</button>
                )}
              </div>
            </div>

            {items.length > 0 && (
              <div className="inv-card">
                <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Items</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: 8 }}>Product/Desc</th>
                        <th style={{ textAlign: "center", padding: 8, width: 80 }}>Qty</th>
                        <th style={{ textAlign: "right", padding: 8, width: 100 }}>Price</th>
                        <th style={{ textAlign: "right", padding: 8, width: 100 }}>Total</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: 8 }}>
                            {item.product_id ? (
                              <span style={{ fontWeight: 600 }}>{item.product_name || item.description}</span>
                            ) : (
                              <input className="inv-input" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Description" />
                            )}
                          </td>
                          <td style={{ padding: 8, textAlign: "center" }}>
                            <input className="inv-input" type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} style={{ width: 80, textAlign: "center" }} />
                          </td>
                          <td style={{ padding: 8, textAlign: "right" }}>
                            <input className="inv-input" type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} style={{ width: 100, textAlign: "right" }} />
                          </td>
                          <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>PKR {item.total.toLocaleString()}</td>
                          <td style={{ padding: 8 }}>
                            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }} onClick={() => removeItem(idx)}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="inv-summary-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Total Return</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <button className="inv-btn" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={saving}>
              {saving ? "Posting..." : "💾 POST Return"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading return form...</div>}>
      <NewSalesReturnPageContent />
    </Suspense>
  )
}