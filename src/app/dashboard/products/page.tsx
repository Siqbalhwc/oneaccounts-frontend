"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Edit, Trash2, X, ArrowDown, ArrowUp } from "lucide-react"

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

  // Modal state for Add / Edit / Adjust
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isAdjustment, setIsAdjustment] = useState(false) // true â†’ adjust stock only
  const [form, setForm] = useState({
    name: "",
    cost_price: 0,
    sale_price: 0,
    opening_qty: 0,
    image_path: "",
  })
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState("")
  const [formError, setFormError] = useState("")

  // â”€â”€ 1. Get real company ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // â”€â”€ 2. Fetch products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchProducts = () => {
    if (!companyId) return
    setLoading(true)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .order("name")

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    query.range(start, end).then(({ data, count }) => {
      // Enrich each product with total inflow/outflow from stock_moves
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

  useEffect(() => { fetchProducts() }, [companyId, search, page])

  // â”€â”€ Generate unique code per company â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getNextCode = async (): Promise<string> => {
    const { data } = await supabase
      .from("products")
      .select("code")
      .eq("company_id", companyId)
      .order("code", { ascending: false })
      .limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const match = data[0].code.match(/PROD-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    return `PROD-${String(nextNum).padStart(3, "0")}`
  }

  // â”€â”€ Open modal for NEW product â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openNew = () => {
    setEditingProduct(null)
    setIsAdjustment(false)
    setForm({ name: "", cost_price: 0, sale_price: 0, opening_qty: 0, image_path: "" })
    setFormError("")
    setShowModal(true)
  }

  // â”€â”€ Open modal for EDIT product â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    setFormError("")
    setShowModal(true)
  }

  // â”€â”€ Open modal for STOCK ADJUSTMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openAdjust = (prod: Product) => {
    setEditingProduct(prod)
    setIsAdjustment(true)
    setAdjustQty(0)
    setAdjustReason("")
    setFormError("")
    setShowModal(true)
  }

  // â”€â”€ Save (Add / Edit / Adjust) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSave = async () => {
    if (!companyId) return
    setSaving(true)
    setFormError("")
    setFlash("")

    // ---------- STOCK ADJUSTMENT ----------
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

      // Record stock movement
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

      setFlash("âœ… Stock adjusted!")
      setSaving(false)
      setShowModal(false)
      fetchProducts()
      setTimeout(() => setFlash(""), 3000)
      return
    }

    // ---------- ADD / EDIT ----------
    if (!form.name.trim()) {
      setFormError("Name is required")
      setSaving(false)
      return
    }

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      cost_price: form.cost_price,
      sale_price: form.sale_price,
      opening_qty: form.opening_qty,
      qty_on_hand: editingProduct ? editingProduct.qty_on_hand : form.opening_qty,
      image_path: form.image_path || null,
    }

    if (editingProduct) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", editingProduct.id)
        .eq("company_id", companyId)
      if (error) { setFormError(error.message); setSaving(false); return }
      setFlash("âœ… Product updated!")
    } else {
      const code = await getNextCode()
      const { error } = await supabase
        .from("products")
        .insert({ ...payload, code, qty_on_hand: form.opening_qty })
      if (error) { setFormError(error.message); setSaving(false); return }
      setFlash("âœ… Product created!")
    }

    setSaving(false)
    setShowModal(false)
    fetchProducts()
    setTimeout(() => setFlash(""), 3000)
  }

  // â”€â”€ Soft delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product?")) return
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    fetchProducts()
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company dataâ€¦</div>
if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .form-error { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 8px 12px; border-radius: 6px; }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>ðŸ“¦ Stock Register</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Manage inventory, view opening / inflow / outflow / closing</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={16} /> New Product
          </button>
        )}
      </div>

      {flash && (
        <div style={{ background: flash.startsWith("Error") ? "#FEF2F2" : "#F0FDF4", color: flash.startsWith("Error") ? "#B91C1C" : "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search by name or code..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Cost Price</th>
              <th>Sale Price</th>
              <th style={{ textAlign: "center" }}>Opening</th>
              <th style={{ textAlign: "center" }}>Inflow</th>
              <th style={{ textAlign: "center" }}>Outflow</th>
              <th style={{ textAlign: "center" }}>Closing</th>
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
                      ) : "â€”"}
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

      {/* Pagination (simple) */}
      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13 }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {/* Add / Edit / Adjust Modal */}
      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>
                {isAdjustment ? "ðŸ”§ Adjust Stock" : editingProduct ? "âœï¸ Edit Product" : "âž• New Product"}
              </h3>
              <button className="btn-outline" onClick={() => setShowModal(false)}><X size={18} /></button>
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
                  <div>
                    <label>Image URL (optional)</label>
                    <input className="input" value={form.image_path} onChange={e => setForm({...form, image_path: e.target.value})} placeholder="https://..." />
                  </div>
                </>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "ðŸ’¾ Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
