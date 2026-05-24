"use client"

import { useState, useEffect } from "react"
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
  const [productId, setProductId] = useState<number | null>(null)
  const [qty, setQty] = useState("")
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    supabase.from("products").select("id, code, name, qty_on_hand").order("code").then(({ data }) => { if (data) setProducts(data) })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!productId || !qty.trim() || !reason.trim()) { setError("Product, quantity, and reason are required."); return }
    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum === 0) { setError("Quantity must be a non‑zero number."); return }
    setLoading(true)

    const res = await fetch("/api/inventory/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, qty: qtyNum, reason: reason.trim(), date }),
    })
    const data = await res.json()
    if (!data.success) { setError(data.error || "Failed to record adjustment"); setLoading(false); return }

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
          padding: 16px 20px; box-shadow: var(--shadow-sm);
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
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/inventory/adjustments")}><ArrowLeft size={16} /></button>
          <div className="inv-title">⚖️ New Inventory Adjustment</div>
        </div>

        {error && <div className="error-box">{error}</div>}
        {flash && <div className="flash-box"><CheckCircle size={16} /> {flash}</div>}

        <form onSubmit={handleSubmit}>
          <div className="inv-card">
            <div style={{ marginBottom: 14 }}>
              <label className="inv-label">Product *</label>
              <select className="inv-select" value={productId ?? ""} onChange={e => setProductId(Number(e.target.value) || null)} required>
                <option value="">Select product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name} (Stock: {p.qty_on_hand || 0})</option>)}
              </select>
            </div>
            <div className="inv-row" style={{ marginBottom: 14 }}>
              <div>
                <label className="inv-label">Quantity (+/−) *</label>
                <input className="inv-input" type="number" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 10 or -5" required />
              </div>
              <div>
                <label className="inv-label">Date</label>
                <input className="inv-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="inv-label">Reason *</label>
              <input className="inv-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Stock count correction" required />
            </div>
            <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 10 }}>
              <Save size={16} /> {loading ? "Saving..." : "Record Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}