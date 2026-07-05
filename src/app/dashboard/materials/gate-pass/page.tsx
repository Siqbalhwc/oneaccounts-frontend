"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { usePlan } from "@/contexts/PlanContext"
import { Plus, X, ChevronDown, ChevronRight, Trash2 } from "lucide-react"

interface Supplier { id: number; code: string; name: string }
interface Product { id: number; code: string; name: string; unit: string | null; mm_category: string | null }
interface PurchaseOrder { id: number; po_no: string; supplier_id: number; status: string }

interface LineItemForm {
  product_id: string
  expected_qty: string
  received_qty: string
  batch_number: string
}

interface IgpRow {
  id: string
  igp_number: string
  supplier_id: number | null
  vehicle_number: string
  driver_name: string | null
  received_date: string
  status: string
  notes: string | null
  linked_po_id: number | null
  lineItems?: { product_name: string; received_qty: number; uom: string }[]
}

export default function InwardGatePassPage() {
  const { hasFeature, loading: planLoading } = usePlan()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [gatePasses, setGatePasses] = useState<IgpRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [matProducts, setMatProducts] = useState<Product[]>([])       // RAW/CHM/STO only — for manual entry
  const [productMap, setProductMap] = useState<Record<number, Product>>({}) // all products — for PO-sourced line display
  const [approvedPOs, setApprovedPOs] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedPoId, setSelectedPoId] = useState("")
  const [form, setForm] = useState({
    supplier_id: "",
    vehicle_number: "",
    driver_name: "",
    received_date: new Date().toISOString().split("T")[0],
    notes: "",
  })
  const [lineItems, setLineItems] = useState<LineItemForm[]>([
    { product_id: "", expected_qty: "", received_qty: "", batch_number: "" },
  ])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      await Promise.all([loadGatePasses(cid), loadSuppliers(cid), loadProducts(cid), loadApprovedPOs(cid)])
      setLoading(false)
    }
    init()
  }, [])

  const loadSuppliers = async (cid: string) => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
    if (data) setSuppliers(data as Supplier[])
  }

  const loadProducts = async (cid: string) => {
    const { data } = await supabase
      .from("products")
      .select("id, code, name, unit, mm_category")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
    if (data) {
      const all = data as Product[]
      const map: Record<number, Product> = {}
      all.forEach(p => { map[p.id] = p })
      setProductMap(map)
      setMatProducts(all.filter(p => ["RAW", "CHM", "STO"].includes(p.mm_category || "")))
    }
  }

  const loadApprovedPOs = async (cid: string) => {
    const { data } = await supabase
      .from("purchase_orders")
      .select("id, po_no, supplier_id, status")
      .eq("company_id", cid)
      .eq("status", "Approved")
      .order("po_no")
    if (data) setApprovedPOs(data as PurchaseOrder[])
  }

  const loadGatePasses = async (cid: string) => {
    const { data } = await supabase
      .from("mm_inward_gate_passes")
      .select("id, igp_number, supplier_id, vehicle_number, driver_name, received_date, status, notes, linked_po_id")
      .eq("company_id", cid)
      .order("received_date", { ascending: false })
    if (data) setGatePasses(data as IgpRow[])
  }

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 3500)
  }

  const generateIgpNumber = () => {
    const year = new Date().getFullYear()
    const thisYear = gatePasses.filter(g => g.igp_number.includes(`IGP-${year}`))
    const numbers = thisYear.map(g => parseInt(g.igp_number.split("-")[2] || "0", 10) || 0)
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    return `IGP-${year}-${String(next).padStart(4, "0")}`
  }

  const openAddModal = () => {
    setForm({ supplier_id: "", vehicle_number: "", driver_name: "", received_date: new Date().toISOString().split("T")[0], notes: "" })
    setLineItems([{ product_id: "", expected_qty: "", received_qty: "", batch_number: "" }])
    setSelectedPoId("")
    setShowModal(true)
  }

  const handleSelectPO = async (poId: string) => {
    setSelectedPoId(poId)
    if (!poId) return
    const po = approvedPOs.find(p => p.id === parseInt(poId))
    if (!po) return

    setForm(prev => ({ ...prev, supplier_id: String(po.supplier_id) }))

    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("product_id, qty")
      .eq("po_id", po.id)

    if (items && items.length > 0) {
      setLineItems(
        items
          .filter(it => it.product_id)
          .map(it => ({
            product_id: String(it.product_id),
            expected_qty: String(it.qty),
            received_qty: "",
            batch_number: "",
          }))
      )
    }
  }

  const clearPOLink = () => {
    setSelectedPoId("")
    setForm(prev => ({ ...prev, supplier_id: "" }))
    setLineItems([{ product_id: "", expected_qty: "", received_qty: "", batch_number: "" }])
  }

  const addLineItem = () => setLineItems([...lineItems, { product_id: "", expected_qty: "", received_qty: "", batch_number: "" }])
  const removeLineItem = (idx: number) => setLineItems(lineItems.filter((_, i) => i !== idx))
  const updateLineItem = (idx: number, field: keyof LineItemForm, value: string) => {
    const updated = [...lineItems]
    updated[idx] = { ...updated[idx], [field]: value }
    setLineItems(updated)
  }

  const handleSave = async () => {
    if (!companyId) return
    if (!form.vehicle_number.trim()) { showMessage("❌ Vehicle number is required"); return }
    const validItems = lineItems.filter(li => li.product_id && li.received_qty)
    if (validItems.length === 0) { showMessage("❌ Add at least one product with a received quantity"); return }

    setSaving(true)
    const igpNumber = generateIgpNumber()

    const { data: igp, error: igpError } = await supabase
      .from("mm_inward_gate_passes")
      .insert({
        company_id: companyId,
        igp_number: igpNumber,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        vehicle_number: form.vehicle_number.trim(),
        driver_name: form.driver_name.trim() || null,
        received_date: form.received_date,
        status: "received",
        notes: form.notes.trim() || null,
        linked_po_id: selectedPoId ? parseInt(selectedPoId) : null,
      })
      .select()
      .single()

    if (igpError || !igp) {
      showMessage("❌ " + (igpError?.message || "Failed to create gate pass"))
      setSaving(false)
      return
    }

    for (const li of validItems) {
      const product = productMap[parseInt(li.product_id)]
      const uom = (product?.unit || "kg") as string

      const { error: lineError } = await supabase.from("mm_igp_line_items").insert({
        company_id: companyId,
        igp_id: igp.id,
        product_id: parseInt(li.product_id),
        expected_qty: li.expected_qty ? parseFloat(li.expected_qty) : null,
        received_qty: parseFloat(li.received_qty),
        uom,
        batch_number: li.batch_number.trim() || null,
      })

      if (lineError) {
        showMessage("⚠️ Gate pass saved, but a line item failed: " + lineError.message)
        continue
      }

      await supabase.from("mm_stock_ledger").insert({
        company_id: companyId,
        product_id: parseInt(li.product_id),
        store: "material_store",
        txn_type: "received",
        quantity: parseFloat(li.received_qty),
        direction: 1,
        reference_type: "inward_gate_pass",
        reference_id: igp.id,
        notes: `${igpNumber} — received`,
      })
    }

    showMessage(`✅ Gate pass ${igpNumber} created`)
    setShowModal(false)
    await loadGatePasses(companyId)
    setSaving(false)
  }

  const toggleExpand = async (row: IgpRow) => {
    const next = new Set(expandedRows)
    if (next.has(row.id)) {
      next.delete(row.id)
      setExpandedRows(next)
      return
    }
    if (!row.lineItems) {
      const { data } = await supabase
        .from("mm_igp_line_items")
        .select("received_qty, uom, product_id")
        .eq("igp_id", row.id)
      const items = (data || []).map(li => ({
        product_name: productMap[li.product_id]?.name || `Product #${li.product_id}`,
        received_qty: li.received_qty,
        uom: li.uom,
      }))
      setGatePasses(prev => prev.map(g => g.id === row.id ? { ...g, lineItems: items } : g))
    }
    next.add(row.id)
    setExpandedRows(next)
  }

  const supplierName = (id: number | null) => suppliers.find(s => s.id === id)?.name || "—"
  const poNumber = (id: number | null) => approvedPOs.find(p => p.id === id)?.po_no || null

  if (planLoading || loading) {
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
        .gp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .gp-title { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
        .gp-subtitle { font-size: 13px; color: var(--text-muted); margin: 0; }

        .gp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; background: transparent; color: var(--text-muted); font-family: inherit; }
        .gp-btn:hover { background: var(--card-hover); }
        .gp-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .gp-btn-primary:hover { background: var(--primary-hover); }
        .gp-btn-danger { background: #EF4444; color: white; border-color: #EF4444; }

        .gp-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
        .gp-table { width: 100%; border-collapse: collapse; min-width: 750px; }
        .gp-table th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); border-bottom: 2px solid var(--border); text-transform: uppercase; }
        .gp-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
        .gp-table tr:hover { background: var(--card-hover); }
        .gp-expand-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px; }

        .gp-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; background: #065F46; color: #A7F3D0; text-transform: capitalize; }
        .gp-badge-po { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; background: #1D4ED8; color: #DBEAFE; margin-left: 6px; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-box { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 640px; width: 100%; max-height: 88vh; overflow-y: auto; color: var(--text); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
        .input-field { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; margin-bottom: 14px; background: var(--bg); color: var(--text); }
        .input-field:disabled { opacity: 0.6; cursor: not-allowed; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .po-link-box { background: var(--bg); border: 1px dashed var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }

        .line-item-row { display: grid; grid-template-columns: 2fr 60px 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
        .line-item-header { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .line-item-unit { font-size: 12px; color: var(--text-muted); text-align: center; text-transform: uppercase; font-weight: 600; }

        @media (max-width: 600px) {
          .form-row { grid-template-columns: 1fr; }
          .line-item-row { grid-template-columns: 1fr; }
          .line-item-unit { text-align: left; }
        }
      `}</style>

      <div className="gp-header">
        <div>
          <h1 className="gp-title">🚛 Inward Gate Pass</h1>
          <p className="gp-subtitle">Raw material received from suppliers — posts directly into Material Store</p>
        </div>
        <button className="gp-btn gp-btn-primary" onClick={openAddModal}>
          <Plus size={14} /> New Gate Pass
        </button>
      </div>

      {message && (
        <div style={{ background: message.startsWith("✅") ? "#065F46" : message.startsWith("⚠️") ? "#7C2D12" : "#7F1D1D", color: "white", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      <div className="gp-table-wrap">
        <table className="gp-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>IGP Number</th>
              <th>Supplier</th>
              <th>Vehicle</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {gatePasses.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>No gate passes yet. Click "New Gate Pass" to record your first delivery.</td></tr>
            ) : (
              gatePasses.map(gp => (
                <>
                  <tr key={gp.id}>
                    <td>
                      <button className="gp-expand-btn" onClick={() => toggleExpand(gp)}>
                        {expandedRows.has(gp.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{gp.igp_number}</td>
                    <td>{supplierName(gp.supplier_id)}</td>
                    <td>{gp.vehicle_number}</td>
                    <td>{new Date(gp.received_date).toLocaleDateString()}</td>
                    <td>
                      <span className="gp-badge">{gp.status}</span>
                      {gp.linked_po_id && <span className="gp-badge-po">PO: {poNumber(gp.linked_po_id) || `#${gp.linked_po_id}`}</span>}
                    </td>
                  </tr>
                  {expandedRows.has(gp.id) && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--bg)", padding: "12px 24px" }}>
                        {gp.lineItems && gp.lineItems.length > 0 ? (
                          <div>
                            {gp.lineItems.map((li, i) => (
                              <div key={i} style={{ fontSize: 12, color: "var(--text-muted)", padding: "3px 0" }}>
                                • {li.product_name} — {li.received_qty} {li.uom}
                              </div>
                            ))}
                            {gp.notes && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Notes: {gp.notes}</div>}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No line items.</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16, margin: 0 }}>New Inward Gate Pass</h2>
              <button className="gp-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div className="po-link-box">
              <label className="field-label">Link to Approved Purchase Order (optional)</label>
              <select
                className="input-field"
                style={{ marginBottom: selectedPoId ? 8 : 0 }}
                value={selectedPoId}
                onChange={e => e.target.value ? handleSelectPO(e.target.value) : clearPOLink()}
              >
                <option value="">— No PO / manual entry —</option>
                {approvedPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.po_no} — {supplierName(po.supplier_id)}</option>
                ))}
              </select>
              {selectedPoId && (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Supplier and expected quantities filled from this PO. Enter what was actually received below.
                  <button className="gp-btn" style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px" }} onClick={clearPOLink}>Clear</button>
                </div>
              )}
            </div>

            <div className="form-row">
              <div>
                <label className="field-label">Supplier</label>
                <select className="input-field" value={form.supplier_id} disabled={!!selectedPoId} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Received Date</label>
                <input className="input-field" type="date" value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div>
                <label className="field-label">Vehicle Number *</label>
                <input className="input-field" value={form.vehicle_number} onChange={e => setForm({ ...form, vehicle_number: e.target.value })} placeholder="e.g. LEA-1234" />
              </div>
              <div>
                <label className="field-label">Driver Name</label>
                <input className="input-field" value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} placeholder="Optional" />
              </div>
            </div>

            <label className="field-label">Notes</label>
            <input className="input-field" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />

            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <div className="line-item-header" style={{ display: "grid", gridTemplateColumns: "2fr 60px 1fr 1fr 1fr auto", gap: 8 }}>
                <span>Product</span><span>Unit</span><span>Expected</span><span>Received *</span><span>Batch #</span><span></span>
              </div>
              {lineItems.map((li, idx) => (
                <div key={idx} className="line-item-row">
                  {selectedPoId ? (
                    <input className="input-field" style={{ marginBottom: 0 }} disabled value={productMap[parseInt(li.product_id)]?.name || `Product #${li.product_id}`} />
                  ) : (
                    <select className="input-field" style={{ marginBottom: 0 }} value={li.product_id} onChange={e => updateLineItem(idx, "product_id", e.target.value)}>
                      <option value="">— Select —</option>
                      {matProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <div className="line-item-unit">{productMap[parseInt(li.product_id)]?.unit || "—"}</div>
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" value={li.expected_qty} disabled={!!selectedPoId} onChange={e => updateLineItem(idx, "expected_qty", e.target.value)} placeholder="Qty" />
                  <input className="input-field" style={{ marginBottom: 0 }} type="number" value={li.received_qty} onChange={e => updateLineItem(idx, "received_qty", e.target.value)} placeholder="Qty" />
                  <input className="input-field" style={{ marginBottom: 0 }} value={li.batch_number} onChange={e => updateLineItem(idx, "batch_number", e.target.value)} placeholder="Optional" />
                  {!selectedPoId && (
                    <button className="gp-btn gp-btn-danger" onClick={() => removeLineItem(idx)} disabled={lineItems.length === 1} title="Remove">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {!selectedPoId && (
                <button className="gp-btn" onClick={addLineItem} style={{ marginTop: 6 }}>
                  <Plus size={12} /> Add Product Line
                </button>
              )}
            </div>

            <button className="gp-btn gp-btn-primary" onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "10px", justifyContent: "center", marginTop: 16 }}>
              {saving ? "Saving…" : "Save Gate Pass"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}