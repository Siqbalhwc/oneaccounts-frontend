"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle, ImagePlus, Save } from "lucide-react"

export default function ProductFormPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")   // if present → edit mode

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [productCode, setProductCode] = useState("")
  const [name, setName] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [openingQty, setOpeningQty] = useState("")
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // ── Load company & generate code (new) / fetch product (edit) ──────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      if (editId) {
        // Fetch existing product
        const { data: product } = await supabase
          .from("products")
          .select("*")
          .eq("id", editId)
          .eq("company_id", cid)
          .single()
        if (product) {
          setProductCode(product.code)
          setName(product.name)
          setSalePrice(String(product.sale_price || ""))
          setCostPrice(String(product.cost_price || ""))
          setOpeningQty(String(product.opening_qty || ""))
          setExistingImageUrl(product.image_path || null)
          if (product.image_path) setImagePreview(product.image_path)
        }
      } else {
        // Generate next product code
        const { data } = await supabase
          .from("products")
          .select("code")
          .eq("company_id", cid)
          .ilike("code", "PROD-%")
          .order("code", { ascending: false })
          .limit(1)
        let nextNum = 1
        if (data && data.length > 0) {
          const match = data[0].code?.match(/PROD-(\d+)/)
          if (match) nextNum = parseInt(match[1], 10) + 1
        }
        setProductCode(`PROD-${String(nextNum).padStart(3, "0")}`)
      }
    })
  }, [editId])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`
    const { data: upload, error: uploadErr } = await supabase.storage
      .from("product-images")
      .upload(`public/${fileName}`, file, { cacheControl: "3600", upsert: false })
    if (uploadErr) throw new Error("Image upload failed: " + uploadErr.message)
    const { data: publicData } = supabase.storage
      .from("product-images")
      .getPublicUrl(`public/${fileName}`)
    return publicData.publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (!name.trim()) { setError("Product name is required."); setLoading(false); return }
    if (!companyId) { setError("Company not loaded."); setLoading(false); return }

    let imageUrl = existingImageUrl || ""
    if (imageFile) {
      try {
        imageUrl = await uploadImage(imageFile)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
        return
      }
    }

    const payload = {
      company_id: companyId,
      code: productCode,
      name: name.trim(),
      sale_price: parseFloat(salePrice) || 0,
      cost_price: parseFloat(costPrice) || 0,
      opening_qty: parseFloat(openingQty) || 0,
      image_path: imageUrl || null,
    }

    if (editId) {
      // Update existing product
      const { error: updateErr } = await supabase
        .from("products")
        .update(payload)
        .eq("id", editId)
        .eq("company_id", companyId)
      if (updateErr) { setError(updateErr.message); setLoading(false); return }
      setFlash("✅ Product updated successfully!")
    } else {
      // Insert new product
      const { error: insertErr } = await supabase
        .from("products")
        .insert(payload)
      if (insertErr) { setError(insertErr.message); setLoading(false); return }
      setFlash(`✅ Product ${productCode} created successfully!`)
    }

    if (!editId) {
      // Reset form only for new
      setName("")
      setSalePrice("")
      setCostPrice("")
      setOpeningQty("")
      setImageFile(null)
      setImagePreview(null)
      setExistingImageUrl(null)
      // Generate next code
      const { data } = await supabase
        .from("products")
        .select("code")
        .eq("company_id", companyId)
        .ilike("code", "PROD-%")
        .order("code", { ascending: false })
        .limit(1)
      let nextNum = 1
      if (data && data.length > 0) {
        const match = data[0].code?.match(/PROD-(\d+)/)
        if (match) nextNum = parseInt(match[1], 10) + 1
      }
      setProductCode(`PROD-${String(nextNum).padStart(3, "0")}`)
    }

    setLoading(false)
    setTimeout(() => setFlash(null), 4000)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card {
          background: #111827; border: 1px solid #1E293B; border-radius: 12px;
          padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .label { font-size: 10px; font-weight: 600; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid #334155; border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: #1E293B; color: #F1F5F9; outline: none;
        }
        .input:focus, .select:focus { border-color: #64748B; }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: #CBD5E1; transition: 0.2s;
        }
        .btn:hover { background: #1E293B; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 600px) {
          .inline-group { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/products")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>
            {editId ? "✏️ Edit Product" : "📦 Add New Product"}
          </h1>
          <p style={{ color: "#94A3B8", fontSize: 13 }}>
            {editId ? "Modify product details" : "Add a product to your inventory"}
          </p>
        </div>
      </div>

      {error && <div style={{ background: "#1E293B", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "#064E3B", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <label className="label">Product Code</label>
            <input className="input" value={productCode} disabled />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Product Name *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Widget A" />
          </div>

          <div className="inline-group" style={{ marginBottom: 16 }}>
            <div>
              <label className="label">Sale Price (PKR)</label>
              <input className="input" type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Cost Price (PKR)</label>
              <input className="input" type="number" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Opening Quantity</label>
            <input className="input" type="number" value={openingQty} onChange={e => setOpeningQty(e.target.value)} placeholder="0" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Product Image (optional)</label>
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label className="btn" style={{ cursor: "pointer" }}>
                <ImagePlus size={14} /> Choose File
                <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
              </label>
              {imagePreview && (
                <img src={imagePreview} alt="Preview" style={{ maxWidth: 100, maxHeight: 100, borderRadius: 8, objectFit: "cover" }} />
              )}
            </div>
          </div>

          <button className="btn" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? "Saving..." : editId ? <><Save size={16} /> Update Product</> : <><Plus size={16} /> Create Product</>}
          </button>
        </div>
      </form>
    </div>
  )
}s