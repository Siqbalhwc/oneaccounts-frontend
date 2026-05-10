"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Edit, Trash2, X, ArrowDown, ArrowUp, ImagePlus } from "lucide-react"

interface Product {
  id: number
  code: string
  name: string
  cost_price: number
  sale_price: number
  opening_qty: number
  qty_on_hand: number
  total_inflow: number
  total_outflow: number
  image_path: string
}

type SortColumn = "code" | "name" | "cost_price" | "sale_price" | "opening_qty" | "qty_on_hand" | "total_inflow" | "total_outflow"
type SortDir = "asc" | "desc"

export default function StockRegisterPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  // Sorting
  const [sortCol, setSortCol] = useState<SortColumn>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isAdjustment, setIsAdjustment] = useState(false)
  const [form, setForm] = useState({
    name: "",
    cost_price: 0,
    sale_price: 0,
    opening_qty: 0,
    image_path: "",
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState("")
  const [formError, setFormError] = useState("")

  // ── Get company ID ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── Fetch products with sorting ──
  const fetchProducts = () => {
    if (!companyId) return
    setLoading(true)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    query = query.order(sortCol, { ascending: sortDir === "asc" })
    query.range(start, end).then(({ data, count }) => {
      const enriched = (data || []).map((p: any) => ({
        ...p,
        total_inflow: p.total_inflow || 0,
        total_outflow: p.total_outflow || 0,
      }))
      setProducts(enriched)
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => { fetchProducts() }, [companyId, search, page, sortCol, sortDir])

  // Toggle sort
  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortCol(col)
      setSortDir("asc")
    }
  }

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortCol !== col) return null
    return sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
  }

  // ── Generate unique product code ──
  const getNextCode = async (): Promise<string> => {
    const { data } = await supabase
      .from("products")
      .select("code")
      .eq("company_id", companyId)
      .order("code", { ascending: false })
      .limit(50)
    let maxNum = 0
    if (data) {
      data.forEach(row => {
        const match = row.code?.match(/PROD-(\d+)/)
        if (match) {
          const n = parseInt(match[1], 10)
          if (!isNaN(n) && n > maxNum) maxNum = n
        }
      })
    }
    return `PROD-${String(maxNum + 1).padStart(3, "0")}`
  }

  // ── Image upload to existing product-images bucket ──
  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from("product-images")
      .upload(`public/${fileName}`, file, { cacheControl: "3600", upsert: false })

    if (error) throw new Error("Image upload failed: " + error.message)
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(`public/${fileName}`)
    return urlData.publicUrl
  }

  // ── Handle file pick and preview ──
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  // ── Modal open helpers ──
  const openNew = () => {
    setEditingProduct(null)
    setIsAdjustment(false)
    setForm({ name: "", cost_price: 0, sale_price: 0, opening_qty: 0, image_path: "" })
    setImageFile(null)
    setImagePreview(null)
    setFormError("")
    setShowModal(true)
  }

  const openEdit = (prod: Product) => {
    setEditingProduct(prod)
    setIsAdjustment(false)
    setForm({
      name: prod.name,
      cost_price: prod.cost_price || 0,
      sale_price: prod.sale_price || 0,
      opening_qty: prod.opening_qty || 0,
      image_path: prod.image_path || "",
    })
    setImageFile(null)
    setImagePreview(null)
    setFormError("")
    setShowModal(true)
  }

  const openAdjust = (prod: Product) => {
    setEditingProduct(prod)
    setIsAdjustment(true)
    setAdjustQty(0)
    setAdjustReason("")
    setFormError("")
    setShowModal(true)
  }

  // ── Save product or adjustment ──
  const handleSave = async () => {
    if (!companyId) return
    setSaving(true)
    setFormError("")
    setFlash("")

    // Stock adjustment
    if (isAdjustment && editingProduct) {
      if (adjustQty === 0) {
        setFormError("Adjustment quantity cannot be zero")
        setSaving(false)
        return
      }
      const newQty = (editingProduct.qty_on_hand || 0) + adjustQty
      const { error: updErr } = await supabase
        .from("products")
        .update({ qty_on_hand: newQty })
        .eq("id", editingProduct.id)
        .eq("company_id", companyId)
      if (updErr) {
        setFormError(updErr.message)
        setSaving(false)
        return
      }
      await supabase.from("stock_moves").insert({
        company_id: companyId,
        product_id: editingProduct.id,
        move_type: adjustQty > 0 ? "adjustment_in" : "adjustment_out",
        qty: adjustQty,
        unit_price: editingProduct.cost_price,
        ref: "ADJ",
        date: new Date().toISOString().split("T")[0],
        notes: adjustReason,
      })
      setFlash("Stock adjusted!")
      setSaving(false)
      setShowModal(false)
      fetchProducts()
      setTimeout(() => setFlash(""), 3000)
      return
    }

    // Add / Edit
    if (!form.name.trim()) {
      setFormError("Name is required")
      setSaving(false)
      return
    }

    let imagePath = form.image_path

    // Upload new image if selected
    if (imageFile) {
      try {
        imagePath = await uploadImage(imageFile)
      } catch (err: any) {
        setFormError(err.message)
        setSaving(false)
        return
      }
    }

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      cost_price: form.cost_price,
      sale_price: form.sale_price,
      opening_qty: form.opening_qty,
      qty_on_hand: editingProduct ? editingProduct.qty_on_hand : form.opening_qty,
      image_path: imagePath || null,
    }

    if (editingProduct) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", editingProduct.id)
        .eq("company_id", companyId)
      if (error) { setFormError(error.message); setSaving(false); return }
      setFlash("Product updated!")
    } else {
      const code = await getNextCode()
      const { error } = await supabase
        .from("products")
        .insert({ ...payload, code, qty_on_hand: form.opening_qty })
      if (error) { setFormError(error.message); setSaving(false); return }
      setFlash("Product created!")
    }

    setSaving(false)
    setShowModal(false)
    fetchProducts()
    setTimeout(() => setFlash(""), 3000)
  }

  // ── Soft delete ──
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product?")) return
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    fetchProducts()
  }

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
  }
  if (!canView) {
    return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2></div>
  }
  if (!companyId) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading company data...</div>
  }

  // ── Compute summary stats ──
  const totalStockValue = products.reduce((sum, p) => sum + (p.qty_on_hand || 0) * (p.cost_price || 0), 0)
  const totalProducts = total

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; cursor: pointer; user-select: none; }
        th:hover { color: #1E293B; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .form-error { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 8px 12px; border-radius: 6px; }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Stock Register</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Manage inventory, view opening / inflow / outflow / closing</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={16} /> New Product
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Products</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{totalProducts}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Stock Value</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>PKR {totalStockValue.toLocaleString()}</div>
        </div>
      </div>

      {flash && (
        <div style={{ background: flash.startsWith("Error") ? "#FEF2F2" : "#F0FDF4", color: flash.startsWith("Error") ? "#B91C1C" : "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div style={{ marginBottom: 12, maxWidth: 320 }}>
        <input className="input" placeholder="Search by name or code..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort("code")}>Code <SortIcon col="code" /></th>
              <th onClick={() => handleSort("name")}>Name <SortIcon col="name" /></th>
              <th onClick={() => handleSort("cost_price")}>Cost Price <SortIcon col="cost_price" /></th>
              <th onClick={() => handleSort("sale_price")}>Sale Price <SortIcon col="sale_price" /></th>
              <th onClick={() => handleSort("opening_qty")} style={{ textAlign: "center" }}>Opening <SortIcon col="opening_qty" /></th>
              <th onClick={() => handleSort("total_inflow")} style={{ textAlign: "center" }}>Inflow <SortIcon col="total_inflow" /></th>
              <th onClick={() => handleSort("total_outflow")} style={{ textAlign: "center" }}>Outflow <SortIcon col="total_outflow" /></th>
              <th onClick={() => handleSort("qty_on_hand")} style={{ textAlign: "center" }}>Closing <SortIcon col="qty_on_hand" /></th>
              <th style={{ textAlign: "center" }}>Image</th>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>No products yet. Add your first product above.</td></tr>
            ) : (
              products.map(prod => {
                const totalInflow = prod.total_inflow || 0
                const totalOutflow = prod.total_outflow || 0
                const closing = (prod.opening_qty || 0) + totalInflow - totalOutflow
                return (
                  <tr key={prod.id}>
                    <td style={{ fontWeight: 600 }}>{prod.code}</td>
                    <td>{prod.name}</td>
                    <td>PKR {prod.cost_price?.toLocaleString()}</td>
                    <td>PKR {prod.sale_price?.toLocaleString()}</td>
                    <td style={{ textAlign: "center" }}>{prod.opening_qty}</td>
                    <td style={{ textAlign: "center", color: "#059669" }}>{totalInflow}</td>
                    <td style={{ textAlign: "center", color: "#dc2626" }}>{totalOutflow}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{closing}</td>
                    <td style={{ textAlign: "center" }}>
                      {prod.image_path ? (
                        <img src={prod.image_path} alt="" style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 4 }} />
                      ) : "—"}
                    </td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: 4 }} onClick={() => openEdit(prod)}><Edit size={14} /></button>
                    </td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: 4, color: "#0d9488", borderColor: "#0d9488" }} onClick={() => openAdjust(prod)} title="Adjust Stock">
                        <ArrowUp size={14} /><ArrowDown size={14} />
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: 4, color: "#EF4444", borderColor: "#FECACA" }} onClick={() => handleDelete(prod.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13 }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {/* Add / Edit / Adjust Modal */}
      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>
                {isAdjustment ? "Adjust Stock" : editingProduct ? "Edit Product" : "New Product"}
              </h3>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {formError && <div className="form-error">{formError}</div>}

              {isAdjustment ? (
                <>
                  <p><strong>{editingProduct?.name}</strong> | Current qty: {editingProduct?.qty_on_hand}</p>
                  <div>
                    <label>Adjustment Qty (+ in, - out)</label>
                    <input className="input" type="number" value={adjustQty} onChange={e => setAdjustQty(Number(e.target.value))} />
                  </div>
                  <div>
                    <label>Reason (optional)</label>
                    <input className="input" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g., stock take" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label>Name *</label>
                    <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Product name" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label>Cost Price</label>
                      <input className="input" type="number" value={form.cost_price} onChange={e => setForm({...form, cost_price: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label>Sale Price</label>
                      <input className="input" type="number" value={form.sale_price} onChange={e => setForm({...form, sale_price: Number(e.target.value)})} />
                    </div>
                  </div>
                  <div>
                    <label>Opening Quantity</label>
                    <input className="input" type="number" value={form.opening_qty} onChange={e => setForm({...form, opening_qty: Number(e.target.value)})} />
                  </div>
                  {/* Image upload */}
                  <div>
                    <label>Product Image</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                      <label className="btn btn-outline" style={{ cursor: "pointer", padding: "8px 16px" }}>
                        <ImagePlus size={14} /> Choose File
                        <input type="file" accept="image/*" onChange={handleImageFileChange} style={{ display: "none" }} />
                      </label>
                      {imagePreview ? (
                        <img src={imagePreview} alt="preview" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                      ) : form.image_path ? (
                        <img src={form.image_path} alt="current" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                      ) : null}
                      {imageFile && <span style={{ fontSize: 12, color: "#10B981" }}>New image selected</span>}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}