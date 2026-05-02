"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Edit, Trash2, X, Upload, Package, AlertTriangle, CheckCircle } from "lucide-react"
import { CsvExport } from "@/components/CsvExport"
import { CsvImport } from "@/components/CsvImport"
import { usePlan } from "@/contexts/PlanContext"

interface Product {
  id: number
  code: string
  name: string
  category: string | null
  unit: string
  cost_price: number
  sale_price: number
  qty_on_hand: number
  opening_qty: number
  reorder_level: number
  image_path: string | null
}

export default function ProductsPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { hasFeature } = usePlan()

  const [products, setProducts] = useState<Product[]>([])
  const [filtered, setFiltered] = useState<Product[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState("")

  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [unit, setUnit] = useState("PCS")
  const [costPrice, setCostPrice] = useState(0)
  const [salePrice, setSalePrice] = useState(0)
  const [openingQty, setOpeningQty] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase.from("products").select("*").order("code")
    if (data) { setProducts(data); setFiltered(data) }
    setLoading(false)
  }

  useEffect(() => { fetchProducts() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(products); return }
    const s = search.toLowerCase()
    setFiltered(products.filter(p => p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)))
  }, [search, products])

  const generateCode = () => {
    const max = products.reduce((m, p) => { const n = parseInt(p.code?.split("-")[1]) || 0; return n > m ? n : m }, 0)
    return `PROD-${String(max + 1).padStart(3, "0")}`
  }

  const openNew = () => {
    setEditing(null)
    setCode(generateCode()); setName(""); setCategory(""); setUnit("PCS")
    setCostPrice(0); setSalePrice(0); setOpeningQty(0); setReorderLevel(0)
    setImagePreview(null); setImageFile(null)
    setShowModal(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setCode(p.code); setName(p.name); setCategory(p.category || ""); setUnit(p.unit)
    setCostPrice(p.cost_price); setSalePrice(p.sale_price)
    setOpeningQty(p.opening_qty); setReorderLevel(p.reorder_level)
    setImagePreview(p.image_path); setImageFile(null)
    setShowModal(true)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const uploadImage = async (productCode: string): Promise<string | null> => {
    if (!imageFile) return editing?.image_path || null
    const fileName = `${productCode}_${Date.now()}_${imageFile.name}`
    const { error } = await supabase.storage.from("product-images").upload(fileName, imageFile, { upsert: true, contentType: imageFile.type })
    if (error) { console.error("Upload error:", error); return null }
    const { data } = supabase.storage.from("product-images").getPublicUrl(fileName)
    return data?.publicUrl || null
  }

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) return
    setSaving(true)

    let imageUrl = editing?.image_path || null
    if (imageFile) {
      imageUrl = await uploadImage(code.trim())
    }

    const payload = {
      code: code.trim(), name: name.trim(), category: category.trim() || null,
      unit, cost_price: costPrice, sale_price: salePrice,
      opening_qty: openingQty, qty_on_hand: editing ? editing.qty_on_hand : openingQty,
      reorder_level: reorderLevel, image_path: imageUrl
    }

    if (editing) {
      await supabase.from("products").update(payload).eq("id", editing.id)
      setFlash(`Product '${name}' updated!`)
    } else {
      const { data: newProd } = await supabase.from("products").insert(payload).select("id").single()
      if (newProd && openingQty > 0) {
        const { data: invAcc } = await supabase.from("accounts").select("id,balance").eq("code", "1200").single()
        const { data: eqAcc } = await supabase.from("accounts").select("id,balance").eq("code", "3000").single()
        if (invAcc && eqAcc) {
          const totalValue = openingQty * costPrice
          const { data: je } = await supabase.from("journal_entries").insert({
            entry_no: `OB-INV-${newProd.id}`, date: new Date().toISOString().split("T")[0],
            description: `Opening Inventory - ${name}`
          }).select("id").single()
          if (je) {
            await supabase.from("journal_lines").insert([
              { entry_id: je.id, account_id: invAcc.id, debit: totalValue, credit: 0 },
              { entry_id: je.id, account_id: eqAcc.id, debit: 0, credit: totalValue }
            ])
            await supabase.from("accounts").update({ balance: invAcc.balance + totalValue }).eq("id", invAcc.id)
            await supabase.from("accounts").update({ balance: eqAcc.balance + totalValue }).eq("id", eqAcc.id)
          }
        }
        await supabase.from("stock_moves").insert({
          product_id: newProd.id, move_type: "opening", qty: openingQty,
          unit_price: costPrice, ref: `Opening - ${code}`, date: new Date().toISOString().split("T")[0]
        })
      }
      setFlash(`Product '${name}' added!`)
    }

    setSaving(false); setShowModal(false); fetchProducts()
    setTimeout(() => setFlash(""), 3000)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from("products").delete().eq("id", deleteId)
    setDeleteId(null); setFlash("Product deleted."); fetchProducts()
    setTimeout(() => setFlash(""), 3000)
  }

  const handleImport = async (rows: any[]) => {
    for (const row of rows) {
      await supabase.from("products").insert({
        code: row.code || `PROD-${Date.now()}`,
        name: row.name || "Unnamed",
        category: row.category || null,
        unit: row.unit || "PCS",
        cost_price: parseFloat(row.cost_price) || 0,
        sale_price: parseFloat(row.sale_price) || 0,
        opening_qty: parseFloat(row.opening_qty) || 0,
        qty_on_hand: parseFloat(row.qty_on_hand) || 0,
        reorder_level: parseFloat(row.reorder_level) || 0
      })
    }
    fetchProducts()
    setFlash("Import completed!")
    setTimeout(() => setFlash(""), 3000)
  }

  const getStockStatus = (qty: number, reorder: number) => {
    if (qty <= 0) return { label: "Out", color: "#EF4444", bg: "#FEE2E2", icon: <AlertTriangle size={10} /> }
    if (qty <= reorder) return { label: "Low", color: "#F59E0B", bg: "#FEF3C7", icon: <AlertTriangle size={10} /> }
    return { label: "OK", color: "#10B981", bg: "#D1FAE5", icon: <CheckCircle size={10} /> }
  }

  const totalProducts = filtered.length
  const totalValue = filtered.reduce((s, p) => s + (p.qty_on_hand * p.cost_price), 0)
  const lowStock = filtered.filter(p => p.qty_on_hand <= p.reorder_level && p.qty_on_hand > 0).length
  const outOfStock = filtered.filter(p => p.qty_on_hand <= 0).length

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .prod-shell { max-width: 1200px; }
        .prod-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .prod-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .prod-subtitle { font-size: 13px; color: #94A3B8; }
        .prod-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .prod-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .prod-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .prod-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .prod-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .prod-stat { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 14px; }
        .prod-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 4px; }
        .prod-stat-value { font-size: 20px; font-weight: 800; }
        .prod-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .prod-table-header { display: grid; grid-template-columns: 50px 80px 1fr 80px 70px 80px 80px 80px 80px 50px 50px; padding: 10px 14px; background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; align-items: center; }
        .prod-table-row { display: grid; grid-template-columns: 50px 80px 1fr 80px 70px 80px 80px 80px 80px 50px 50px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
        .prod-table-row:hover { background: #FAFBFF; }
        .prod-img { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; background: #F1F5F9; }
        .prod-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .prod-modal { background: white; border-radius: 14px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
        .prod-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
        .prod-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .prod-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .prod-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .prod-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .prod-input:focus { border-color: #1740C8; background: white; }
        .prod-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .prod-image-upload { border: 2px dashed #E2E8F0; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: border-color 0.15s; }
        .prod-image-upload:hover { border-color: #1740C8; }
        .prod-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
        .prod-icon-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; color: #94A3B8; }
        .prod-icon-btn:hover { background: #F1F5F9; color: #475569; }
        @media (max-width: 900px) {
          .prod-table-header, .prod-table-row { grid-template-columns: 50px 80px 1fr 80px 70px 60px 60px; }
          .prod-hide-md { display: none; }
        }
        @media (max-width: 600px) {
          .prod-table-header, .prod-table-row { grid-template-columns: 50px 80px 1fr 60px 60px; }
          .prod-hide-sm { display: none; }
          .prod-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="prod-shell">
        {flash && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>✅ {flash}</div>
        )}

        <div className="prod-header">
          <div>
            <div className="prod-title">📦 Products & Inventory</div>
            <div className="prod-subtitle">Manage products, stock levels, and product images</div>
          </div>
          <div className="prod-actions">
            <button className="prod-btn prod-btn-primary" onClick={openNew}><Plus size={16} /> Add Product</button>
            {hasFeature('csv_import') && (
              <>
                <CsvExport data={products} filename="products" />
                <CsvImport onImport={handleImport} />
              </>
            )}
          </div>
        </div>

        <div className="prod-stats">
          <div className="prod-stat"><div className="prod-stat-label">Total Products</div><div className="prod-stat-value" style={{ color: "#1E3A8A" }}>{totalProducts}</div></div>
          <div className="prod-stat"><div className="prod-stat-label">Stock at Cost</div><div className="prod-stat-value" style={{ color: "#1D4ED8" }}>PKR {totalValue.toLocaleString()}</div></div>
          <div className="prod-stat"><div className="prod-stat-label">Low Stock</div><div className="prod-stat-value" style={{ color: "#F59E0B" }}>{lowStock}</div></div>
          <div className="prod-stat"><div className="prod-stat-label">Out of Stock</div><div className="prod-stat-value" style={{ color: "#EF4444" }}>{outOfStock}</div></div>
        </div>

        <div style={{ position: "relative", marginBottom: 16 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
          <input placeholder="Search by code or name..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", maxWidth: 320, height: 40, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px 0 36px", fontSize: 13, outline: "none" }} />
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
          filtered.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", background: "white", borderRadius: 10 }}>No products found</div> :
          <div className="prod-table">
            <div className="prod-table-header">
              <span>Img</span><span>Code</span><span>Name</span><span className="prod-hide-md">Category</span>
              <span style={{ textAlign: "right" }}>Cost</span><span style={{ textAlign: "right" }}>Sale</span>
              <span style={{ textAlign: "right" }}>Opening</span><span style={{ textAlign: "right" }}>On Hand</span>
              <span style={{ textAlign: "center" }}>Status</span><span></span><span></span>
            </div>
            {filtered.map(p => {
              const status = getStockStatus(p.qty_on_hand, p.reorder_level)
              return (
                <div key={p.id} className="prod-table-row">
                  {p.image_path ? <img src={p.image_path} alt="" className="prod-img" /> : <div className="prod-img" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>📦</div>}
                  <span style={{ fontWeight: 700, color: "#1E3A8A", fontSize: 11 }}>{p.code}</span>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="prod-hide-md" style={{ color: "#64748B" }}>{p.category || "-"}</span>
                  <span style={{ textAlign: "right" }}>PKR {p.cost_price.toLocaleString()}</span>
                  <span style={{ textAlign: "right" }}>PKR {p.sale_price.toLocaleString()}</span>
                  <span className="prod-hide-sm" style={{ textAlign: "right" }}>{p.opening_qty}</span>
                  <span style={{ textAlign: "right", fontWeight: 600, color: p.qty_on_hand <= 0 ? "#EF4444" : p.qty_on_hand <= p.reorder_level ? "#F59E0B" : "#10B981" }}>{p.qty_on_hand}</span>
                  <span style={{ textAlign: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: status.bg, color: status.color, display: "inline-flex", alignItems: "center", gap: 3 }}>
                      {status.icon} {status.label}
                    </span>
                  </span>
                  <button className="prod-icon-btn" onClick={() => openEdit(p)}><Edit size={13} /></button>
                  <button className="prod-icon-btn" onClick={() => setDeleteId(p.id)} style={{ color: "#EF4444" }}><Trash2 size={13} /></button>
                </div>
              )
            })}
          </div>
        }
      </div>

      {showModal && (
        <div className="prod-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="prod-modal" onClick={e => e.stopPropagation()}>
            <div className="prod-modal-header">
              <div className="prod-modal-title">{editing ? "✏️ Edit Product" : "➕ Add New Product"}</div>
              <button className="prod-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="prod-modal-body">
              <div className="prod-row">
                <div><label className="prod-label">Product Code *</label><input className="prod-input" value={code} onChange={e => setCode(e.target.value)} /></div>
                <div><label className="prod-label">Product Name *</label><input className="prod-input" value={name} onChange={e => setName(e.target.value)} /></div>
              </div>
              <div className="prod-row">
                <div><label className="prod-label">Category</label><input className="prod-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="Electronics, etc." /></div>
                <div>
                  <label className="prod-label">Unit</label>
                  <select className="prod-input" value={unit} onChange={e => setUnit(e.target.value)}>
                    {["PCS", "KG", "LTR", "MTR", "BOX", "SET"].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="prod-row">
                <div><label className="prod-label">Cost Price (PKR)</label><input className="prod-input" type="number" value={costPrice} onChange={e => setCostPrice(Number(e.target.value))} /></div>
                <div><label className="prod-label">Sale Price (PKR)</label><input className="prod-input" type="number" value={salePrice} onChange={e => setSalePrice(Number(e.target.value))} /></div>
              </div>
              <div className="prod-row">
                <div><label className="prod-label">Opening Quantity</label><input className="prod-input" type="number" value={openingQty} onChange={e => setOpeningQty(Number(e.target.value))} /></div>
                <div><label className="prod-label">Reorder Level</label><input className="prod-input" type="number" value={reorderLevel} onChange={e => setReorderLevel(Number(e.target.value))} /></div>
              </div>
              {openingQty > 0 && costPrice > 0 && (
                <div style={{ background: "#F0F7FF", borderRadius: 8, padding: 10, fontSize: 12, color: "#1E3A8A" }}>
                  Opening Inventory Value: <strong>PKR {(openingQty * costPrice).toLocaleString()}</strong> (DR 1200 Inventory / CR 3000 Owner Equity)
                </div>
              )}

              <div>
                <label className="prod-label">Product Image</label>
                <div className="prod-image-upload" onClick={() => fileInputRef.current?.click()}>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} hidden />
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, objectFit: "contain" }} />
                  ) : (
                    <div style={{ color: "#94A3B8" }}>
                      <Upload size={24} style={{ marginBottom: 6 }} />
                      <div style={{ fontSize: 12 }}>Click to upload image</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="prod-modal-footer">
              <button className="prod-btn prod-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="prod-btn prod-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "💾 Save Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="prod-modal-overlay">
          <div className="prod-modal" style={{ maxWidth: 400 }}>
            <div className="prod-modal-header"><div className="prod-modal-title">⚠️ Delete Product?</div></div>
            <div className="prod-modal-body" style={{ textAlign: "center" }}>
              <p style={{ color: "#EF4444" }}>This action cannot be undone.</p>
            </div>
            <div className="prod-modal-footer" style={{ justifyContent: "center" }}>
              <button className="prod-btn prod-btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="prod-btn prod-btn-primary" style={{ background: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}