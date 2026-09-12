# ============================================================
# OneAccounts - Fix Opening Cost Price capture + restore
# the visible Average Cost working formula
# ============================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# ---------- FILE 1: dashboard/products/new/page.tsx ----------
$file1 = "src\app\dashboard\products\new\page.tsx"
$backup1 = "$file1.backup_$timestamp"
Copy-Item -LiteralPath $file1 -Destination $backup1
Write-Host "Backed up $file1 -> $backup1"

$newFile1Content = @'
"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle, ImagePlus, Save } from "lucide-react"

export default function ProductFormPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [productCode, setProductCode] = useState("")
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [unit, setUnit] = useState("PCS")
  const [salePrice, setSalePrice] = useState("")
  const [openingCostPrice, setOpeningCostPrice] = useState("")
  const [openingQty, setOpeningQty] = useState("")
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const qty = parseFloat(openingQty) || 0
  const cost = parseFloat(openingCostPrice) || 0
  const totalCost = qty * cost

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      if (editId) {
        const { data: product } = await supabase
          .from("products")
          .select("*")
          .eq("id", editId)
          .eq("company_id", cid)
          .single()
        if (product) {
          setProductCode(product.code)
          setName(product.name)
          setCategory(product.category || "")
          setUnit(product.unit || "PCS")
          setSalePrice(String(product.sale_price || ""))
          setOpeningCostPrice(String(product.opening_cost_price ?? product.cost_price ?? ""))
          setOpeningQty(String(product.opening_qty || ""))
          setExistingImageUrl(product.image_path || null)
          if (product.image_path) setImagePreview(product.image_path)
        }
      } else {
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

    const openingCostVal = parseFloat(openingCostPrice) || 0

    const payload: Record<string, any> = {
      company_id: companyId,
      code: productCode,
      name: name.trim(),
      category: category.trim() || null,
      unit: unit,
      sale_price: parseFloat(salePrice) || 0,
      opening_qty: parseFloat(openingQty) || 0,
      opening_cost_price: openingCostVal,
      image_path: imageUrl || null,
    }

    if (editId) {
      const { error: updateErr } = await supabase
        .from("products")
        .update(payload)
        .eq("id", editId)
        .eq("company_id", companyId)
      if (updateErr) { setError(updateErr.message); setLoading(false); return }

      // Opening qty/cost may have just changed - recompute the running average
      // from scratch (opening + full purchase history) rather than leaving the
      // old average in place.
      const { error: recalcErr } = await supabase.rpc("recalculate_product_avg_cost", {
        p_product_id: Number(editId),
        p_company_id: companyId,
      })
      if (recalcErr) { setError("Product saved, but average cost recalculation failed: " + recalcErr.message); setLoading(false); return }

      setFlash("Product updated successfully!")
    } else {
      // Brand new product - no purchases yet, so cost_price starts equal to the opening cost.
      payload.cost_price = openingCostVal

      const { error: insertErr } = await supabase
        .from("products")
        .insert(payload)
      if (insertErr) { setError(insertErr.message); setLoading(false); return }
      setFlash(`Product ${productCode} created successfully!`)
    }

    if (!editId) {
      setName("")
      setCategory("")
      setSalePrice("")
      setOpeningCostPrice("")
      setOpeningQty("")
      setImageFile(null)
      setImagePreview(null)
      setExistingImageUrl(null)
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

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data...</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .input:focus, .select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-submit { width: 100%; justify-content: center; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }

        /* Summary side will jump above form on mobile */
        @media (max-width: 900px) {
          .header-grid { grid-template-columns: 1fr; }
          .summary-side { order: -1; }
        }
        @media (max-width: 600px) {
          .inline-group { grid-template-columns: 1fr; }
          .page-wrap { padding: 12px !important; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/products")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            {editId ? "Edit Product" : "Add New Product"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {editId ? "Modify product details" : "Add a product to your inventory"}
          </p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <form onSubmit={handleSubmit}>
        <div className="header-grid">
          {/* Left: Form fields (no button) */}
          <div className="card">
            <div style={{ marginBottom: 16 }}>
              <label className="label">Product Code</label>
              <input className="input" value={productCode} disabled />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Product Name *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Widget A" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Category (optional)</label>
              <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Cabinet Handles, Cabinet Knobs" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Unit of Measurement</label>
              <select className="input" value={unit} onChange={e => setUnit(e.target.value)}>
                <option value="PCS">Pieces (PCS)</option>
                <option value="KG">Kilogram (KG)</option>
                <option value="Gram">Gram</option>
                <option value="Liter">Liter</option>
                <option value="Meter">Meter</option>
                <option value="Yard">Yard</option>
                <option value="Feet">Feet</option>
                <option value="Dozen">Dozen</option>
                <option value="Box">Box</option>
                <option value="Carton">Carton</option>
                <option value="Set">Set</option>
                <option value="Pair">Pair</option>
                <option value="Roll">Roll</option>
                <option value="Bag">Bag</option>
                <option value="Ton">Ton</option>
              </select>
            </div>

            <div className="inline-group" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Sale Price (PKR)</label>
                <input className="input" type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label">Opening Cost Price (PKR)</label>
                <input className="input" type="number" value={openingCostPrice} onChange={e => setOpeningCostPrice(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Opening Quantity</label>
              <input className="input" type="number" value={openingQty} onChange={e => setOpeningQty(e.target.value)} placeholder="0" />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Opening quantity and cost can be corrected later even after purchases exist -
                the average cost will be recalculated automatically when you save.
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
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
          </div>

          {/* Right: Summary card and Save button card stacked */}
          <div className="summary-side" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                <span>Units in Hand</span>
                <span>{qty.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Total Cost</span>
                <span style={{ color: "#F59E0B" }}>PKR {totalCost.toLocaleString()}</span>
              </div>
            </div>
            <div className="card" style={{ padding: "16px" }}>
              <button className="btn btn-submit" type="submit" disabled={loading}>
                {loading ? "Saving..." : editId ? <><Save size={16} /> Update Product</> : <><Plus size={16} /> Create Product</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
'@

[System.IO.File]::WriteAllText((Resolve-Path $file1), $newFile1Content, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: $file1 updated (Opening Cost Price field, recalc on edit)"

# ---------- FILE 2: dashboard/products/page.tsx ----------
$file2 = "src\app\dashboard\products\page.tsx"
$backup2 = "$file2.backup_$timestamp"
Copy-Item -LiteralPath $file2 -Destination $backup2
Write-Host "Backed up $file2 -> $backup2"

$content2 = [System.IO.File]::ReadAllText((Resolve-Path $file2), [System.Text.Encoding]::UTF8)

$oldBlock = '                          {(costBreakdown[prod.id] || []).length > 0 && (() => {
                            const rows = costBreakdown[prod.id] || []
                            const lastRow = rows[rows.length - 1]
                            const finalAvg = Number(lastRow?.running_avg_cost || 0)
                            const finalQty = Number(lastRow?.running_qty || 0)
                            return (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
                                <div>Current Average Cost (as of last recorded event, {finalQty} units): <b>{finalAvg.toFixed(2)}</b></div>
                              </div>
                            )
                          })()}'

$newBlock = '                          {(costBreakdown[prod.id] || []).length > 0 && (() => {
                            const rows = costBreakdown[prod.id] || []
                            const totalQty = rows.reduce((s: number, r: any) => s + Number(r.qty || 0), 0)
                            const totalValue = rows.reduce((s: number, r: any) => s + Number(r.qty || 0) * Number(r.unit_price || 0), 0)
                            const finalAvg = totalQty > 0 ? totalValue / totalQty : 0
                            const formula = rows.map((r: any) => "(" + Number(r.qty) + " x " + Number(r.unit_price).toFixed(2) + ")").join(" + ")
                            return (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
                                <div>{formula} = {totalValue.toFixed(2)}</div>
                                <div>{totalValue.toFixed(2)} / {totalQty} = <b>{finalAvg.toFixed(2)}</b></div>
                                <div style={{ marginTop: 4, color: "var(--text-muted)" }}>Current Average Cost (as of last recorded event, {totalQty} units): <b>{finalAvg.toFixed(2)}</b></div>
                              </div>
                            )
                          })()}'

if ($content2.Contains($oldBlock)) {
    $content2 = $content2.Replace($oldBlock, $newBlock)
    [System.IO.File]::WriteAllText((Resolve-Path $file2), $content2, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: $file2 updated (formula working restored)"
} else {
    Write-Host "NOT FOUND: the expected block in $file2 did not match exactly. No changes made to this file. Please tell Claude so the anchor text can be corrected."
}

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "1. rmdir /s /q .next"
Write-Host "2. git add -A"
Write-Host "3. git commit -m 'Fix opening cost price capture and restore average cost working display'"
Write-Host "4. git push"
Write-Host "5. Paste back the full Vercel build log"