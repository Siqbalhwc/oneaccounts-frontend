"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Upload, Save, CheckCircle } from "lucide-react"

export default function NewProductPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [name, setName] = useState("")
  const [sale_price, setSalePrice] = useState("")
  const [cost_price, setCostPrice] = useState("")
  const [opening_qty, setOpeningQty] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError("")
    if (!name.trim()) {
      setError("Product name is required.")
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
        name: name.trim(),
        sale_price: parseFloat(sale_price) || 0,
        cost_price: parseFloat(cost_price) || 0,
        opening_qty: parseFloat(opening_qty) || 0,
        image_url: imageUrl,
      }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }

    // Inline success + reset
    setFlash(`✅ Product ${data.code} created successfully!`)
    setName(""); setSalePrice(""); setCostPrice(""); setOpeningQty("")
    setImageFile(null); setImagePreview(null)
    setLoading(false)
    setTimeout(() => setFlash(null), 4000)
  }

  return (
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .inv-shell { max-width: 700px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .inv-card {
          background: white;
          border-radius: 12px;
          border: 1px solid #E5EAF2;
          padding: 16px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .inv-label {
          font-size: 10px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 4px;
          display: block;
        }
        .inv-input {
          width: 100%; height: 38px;
          border: 1.5px solid #E5EAF2;
          border-radius: 8px; padding: 0 12px; font-size: 13px;
          font-family: inherit; background: #FAFBFF; outline: none;
          box-sizing: border-box; transition: border-color 0.15s;
        }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; border: none;
          font-family: inherit; transition: all 0.15s; white-space: nowrap;
        }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E5EAF2; color: #475569; }
        @media (max-width: 600px) {
          .inv-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/products")}>
            <ArrowLeft size={16} />
          </button>
          <div className="inv-title">📦 Add New Product</div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {flash && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="inv-card">
            <div className="inv-row" style={{ marginBottom: 14 }}>
              <div>
                <label className="inv-label">Product Name *</label>
                <input className="inv-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Widget A" required />
              </div>
              <div>
                <label className="inv-label">Sale Price (PKR)</label>
                <input className="inv-input" type="number" value={sale_price} onChange={e => setSalePrice(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="inv-row" style={{ marginBottom: 14 }}>
              <div>
                <label className="inv-label">Cost Price (PKR)</label>
                <input className="inv-input" type="number" value={cost_price} onChange={e => setCostPrice(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="inv-label">Opening Quantity</label>
                <input className="inv-input" type="number" value={opening_qty} onChange={e => setOpeningQty(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="inv-label">Product Image (optional)</label>
              <input type="file" accept="image/*" onChange={handleImageChange} />
              {imagePreview && (
                <img src={imagePreview} alt="Preview" style={{ marginTop: 10, maxWidth: 200, maxHeight: 200, borderRadius: 8 }} />
              )}
            </div>

            <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 10 }}>
              <Save size={16} /> {loading ? "Saving..." : "Save Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}