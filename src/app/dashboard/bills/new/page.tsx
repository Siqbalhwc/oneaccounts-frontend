"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, Search, X, Download } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"

export default function NewBillPage() {
  const router  = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [suppliers,            setSuppliers]            = useState<any[]>([])
  const [products,             setProducts]             = useState<any[]>([])
  const [supplierId,           setSupplierId]           = useState<number | null>(null)
  const [supplierSearch,       setSupplierSearch]       = useState("")
  const [showSupplierList,     setShowSupplierList]     = useState(false)
  const [selectedSupplier,     setSelectedSupplier]     = useState<any>(null)
  const supplierRef                                     = useRef<HTMLDivElement>(null)
  const [billDate,             setBillDate]             = useState(new Date().toISOString().split("T")[0])
  const [dueDate,              setDueDate]              = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
  const [reference,            setReference]            = useState("")
  const [notes,                setNotes]                = useState("")
  const [items,                setItems]                = useState<any[]>([])
  const [loading,              setLoading]              = useState(false)
  const [error,                setError]                = useState("")
  const [successBill,          setSuccessBill]          = useState<any>(null)
  const [productSearch,        setProductSearch]        = useState("")
  const [showProductList,      setShowProductList]      = useState(false)

  useEffect(() => {
    supabase.from("suppliers").select("id,code,name,phone,balance").order("name")
      .then(r => r.data && setSuppliers(r.data))
    supabase.from("products").select("id,code,name,cost_price,qty_on_hand").order("name")
      .then(r => r.data && setProducts(r.data))
  }, [])

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
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  )

  const addItem = (prod: any) => {
    setItems([...items, {
      product_id: prod.id,
      description: `${prod.code} - ${prod.name}`,
      qty: 1,
      unit_price: prod.cost_price,   // purchase cost
      total: prod.cost_price,
    }])
    setProductSearch("")
    setShowProductList(false)
  }

  const addManualItem = () => {
    setItems([...items, { product_id: null, description: "Manual Item", qty: 1, unit_price: 0, total: 0 }])
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

  const generateBillNo = () => {
    const supp = suppliers.find(s => s.id === supplierId)
    return supp ? `${supp.code}-01` : `BILL-${Date.now().toString(36).toUpperCase()}`
  }

  const totalAmount = items.reduce((s, i) => s + i.total, 0)

  const handleSubmit = async () => {
    if (!supplierId)       { setError("Please select a supplier"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    setLoading(true); setError("")

    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_no: generateBillNo(),
          party_id:     supplierId,
          invoice_date: billDate,
          due_date:     dueDate,
          items: items.map(i => ({
            product_id: i.product_id, description: i.description,
            qty: i.qty, unit_price: i.unit_price,
          })),
          reference,
          notes,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to create bill")
        setLoading(false)
        return
      }

      setSuccessBill({
        id: result.bill_id,
        invoice_no: result.bill_no,
        total: totalAmount,
        date: billDate,
        suppliers: selectedSupplier || null,
      })
      setLoading(false)
    } catch (e: any) {
      setError("Network error. Please try again.")
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!successBill) return
    const { data: itemsData } = await supabase.from("invoice_items").select("*").eq("invoice_id", successBill.id)
    const doc = generateInvoicePDF(successBill, itemsData || [])
    doc.save(`bill-${successBill.invoice_no}.pdf`)
  }

  // ── UI ────────────────────────────────────────────────────
  return (
    <div style={{ padding: "clamp(16px,2.5vw,24px)", background: "#EFF4FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 900px; margin: 0 auto; }
        .inv-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 20px 24px; margin-bottom: 16px; }
        .inv-title { font-size: 20px; font-weight: 800; color: #1E293B; }
        .inv-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: block; }
        .inv-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .inv-btn-danger { background: #EF4444; color: white; }
        .inv-btn-success { background: #25D366; color: white; }
        .inv-btn-sm { padding: 5px 10px; font-size: 11px; }
        .inv-item-row { display: grid; grid-template-columns: 1fr 70px 90px 70px 40px; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid #F1F5F9; }
        .inv-item-header { display: grid; grid-template-columns: 1fr 70px 90px 70px 40px; gap: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; padding-bottom: 8px; }
        .inv-total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
        .inv-total-row.bold { font-weight: 700; font-size: 15px; border-top: 2px solid #E2E8F0; padding-top: 12px; }

        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-search-icon { position: absolute; left: 12px; color: #94A3B8; pointer-events: none; }
        .cust-clear { position: absolute; right: 10px; background: none; border: none; cursor: pointer; color: #94A3B8; display: flex; align-items: center; padding: 4px; border-radius: 4px; }
        .cust-clear:hover { color: #EF4444; background: #FEF2F2; }
        .cust-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: white; border: 1.5px solid #C7D2FE;
          border-radius: 10px; max-height: 240px; overflow-y: auto;
          z-index: 100; box-shadow: 0 8px 24px rgba(30,58,138,0.12);
        }
        .cust-option {
          padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #F1F5F9;
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

        @media (max-width: 600px) {
          .inv-row { grid-template-columns: 1fr; }
          .inv-item-row, .inv-item-header { grid-template-columns: 1fr 60px 70px 40px; }
        }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/bills")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="inv-title">📦 New Purchase Bill</div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>Record a supplier purchase – inventory will be increased</div>
          </div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {successBill ? (
          <div className="inv-card" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <h3 style={{ color: "#15803D", marginBottom: 8 }}>✅ Bill {successBill.invoice_no} posted!</h3>
            <p style={{ marginBottom: 12 }}>Total: PKR {successBill.total?.toLocaleString()}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleDownloadPDF} className="inv-btn inv-btn-primary"><Download size={14} /> Download PDF</button>
              <button onClick={() => router.push("/dashboard/bills")} className="inv-btn inv-btn-outline">View Bills List</button>
              <button onClick={() => { setSuccessBill(null); setItems([]); setSupplierId(null); setSelectedSupplier(null); setSupplierSearch(""); setReference(""); setNotes("") }} className="inv-btn inv-btn-outline">Create Another</button>
            </div>
          </div>
        ) : (
          <>
            {/* Supplier & Dates */}
            <div className="inv-card">
              <div className="inv-row">
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="inv-label">Supplier *</label>
                  <div className="cust-wrap" ref={supplierRef}>
                    {selectedSupplier ? (
                      <div className="cust-selected-badge" onClick={clearSupplier}>
                        <span>👤</span>
                        <span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                        <span style={{ fontSize: 11, color: "#64748B" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                        <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearSupplier(); }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="cust-input-row">
                          <Search size={14} className="cust-search-icon" style={{ position: "absolute", left: 12 }} />
                          <input
                            className="inv-input"
                            style={{ paddingLeft: 36, paddingRight: 36 }}
                            placeholder="Search by name, code or phone..."
                            value={supplierSearch}
                            onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true) }}
                            onFocus={() => setShowSupplierList(true)}
                            autoComplete="off"
                          />
                          {supplierSearch && (
                            <button className="cust-clear" onClick={() => setSupplierSearch("")}>
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        {showSupplierList && (
                          <div className="cust-dropdown">
                            {filteredSuppliers.length === 0 ? (
                              <div style={{ padding: "12px 14px", color: "#94A3B8", fontSize: 13 }}>No suppliers found</div>
                            ) : (
                              filteredSuppliers.map(s => (
                                <div key={s.id} className="cust-option" onMouseDown={() => selectSupplier(s)}>
                                  <div>
                                    <div className="cust-option-name">{s.name}</div>
                                    <div className="cust-option-meta">{s.code}{s.phone ? ` · ${s.phone}` : ""}</div>
                                  </div>
                                  <div className="cust-option-bal">
                                    PKR {(s.balance || 0).toLocaleString()}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="inv-label">Bill Date *</label>
                  <input className="inv-input" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
                </div>
                <div>
                  <label className="inv-label">Due Date</label>
                  <input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div>
                  <label className="inv-label">Reference</label>
                  <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Supplier Invoice #" />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label className="inv-label">Notes</label>
                <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" />
              </div>
            </div>

            {/* Add Product */}
            <div className="inv-card">
              <label className="inv-label">Add Product</label>
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
                    <input
                      className="inv-input"
                      style={{ paddingLeft: 36 }}
                      placeholder="Search product by name or code..."
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowProductList(true) }}
                      onFocus={() => setShowProductList(true)}
                      onBlur={() => setTimeout(() => setShowProductList(false), 200)}
                    />
                  </div>
                  <button className="inv-btn inv-btn-outline" onClick={addManualItem}><Plus size={14} /> Manual</button>
                </div>
                {showProductList && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #E2E8F0", borderRadius: 8, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", marginTop: 4 }}>
                    {(productSearch ? filteredProducts : products).map((p: any) => (
                      <div key={p.id}
                        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}
                        onClick={() => addItem(p)}>
                        <span><strong>{p.code}</strong> — {p.name}</span>
                        <span style={{ color: "#64748B", fontSize: 12 }}>Cost: PKR {p.cost_price} | Stock: {p.qty_on_hand}</span>
                      </div>
                    ))}
                    {(productSearch ? filteredProducts : products).length === 0 && (
                      <div style={{ padding: 12, color: "#94A3B8", fontSize: 12 }}>No products found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            {items.length > 0 && (
              <div className="inv-card">
                <div className="inv-item-header">
                  <span>Description</span><span>Qty</span><span>Price</span><span>Total</span><span></span>
                </div>
                {items.map((item: any, idx: number) => (
                  <div key={idx} className="inv-item-row">
                    <input className="inv-input" style={{ height: 36, fontSize: 12 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} />
                    <input className="inv-input" style={{ height: 36, fontSize: 12, textAlign: "center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                    <input className="inv-input" style={{ height: 36, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                    <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>PKR {item.total.toLocaleString()}</span>
                    <button className="inv-btn inv-btn-danger inv-btn-sm" onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            {items.length > 0 && (
              <div className="inv-card">
                <div className="inv-total-row"><span>Subtotal</span><span>PKR {totalAmount.toLocaleString()}</span></div>
                <div className="inv-total-row bold">
                  <span>Total</span><span>PKR {totalAmount.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            {items.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <button className="inv-btn inv-btn-primary" onClick={handleSubmit} disabled={loading}>
                  {loading ? "Posting..." : "💾 POST Bill"}
                </button>
                <button className="inv-btn inv-btn-outline" onClick={() => window.print()}>
                  <Download size={14} /> PDF Preview
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}