"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, CheckCircle } from "lucide-react"
import EntityPicker from "@/components/entity-picker/EntityPicker"

export default function NewCashSalePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [customerId, setCustomerId] = useState<number | null>(null)

  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [bankAccountId, setBankAccountId] = useState<number | null>(null)

  const [items, setItems] = useState<any[]>([])
  const [stockErrors, setStockErrors] = useState<Record<number, string>>({})

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)
  const [savedSaleNo, setSavedSaleNo] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)
      const { data: banks } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_number")
        .eq("company_id", cid)
        .eq("is_active", true)
      if (banks) setBankAccounts(banks)
    })
  }, [])

  useEffect(() => {
    const errors: Record<number, string> = {}
    items.forEach((item, idx) => {
      if (item.product_id && item.qty > 0 && item.available !== undefined) {
        if (item.qty > item.available) {
          errors[idx] = "Insufficient stock: available " + item.available
        }
      }
    })
    setStockErrors(errors)
  }, [items])

  const addProductItem = (prod: any) => {
    setItems([...items, {
      product_id: prod.id,
      description: prod.code + " - " + prod.name,
      qty: 1,
      unit_price: prod.sale_price || 0,
      total: prod.sale_price || 0,
      available: prod.qty_on_hand || 0,
      unit: prod.unit || "PCS",
    }])
  }

  const addManualItem = () => {
    setItems([...items, {
      product_id: null,
      description: "",
      qty: 1,
      unit_price: 0,
      total: 0,
      available: undefined,
      unit: "",
    }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === "qty" || field === "unit_price") {
      updated[idx].total = updated[idx].qty * updated[idx].unit_price
    } else if (field === "total") {
      updated[idx].unit_price = updated[idx].qty > 0 ? updated[idx].total / updated[idx].qty : 0
    }
    setItems(updated)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const totalAmount = items.reduce((s, i) => s + (i.total || 0), 0)
  const hasStockErrors = Object.keys(stockErrors).length > 0

  const handleSubmit = async () => {
    if (items.length === 0) { setError("Add at least one item"); return }
    if (hasStockErrors) { setError("Cannot save: some items have insufficient stock."); return }
    setSaving(true); setError("")
    try {
      const payloadItems = items.map(i => ({
        product_id: i.product_id || null,
        description: i.description,
        qty: i.qty,
        unit_price: i.unit_price,
      }))
      const { data, error: rpcError } = await supabase.rpc("create_cash_sale_transaction", {
        p_company_id: companyId,
        p_sale_date: saleDate,
        p_items: payloadItems,
        p_party_id: customerId,
        p_bank_account_id: bankAccountId,
        p_reference: reference || "",
        p_notes: notes || "",
        p_user_email: "system",
      })
      if (rpcError) { setError(rpcError.message || "Failed to save cash sale"); setSaving(false); return }
      if (!data || !data.success) { setError(data?.error || "Failed to save cash sale"); setSaving(false); return }
      setSavedSaleNo(data.sale_no)
      setFlash("Cash sale " + data.sale_no + " posted successfully.")
      setItems([])
      setSelectedCustomer(null)
      setCustomerId(null)
      setBankAccountId(null)
      setReference("")
      setNotes("")
      setSaving(false)
    } catch (err: any) {
      setError(err.message || "Network error")
      setSaving(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }
  const inputStyle: React.CSSProperties = { width: "100%", height: 38, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }
  const btnStyle: React.CSSProperties = { height: 38, padding: "0 14px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }
  const btnPrimaryStyle: React.CSSProperties = { ...btnStyle, background: "var(--primary)", color: "#fff", border: "none", fontWeight: 600, justifyContent: "center" }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button style={btnStyle} onClick={() => router.push("/dashboard")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>New Cash Sale</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Receive cash immediately against a product sale</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Customer (optional - walk-in if blank)</label>
          <EntityPicker
            entityType="customer"
            value={selectedCustomer}
            onChange={(record: any) => {
              if (record) { setCustomerId(Number(record.id)); setSelectedCustomer(record) }
              else { setCustomerId(null); setSelectedCustomer(null) }
            }}
            label=""
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Sale Date</label>
            <input style={inputStyle} type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Receive Into</label>
            <select style={inputStyle} value={bankAccountId ?? ""} onChange={e => setBankAccountId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Cash in Hand (default)</option>
              {bankAccounts.map((b: any) => (
                <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? " - " + b.account_number : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Reference</label>
            <input style={inputStyle} value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional reference" />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <label style={labelStyle}>Add Item</label>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <EntityPicker
              entityType="product"
              value={null}
              onChange={(record: any) => { if (record) addProductItem(record) }}
              placeholder="Search product..."
              label=""
              allowCreate={false}
              clearCacheOnOpen
            />
          </div>
          <button style={btnStyle} onClick={addManualItem}><Plus size={14} /> Manual</button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 100px 40px", gap: 8, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
            <span>Description</span>
            <span style={{ textAlign: "center" }}>Qty</span>
            <span style={{ textAlign: "right" }}>Rate</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span></span>
          </div>
          {items.map((item, idx) => (
            <div key={idx} style={{ marginBottom: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 100px 40px", gap: 8, alignItems: "center" }}>
                <input style={{ ...inputStyle, height: 34 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Description" />
                <input style={{ ...inputStyle, height: 34, textAlign: "center", borderColor: stockErrors[idx] ? "#EF4444" : undefined }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                <input style={{ ...inputStyle, height: 34, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                <input style={{ ...inputStyle, height: 34, textAlign: "right", fontWeight: 600 }} type="number" value={item.total} onChange={e => updateItem(idx, "total", Number(e.target.value))} />
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }} onClick={() => removeItem(idx)}><Trash2 size={14} /></button>
              </div>
              {stockErrors[idx] && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{stockErrors[idx]}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Total Received</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>PKR {totalAmount.toLocaleString()}</span>
      </div>

      <button style={{ ...btnPrimaryStyle, width: "100%" }} onClick={handleSubmit} disabled={saving || hasStockErrors || items.length === 0}>
        {saving ? "Posting..." : "Post Cash Sale"}
      </button>

      {savedSaleNo && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button style={btnStyle} onClick={() => router.push("/dashboard")}>Done</button>
        </div>
      )}
    </div>
  )
}