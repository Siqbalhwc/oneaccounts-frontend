"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, Trash2 } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [unit_price, setUnitPrice] = useState("0")
  const [cost_price, setCostPrice] = useState("0")
  const [opening_qty, setOpeningQty] = useState("0")
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!productId) return
    supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()
      .then(
        ({ data }) => {
          if (data) {
            setCode(data.code)
            setName(data.name)
            setUnitPrice(String(data.unit_price || 0))
            setCostPrice(String(data.cost_price || 0))
            setOpeningQty(String(data.qty_on_hand || 0))
            setExistingImageUrl(data.image_url || null)
            if (data.image_url) setImagePreview(data.image_url)
          } else {
            setError("Product not found")
          }
          setFetching(false)
        },
        () => {
          setError("Failed to load product")
          setFetching(false)
        }
      )
  }, [productId])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setExistingImageUrl(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError("")
    if (!code.trim() || !name.trim()) {
      setError("Product code and name are required.")
      setLoading(false); return
    }

    let finalImageUrl = existingImageUrl
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
      finalImageUrl = publicData.publicUrl
    }

    const res = await fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Number(productId),
        code: code.trim(),
        name: name.trim(),
        unit_price: parseFloat(unit_price) || 0,
        cost_price: parseFloat(cost_price) || 0,
        opening_qty: parseFloat(opening_qty) || 0,
        image_url: finalImageUrl,
      }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setSuccess(true)
    setLoading(false)
  }

  if (fetching) return <div style={{ padding: 24, textAlign: "center" }}>Loading product...</div>

  if (success) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <h2>✅ Product Updated</h2>
        <p>The product and its opening inventory have been updated.</p>
        <div style={{ marginTop: 16 }}>
          <button className="inv-btn inv-btn-primary" onClick={() => router.push("/dashboard/products")}>View Products</button>
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
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>Edit Product</h1>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Update product details and opening stock</p>
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
                <input className="inv-input" value={code} onChange={e => setCode(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Product Name *</label>
                <input className="inv-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Sale Price (PKR)</label>
                <input className="inv-input" type="number" value={unit_price} onChange={e => setUnitPrice(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Cost Price (PKR)</label>
                <input className="inv-input" type="number" value={cost_price} onChange={e => setCostPrice(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Opening Quantity</label>
                <input className="inv-input" type="number" value={opening_qty} onChange={e => setOpeningQty(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Product Image</label>
              {imagePreview ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={imagePreview} alt="Preview" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }} />
                  <button type="button" className="inv-btn inv-btn-danger" onClick={removeImage}>
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={handleImageChange} />
              )}
            </div>

            <button className="inv-btn inv-btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 12 }}>
              <Save size={16} /> {loading ? "Updating..." : "Update Product"}
            </button>
          </form>
        </div>
      </div>
    </RoleGuard>
  )
}