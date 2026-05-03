"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Package, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import PremiumGuard from "@/components/PremiumGuard"

function InventoryAdjustmentsContent() {
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

    await supabase.from("products").update({ qty_on_hand: newQty }).eq("id", prod.id)
    await supabase.from("stock_moves").insert({
      product_id: prod.id,
      move_type: moveType,
      qty: moveQty,
      unit_price: prod.cost_price,
      ref: reference || "Manual Adjustment",
      date: adjustmentDate,
    })

    const { data: invAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1200").single()
    const { data: adjAcc } = await supabase.from("accounts").select("id,balance").eq("code", "5800").single()

    if (invAcc && adjAcc) {
      let lines: any[] = []
      if (adjustmentType === "in") {
        lines = [
          { account_id: invAcc.id, debit: totalValue, credit: 0 },
          { account_id: adjAcc.id, debit: 0, credit: totalValue },
        ]
      } else {
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
        await supabase.from("accounts").update({ balance: invAcc.balance + totalValue * (adjustmentType === "in" ? 1 : -1) }).eq("id", invAcc.id)
        await supabase.from("accounts").update({ balance: adjAcc.balance + totalValue * (adjustmentType === "in" ? -1 : 1) }).eq("id", adjAcc.id)
      }
    }

    const { data: fresh } = await supabase.from("stock_moves")
      .select("*, products(code, name)")
      .in("move_type", ["adjustment_in", "adjustment_out"])
      .order("date", { ascending: false })
      .limit(20)
    if (fresh) setAdjustments(fresh)

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/products")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📦 Inventory Adjustments</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Manually adjust stock quantities</p>
        </div>
      </div>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>⚠️ {error}</div>}
      {success && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{success}</div>}

      <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Product *</label>
            <select style={{ width: "100%", height: 40, border: "1.5px solid #E5EAF2", borderRadius: 9, padding: "0 14px", fontSize: 13, background: "#FAFBFF" }}
              value={selectedProductId || ""} onChange={e => setSelectedProductId(Number(e.target.value) || null)}>
              <option value="">Select product...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.code} - {p.name} (Stock: {p.qty_on_hand})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Adjustment Type *</label>
            <div style={{ display: "flex", gap: 20, alignItems: "center", height: 40 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="radio" name="type" checked={adjustmentType === "in"} onChange={() => setAdjustmentType("in")} /> Stock In (+)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="radio" name="type" checked={adjustmentType === "out"} onChange={() => setAdjustmentType("out")} /> Stock Out (-)
              </label>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Quantity *</label>
            <input type="number" style={{ width: "100%", height: 40, border: "1.5px solid #E5EAF2", borderRadius: 9, padding: "0 14px", fontSize: 13, background: "#FAFBFF" }}
              value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Date *</label>
            <input type="date" style={{ width: "100%", height: 40, border: "1.5px solid #E5EAF2", borderRadius: 9, padding: "0 14px", fontSize: 13, background: "#FAFBFF" }}
              value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Reference</label>
            <input style={{ width: "100%", height: 40, border: "1.5px solid #E5EAF2", borderRadius: 9, padding: "0 14px", fontSize: 13, background: "#FAFBFF" }}
              value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g., Stock‑take" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notes</label>
            <input style={{ width: "100%", height: 40, border: "1.5px solid #E5EAF2", borderRadius: 9, padding: "0 14px", fontSize: 13, background: "#FAFBFF" }}
              value={notes} onChange={e => setNotes(e.target.value)} />
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
                <>Total value: <strong>PKR {(quantity * selectedProduct.cost_price).toLocaleString()}</strong></>
              )}
            </div>
          </div>
        )}
        <button onClick={handleSubmit} disabled={loading}
          style={{ marginTop: 20, width: "100%", padding: 12, background: loading ? "#94A3B8" : "#1D4ED8", color: "white", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          {loading ? "Posting..." : "📌 POST ADJUSTMENT"}
        </button>
      </div>

      <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#1E293B" }}>Recent Adjustments</h3>
        {adjustments.length === 0 ? (
          <p style={{ color: "#94A3B8", textAlign: "center", padding: 20 }}>No adjustments recorded yet.</p>
        ) : (
          adjustments.map((adj, i) => (
            <div key={adj.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < adjustments.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 13 }}>
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
  )
}

export default function InventoryAdjustmentsPage() {
  return (
    <PremiumGuard
      featureCode="inventory"
      featureName="Inventory Adjustments"
      featureDesc="Manually adjust stock levels with automatic GL entries."
    >
      <InventoryAdjustmentsContent />
    </PremiumGuard>
  )
}