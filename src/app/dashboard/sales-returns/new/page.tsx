"use client"

import { Suspense } from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, Lock } from "lucide-react"
import { usePlan } from "@/contexts/PlanContext"

function NewSalesReturnPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const originalInvoiceIdFromQuery = searchParams.get("original_invoice_id")
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const showProducts = hasFeature("inventory")

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<any>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Original invoice selection state
  const [originalInvoiceId, setOriginalInvoiceId] = useState<number | null>(null)
  const [originalInvoice, setOriginalInvoice] = useState<any>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)

  // Read‑only mode: when a valid original invoice is present
  const isFullReturn = Boolean(originalInvoiceIdFromQuery)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Load customers & products for lookups (not needed for editing in full return, but keep)
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
    })
  }, [showProducts])

  // Load full invoice details for full return
  useEffect(() => {
    if (!originalInvoiceIdFromQuery || !companyId) return
    const id = Number(originalInvoiceIdFromQuery)
    setOriginalInvoiceId(id)

    supabase.from("invoices")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("type", "sale")
      .single()
      .then(async ({ data: inv }) => {
        if (!inv) {
          setError("Original invoice not found.")
          setLoading(false)
          return
        }
        setOriginalInvoice(inv)

        // Fetch customer
        const { data: cust } = await supabase
          .from("customers")
          .select("id,code,name,phone,balance,country_code,payment_terms")
          .eq("id", inv.party_id)
          .single()
        setSelectedCustomer(cust || null)

        setInvoiceDate(inv.date)
        setDueDate(inv.due_date)
        setReference(inv.reference || "")
        setNotes(inv.notes || "")

        // Fetch items (read-only)
        const { data: invItems } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", inv.id)
        if (invItems) {
          const mapped = invItems.map((item: any) => ({
            product_id: item.product_id,
            description: item.description,
            product_name: "",
            product_image: null,
            qty: item.qty,
            unit_price: item.unit_price,
            cost_price: item.cost_price || 0,
            total: item.qty * item.unit_price,
          }))
          setItems(mapped)
        }
        setLoading(false)
      })
  }, [originalInvoiceIdFromQuery, companyId])

  const totalAmount = items.reduce((s: any, i: any) => s + i.total, 0)

  const handleSubmit = async () => {
    if (!selectedCustomer) { setError("Customer not found."); return }
    if (items.length === 0) { setError("No items to return."); return }

    setSaving(true); setError("")

    try {
      const res = await fetch("/api/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party_id: selectedCustomer.id,
          original_invoice_id: originalInvoiceId,
          invoice_date: invoiceDate,
          due_date: dueDate,
          items: items.map((i: any) => ({
            product_id: i.product_id,
            description: i.description,
            qty: i.qty,
            unit_price: i.unit_price,
            cost_price: i.cost_price,
          })),
          reference,
          notes,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to save return")
        setSaving(false)
        return
      }

      const newId = result.return?.id
      setFlash("✅ Full sales return created successfully!")
      setTimeout(() => {
        if (newId) router.push(`/dashboard/sales-returns/${newId}`)
      }, 1000)
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading invoice details…</div>

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
        .inv-input[readonly], .inv-select[readonly] {
          opacity: 0.7;
          pointer-events: none;
          user-select: none;
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
        .inv-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) {
          .header-grid { grid-template-columns: 1fr; }
        }
        .readonly-badge { background: #1D4ED8; color: white; padding: 2px 8px; border-radius: 6px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/sales-returns")}><ArrowLeft size={16} /></button>
          <div className="inv-title">↩️ Full Sales Return</div>
          {isFullReturn && <span className="readonly-badge"><Lock size={12} /> Locked – all items will be returned</span>}
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
              <label className="inv-label">Customer</label>
              <div className="inv-input" style={{ lineHeight: "36px" }}>
                {selectedCustomer ? `${selectedCustomer.code} - ${selectedCustomer.name}` : "—"}
              </div>

              <div className="inv-row" style={{ marginTop: 14 }}>
                <div><label className="inv-label">Original Invoice Date</label><input className="inv-input" type="date" value={invoiceDate} readOnly /></div>
                <div><label className="inv-label">Due Date</label><input className="inv-input" type="date" value={dueDate} readOnly /></div>
              </div>
              <div className="inv-row" style={{ marginTop: 10 }}>
                <div><label className="inv-label">Reference</label><input className="inv-input" value={reference} readOnly /></div>
                <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} readOnly /></div>
              </div>
            </div>

            {items.length > 0 && (
              <div className="inv-card">
                <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Return Items (all from original invoice)</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: 8 }}>Product/Desc</th>
                        <th style={{ textAlign: "center", padding: 8, width: 80 }}>Qty</th>
                        <th style={{ textAlign: "right", padding: 8, width: 100 }}>Price</th>
                        <th style={{ textAlign: "right", padding: 8, width: 100 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: 8 }}>
                            <span style={{ fontWeight: 600 }}>{item.product_name || item.description}</span>
                          </td>
                          <td style={{ padding: 8, textAlign: "center" }}>{item.qty}</td>
                          <td style={{ padding: 8, textAlign: "right" }}>PKR {item.unit_price.toLocaleString()}</td>
                          <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>PKR {item.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Total Return</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
              {isFullReturn && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
                  This will fully reverse invoice #{originalInvoice?.invoice_no} including stock, accounting, and customer balance.
                </div>
              )}
            </div>
            <button
              className="inv-btn inv-btn-primary"
              style={{ justifyContent: "center", padding: 10, width: "100%" }}
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Posting..." : "💾 POST FULL RETURN"}
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