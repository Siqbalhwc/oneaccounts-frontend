"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Package, AlertTriangle, CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"

export default function InventoryAdjustmentsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [products, setProducts] = useState<any[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<"in" | "out">("in")
  const [quantity, setQuantity] = useState(0)
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const selectedProduct = products.find(p => p.id === selectedProductId)

  useEffect(() => {
    supabase.from("products").select("id, code, name, cost_price, qty_on_hand").order("name").then(r => {
      if (r.data) setProducts(r.data)
    })
    supabase.from("stock_moves")
      .select("*, products(code, name)")
      .in("move_type", ["adjustment_in", "adjustment_out"])
      .order("date", { ascending: false })
      .limit(20)
      .then(r => {
        if (r.data) setAdjustments(r.data)
      })
  }, [])

  const handleSubmit = async () => {
    if (!selectedProductId) { setError("Please select a product"); return }
    if (quantity <= 0) { setError("Quantity must be greater than 0"); return }

    const prod = selectedProduct
    if (!prod) return

    // Prevent negative stock on stock out
    if (adjustmentType === "out" && quantity > prod.qty_on_hand) {
      setError(`Not enough stock. Available: ${prod.qty_on_hand}`)
      return
    }

    setLoading(true)
    setError("")

    const moveType = adjustmentType === "in" ? "adjustment_in" : "adjustment_out"
    const moveQty = adjustmentType === "in" ? quantity : -quantity
    const newQty = prod.qty_on_hand + moveQty
    const totalValue = quantity * (prod.cost_price || 0)

    // 1. Update product stock
    await supabase.from("products").update({ qty_on_hand: newQty }).eq("id", prod.id)

    // 2. Record stock movement
    await supabase.from("stock_moves").insert({
      product_id: prod.id,
      move_type: moveType,
      qty: moveQty,
      unit_price: prod.cost_price,
      ref: reference || "Manual Adjustment",
      date: adjustmentDate,
    })

    // 3. Post GL entry
    const { data: invAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1200").single()
    const { data: adjAcc } = await supabase.from("accounts").select("id,balance").eq("code", "5800").single()

    if (invAcc && adjAcc) {
      let lines: any[] = []
      if (adjustmentType === "in") {
        // DR Inventory / CR Inventory Adjustments
        lines = [
          { account_id: invAcc.id, debit: totalValue, credit: 0 },
          { account_id: adjAcc.id, debit: 0, credit: totalValue },
        ]
      } else {
        // DR Inventory Adjustments / CR Inventory
        lines = [
          { account_id: adjAcc.id, debit: totalValue, credit: 0 },
          { account_id: invAcc.id, debit: 0, credit: totalValue },
        ]
      }

      const entryNo = `ADJ-${adjustmentDate.replace(/-/g, "")}-${prod.id}-${Date.now().toString(36)}`
      const { data: je } = await supabase.from("journal_entries")
        .insert({
          entry_no: entryNo,
          date: adjustmentDate,
          description: `${adjustmentType === "in" ? "Stock In" : "Stock Out"} - ${prod.name}`,
          reference,
        })
        .select("id")
        .single()

      if (je) {
        await supabase.from("journal_lines").insert(
          lines.map(l => ({ ...l, entry_id: je.id }))
        )
        // Update account balances
        await supabase.from("accounts").update({ balance: invAcc.balance + totalValue * (adjustmentType === "in" ? 1 : -1) }).eq("id", invAcc.id)
        await supabase.from("accounts").update({ balance: adjAcc.balance + totalValue * (adjustmentType === "in" ? -1 : 1) }).eq("id", adjAcc.id)
      }
    }

    // Refresh list
    const { data: fresh } = await supabase.from("stock_moves")
      .select("*, products(code, name)")
      .in("move_type", ["adjustment_in", "adjustment_out"])
      .order("date", { ascending: false })
      .limit(20)
    if (fresh) setAdjustments(fresh)

    // Refresh product list
    const { data: freshProds } = await supabase.from("products").select("id, code, name, cost_price, qty_on_hand").order("name")
    if (freshProds) setProducts(freshProds)

    setSuccess(`✅ Adjustment posted! New stock: ${newQty}`)
    setQuantity(0)
    setReference("")
    setNotes("")
    setSelectedProductId(null)
    setLoading(false)
    setTimeout(() => setSuccess(""), 3000)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .adj-shell { max-width: 800px; margin: 0 auto; }
        .adj-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 24px; margin-bottom: 16px; }
        .adj-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .adj-subtitle { font-size: 13px; color: #94A3B8; }
        .adj-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: block; }
        .adj-input, .adj-select { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .adj-input:focus, .adj-select:focus { border-color: #1740C8; background: white; }
        .adj-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .adj-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
        .adj-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .adj-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .adj-radio-group { display: flex; gap: 20px; align-items: center; }
        .adj-move-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        @media (max-width: 500px) {
          .adj-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="adj-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="adj-btn adj-btn-outline" onClick={() => router.push("/dashboard/products")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="adj-title">📦 Inventory Adjustments</div>
            <div className="adj-subtitle">Manually adjust stock quantities (stock‑take, damages, etc.)</div>
          </div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {success}
          </div>
        )}

        <div className="adj-card">
          <div className="adj-row">
            <div>
              <label className="adj-label">Product *</label>
              <select className="adj-select" value={selectedProductId || ""} onChange={e => setSelectedProductId(Number(e.target.value) || null)}>
                <option value="">Select product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name} (Stock: {p.qty_on_hand})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="adj-label">Adjustment Type *</label>
              <div className="adj-radio-group" style={{ height: 40, alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="radio" name="type" checked={adjustmentType === "in"} onChange={() => setAdjustmentType("in")} />
                  Stock In (+)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="radio" name="type" checked={adjustmentType === "out"} onChange={() => setAdjustmentType("out")} />
                  Stock Out (-)
                </label>
              </div>
            </div>
            <div>
              <label className="adj-label">Quantity *</label>
              <input className="adj-input" type="number" value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <label className="adj-label">Date *</label>
              <input className="adj-input" type="date" value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} />
            </div>
          </div>
          <div className="adj-row" style={{ marginTop: 14 }}>
            <div>
              <label className="adj-label">Reference</label>
              <input className="adj-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g., Stock‑take, Damage" />
            </div>
            <div>
              <label className="adj-label">Notes</label>
              <input className="adj-input" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          {selectedProduct && quantity > 0 && (
            <div style={{ background: adjustmentType === "in" ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, padding: 12, marginTop: 14, fontSize: 13 }}>
              <div>
                <strong>{selectedProduct.code} - {selectedProduct.name}</strong><br />
                Current stock: <strong>{selectedProduct.qty_on_hand}</strong><br />
                After adjustment: <strong>{selectedProduct.qty_on_hand + (adjustmentType === "in" ? quantity : -quantity)}</strong><br />
                Cost price: <strong>PKR {selectedProduct.cost_price?.toLocaleString()}</strong><br />
                {selectedProduct.cost_price > 0 && (
                  <>Total value: <strong>PKR {(quantity * selectedProduct.cost_price).toLocaleString()}</strong> (DR {adjustmentType === "in" ? "1200" : "5800"} / CR {adjustmentType === "in" ? "5800" : "1200"})</>
                )}
              </div>
            </div>
          )}
          <button className="adj-btn adj-btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Posting..." : "📌 POST ADJUSTMENT"}
          </button>
        </div>

        <div className="adj-card">
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#1E293B" }}>Recent Adjustments</h3>
          {adjustments.length === 0 ? (
            <p style={{ color: "#94A3B8", textAlign: "center", padding: 20 }}>No adjustments recorded yet.</p>
          ) : (
            adjustments.map((adj, i) => (
              <div key={adj.id} className="adj-move-row">
                <div>
                  <span style={{ fontWeight: 600 }}>{adj.date?.slice(0, 10)}</span>
                  <span style={{ marginLeft: 12, color: "#64748B" }}>{adj.products?.name || "Unknown"}</span>
                  <span style={{ marginLeft: 12, color: adj.move_type === "adjustment_in" ? "#10B981" : "#EF4444" }}>
                    {adj.move_type === "adjustment_in" ? "+" : "-"}{Math.abs(adj.qty)}
                  </span>
                </div>
                <span style={{ color: "#64748B" }}>{adj.ref || ""}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}