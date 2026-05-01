"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"

export default function NewBillPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30*86400000).toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.from("suppliers").select("id,code,name").order("name").then(r => r.data && setSuppliers(r.data))
    supabase.from("products").select("id,code,name,cost_price,qty_on_hand").order("name").then(r => r.data && setProducts(r.data))
  }, [])

  const addItem = (prod: any) => {
    setItems([...items, { product_id: prod.id, description: `${prod.code} - ${prod.name}`, qty: 1, unit_price: prod.cost_price, total: prod.cost_price }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === "qty" || field === "unit_price") updated[idx].total = updated[idx].qty * updated[idx].unit_price
    setItems(updated)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const totalAmount = items.reduce((s, i) => s + i.total, 0)
  const supp = suppliers.find(s => s.id === supplierId)
  const billNo = supp ? `${supp.code}-01` : `BILL-${Date.now().toString(36).toUpperCase()}`

  const handleSubmit = async () => {
    if (!supplierId) { setError("Select a supplier"); return }
    if (items.length === 0) { setError("Add at least one item"); return }
    setLoading(true); setError("")

    const { data: inv } = await supabase.from("invoices").insert({
      invoice_no: billNo, type: "purchase", party_id: supplierId,
      date: billDate, due_date: dueDate, total: totalAmount, paid: 0, status: "Unpaid", reference, notes
    }).select("id").single()

    if (inv) {
      for (const item of items) {
        await supabase.from("invoice_items").insert({
          invoice_id: inv.id, product_id: item.product_id, description: item.description,
          qty: item.qty, unit_price: item.unit_price, total: item.total
        })
        if (item.product_id) {
          const { data: prod } = await supabase.from("products").select("qty_on_hand").eq("id", item.product_id).single()
          if (prod) await supabase.from("products").update({ qty_on_hand: (prod.qty_on_hand || 0) + item.qty }).eq("id", item.product_id)
        }
      }

      // Update supplier balance
      await supabase.from("suppliers").update({ balance: (supp?.balance || 0) + totalAmount }).eq("id", supplierId)

      // GL: DR Inventory / CR Accounts Payable
      const { data: invAcc } = await supabase.from("accounts").select("id").eq("code", "1200").single()
      const { data: apAcc } = await supabase.from("accounts").select("id").eq("code", "2000").single()
      if (invAcc && apAcc) {
        const { data: je } = await supabase.from("journal_entries").insert({
          entry_no: `JE-PI-${String(inv.id).padStart(4, "0")}`, date: billDate, description: `Purchase Bill - ${billNo}`
        }).select("id").single()
        if (je) {
          await supabase.from("journal_lines").insert([
            { entry_id: je.id, account_id: invAcc.id, debit: totalAmount, credit: 0 },
            { entry_id: je.id, account_id: apAcc.id, debit: 0, credit: totalAmount }
          ])
        }
      }

      router.push("/dashboard/bills")
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.push("/dashboard/bills")}
            style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📦 New Purchase Bill</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Record supplier purchase with stock update</p>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Supplier *</label>
              <select value={supplierId || ""} onChange={e => setSupplierId(Number(e.target.value) || null)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Bill Date *</label>
              <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Reference</label>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Vendor Bill #"
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
          </div>
        </div>

        {/* Product selection */}
        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>Add Product</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {products.map(p => (
              <button key={p.id} onClick={() => addItem(p)}
                style={{ padding: "6px 12px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                {p.code} - {p.name} (PKR {p.cost_price})
              </button>
            ))}
          </div>

          {items.map((item, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 70px 40px", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}>
              <input value={item.description} onChange={e => updateItem(idx, "description", e.target.value)}
                style={{ height: 36, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12 }} />
              <input type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))}
                style={{ height: 36, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "center" }} />
              <input type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))}
                style={{ height: 36, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "right" }} />
              <span style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total.toLocaleString()}</span>
              <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }}><Trash2 size={14} /></button>
            </div>
          ))}

          {items.length > 0 && (
            <div style={{ textAlign: "right", marginTop: 12, fontSize: 16, fontWeight: 700 }}>
              Total: PKR {totalAmount.toLocaleString()}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <button onClick={handleSubmit} disabled={loading}
            style={{ width: "100%", padding: 14, background: loading ? "#94A3B8" : "#1D4ED8", color: "white", border: "none", borderRadius: 9, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Posting..." : "💾 POST BILL"}
          </button>
        )}
      </div>
    </div>
  )
}