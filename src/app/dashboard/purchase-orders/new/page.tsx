"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Search, X, Save, CheckCircle,
  Upload, FileText, Download, RefreshCw
} from "lucide-react"
import { usePlan } from "@/contexts/PlanContext"

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const supplierRef = useRef<HTMLDivElement>(null)

  const [poDate, setPoDate] = useState(new Date().toISOString().split("T")[0])
  const [expectedDelivery, setExpectedDelivery] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)
  const [refreshingSuppliers, setRefreshingSuppliers] = useState(false)

  // Document attachments
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load data ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      loadSuppliers(cid)
      setLoading(false)
    })
  }, [])

  // If editing, load existing PO
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.from("purchase_orders")
      .select("*, items:purchase_order_items(*)")
      .eq("id", editId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setPoDate(data.date)
        setExpectedDelivery(data.expected_delivery || "")
        setNotes(data.notes || "")
        setSupplierId(data.supplier_id)
        const supp = suppliers.find(s => s.id === data.supplier_id)
        if (supp) { setSelectedSupplier(supp); setSupplierSearch(supp.name) }
        const loadedItems = (data.items || []).map((item: any) => ({
          id: item.id,
          description: item.description || "",
          qty: item.qty,
          unit_price: item.unit_price,
          total: item.total,
          product_id: item.product_id || null,
        }))
        setItems(loadedItems)
      })
  }, [editId, companyId, suppliers])

  const loadSuppliers = (cid?: string) => {
    const targetId = cid || companyId
    if (!targetId) return
    supabase.from("suppliers")
      .select("id,code,name,phone,balance")
      .eq("company_id", targetId)
      .order("name")
      .then(r => { if (r.data) setSuppliers(r.data) })
  }

  const refreshSuppliers = () => {
    setRefreshingSuppliers(true)
    loadSuppliers()
    setTimeout(() => setRefreshingSuppliers(false), 500)
  }

  // Supplier search/filter
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.code.toLowerCase().includes(supplierSearch.toLowerCase())
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
  }

  // ── Items ──
  const addItem = () => {
    setItems([...items, { description: "", qty: 1, unit_price: 0, total: 0, product_id: null }])
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

  const totalAmount = items.reduce((s, i) => s + (i.total || 0), 0)

  // ── Attachments ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachmentFiles(Array.from(e.target.files))
    }
  }

  // ── Save ──
  const handleSubmit = async () => {
    if (!supplierId) { setError("Please select a supplier"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    setSaving(true); setError("")

    const poData = {
      company_id: companyId,
      supplier_id: supplierId,
      po_no: "",
      date: poDate,
      expected_delivery: expectedDelivery || null,
      notes,
      items: items.map(i => ({
        id: i.id || undefined, // for update
        description: i.description,
        qty: i.qty,
        unit_price: i.unit_price,
        total: i.total,
        product_id: i.product_id || null,
      })),
    }

    const formData = new FormData()
    formData.append("data", JSON.stringify(poData))
    attachmentFiles.forEach(file => formData.append("files", file))

    const url = editId ? `/api/purchase-orders?id=${editId}` : "/api/purchase-orders"
    const method = editId ? "PUT" : "POST"

    try {
      const res = await fetch(url, { method, body: formData })
      const result = await res.json()
      if (result.success) {
        setFlash(`✅ Purchase Order ${editId ? "updated" : "saved"} as Draft`)
        loadSuppliers()
        if (editId) {
          router.push(`/dashboard/purchase-orders/${editId}`)
        } else {
          setItems([])
          clearSupplier()
          setPoDate(new Date().toISOString().split("T")[0])
          setExpectedDelivery("")
          setNotes("")
          setAttachmentFiles([])
        }
      } else {
        setError(result.error || "Failed to save PO")
      }
    } catch {
      setError("Network error")
    }
    setSaving(false)
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

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading form…</div>
  }

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { max-width: 100%; margin: 0 auto; }
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
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s; white-space: nowrap;
        }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }

        .inv-item-row {
          display: grid;
          grid-template-columns: 2fr 70px 100px 100px 30px;
          gap: 6px; align-items: center; padding: 6px 0;
          border-bottom: 1px solid var(--border);
        }
        .inv-item-header {
          display: grid;
          grid-template-columns: 2fr 70px 100px 100px 30px;
          gap: 6px; font-size: 9px; font-weight: 700;
          text-transform: uppercase; color: var(--text-muted); padding-bottom: 6px;
        }

        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
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

        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/purchase-orders")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">{editId ? "✏️ Edit Purchase Order" : "📋 New Purchase Order"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>Supplier → Items → Save as Draft (approval required)</div>
          </div>
          <button className="inv-btn" onClick={() => router.push("/dashboard/purchase-orders")}>View List</button>
        </div>

        {error && (
          <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}
        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        <div className="header-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <label className="inv-label">Supplier *</label>
              <div className="cust-wrap" ref={supplierRef}>
                {selectedSupplier ? (
                  <div className="cust-selected-badge" onClick={clearSupplier}>
                    <span>🚚</span><span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                    <button style={{ marginLeft: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clearSupplier(); }}><X size={14} /></button>
                    <button style={{ marginLeft: 2, background: "none", border: "none", color: "var(--primary)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); refreshSuppliers(); }} title="Refresh"><RefreshCw size={13} /></button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} style={{ position: "absolute", left: 10, color: "var(--text-muted)" }} />
                      <input
                        className="inv-input"
                        style={{ paddingLeft: 32, paddingRight: 32 }}
                        placeholder="Search by name or code..."
                        value={supplierSearch}
                        onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true) }}
                        onFocus={() => setShowSupplierList(true)}
                        onClick={() => setShowSupplierList(true)}
                        autoComplete="off"
                      />
                      {supplierSearch && <button onClick={() => setSupplierSearch("")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={13} /></button>}
                    </div>
                    {showSupplierList && (
                      <div className="cust-dropdown">
                        {filteredSuppliers.length === 0 ? (
                          <div style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 13 }}>No suppliers found</div>
                        ) : (
                          filteredSuppliers.map(s => (
                            <div key={s.id} className="cust-option" onMouseDown={() => selectSupplier(s)}>
                              <div>
                                <div className="cust-option-name">{s.name}</div>
                                <div className="cust-option-meta">{s.code}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="inv-row" style={{ marginTop: 14 }}>
                <div><label className="inv-label">PO Date *</label><input className="inv-input" type="date" value={poDate} onChange={e => setPoDate(e.target.value)} /></div>
                <div><label className="inv-label">Expected Delivery</label><input className="inv-input" type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} /></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label className="inv-label">Notes</label>
                <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes" />
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="inv-label">Attach Documents</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="inv-btn" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} /> Choose Files
                  </button>
                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                  />
                  {attachmentFiles.length > 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {attachmentFiles.length} file(s) selected
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Items</span>
                <button className="inv-btn" onClick={addItem}><Plus size={14} /> Add Item</button>
              </div>
              {items.length > 0 && (
                <div className="inv-card" style={{ overflowX: "auto", padding: "16px 12px" }}>
                  <div className="inv-item-header">
                    <span>Description</span>
                    <span>Qty</span>
                    <span>Price</span>
                    <span style={{ textAlign: "right" }}>Total</span>
                    <span></span>
                  </div>
                  {items.map((item, idx) => (
                    <div key={idx} className="inv-item-row">
                      <input className="inv-input" style={{ height: 34, fontSize: 12 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Item description" />
                      <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                      <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                      <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>PKR {(item.total || 0).toLocaleString()}</span>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 2 }} onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px 0" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600 }}>
                <span>Total</span>
                <span>PKR {totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button
                className="inv-btn inv-btn-primary"
                style={{ justifyContent: "center", padding: 10, width: "100%" }}
                onClick={handleSubmit}
                disabled={saving}
              >
                <Save size={14} /> {saving ? "Saving..." : editId ? "💾 Update PO" : "💾 Save as Draft"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}