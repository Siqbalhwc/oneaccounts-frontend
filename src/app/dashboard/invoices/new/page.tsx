"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Send, Search, X, Download, CheckCircle,
  Image as ImageIcon, RefreshCw,
} from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"

export default function NewInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
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
  const [productSearch, setProductSearch] = useState("")
  const [showProductList, setShowProductList] = useState(false)

  // ── Price History state ──────────────────────────────────────────────
  const [priceHistory, setPriceHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [lastSelectedProduct, setLastSelectedProduct] = useState<any>(null)

  // ── Customer refresh indicator ────────────────────────────────────────
  const [refreshingCustomers, setRefreshingCustomers] = useState(false)

  // ── 1. Load company ID, customers, and products ONCE ─────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Always load customers
      supabase.from("customers")
        .select("id,code,name,phone,balance,country_code")
        .eq("company_id", cid)
        .order("name")
        .then(r => {
          if (r.data) setCustomers(r.data)
          else setCustomers([])
        })

      // Always load active products (exclude soft‑deleted)
      supabase.from("products")
        .select("id,code,name,sale_price,cost_price,qty_on_hand,image_path")
        .is("deleted_at", null)                    // ← filter soft‑deleted
        .order("name")
        .then(r => r.data && setProducts(r.data))

      setLoading(false)
    })
  }, [])

  // ── 2. If editing, load the existing invoice data AFTER customers/products are ready ──
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.from("invoices")
      .select("*")
      .eq("id", editId)
      .eq("company_id", companyId)
      .single()
      .then(({ data: bill }) => {
        if (!bill) return
        setCustomerId(bill.party_id)
        const cust = customers.find((s: any) => s.id === bill.party_id)
        if (cust) { setSelectedCustomer(cust); setCustomerSearch(cust.name) }
        setInvoiceDate(bill.date)
        setDueDate(bill.due_date)
        setReference(bill.reference || "")
        setNotes(bill.notes || "")

        supabase.from("invoice_items")
          .select("*")
          .eq("invoice_id", bill.id)
          .order("id")
          .then(({ data: itemsData }) => {
            if (itemsData) {
              const loaded = itemsData.map((item: any) => ({
                product_id: item.product_id,
                description: item.description,
                product_name: "",
                product_image: null,
                qty: item.qty,
                unit_price: item.unit_price,
                cost_price: item.cost_price || 0,
                total: item.total,
              }))
              setItems(loaded)
            }
          })
      })
  }, [editId, companyId, customers])

  // ── Reload customers (preserves search) ─────────────────────────────
  const refreshCustomers = () => {
    if (!companyId) return
    setRefreshingCustomers(true)
    supabase.from("customers")
      .select("id,code,name,phone,balance,country_code")
      .eq("company_id", companyId)
      .order("name")
      .then(r => {
        if (r.data) setCustomers(r.data)
        setRefreshingCustomers(false)
        // Update selected customer balance if present
        if (selectedCustomer) {
          const updated = r.data?.find((c: any) => c.id === selectedCustomer.id)
          if (updated) setSelectedCustomer(updated)
        }
      })
  }

  // ── Customer helpers ───────────────────────────────────────────────────
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
  }

  // ── Product / Item management ─────────────────────────────────────────
  const filteredProducts = products.filter((p: any) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  )

  // Safe price history fetch (two‑step)
  const fetchPriceHistory = async (productId: number, custId: number) => {
    // Step 1: get invoice_items for this product (limited)
    const { data: items } = await supabase
      .from("invoice_items")
      .select("id, invoice_id, unit_price")
      .eq("product_id", productId)
      .order("id", { ascending: false })
      .limit(20)

    if (!items || items.length === 0) {
      setPriceHistory([])
      setShowHistory(true)
      return
    }

    const invoiceIds = [...new Set(items.map((i: any) => i.invoice_id))]

    // Step 2: fetch only invoices belonging to this customer
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, date")
      .in("id", invoiceIds)
      .eq("party_id", custId)

    if (!invoices || invoices.length === 0) {
      setPriceHistory([])
      setShowHistory(true)
      return
    }

    const invMap: Record<number, any> = {}
    invoices.forEach((inv: any) => { invMap[inv.id] = inv })

    const history = items
      .filter((item: any) => invMap[item.invoice_id])
      .map((item: any) => ({
        unit_price: item.unit_price,
        invoice_no: invMap[item.invoice_id].invoice_no,
        date: invMap[item.invoice_id].date,
      }))
      .slice(0, 5)

    setPriceHistory(history)
    setShowHistory(true)
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
    setProductSearch("")
    setShowProductList(false)

    setLastSelectedProduct(prod)
    if (customerId) {
      fetchPriceHistory(prod.id, customerId)
    } else {
      setShowHistory(false)
    }
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

  // ── Invoice number generation ─────────────────────────────────────────
  const getNextInvoiceNo = async (custCode: string): Promise<string> => {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_no")
      .like("invoice_no", `${custCode}-%`)
      .eq("type", "sale")
      .order("invoice_no", { ascending: false }).limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const last = data[0].invoice_no
      const match = last.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    return `${custCode}-${String(nextNum).padStart(2, "0")}`
  }

  const totalAmount = items.reduce((s, i) => s + i.total, 0)

  // ── WhatsApp link ─────────────────────────────────────────────────────
  const waLink = () => {
    if (!selectedCustomer) return ""
    const code = (selectedCustomer.country_code || "+92").replace(/\D/g, "")
    const phone = (selectedCustomer.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${selectedCustomer.name},\n\nYour invoice of PKR ${totalAmount.toLocaleString()} is ready.\nDate: ${invoiceDate}\nDue: ${dueDate}\n\nThank you.\n— OneAccounts`
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!customerId) { setError("Please select a customer"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    setSaving(true); setError("")
    const custCode = selectedCustomer?.code || "CUST"
    const invoiceNo = editId ? selectedCustomer?.code + "-EDIT" : await getNextInvoiceNo(custCode)

    const url = editId ? `/api/invoices?id=${editId}` : "/api/invoices"
    const method = editId ? "PUT" : "POST"

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId || undefined,
          invoice_no: invoiceNo,
          party_id: customerId,
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
        setError(result.error || "Failed to save invoice")
        setSaving(false)
        return
      }

      setFlash(`✅ Invoice ${editId ? "updated" : "saved"} successfully!`)
      if (editId) {
        router.push(`/dashboard/invoices/${editId}`)
      } else {
        setSaving(false)
        setTimeout(() => {
          setFlash(null)
          setItems([])
          clearCustomer()
          setReference("")
          setNotes("")
        }, 2000)
      }
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  const handleBeforeSavePdf = () => {
    if (!selectedCustomer) return
    const pdfData = {
      companyName: "OneAccounts",
      invoiceNo: "PREVIEW",
      date: invoiceDate,
      dueDate: dueDate,
      customerName: selectedCustomer.name || "Customer",
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
    doc.save(`invoice-preview.pdf`)
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
    return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", background: "#0B1120", minHeight: "100vh" }}>Loading invoice form…</div>
  }

  return (
    <div style={{ padding: "16px", background: "#0B1120", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .inv-shell { max-width: 1200px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #F1F5F9; }
        .inv-card {
          background: #111827; border-radius: 12px; border: 1px solid #1E293B;
          padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          margin-bottom: 12px;
        }
        .inv-label {
          font-size: 10px; font-weight: 600; color: #94A3B8;
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;
        }
        .inv-input, .inv-select {
          width: 100%; height: 38px; border: 1.5px solid #334155;
          border-radius: 8px; padding: 0 12px; font-size: 13px;
          font-family: inherit; background: #1E293B; color: #F1F5F9; outline: none; box-sizing: border-box;
        }
        .inv-input:focus, .inv-select:focus { border-color: #64748B; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; border: none;
          font-family: inherit; transition: all 0.15s; white-space: nowrap;
        }
        .inv-btn-primary { background: #1E3A8A; color: white; }
        .inv-btn-primary:hover { background: #1E40AF; }
        .inv-btn-outline { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
        .inv-btn-outline:hover { background: #1E293B; }
        .inv-btn-success { background: #25D366; color: white; }

        .inv-item-row {
          display: grid;
          grid-template-columns: 30px 150px 3fr 70px 90px 90px auto 30px;
          gap: 6px; align-items: center; padding: 6px 0;
          border-bottom: 1px solid #1E293B;
        }
        .inv-item-header {
          display: grid;
          grid-template-columns: 30px 150px 3fr 70px 90px 90px auto 30px;
          gap: 6px; font-size: 9px; font-weight: 700;
          text-transform: uppercase; color: #94A3B8; padding-bottom: 6px;
        }

        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: #111827; border: 1.5px solid #334155; border-radius: 10px;
          max-height: 220px; overflow-y: auto; z-index: 100;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .cust-option {
          padding: 8px 12px; cursor: pointer;
          border-bottom: 1px solid #1E293B;
          display: flex; justify-content: space-between; align-items: center;
        }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: #1E293B; }
        .cust-option-name { font-size: 13px; font-weight: 600; color: #F1F5F9; }
        .cust-option-meta { font-size: 11px; color: #94A3B8; margin-top: 2px; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: #93C5FD; white-space: nowrap; }
        .cust-selected-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: #1E293B; border: 1.5px solid #334155;
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
          font-weight: 600; color: #F1F5F9; width: 100%; cursor: pointer;
        }

        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }

        .price-history {
          background: #1E293B; border-radius: 8px; padding: 10px 14px;
          margin-top: 12px; font-size: 12px;
        }
        .price-history-item {
          display: flex; justify-content: space-between; padding: 4px 0;
          border-bottom: 1px solid #334155;
        }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/invoices")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">{editId ? "✏️ Edit Sales Invoice" : "🧾 New Sales Invoice"}</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>{editId ? "Modify invoice details and items" : "Create invoice with full accounting automation"}</div>
          </div>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/invoices")}>View List</button>
        </div>

        {error && <div style={{ background: "#1E293B", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && (
          <div style={{ background: "#064E3B", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        <div className="header-grid">
          {/* LEFT: Customer + Dates + Reference + Notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <label className="inv-label">Customer *</label>
              <div className="cust-wrap" ref={customerRef}>
                {selectedCustomer ? (
                  <div className="cust-selected-badge" onClick={clearCustomer} style={{ position: "relative", paddingRight: 40 }}>
                    <span>👤</span><span style={{ flex: 1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                    <button
                      className="cust-clear"
                      style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); clearCustomer(); }}
                    >
                      <X size={14} />
                    </button>
                    <button
                      className="cust-clear"
                      style={{ position: "absolute", right: 22, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#93C5FD", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); refreshCustomers(); }}
                      title="Refresh customer list"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} style={{ position: "absolute", left: 10, color: "#94A3B8" }} />
                      <input
                        className="inv-input"
                        style={{ paddingLeft: 32, paddingRight: 32 }}
                        placeholder="Search by name, code or phone..."
                        value={customerSearch}
                        onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                        onFocus={() => setShowCustomerList(true)}
                        onClick={() => setShowCustomerList(true)}
                        autoComplete="off"
                      />
                      {customerSearch && <button className="cust-clear" onClick={() => setCustomerSearch("")} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}><X size={13} /></button>}
                    </div>
                    {showCustomerList && (
                      <div className="cust-dropdown">
                        {filteredCustomers.length === 0 ? (
                          <div style={{ padding: "10px 14px", color: "#94A3B8", fontSize: 13 }}>No customers found</div>
                        ) : (
                          filteredCustomers.map(c => (
                            <div key={c.id} className="cust-option" onMouseDown={() => selectCustomer(c)}>
                              <div>
                                <div className="cust-option-name">{c.name}</div>
                                <div className="cust-option-meta">{c.code}{c.phone ? ` · ${c.phone}` : ""}</div>
                              </div>
                              <div className="cust-option-bal">PKR {(c.balance || 0).toLocaleString()}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="inv-row" style={{ marginTop: 14 }}>
                <div><label className="inv-label">Invoice Date *</label><input className="inv-input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
                <div><label className="inv-label">Due Date</label><input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              </div>
              <div className="inv-row" style={{ marginTop: 10 }}>
                <div><label className="inv-label">Reference</label><input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Customer PO #" /></div>
                <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" /></div>
              </div>

              {/* Product search + manual */}
              <div style={{ marginTop: 14 }}>
                <label className="inv-label">Add Product</label>
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
                      <input
                        className="inv-input"
                        style={{ paddingLeft: 36 }}
                        placeholder="Search product..."
                        value={productSearch}
                        onChange={e => { setProductSearch(e.target.value); setShowProductList(true) }}
                        onFocus={() => setShowProductList(true)}
                        onBlur={() => setTimeout(() => setShowProductList(false), 200)}
                      />
                    </div>
                    <button className="inv-btn inv-btn-outline" onClick={addManualItem}><Plus size={14} /> Manual</button>
                  </div>
                  {showProductList && (
                    <div className="cust-dropdown" style={{ marginTop: 4 }}>
                      {filteredProducts.map((p: any) => (
                        <div key={p.id} className="cust-option" onMouseDown={() => addProductItem(p)}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {p.image_path && <img src={p.image_path} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />}
                            <div>
                              <div className="cust-option-name">{p.code} - {p.name}</div>
                              <div className="cust-option-meta">PKR {p.sale_price} | Stock: {p.qty_on_hand}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredProducts.length === 0 && (
                        <div style={{ padding: 12, color: "#94A3B8", fontSize: 12 }}>No products found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Price History Panel */}
              {showHistory && lastSelectedProduct && (
                <div className="price-history">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "#F1F5F9" }}>📋 Price history for {lastSelectedProduct.name}</span>
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }} onClick={() => setShowHistory(false)}>
                      <X size={14} />
                    </button>
                  </div>
                  {priceHistory.length > 0 ? (
                    priceHistory.map((h: any, i: number) => (
                      <div key={i} className="price-history-item">
                        <span>{h.invoice_no} - {h.date}</span>
                        <span style={{ fontWeight: 600 }}>PKR {h.unit_price.toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#94A3B8", fontSize: 12 }}>No previous sales to this customer</div>
                  )}
                </div>
              )}
            </div>

            {/* Change History when editing */}
            {editId && (
              <div className="inv-card">
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>📝 Change History</h3>
                <RecordHistory tableName="invoices" recordId={editId} />
              </div>
            )}
          </div>

          {/* RIGHT: Summary & Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Total</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button className="inv-btn inv-btn-primary" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={saving}>
                {saving ? "Posting..." : editId ? "💾 UPDATE Invoice" : "💾 POST Invoice"}
              </button>
              <button className="inv-btn inv-btn-outline" style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }} onClick={handleBeforeSavePdf}>
                <Download size={14} /> PDF Preview
              </button>
              {selectedCustomer && waLink() && (
                <a href={waLink()} target="_blank" rel="noopener noreferrer" className="inv-btn inv-btn-success" style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%", textDecoration: "none" }}>
                  <Send size={14} /> WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Items table – full width */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9" }}>Items</span>
          </div>
          {items.length > 0 && (
            <div className="inv-card" style={{ overflowX: "auto", padding: "16px 12px" }}>
              <div className="inv-item-header">
                <span></span>
                <span>Product</span>
                <span>Description</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Cost</span>
                <span style={{ textAlign: "right" }}>Total</span>
                <span></span>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="inv-item-row">
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {item.product_image ? (
                      <img src={item.product_image} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />
                    ) : (
                      <ImageIcon size={14} color="#94A3B8" />
                    )}
                  </div>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.product_name || "—"}
                  </span>
                  <input
                    className="inv-input"
                    style={{ height: 34, fontSize: 12 }}
                    value={item.description}
                    onChange={e => updateItem(idx, "description", e.target.value)}
                    placeholder="Description / product name"
                  />
                  <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                  <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                  <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} type="number" value={item.cost_price} onChange={e => updateItem(idx, "cost_price", Number(e.target.value))} />
                  <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                    PKR {item.total.toLocaleString()}
                  </span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 2 }} onClick={() => removeItem(idx)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}