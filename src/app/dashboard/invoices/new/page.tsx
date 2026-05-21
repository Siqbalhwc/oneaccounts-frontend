"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Send, Search, X, Download, CheckCircle,
  Image as ImageIcon, RefreshCw, ExternalLink,
} from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"

// ── Helper: convert payment terms to days ──────────────────────────────
function getCreditDays(term?: string | null): number {
  if (!term) return 30
  const s = term.toLowerCase()
  if (s.includes("receipt")) return 0
  if (s.includes("net 7")) return 7
  if (s.includes("net 15")) return 15
  if (s.includes("net 30")) return 30
  if (s.includes("net 60")) return 60
  return 30
}

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
  const [company, setCompany] = useState<any>(null)

  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState("")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [showProductList, setShowProductList] = useState(false)

  const [priceHistory, setPriceHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [lastSelectedProduct, setLastSelectedProduct] = useState<any>(null)
  const [refreshingCustomers, setRefreshingCustomers] = useState(false)

  // For "View Invoice" after save
  const [savedInvoiceId, setSavedInvoiceId] = useState<number | null>(null)

  // ── Load master data ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("customers")
        .select("id,code,name,phone,balance,country_code,payment_terms")
        .eq("company_id", cid)
        .order("name")
        .then(r => { if (r.data) setCustomers(r.data) })

      supabase.from("products")
        .select("id,code,name,sale_price,cost_price,qty_on_hand,image_path")
        .is("deleted_at", null)
        .order("name")
        .then(r => r.data && setProducts(r.data))

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

      setLoading(false)
    })
  }, [])

  // ── If editing, load existing invoice ──
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

  // ── Auto‑due date ──
  useEffect(() => {
    if (!invoiceDate || !selectedCustomer) return
    const days = getCreditDays(selectedCustomer.payment_terms)
    const dt = new Date(invoiceDate)
    dt.setDate(dt.getDate() + days)
    setDueDate(dt.toISOString().split("T")[0])
  }, [invoiceDate, selectedCustomer])

  // ── Refresh price history when customer changes AND a product is selected ──
  useEffect(() => {
    if (customerId && lastSelectedProduct) {
      fetchPriceHistory(lastSelectedProduct.id, customerId)
    }
  }, [customerId])

  const refreshCustomers = () => {
    if (!companyId) return
    setRefreshingCustomers(true)
    supabase.from("customers")
      .select("id,code,name,phone,balance,country_code,payment_terms")
      .eq("company_id", companyId)
      .order("name")
      .then(r => {
        if (r.data) setCustomers(r.data)
        setRefreshingCustomers(false)
        if (selectedCustomer) {
          const updated = r.data?.find((c: any) => c.id === selectedCustomer.id)
          if (updated) setSelectedCustomer(updated)
        }
      })
  }

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

  const filteredProducts = products.filter((p: any) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  )

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
    if (customerId) fetchPriceHistory(prod.id, customerId)
    else setShowHistory(false)
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

  const fetchPriceHistory = async (productId: number, custId: number) => {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("id, invoice_id, unit_price")
      .eq("product_id", productId)
      .order("id", { ascending: false })
      .limit(20)
    if (!items || items.length === 0) { setPriceHistory([]); setShowHistory(true); return }
    const invoiceIds = [...new Set(items.map((i: any) => i.invoice_id))]
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, date")
      .in("id", invoiceIds)
      .eq("party_id", custId)
    if (!invoices || invoices.length === 0) { setPriceHistory([]); setShowHistory(true); return }
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

  const totalAmount = items.reduce((s, i) => s + i.total, 0)

  // ── Stock validation ──
  const validateStock = () => {
    for (const item of items) {
      if (item.product_id) {
        const product = products.find(p => p.id === item.product_id)
        if (product && item.qty > (product.qty_on_hand || 0)) {
          return `Insufficient stock for "${product.name}". Available: ${product.qty_on_hand}, requested: ${item.qty}.`
        }
      }
    }
    return null
  }

  const waLink = () => {
    if (!selectedCustomer) return ""
    const code = (selectedCustomer.country_code || "+92").replace(/\D/g, "")
    const phone = (selectedCustomer.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${selectedCustomer.name},\n\nYour invoice of PKR ${totalAmount.toLocaleString()} is ready.\nDate: ${invoiceDate}\nDue: ${dueDate}\n\nThank you.\n— OneAccounts`
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  // ── WhatsApp with PDF ──
  const handleWhatsAppWithPDF = async () => {
    if (!selectedCustomer) return
    const phone = (selectedCustomer.phone || "").replace(/\D/g, "")
    if (!phone) {
      alert("No phone number for this customer.")
      return
    }
    // Generate PDF
    const pdfData = {
      companyName: company?.name || company?.company_name || "OneAccounts",
      companyAddress: company?.address || "",
      companyPhone: company?.phone || "",
      companyEmail: company?.email || "",
      companyTagline: company?.tagline || "",
      logoUrl: company?.logo_url || null,
      businessType: company?.business_type || "",
      invoiceNo: "PREVIEW",
      date: invoiceDate,
      dueDate: dueDate,
      customerName: selectedCustomer.name || "Customer",
      customerPhone: selectedCustomer.phone || "",
      customerAddress: selectedCustomer.address || "",
      customerEmail: selectedCustomer.email || "",
      items: items.map(i => ({
        description: i.description || "",
        qty: i.qty || 0,
        unit_price: i.unit_price || 0,
        total: i.total || 0,
        image_path: i.product_image || null,
        product_id: i.product_id || null,
        product_name: i.product_name || "",
      })),
      subtotal: totalAmount,
      total: totalAmount,
    }
    const doc = await generateInvoicePDF(pdfData)
    const blob = doc.output("blob")
    // Upload to Supabase storage (public bucket "invoice-pdfs")
    const filePath = `invoices/${Date.now()}-${Math.random().toString(36).substr(2,5)}.pdf`
    try {
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("invoice-pdfs")
        .upload(filePath, blob, { contentType: "application/pdf", upsert: false })
      if (!uploadErr) {
        const { data: publicUrlData } = supabase.storage
          .from("invoice-pdfs")
          .getPublicUrl(filePath)
        const pdfLink = publicUrlData.publicUrl
        const msg = `Dear ${selectedCustomer.name},\n\nYour invoice PDF is ready.\nDownload: ${pdfLink}\n\nDate: ${invoiceDate}\nDue: ${dueDate}\n\nThank you.\n— OneAccounts`
        const waURL = `https://wa.me/${(selectedCustomer.country_code || "+92").replace(/\D/g, "")}${phone}?text=${encodeURIComponent(msg)}`
        window.open(waURL, "_blank")
        return
      }
    } catch (e) {
      console.warn("Upload failed, fallback to text only")
    }
    // Fallback: text only
    window.open(waLink(), "_blank")
  }

  const handleSubmit = async () => {
    if (!customerId) { setError("Please select a customer"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    // ── Stock check ──
    const stockError = validateStock()
    if (stockError) {
      setError(stockError)
      return
    }

    setSaving(true); setError("")

    const url = editId ? `/api/invoices?id=${editId}` : "/api/invoices"
    const method = editId ? "PUT" : "POST"

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId || undefined,
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

      const newInvoiceId = result.invoice?.id

      setFlash(`✅ Invoice ${editId ? "updated" : "saved"} successfully!`)
      setSavedInvoiceId(newInvoiceId || null)

      if (editId) {
        router.push(`/dashboard/invoices/${editId}`)
      } else {
        setSaving(false)
      }
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  const handleBeforeSavePdf = async () => {
    if (!selectedCustomer) return
    const pdfData = {
      companyName: company?.name || company?.company_name || "OneAccounts",
      companyAddress: company?.address || "",
      companyPhone: company?.phone || "",
      companyEmail: company?.email || "",
      companyTagline: company?.tagline || "",
      logoUrl: company?.logo_url || null,
      businessType: company?.business_type || "",
      invoiceNo: "PREVIEW",
      date: invoiceDate,
      dueDate: dueDate,
      customerName: selectedCustomer.name || "Customer",
      customerPhone: selectedCustomer.phone || "",
      customerAddress: selectedCustomer.address || "",
      customerEmail: selectedCustomer.email || "",
      items: items.map(i => ({
        description: i.description || "",
        qty: i.qty || 0,
        unit_price: i.unit_price || 0,
        total: i.total || 0,
        image_path: i.product_image || null,
        product_id: i.product_id || null,
        product_name: i.product_name || "",
      })),
      subtotal: totalAmount,
      total: totalAmount,
    }
    const doc = await generateInvoicePDF(pdfData)
    doc.save(`invoice-preview.pdf`)
  }

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
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading invoice form…</div>
  }

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
        /* Fix dark calendar */
        input[type="date"] {
          color-scheme: dark;
        }
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

        .inv-item-row {
          display: grid;
          grid-template-columns: 30px 150px 3fr 80px 110px 110px 110px 30px;
          gap: 6px; align-items: center; padding: 6px 0;
          border-bottom: 1px solid var(--border);
        }
        .inv-item-header {
          display: grid;
          grid-template-columns: 30px 150px 3fr 80px 110px 110px 110px 30px;
          gap: 6px; font-size: 9px; font-weight: 700;
          text-transform: uppercase; color: var(--text-muted); padding-bottom: 6px;
        }

        .inv-cell {
          height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px; font-size: 13px;
          font-family: inherit; background: var(--bg); color: var(--text);
          display: flex; align-items: center; box-sizing: border-box;
          overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
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
        .cust-option-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: var(--primary); white-space: nowrap; }
        .cust-selected-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--card); border: 1.5px solid var(--border);
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
          font-weight: 600; color: var(--text); width: 100%; cursor: pointer;
          position: relative;
        }

        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }

        .price-history {
          background: var(--card); border-radius: 8px; padding: 10px 14px;
          margin-top: 12px; font-size: 12px; border: 1px solid var(--border);
        }
        .price-history-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 0; border-bottom: 1px solid var(--border);
        }

        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/invoices")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">{editId ? "✏️ Edit Sales Invoice" : "🧾 New Sales Invoice"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{editId ? "Modify invoice details and items" : "Create invoice with full accounting automation"}</div>
          </div>
          <button className="inv-btn" onClick={() => router.push("/dashboard/invoices")}>View List</button>
        </div>

        {error && <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
            {savedInvoiceId && !editId && (
              <button
                className="inv-btn"
                style={{ marginLeft: 8, borderColor: "#ECFDF5", color: "#ECFDF5" }}
                onClick={() => router.push(`/dashboard/invoices/${savedInvoiceId}`)}
              >
                <ExternalLink size={14} /> View Invoice
              </button>
            )}
          </div>
        )}

        <div className="header-grid">
          {/* LEFT: Customer + Dates + Reference + Notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <label className="inv-label">Customer *</label>
              <div className="cust-wrap" ref={customerRef}>
                {selectedCustomer ? (
                  <div className="cust-selected-badge" onClick={clearCustomer}>
                    <span>👤</span><span style={{ flex: 1 }}>{selectedCustomer.code} — {selectedCustomer.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Bal: PKR {(selectedCustomer.balance || 0).toLocaleString()}</span>
                    <button
                      style={{ marginLeft: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); clearCustomer(); }}
                    >
                      <X size={14} />
                    </button>
                    <button
                      style={{ marginLeft: 2, background: "none", border: "none", color: "var(--primary)", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); refreshCustomers(); }}
                      title="Refresh"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} style={{ position: "absolute", left: 10, color: "var(--text-muted)" }} />
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
                      {customerSearch && <button onClick={() => setCustomerSearch("")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={13} /></button>}
                    </div>
                    {showCustomerList && (
                      <div className="cust-dropdown">
                        {filteredCustomers.length === 0 ? (
                          <div style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 13 }}>No customers found</div>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "var(--text-muted)" }} />
                    <input
                      className="inv-input"
                      style={{ paddingLeft: 36 }}
                      placeholder="Search product..."
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowProductList(true) }}
                      onFocus={() => setShowProductList(true)}
                      onBlur={() => setTimeout(() => setShowProductList(false), 200)}
                    />
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
                          <div style={{ padding: 12, color: "var(--text-muted)", fontSize: 12 }}>No products found</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button className="inv-btn" onClick={addManualItem}><Plus size={14} /> Manual</button>
                </div>
              </div>

              {/* Price History Panel */}
              {showHistory && lastSelectedProduct && (
                <div className="price-history">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    {lastSelectedProduct.image_path && (
                      <img src={lastSelectedProduct.image_path} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                    )}
                    <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>
                      📋 Price history for {lastSelectedProduct.name}
                    </span>
                    <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }} onClick={() => setShowHistory(false)}>
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
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No previous sales to this customer</div>
                  )}
                </div>
              )}
            </div>

            {/* Change History when editing */}
            {editId && (
              <div className="inv-card" style={{ marginTop: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
                <RecordHistory tableName="invoices" recordId={editId} />
              </div>
            )}
          </div>

          {/* RIGHT: Summary & Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Total</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button className="inv-btn" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={saving}>
                {saving ? "Posting..." : editId ? "💾 UPDATE Invoice" : "💾 POST Invoice"}
              </button>
              <button className="inv-btn" style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }} onClick={handleBeforeSavePdf}>
                <Download size={14} /> PDF Preview
              </button>
              {selectedCustomer && (
                <button className="inv-btn inv-btn-success" style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }} onClick={handleWhatsAppWithPDF}>
                  <Send size={14} /> WhatsApp (PDF)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Items table */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Items</span>
          </div>
          {items.length > 0 && (
            <div className="inv-card" style={{ overflowX: "auto", padding: "16px 12px" }}>
              <div className="inv-item-header">
                <span></span>
                <span>Product</span>
                <span>Description</span>
                <span>Qty</span>
                <span>Price</span>
                <span style={{ textAlign: "right" }}>Total</span>
                <span style={{ textAlign: "right" }}>Cost</span>
                <span></span>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="inv-item-row">
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {item.product_image ? (
                      <img src={item.product_image} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />
                    ) : (
                      <ImageIcon size={14} color="var(--text-muted)" />
                    )}
                  </div>
                  <div className="inv-cell" style={{ paddingLeft: 12 }}>
                    {item.product_name || "—"}
                  </div>
                  <input
                    className="inv-input"
                    style={{ height: 34, fontSize: 12 }}
                    value={item.description}
                    onChange={e => updateItem(idx, "description", e.target.value)}
                    placeholder="Description"
                  />
                  <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                  <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                  <div className="inv-cell" style={{ justifyContent: "flex-end", fontWeight: 600 }}>
                    PKR {item.total.toLocaleString()}
                  </div>
                  <div className="inv-cell" style={{ justifyContent: "flex-end", color: "var(--text-muted)" }}>
                    {item.product_id ? `PKR ${(item.cost_price * item.qty).toLocaleString()}` : "—"}
                  </div>
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