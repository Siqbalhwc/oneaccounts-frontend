"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle, ImagePlus } from "lucide-react"

export default function NewProductPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [productCode, setProductCode] = useState("")      // system generated
  const [name, setName] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [openingQty, setOpeningQty] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Get company ID and generate next product code
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Find next PROD-xxx for this company
        supabase
          .from("products")
          .select("code")
          .eq("company_id", cid)
          .ilike("code", "PROD-%")
          .order("code", { ascending: false })
          .limit(1)
          .then(({ data }) => {
            let nextNum = 1
            if (data && data.length > 0) {
              const match = data[0].code?.match(/PROD-(\d+)/)
              if (match) {
                nextNum = parseInt(match[1], 10) + 1
              }
            }
            const code = `PROD-${String(nextNum).padStart(3, "0")}`
            setProductCode(code)
          })
      }
    })
  }, [])

  // Image change handler
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // Upload image to product-images bucket
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

    if (!name.trim()) {
      setError("Product name is required.")
      setLoading(false)
      return
    }
    if (!companyId) {
      setError("Company not loaded.")
      setLoading(false)
      return
    }

    let imageUrl = ""
    if (imageFile) {
      try {
        imageUrl = await uploadImage(imageFile)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
        return
      }
    }

    // Use the API route that already stamps company_id
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: productCode,          // system‑generated code
        name: name.trim(),
        sale_price: parseFloat(salePrice) || 0,
        cost_price: parseFloat(costPrice) || 0,
        opening_qty: parseFloat(openingQty) || 0,
        image_url: imageUrl,
      }),
    })

    const data = await res.json()
    if (data.error) {
      setError(data.error)
      setLoading(false)
      return
    }

    setFlash(`✅ Product ${data.code} created successfully!`)
    setName("")
    setSalePrice("")
    setCostPrice("")
    setOpeningQty("")
    setImageFile(null)
    setImagePreview(null)
    setLoading(false)

    // Generate a fresh code for the next product
    supabase
      .from("products")
      .select("code")
      .eq("company_id", companyId)
      .ilike("code", "PROD-%")
      .order("code", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        let nextNum = 1
        if (data && data.length > 0) {
          const match = data[0].code?.match(/PROD-(\d+)/)
          if (match) {
            nextNum = parseInt(match[1], 10) + 1
          }
        }
        setProductCode(`PROD-${String(nextNum).padStart(3, "0")}`)
      })

    setTimeout(() => setFlash(null), 4000)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .form-card {
          background: #111827; border: 1px solid #1E293B; border-radius: 12px;
          padding: 24px; margin-bottom: 16px; max-width: 560px;
          margin-left: auto; margin-right: auto;
        }
        .label { font-size: 11px; font-weight: 600; color: #94A3B8; text-transform: uppercase; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 40px; border: 1.5px solid #334155; border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: #1E293B; color: #F1F5F9;
        }
        .input:focus, .select:focus { border-color: #64748B; outline: none; }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 10px 20px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600;
          font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-outline { background: transparent; color: white; border-color: #334155; }
        .btn-outline:hover { background: #1E293B; }
        .btn-back { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 600px) {
          .inline-group { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-back" onClick={() => router.push("/dashboard/products")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📦 Add New Product</h1>
            <p style={{ color: "#94A3B8", fontSize: 13 }}>Add a product to your inventory</p>
          </div>
        </div>

        {error && <div style={{ background: "#1E293B", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "#064E3B", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-card">
            {/* Product Code – system generated, read‑only */}
            <div style={{ marginBottom: 16 }}>
              <label className="label">Product Code</label>
              <input className="input" value={productCode} disabled />
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>System‑generated, unique per company</div>
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
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>Sets initial stock on hand</div>
            </div>

            {/* Image upload */}
            <div style={{ marginBottom: 20 }}>
              <label className="label">Product Image (optional)</label>
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <label className="btn btn-outline" style={{ cursor: "pointer" }}>
                  <ImagePlus size={14} /> Choose File
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
                </label>
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" style={{ maxWidth: 100, maxHeight: 100, borderRadius: 8, objectFit: "cover" }} />
                )}
              </div>
            </div>

            <button className="btn btn-outline" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Saving..." : <><Plus size={16} /> Create Product</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}