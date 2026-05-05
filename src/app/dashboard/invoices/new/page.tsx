"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, Send, Search, X, Download } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import { usePlan } from "@/contexts/PlanContext"

const SALARY_RATE = 0.04
const ADS_RATE    = 0.005
const FUEL_RATE   = 0.005
const PARTNERS: Record<string, [string, number]> = {
  "3101": ["Profit A",     0.05],
  "3102": ["Profit BA",    0.05],
  "3103": ["Profit AM",    0.05],
  "3104": ["Profit MA",    0.05],
  "3106": ["Profit Owner", 0.80],
}

export default function NewInvoicePage() {
  const router  = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { hasFeature } = usePlan()
  const automationEnabled = hasFeature('invoice_automation')
  const profitAllocEnabled = hasFeature('profit_allocation')

  const [customers,            setCustomers]            = useState<any[]>([])
  const [products,             setProducts]             = useState<any[]>([])
  const [customerId,           setCustomerId]           = useState<number | null>(null)
  const [customerSearch,       setCustomerSearch]       = useState("")
  const [showCustomerList,     setShowCustomerList]     = useState(false)
  const [selectedCustomer,     setSelectedCustomer]     = useState<any>(null)
  const customerRef                                      = useRef<HTMLDivElement>(null)
  const [invoiceDate,          setInvoiceDate]          = useState(new Date().toISOString().split("T")[0])
  const [dueDate,              setDueDate]              = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
  const [reference,            setReference]            = useState("")
  const [notes,                setNotes]                = useState("")
  const [items,                setItems]                = useState<any[]>([])
  const [loading,              setLoading]              = useState(false)
  const [error,                setError]                = useState("")
  const [successInvoice,       setSuccessInvoice]       = useState<any>(null)
  const [productSearch,        setProductSearch]        = useState("")
  const [showProductList,      setShowProductList]      = useState(false)
  const [priceHistory,         setPriceHistory]         = useState<any[]>([])
  const [showHistory,          setShowHistory]          = useState(false)
  const [lastSelectedProduct,  setLastSelectedProduct]  = useState<any>(null)

  useEffect(() => {
    supabase.from("customers").select("id,code,name,phone,balance").order("name").then(r => r.data && setCustomers(r.data))
    supabase.from("products").select("id,code,name,sale_price,cost_price,qty_on_hand").order("name").then(r => r.data && setProducts(r.data))
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

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

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  )

  // ⭐ FIXED: Safe two‑step price history fetch (no embedded resource)
  const fetchPriceHistory = async (productId: number, custId: number) => {
    // 1. Get all invoice_items for this product
    const { data: items } = await supabase
      .from("invoice_items")
      .select("unit_price, invoice_id")
      .eq("product_id", productId)

    if (!items || items.length === 0) {
      setPriceHistory([])
      setShowHistory(true)
      return
    }

    const invoiceIds = [...new Set(items.map((i: any) => i.invoice_id))]

    // 2. Fetch those invoices and keep only the ones belonging to this customer
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, date")
      .in("id", invoiceIds)
      .eq("party_id", custId)
      .order("date", { ascending: false })
      .limit(5)

    if (!invoices || invoices.length === 0) {
      setPriceHistory([])
      setShowHistory(true)
      return
    }

    // 3. Merge unit_price from the items
    const invoiceMap = new Map(invoices.map((inv: any) => [inv.id, inv]))
    const history = items
      .filter((i: any) => invoiceMap.has(i.invoice_id))
      .map((i: any) => ({
        unit_price: i.unit_price,
        invoice_no: invoiceMap.get(i.invoice_id)!.invoice_no,
        date: invoiceMap.get(i.invoice_id)!.date,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)

    setPriceHistory(history)
    setShowHistory(true)
  }

  const addItem = (prod: any) => {
    setItems([...items, {
      product_id: prod.id,
      description: `${prod.code} - ${prod.name}`,
      qty: 1,
      unit_price: prod.sale_price,
      cost_price: prod.cost_price,
      total: prod.sale_price,
    }])
    setProductSearch("")
    setShowProductList(false)
    setLastSelectedProduct(prod)
    if (customerId) fetchPriceHistory(prod.id, customerId)
  }

  const addManualItem = () => {
    setItems([...items, { product_id: null, description: "Manual Item", qty: 1, unit_price: 0, cost_price: 0, total: 0 }])
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

  const generateInvoiceNo = () => {
    const cust = customers.find(c => c.id === customerId)
    return cust ? `${cust.code}-01` : `INV-${Date.now().toString(36).toUpperCase()}`
  }

  const totalAmount   = items.reduce((s, i) => s + i.total, 0)
  const totalCost     = items.reduce((s, i) => s + (i.qty * i.cost_price), 0)
  const totalSalary   = automationEnabled ? totalAmount * SALARY_RATE : 0
  const totalAds      = automationEnabled ? totalAmount * ADS_RATE : 0
  const totalFuel     = automationEnabled ? totalAmount * FUEL_RATE : 0
  const totalExpenses = totalSalary + totalAds + totalFuel
  const netProfit     = totalAmount - totalCost - totalExpenses

  const handleSubmit = async () => {
    if (!customerId)       { setError("Please select a customer"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    for (const item of items) {
      if (!item.product_id) continue
      const prod = products.find(p => p.id === item.product_id)
      if (prod && item.qty > (prod.qty_on_hand || 0)) {
        setError(`Not enough stock for ${prod.name}. Available: ${prod.qty_on_hand || 0}, Requested: ${item.qty}`)
        return
      }
    }

    setLoading(true); setError("")

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_no:   generateInvoiceNo(),
          party_id:     customerId,
          invoice_date: invoiceDate,
          due_date:     dueDate,
          items: items.map(i => ({
            product_id: i.product_id, description: i.description,
            qty: i.qty, unit_price: i.unit_price, cost_price: i.cost_price,
          })),
          reference,
          notes,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to create invoice")
        setLoading(false)
        return
      }

      setSuccessInvoice({
        id: result.invoice_id,
        invoice_no: result.invoice?.invoice_no || generateInvoiceNo(),
        total: result.invoice?.total || totalAmount,
        date: result.invoice?.date || invoiceDate,
        customers: selectedCustomer || null,
      })
      setLoading(false)
    } catch (e: any) {
      setError("Network error. Please try again.")
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!successInvoice) return
    const { data: itemsData } = await supabase.from("invoice_items").select("*").eq("invoice_id", successInvoice.id)
    const doc = generateInvoicePDF(successInvoice, itemsData || [])
    doc.save(`invoice-${successInvoice.invoice_no}.pdf`)
  }

  const waLink = () => {
    const cust = successInvoice?.customers || selectedCustomer
    if (!cust?.phone) return ""
    const msg = `Assalam-u-Alaikum ${cust.name},\nInvoice ${successInvoice?.invoice_no || ''} of PKR ${totalAmount.toLocaleString()} is ready.\nDue date: ${dueDate}.\nKindly arrange payment. JazakAllah Khair.\n– OneAccounts by Siqbal`
    return `https://wa.me/92${cust.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`
  }

  const handleBeforeSavePdf = () => {
    const tempInvoice = {
      invoice_no: generateInvoiceNo(),
      date: invoiceDate,
      due_date: dueDate,
      customers: customers.find(c => c.id === customerId) || {},
    }
    const doc = generateInvoicePDF(tempInvoice, items)
    doc.save(`invoice-preview-${tempInvoice.invoice_no}.pdf`)
  }

  // ── UI ────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 1200px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .inv-card {
          background: white;
          border-radius: 12px;
          border: 1px solid #E5EAF2;
          padding: 16px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .inv-label {
          font-size: 10px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 4px;
          display: block;
        }
        .inv-input {
          width: 100%;
          height: 38px;
          border: 1.5px solid #E5EAF2;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          font-family: inherit;
          background: #FAFBFF;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; border: none;
          font-family: inherit; transition: all 0.15s; white-space: nowrap;
        }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E5EAF2; color: #475569; }
        .inv-btn-danger { background: #EF4444; color: white; }
        .inv-btn-success { background: #25D366; color: white; }
        .inv-btn-sm { padding: 4px 8px; font-size: 11px; }
        .inv-item-row {
          display: grid; grid-template-columns: 1fr 65px 80px 65px 40px;
          gap: 8px; align-items: center; padding: 6px 0;
          border-bottom: 1px solid #F1F5F9;
        }
        .inv-item-header {
          display: grid; grid-template-columns: 1fr 65px 80px 65px 40px;
          gap: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase;
          color: #94A3B8; padding-bottom: 6px;
        }
        .inv-summary-row {
          display: flex; justify-content: space-between;
          padding: 5px 0; font-size: 13px;
        }
        .inv-summary-row.bold {
          font-weight: 700; font-size: 14px;
          border-top: 2px solid #E2E8F0; padding-top: 8px; margin-top: 4px;
        }
        .inv-profit { color: #10B981; }
        .inv-loss { color: #EF4444; }
        .inv-price-history {
          background: #F8FAFC; border-radius: 8px;
          padding: 10px 14px; margin-top: 8px; font-size: 12px;
        }
        .inv-price-history-item {
          display: flex; justify-content: space-between;
          padding: 4px 0; border-bottom: 1px solid #E2E8F0;
        }
        .inv-grid {
          display: grid; grid-template-columns: 1fr 300px;
          gap: 16px; align-items: start;
        }
        @media (max-width: 900px) {
          .inv-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .inv-row { grid-template-columns: 1fr; }
          .inv-item-row, .inv-item-header { grid-template-columns: 1fr 60px 70px 40px; }
        }

        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-search-icon { position: absolute; left: 10px; color: #94A3B8; pointer-events: none; }
        .cust-clear { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #94A3B8; display: flex; align-items: center; padding: 4px; border-radius: 4px; }
        .cust-clear:hover { color: #EF4444; background: #FEF2F2; }
        .cust-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: white; border: 1.5px solid #C7D2FE; border-radius: 10px;
          max-height: 220px; overflow-y: auto; z-index: 100;
          box-shadow: 0 8px 24px rgba(30,58,138,0.12);
        }
        .cust-option {
          padding: 8px 12px; cursor: pointer;
          border-bottom: 1px solid #F1F5F9;
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
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/invoices")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="inv-title">🧾 New Sales Invoice</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>
              {automationEnabled ? "Automation enabled – expenses & profit allocation will be posted" : "Plain invoice (no automation)"}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {successInvoice ? (
          <div className="inv-card" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <h3 style={{ color: "#15803D", marginBottom: 6 }}>✅ Invoice {successInvoice.invoice_no} posted!</h3>
            <p style={{ marginBottom: 10, fontSize: 14 }}>Total: PKR {successInvoice.total?.toLocaleString()}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleDownloadPDF} className="inv-btn inv-btn-primary"><Download size={14} /> Download PDF</button>
              {hasFeature('whatsapp_invoice') && waLink() && <a href={waLink()} target="_blank" className="inv-btn inv-btn-success" style={{ textDecoration: "none" }}><Send size={14} /> WhatsApp</a>}
              <button onClick={() => router.push("/dashboard/invoices")} className="inv-btn inv-btn-outline">View Invoices List</button>
              <button onClick={() => { setSuccessInvoice(null); setItems([]); setCustomerId(null); setSelectedCustomer(null); setCustomerSearch(""); setReference(""); setNotes("") }} className="inv-btn inv-btn-outline">Create Another</button>
            </div>
          </div>
        ) : (
          <div className="inv-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Customer & Dates */}
              <div className="inv-card">
                <label className="inv-label">Customer *</label>
                <div className="cust-wrap" ref={customerRef}>
                  {selectedCustomer ? (
                    <div className="cust-selected-badge" onClick={clearCustomer}>
                      <span>👤</span>
                      <span style={{ flex: 1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                      <span style={{ fontSize: 11, color: "#64748B" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                      <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearCustomer(); }}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="cust-input-row">
                        <Search size={14} className="cust-search-icon" style={{ position: "absolute", left: 10 }} />
                        <input
                          className="inv-input"
                          style={{ paddingLeft: 32, paddingRight: 32 }}
                          placeholder="Search by name, code or phone..."
                          value={customerSearch}
                          onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true) }}
                          onFocus={() => setShowCustomerList(true)}
                          autoComplete="off"
                        />
                        {customerSearch && (
                          <button className="cust-clear" onClick={() => setCustomerSearch("")}>
                            <X size={13} />
                          </button>
                        )}
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

                <div className="inv-row" style={{ marginTop: 10 }}>
                  <div>
                    <label className="inv-label">Invoice Date *</label>
                    <input className="inv-input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="inv-label">Due Date</label>
                    <input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="inv-row" style={{ marginTop: 10 }}>
                  <div>
                    <label className="inv-label">Reference</label>
                    <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="PO #" />
                  </div>
                  <div>
                    <label className="inv-label">Notes</label>
                    <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" />
                  </div>
                </div>
              </div>

              {/* Product Search */}
              <div className="inv-card">
                <label className="inv-label">Add Product</label>
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
                      <input
                        className="inv-input"
                        style={{ paddingLeft: 32 }}
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
                          style={{ padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}
                          onClick={() => { addItem(p); if (customerId) fetchPriceHistory(p.id, customerId) }}>
                          <span><strong>{p.code}</strong> — {p.name}</span>
                          <span style={{ color: "#64748B", fontSize: 12 }}>PKR {p.sale_price} | Stock: {p.qty_on_hand}</span>
                        </div>
                      ))}
                      {(productSearch ? filteredProducts : products).length === 0 && (
                        <div style={{ padding: 10, color: "#94A3B8", fontSize: 12 }}>No products found</div>
                      )}
                    </div>
                  )}
                </div>

                {showHistory && (
                  <div className="inv-price-history" style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>📋 Price history for {lastSelectedProduct?.name}</span>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }} onClick={() => setShowHistory(false)}><X size={14} /></button>
                    </div>
                    {priceHistory.length > 0
                      ? priceHistory.map((h: any, i: number) => (
                          <div key={i} className="inv-price-history-item">
                            <span>{h.invoice_no} — {h.date?.slice(0,10)}</span>
                            <span style={{ fontWeight: 600 }}>PKR {h.unit_price.toLocaleString()}</span>
                          </div>
                        ))
                      : <div style={{ color: "#94A3B8", fontSize: 12 }}>No previous sales to this customer</div>
                    }
                  </div>
                )}
              </div>

              {/* Items Table */}
              {items.length > 0 && (
                <div className="inv-card">
                  <div className="inv-item-header">
                    <span>Description</span><span>Qty</span><span>Price</span><span>Total</span><span></span>
                  </div>
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="inv-item-row">
                      <input className="inv-input" style={{ height: 34, fontSize: 12 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} />
                      <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                      <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                      <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>PKR {item.total.toLocaleString()}</span>
                      <button className="inv-btn inv-btn-danger inv-btn-sm" onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN (sticky summary) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
              <div className="inv-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 10 }}>Summary</h3>
                <div className="inv-summary-row">
                  <span>Subtotal</span><span>PKR {totalAmount.toLocaleString()}</span>
                </div>
                <div className="inv-summary-row">
                  <span>COGS</span><span>PKR {totalCost.toLocaleString()}</span>
                </div>
                {automationEnabled ? (
                  <>
                    <div className="inv-summary-row">
                      <span>Salary (4%)</span><span>PKR {totalSalary.toLocaleString()}</span>
                    </div>
                    <div className="inv-summary-row">
                      <span>Advertisement (0.5%)</span><span>PKR {totalAds.toLocaleString()}</span>
                    </div>
                    <div className="inv-summary-row">
                      <span>Fuel (0.5%)</span><span>PKR {totalFuel.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="inv-summary-row" style={{ color: "#94A3B8", fontStyle: "italic" }}>
                    <span>Expenses</span><span>Not applied</span>
                  </div>
                )}
                <div className="inv-summary-row bold">
                  <span>Net Profit</span>
                  <span className={netProfit >= 0 ? "inv-profit" : "inv-loss"}>PKR {netProfit.toLocaleString()}</span>
                </div>
                {automationEnabled && profitAllocEnabled && netProfit > 0 && (
                  <div style={{ marginTop: 10, padding: "10px", background: "#F0FDF4", borderRadius: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Profit Allocation:</div>
                    {Object.entries(PARTNERS).map(([code, value]) => {
                      const [name, share] = value as [string, number]
                      return (
                        <div key={code} className="inv-summary-row" style={{ fontSize: 12 }}>
                          <span>{name} ({(share * 100).toFixed(0)}%)</span>
                          <span>PKR {(netProfit * share).toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="inv-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="inv-btn inv-btn-primary" style={{ justifyContent: "center", padding: 10 }} onClick={handleSubmit} disabled={loading}>
                  {loading ? "Posting..." : "💾 POST Invoice"}
                </button>
                <button className="inv-btn inv-btn-outline" style={{ justifyContent: "center", padding: 9 }} onClick={handleBeforeSavePdf}>
                  <Download size={14} /> PDF Preview
                </button>
                {hasFeature('whatsapp_invoice') && waLink() && (
                  <a href={waLink()} target="_blank" className="inv-btn inv-btn-success" style={{ textDecoration: "none", justifyContent: "center", padding: 9 }}>
                    <Send size={14} /> WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}