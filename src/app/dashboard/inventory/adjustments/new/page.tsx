"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, CheckCircle } from "lucide-react"

export default function NewAdjustmentPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [products, setProducts] = useState<any[]>([])
  const [stockMap, setStockMap] = useState<Record<number, number>>({})
  const [productId, setProductId] = useState<number | null>(null)
  const [qty, setQty] = useState("")
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // True available stock = opening_qty + purchases - sales + adjustments
  const [trueStock, setTrueStock] = useState<number | null>(null)

  // Fetch all products and pre-compute closing stock for all in one batch
  useEffect(() => {
    const fetchProductsAndStock = async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id, code, name, opening_qty, cost_price")
        .order("code")
      if (!prods) return
      setProducts(prods)

      // Fetch all invoice items and stock moves in parallel
      const [{ data: items }, { data: moves }] = await Promise.all([
        supabase
          .from("invoice_items")
          .select("qty, product_id, invoices!inner(type)"),
        supabase
          .from("stock_moves")
          .select("qty, product_id"),
      ])

      // Build closing stock map starting from opening_qty
      const map: Record<number, number> = {}
      prods.forEach((p: any) => {
        map[p.id] = p.opening_qty || 0
      })

      if (items) {
        items.forEach((item: any) => {
          const type = item.invoices?.type
          if (type === "purchase") map[item.product_id] = (map[item.product_id] || 0) + item.qty
          else if (type === "sale") map[item.product_id] = (map[item.product_id] || 0) - item.qty
        })
      }

      if (moves) {
        moves.forEach((m: any) => {
          map[m.product_id] = (map[m.product_id] || 0) + (m.qty || 0)
        })
      }

      setStockMap(map)
    }
    fetchProductsAndStock()
  }, [])

  // Set trueStock from pre-computed stockMap when product is selected
  useEffect(() => {
    if (!productId) {
      setTrueStock(null)
      return
    }
    setTrueStock(stockMap[productId] ?? null)
  }, [productId, stockMap])

  const selectedProduct = useMemo(
    () => products.find(p => p.id === productId) || null,
    [products, productId]
  )

  const qtyNum = parseFloat(qty)
  const adjustmentQty = isNaN(qtyNum) ? 0 : qtyNum
  const currentStock = trueStock ?? 0
  const newStock = currentStock + adjustmentQty
  const costPrice = selectedProduct?.cost_price ?? 0
  const valueChange = adjustmentQty * costPrice
  const absValueChange = Math.abs(valueChange)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!productId || !qty.trim() || !reason.trim()) {
      setError("Product, quantity, and reason are required.")
      return
    }
    if (isNaN(adjustmentQty) || adjustmentQty === 0) {
      setError("Quantity must be a non‑zero number.")
      return
    }
    if (newStock < 0) {
      setError("Insufficient stock for this adjustment.")
      return
    }
    setLoading(true)

    const res = await fetch("/api/inventory/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        qty: adjustmentQty,
        reason: reason.trim(),
        date,
      }),
    })
    const data = await res.json()
    if (!data.success) {
      setError(data.error || "Failed to record adjustment")
      setLoading(false)
      return
    }

    setFlash(`✅ Adjustment recorded! New stock: ${data.new_qty_on_hand}`)
    setProductId(null)
    setQty("")
    setReason("")
    setLoading(false)
    setTimeout(() => setFlash(null), 4000)
  }

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { max-width: 600px; margin: 0 auto; }
        .inv-card {
          background: var(--card); border-radius: 12px; border: 1px solid var(--border);
          padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 16px;
        }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-label {
          font-size: 10px; font-weight: 600; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;
        }
        .inv-input, .inv-select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text);
          outline: none; box-sizing: border-box;
        }
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit; transition: all 0.15s; white-space: nowrap;
        }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .inv-btn-primary:hover { background: var(--primary-hover); }
        .inv-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .error-box { background: var(--card); border: 1px solid #EF4444; color: #FCA5A5; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; }
        .flash-box { background: var(--card); border: 1px solid #065F46; color: #6EE7B7; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; }
        .summary-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px; }
        .summary-value { font-size: 16px; font-weight: 700; color: var(--text); }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/inventory/adjustments")}>
            <ArrowLeft size={16} />
          </button>
          <div className="inv-title">⚖️ New Inventory Adjustment</div>
        </div>

        {error && <div className="error-box">{error}</div>}
        {flash && <div className="flash-box"><CheckCircle size={16} /> {flash}</div>}

        <form onSubmit={handleSubmit}>
          <div className="inv-card">
            <div style={{ marginBottom: 14 }}>
              <label className="inv-label">Product *</label>
              <select
                className="inv-select"
                value={productId ?? ""}
                onChange={(e) => setProductId(Number(e.target.value) || null)}
                required
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} – {p.name} (In Hand: {stockMap[p.id] ?? p.opening_qty ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div className="inv-row" style={{ marginBottom: 14 }}>
              <div>
                <label className="inv-label">Quantity (+/−) *</label>
                <input
                  className="inv-input"
                  type="number"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="e.g. 10 or -5"
                  required
                />
              </div>
              <div>
                <label className="inv-label">Date</label>
                <input
                  className="inv-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="inv-label">Reason *</label>
              <input
                className="inv-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Stock count correction"
                required
              />
            </div>

            {/* Summary section shows true stock = opening + purchases - sales + adjustments */}
            {selectedProduct && trueStock !== null && (
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div className="summary-item">
                  <div className="summary-label">Current Stock (In Hand)</div>
                  <div className="summary-value">{currentStock}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Cost Price</div>
                  <div className="summary-value">PKR {costPrice.toLocaleString()}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">New Stock After Adjustment</div>
                  <div className="summary-value" style={{ color: newStock >= 0 ? "#10B981" : "#EF4444" }}>
                    {newStock}
                  </div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Value Change</div>
                  <div className="summary-value" style={{ color: valueChange >= 0 ? "#10B981" : "#EF4444" }}>
                    PKR {absValueChange.toLocaleString()} {valueChange >= 0 ? "↑" : "↓"}
                  </div>
                </div>
              </div>
            )}

            <button
              className="inv-btn inv-btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", padding: 10 }}
            >
              <Save size={16} /> {loading ? "Saving..." : "Record Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
