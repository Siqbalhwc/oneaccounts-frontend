"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"

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
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    supabase
      .from("products")
      .select("id, code, name, qty_on_hand")
      .order("code")
      .then(({ data }) => { if (data) setProducts(data) })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (!productId || !qty.trim() || !reason.trim()) {
      setError("Product, quantity, and reason are required.")
      setLoading(false)
      return
    }

    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum === 0) {
      setError("Quantity must be a non‑zero number.")
      setLoading(false)
      return
    }

    const res = await fetch("/api/inventory/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        qty: qtyNum,
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

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ padding: 24, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <h2>✅ Adjustment Recorded</h2>
        <p>Stock has been updated.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button className="inv-btn inv-btn-primary" onClick={() => router.push("/dashboard/inventory/adjustments")}>View Adjustments</button>
          <button className="inv-btn inv-btn-outline" onClick={() => { setSuccess(false); setQty(""); setReason(""); setProductId(null) }}>Add Another</button>
        </div>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/inventory/adjustments")}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>New Inventory Adjustment</h1>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Manually increase or decrease stock quantity</p>
            </div>
          </div>

          {error && (
            <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", padding: 24 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Product *</label>
              <select
                className="inv-input"
                value={productId ?? ""}
                onChange={e => setProductId(Number(e.target.value) || null)}
                required
              >
                <option value="">Select product</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.code} – {p.name} (Stock: {p.qty_on_hand || 0})</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Quantity (+/−) *</label>
                <input
                  className="inv-input"
                  type="number"
                  step="any"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  placeholder="e.g. 10 or -5"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Date</label>
                <input
                  className="inv-input"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Reason *</label>
              <input
                className="inv-input"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Stock count correction"
                required
              />
            </div>

            <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 12 }}>
              <Save size={16} /> {loading ? "Saving..." : "Record Adjustment"}
            </button>
          </form>
        </div>
      </div>
    </RoleGuard>
  )
}