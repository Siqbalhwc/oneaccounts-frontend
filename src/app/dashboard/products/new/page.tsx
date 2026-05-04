"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Upload, Save } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"

export default function NewProductPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [unit_price, setUnitPrice] = useState("")
  const [cost_price, setCostPrice] = useState("")
  const [opening_qty, setOpeningQty] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<number | null>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError("")
    if (!code.trim() || !name.trim()) {
      setError("Product code and name are required.")
      setLoading(false); return
    }

    let imageUrl = ""
    if (imageFile) {
      const { data: upload, error: uploadErr } = await supabase.storage
        .from("product-images")
        .upload(`products/${Date.now()}-${imageFile.name}`, imageFile, {
          cacheControl: "3600", upsert: false,
        })
      if (uploadErr) {
        setError("Image upload failed: " + uploadErr.message)
        setLoading(false); return
      }
      const { data: publicData } = supabase.storage
        .from("product-images")
        .getPublicUrl(upload.path)
      imageUrl = publicData.publicUrl
    }

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.trim(),
        name: name.trim(),
        unit_price: parseFloat(unit_price) || 0,
        cost_price: parseFloat(cost_price) || 0,
        opening_qty: parseFloat(opening_qty) || 0,
        image_url: imageUrl,
      }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setSuccess(data.productId)
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <h2>✅ Product Created</h2>
        <p>Product has been saved and opening inventory GL entry posted (if applicable).</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button className="inv-btn inv-btn-primary" onClick={() => router.push("/dashboard/products")}>View Products</button>
          <button className="inv-btn inv-btn-outline" onClick={() => { setSuccess(null); setCode(""); setName(""); setUnitPrice(""); setCostPrice(""); setOpeningQty(""); setImageFile(null); setImagePreview(null) }}>Add Another</button>
        </div>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/products")}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>Add New Product</h1>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Create inventory item with opening stock</p>
            </div>
          </div>

          {error && (
            <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Product Code *</label>
                <input className="inv-input" value={code} onChange={e => setCode(e.target.value)} placeholder="PROD-001" required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Product Name *</label>
                <input className="inv-input" value={name} onChange={e => setName(e.target.value)} placeholder="Widget A" required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Sale Price (PKR)</label>
                <input className="inv-input" type="number" value={unit_price} onChange={e => setUnitPrice(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Cost Price (PKR)</label>
                <input className="inv-input" type="number" value={cost_price} onChange={e => setCostPrice(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Opening Quantity</label>
                <input className="inv-input" type="number" value={opening_qty} onChange={e => setOpeningQty(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Product Image (optional)</label>
              <input type="file" accept="image/*" onChange={handleImageChange} />
              {imagePreview && (
                <img src={imagePreview} alt="Preview" style={{ marginTop: 10, maxWidth: 200, maxHeight: 200, borderRadius: 8 }} />
              )}
            </div>

            <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 12 }}>
              <Save size={16} /> {loading ? "Saving..." : "Save Product"}
            </button>
          </form>
        </div>
      </div>
    </RoleGuard>
  )
}