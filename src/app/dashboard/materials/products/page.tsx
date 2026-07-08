"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { usePlan } from "@/contexts/PlanContext"
import { Plus, X, Search, Pencil } from "lucide-react"

const CATEGORIES = [
  { code: "RAW", label: "Raw Material" },
  { code: "CHM", label: "Chemical" },
  { code: "STO", label: "Store / Consumable" },
  { code: "FG",  label: "Finished Good" },
]

const UOM_OPTIONS = ["kg", "bags", "litres", "units", "metres", "pcs"]

interface Product {
  id: number
  code: string
  name: string
  mm_category: string | null
  unit: string | null
  mm_conversion_kg: number | null
  mm_is_rc: boolean | null
  mm_is_sellable: boolean | null
  reorder_level: number | null
  mm_parent_product_id: number | null
  deleted_at: string | null
}

export default function MaterialsProductsPage() {
  const { hasFeature, loading: planLoading } = usePlan()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [message, setMessage] = useState("")

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: "",
    category: "RAW",
    unit: "kg",
    is_rc: false,
    reorder_level: "",
    conversion_kg: "",
    parent_product_id: "",
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      await loadProducts(cid)
      setLoading(false)
    }
    init()
  }, [])

  const loadProducts = async (cid: string) => {
    const { data, error } = await supabase
      .from("products")
      .select("id, code, name, mm_category, unit, mm_conversion_kg, mm_is_rc, mm_is_sellable, reorder_level, mm_parent_product_id, deleted_at")
      .eq("company_id", cid)
      .not("mm_category", "is", null)
      .order("code", { ascending: true })
    if (!error && data) setProducts(data as Product[])
  }

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 3000)
  }

  const generateNextCode = (category: string) => {
    const prefix = category
    const existing = products.filter(p => p.mm_category === category)
    const numbers = existing.map(p => {
      const parts = p.code.split("-")
      return parseInt(parts[1] || "0", 10) || 0
    })
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    return `${prefix}-${String(next).padStart(4, "0")}`
  }

  const openAddModal = () => {
    setEditingId(null)
    setForm({ name: "", category: "RAW", unit: "kg", is_rc: false, reorder_level: "", conversion_kg: "", parent_product_id: "" })
    setShowModal(true)
  }

  const openEditModal = (p: Product) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      category: p.mm_category || "RAW",
      unit: p.unit || "kg",
      is_rc: !!p.mm_is_rc,
      reorder_level: p.reorder_level != null ? String(p.reorder_level) : "",
      conversion_kg: p.mm_conversion_kg != null ? String(p.mm_conversion_kg) : "",
      parent_product_id: p.mm_parent_product_id != null ? String(p.mm_parent_product_id) : "",
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!companyId) return
    if (!form.name.trim()) { showMessage("❌ Product name is required"); return }
    if (form.unit !== "kg" && !form.conversion_kg) { showMessage("❌ Conversion to KG is required for non-kg units"); return }

    setSaving(true)
    const isSellable = form.category === "FG"

    if (editingId) {
      const { error } = await supabase.from("products").update({
        name: form.name.trim(),
        mm_category: form.category,
        unit: form.unit,
        mm_is_rc: form.is_rc,
        mm_is_sellable: isSellable,
        reorder_level: form.reorder_level ? parseFloat(form.reorder_level) : null,
        mm_conversion_kg: form.conversion_kg ? parseFloat(form.conversion_kg) : null,
        mm_parent_product_id: form.parent_product_id ? parseInt(form.parent_product_id) : null,
      }).eq("id", editingId).eq("company_id", companyId)

      if (error) {
        showMessage("❌ " + error.message)
      } else {
        showMessage(`✅ Product updated`)
        setShowModal(false)
        await loadProducts(companyId)
      }
    } else {
      const code = generateNextCode(form.category)
      const { error } = await supabase.from("products").insert({
        company_id: companyId,
        code,
        name: form.name.trim(),
        mm_category: form.category,
        unit: form.unit,
        mm_is_rc: form.is_rc,
        mm_is_sellable: isSellable,
        reorder_level: form.reorder_level ? parseFloat(form.reorder_level) : null,
        mm_conversion_kg: form.conversion_kg ? parseFloat(form.conversion_kg) : null,
        mm_parent_product_id: form.parent_product_id ? parseInt(form.parent_product_id) : null,
        opening_qty: 0,
        qty_on_hand: 0,
      })

      if (error) {
        showMessage("❌ " + error.message)
      } else {
        showMessage(`✅ Product ${code} added`)
        setShowModal(false)
        await loadProducts(companyId)
      }
    }
    setSaving(false)
  }

  const toggleActive = async (product: Product) => {
    if (!companyId) return
    const nowDeleting = !product.deleted_at
    const { error } = await supabase
      .from("products")
      .update({ deleted_at: nowDeleting ? new Date().toISOString() : null })
      .eq("id", product.id)
      .eq("company_id", companyId)
    if (!error) {
      showMessage(`✅ ${product.code} ${nowDeleting ? "deactivated" : "activated"}`)
      await loadProducts(companyId)
    }
  }

  const parentName = (id: number | null) => {
    if (!id) return null
    return products.find(p => p.id === id)?.name || `#${id}`
  }

  const filtered = products.filter(p => {
    if (!showInactive && p.deleted_at) return false
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
  })

  // Candidates for "parent" dropdown: same category, not itself, not already a child
  const parentCandidates = products.filter(p =>
    p.mm_category === form.category &&
    p.id !== editingId &&
    !p.mm_parent_product_id
  )

  if (planLoading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  if (!hasFeature("material_management")) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text)" }}>
        <h2>Feature Not Enabled</h2>
        <p style={{ color: "var(--text-muted)" }}>Material Management is not enabled for your company.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .mp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .mp-title { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
        .mp-subtitle { font-size: 13px; color: var(--text-muted); margin: 0; }

        .mp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; background: transparent; color: var(--text-muted); font-family: inherit; }
        .mp-btn:hover { background: var(--card-hover); }
        .mp-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .mp-btn-primary:hover { background: var(--primary-hover); }
        .mp-btn-icon { padding: 6px; }

        .mp-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
        .mp-search { display: flex; align-items: center; gap: 6px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; flex: 1; min-width: 200px; max-width: 320px; }
        .mp-search input { border: none; background: transparent; outline: none; color: var(--text); font-size: 13px; width: 100%; }

        .mp-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
        .mp-table { width: 100%; border-collapse: collapse; min-width: 820px; }
        .mp-table th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); border-bottom: 2px solid var(--border); text-transform: uppercase; }
        .mp-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
        .mp-table tr:hover { background: var(--card-hover); }
        .mp-child-name { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

        .mp-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
        .mp-badge-active { background: #065F46; color: #A7F3D0; }
        .mp-badge-inactive { background: var(--border); color: var(--text-muted); }
        .mp-badge-sellable { background: #1D4ED8; color: #DBEAFE; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-box { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 460px; width: 90%; max-height: 85vh; overflow-y: auto; color: var(--text); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
        .input-field { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; margin-bottom: 14px; background: var(--bg); color: var(--text); }
      `}</style>

      <div className="mp-header">
        <div>
          <h1 className="mp-title">📦 Material Products</h1>
          <p className="mp-subtitle">Raw materials, chemicals, consumables, and finished goods — shared with the rest of OneAccounts</p>
        </div>
        <button className="mp-btn mp-btn-primary" onClick={openAddModal}>
          <Plus size={14} /> Add Product
        </button>
      </div>

      {message && (
        <div style={{ background: message.startsWith("✅") ? "#065F46" : "#7F1D1D", color: "white", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      <div className="mp-toolbar">
        <div className="mp-search">
          <Search size={14} color="var(--text-muted)" />
          <input placeholder="Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <div className="mp-table-wrap">
        <table className="mp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Reorder Level</th>
              <th>Sellable</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>No products yet. Click "Add Product" to create your first one.</td></tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.code}</td>
                  <td>
                    {p.name}
                    {p.mm_parent_product_id && (
                      <div className="mp-child-name">↳ variant of {parentName(p.mm_parent_product_id)}</div>
                    )}
                  </td>
                  <td>{CATEGORIES.find(c => c.code === p.mm_category)?.label || p.mm_category}</td>
                  <td>{p.unit}</td>
                  <td>{p.reorder_level ?? "—"}</td>
                  <td>
                    {p.mm_is_sellable ? (
                      <span className="mp-badge mp-badge-sellable">On Invoices</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`mp-badge ${!p.deleted_at ? "mp-badge-active" : "mp-badge-inactive"}`}>
                      {!p.deleted_at ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="mp-btn mp-btn-icon" onClick={() => openEditModal(p)} title="Edit"><Pencil size={12} /></button>
                      <button className="mp-btn" onClick={() => toggleActive(p)}>
                        {!p.deleted_at ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16, margin: 0 }}>{editingId ? "Edit Product" : "Add Product"}</h2>
              <button className="mp-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <label className="field-label">Product Name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Polypropylene Granules" />

            <label className="field-label">Category</label>
            <select className="input-field" value={form.category} disabled={!!editingId} onChange={e => setForm({ ...form, category: e.target.value, parent_product_id: "" })}>
              {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            {editingId && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -10, marginBottom: 14 }}>
                Category can't be changed after creation (it's baked into the product code).
              </div>
            )}
            {form.category === "FG" && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -10, marginBottom: 14 }}>
                Finished Goods will be selectable on Sales Invoices.
              </div>
            )}

            <label className="field-label">Parent Product (optional)</label>
            <select className="input-field" value={form.parent_product_id} onChange={e => setForm({ ...form, parent_product_id: e.target.value })}>
              <option value="">— None, this is a standalone/base product —</option>
              {parentCandidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -10, marginBottom: 14 }}>
              Use this for size/packaging variants of the same base material (e.g. "Caustic Soda – 25kg Bag" and "Caustic Soda – 50kg Bag" both under a "Caustic Soda" parent).
            </div>

            <label className="field-label">Unit of Measure</label>
            <select className="input-field" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>

            {form.unit !== "kg" && (
              <>
                <label className="field-label">Conversion to KG *</label>
                <input className="input-field" type="number" value={form.conversion_kg} onChange={e => setForm({ ...form, conversion_kg: e.target.value })} placeholder={`e.g. 25 (1 ${form.unit} = 25 kg)`} />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -10, marginBottom: 14 }}>
                  Required for production math — how many KG does one {form.unit} of this product equal?
                </div>
              </>
            )}

            <label className="field-label">Reorder Level (optional)</label>
            <input className="input-field" type="number" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} placeholder="Low-stock alert threshold" />

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 16 }}>
              <input type="checkbox" checked={form.is_rc} onChange={e => setForm({ ...form, is_rc: e.target.checked })} />
              This is a returnable component / waste item
            </label>

            <button className="mp-btn mp-btn-primary" onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "10px", justifyContent: "center" }}>
              {saving ? "Saving…" : editingId ? "Update Product" : "Save Product"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}