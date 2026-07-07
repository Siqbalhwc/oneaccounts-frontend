"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { usePlan } from "@/contexts/PlanContext"
import { Factory, X, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"

interface Product {
  id: number
  code: string
  name: string
  unit: string | null
  mm_category: string | null
  mm_conversion_kg: number | null
}

interface StockRow extends Product {
  qty_on_hand: number
}

interface ProductionRun {
  id: string
  run_number: string
  raw_material_product_id: number
  finished_good_product_id: number
  kg_consumed: number
  kg_produced: number
  kg_waste: number
  ratio: number | null
  status: string
  created_at: string
}

// Returns how many KG one unit of this product equals
const kgFactor = (p: Product | undefined | null): number => {
  if (!p) return 1
  if (p.unit === "kg") return 1
  return p.mm_conversion_kg || 0 // 0 signals "not set — cannot convert"
}

export default function WipProductionPage() {
  const { hasFeature, loading: planLoading } = usePlan()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [wipStock, setWipStock] = useState<StockRow[]>([])
  const [fgProducts, setFgProducts] = useState<Product[]>([])
  const [productMap, setProductMap] = useState<Record<number, Product>>({})
  const [runs, setRuns] = useState<ProductionRun[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    raw_product_id: "",
    consumed_qty: "",
    fg_product_id: "",
    produced_qty: "",
    batch_ref: "",
    notes: "",
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      await Promise.all([loadWipStock(cid), loadFgProducts(cid), loadRuns(cid), loadAllProducts(cid)])
      setLoading(false)
    }
    init()
  }, [])

  const loadAllProducts = async (cid: string) => {
    const { data } = await supabase
      .from("products")
      .select("id, code, name, unit, mm_category, mm_conversion_kg")
      .eq("company_id", cid)
      .is("deleted_at", null)
    if (data) {
      const map: Record<number, Product> = {}
      data.forEach(p => { map[p.id] = p as Product })
      setProductMap(map)
    }
  }

  const loadWipStock = async (cid: string) => {
    const { data: balances } = await supabase
      .from("mm_stock_balance")
      .select("product_id, qty_on_hand")
      .eq("company_id", cid)
      .eq("store", "wip")

    if (!balances || balances.length === 0) { setWipStock([]); return }

    const productIds = balances.map(b => b.product_id)
    const { data: products } = await supabase
      .from("products")
      .select("id, code, name, unit, mm_category, mm_conversion_kg")
      .in("id", productIds)

    const rows: StockRow[] = (products || []).map(p => {
      const bal = balances.find(b => b.product_id === p.id)
      return { ...(p as Product), qty_on_hand: bal?.qty_on_hand || 0 }
    }).filter(r => r.qty_on_hand > 0)

    setWipStock(rows)
  }

  const loadFgProducts = async (cid: string) => {
    const { data } = await supabase
      .from("products")
      .select("id, code, name, unit, mm_category, mm_conversion_kg")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .eq("mm_category", "FG")
      .order("name")
    if (data) setFgProducts(data as Product[])
  }

  const loadRuns = async (cid: string) => {
    const { data } = await supabase
      .from("mm_production_runs")
      .select("id, run_number, raw_material_product_id, finished_good_product_id, kg_consumed, kg_produced, kg_waste, ratio, status, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
    if (data) setRuns(data as ProductionRun[])
  }

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 4000)
  }

  const generateRunNumber = () => {
    const year = new Date().getFullYear()
    const thisYear = runs.filter(r => r.run_number.includes(`PR-${year}`))
    const numbers = thisYear.map(r => parseInt(r.run_number.split("-")[2] || "0", 10) || 0)
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    return `PR-${year}-${String(next).padStart(4, "0")}`
  }

  const openModal = () => {
    setForm({ raw_product_id: "", consumed_qty: "", fg_product_id: "", produced_qty: "", batch_ref: "", notes: "" })
    setShowModal(true)
  }

  const rawProduct = wipStock.find(p => p.id === parseInt(form.raw_product_id))
  const fgProduct = fgProducts.find(p => p.id === parseInt(form.fg_product_id))

  const rawFactor = kgFactor(rawProduct)
  const fgFactor = kgFactor(fgProduct)

  const consumedKg = form.consumed_qty && rawFactor ? parseFloat(form.consumed_qty) * rawFactor : 0
  const producedKg = form.produced_qty && fgFactor ? parseFloat(form.produced_qty) * fgFactor : 0
  const wasteKg = consumedKg - producedKg

  const rawMissingFactor = !!rawProduct && rawProduct.unit !== "kg" && !rawProduct.mm_conversion_kg
  const fgMissingFactor = !!fgProduct && fgProduct.unit !== "kg" && !fgProduct.mm_conversion_kg

  const handleSave = async () => {
    if (!companyId) return
    if (!form.raw_product_id || !form.consumed_qty) { showMessage("❌ Select raw material and consumed quantity"); return }
    if (!form.fg_product_id || !form.produced_qty) { showMessage("❌ Select finished good and produced quantity"); return }
    if (rawMissingFactor) { showMessage(`❌ ${rawProduct?.name} has no KG conversion factor set — fix this on the Products page first`); return }
    if (fgMissingFactor) { showMessage(`❌ ${fgProduct?.name} has no KG conversion factor set — fix this on the Products page first`); return }

    const consumedQty = parseFloat(form.consumed_qty)
    if (consumedQty > (rawProduct?.qty_on_hand || 0)) { showMessage("❌ Cannot consume more than available WIP stock"); return }
    if (wasteKg < 0) { showMessage("❌ Produced KG cannot exceed consumed KG — check your quantities"); return }

    setSaving(true)
    const runNumber = generateRunNumber()
    const ratio = consumedKg > 0 ? (producedKg / consumedKg) * 100 : null

    const { data: run, error: runError } = await supabase
      .from("mm_production_runs")
      .insert({
        company_id: companyId,
        run_number: runNumber,
        raw_material_product_id: parseInt(form.raw_product_id),
        finished_good_product_id: parseInt(form.fg_product_id),
        batch_ref: form.batch_ref.trim() || null,
        kg_consumed: consumedKg,
        kg_produced: producedKg,
        kg_waste: wasteKg,
        ratio,
        status: "completed",
        notes: form.notes.trim() || null,
      })
      .select()
      .single()

    if (runError || !run) {
      showMessage("❌ " + (runError?.message || "Failed to save production run"))
      setSaving(false)
      return
    }

    // Consume raw material from WIP (in raw material's native unit)
    await supabase.from("mm_stock_ledger").insert({
      company_id: companyId,
      product_id: parseInt(form.raw_product_id),
      store: "wip",
      txn_type: "consumed",
      quantity: consumedQty,
      direction: -1,
      reference_type: "production_run",
      reference_id: run.id,
      notes: `${runNumber} — consumed`,
    })

    // Produce finished good into Finished Goods store (in FG's native unit)
    await supabase.from("mm_stock_ledger").insert({
      company_id: companyId,
      product_id: parseInt(form.fg_product_id),
      store: "finished_goods",
      txn_type: "produced",
      quantity: parseFloat(form.produced_qty),
      direction: 1,
      reference_type: "production_run",
      reference_id: run.id,
      notes: `${runNumber} — produced`,
    })

    // Waste — leftover raw material moved to RC Store (converted back to raw material's native unit)
    if (wasteKg > 0 && rawFactor > 0) {
      const wasteNativeQty = wasteKg / rawFactor
      await supabase.from("mm_stock_ledger").insert({
        company_id: companyId,
        product_id: parseInt(form.raw_product_id),
        store: "rc_store",
        txn_type: "waste",
        quantity: wasteNativeQty,
        direction: 1,
        reference_type: "production_run",
        reference_id: run.id,
        notes: `${runNumber} — waste`,
      })
    }

    showMessage(`✅ Production run ${runNumber} recorded`)
    setShowModal(false)
    await Promise.all([loadWipStock(companyId), loadRuns(companyId)])
    setSaving(false)
  }

  const toggleExpand = (id: string) => {
    const next = new Set(expandedRows)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpandedRows(next)
  }

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
        .wp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .wp-title { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
        .wp-subtitle { font-size: 13px; color: var(--text-muted); margin: 0; }

        .wp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; background: transparent; color: var(--text-muted); font-family: inherit; }
        .wp-btn:hover { background: var(--card-hover); }
        .wp-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .wp-btn-primary:hover { background: var(--primary-hover); }
        .wp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .wp-section-title { font-size: 14px; font-weight: 700; margin: 24px 0 10px; }

        .wp-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
        .wp-table { width: 100%; border-collapse: collapse; min-width: 650px; }
        .wp-table th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); border-bottom: 2px solid var(--border); text-transform: uppercase; }
        .wp-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
        .wp-table tr:hover { background: var(--card-hover); }
        .wp-expand-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px; }

        .wp-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; background: #065F46; color: #A7F3D0; text-transform: capitalize; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-box { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 520px; width: 100%; max-height: 88vh; overflow-y: auto; color: var(--text); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
        .input-field { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; margin-bottom: 4px; background: var(--bg); color: var(--text); }
        .kg-preview { font-size: 12px; color: var(--primary); font-weight: 600; margin-bottom: 14px; min-height: 16px; }
        .kg-warning { font-size: 11px; color: #F59E0B; display: flex; align-items: center; gap: 4px; margin-bottom: 14px; }

        .ratio-box { background: var(--bg); border: 1px dashed var(--border); border-radius: 10px; padding: 12px 14px; margin: 8px 0 16px; font-size: 12px; }
        .ratio-row { display: flex; justify-content: space-between; padding: 3px 0; }
      `}</style>

      <div className="wp-header">
        <div>
          <h1 className="wp-title">⚙️ WIP — Record Production</h1>
          <p className="wp-subtitle">Convert raw material into finished goods. All ratio math is calculated in KG regardless of native units.</p>
        </div>
        <button className="wp-btn wp-btn-primary" onClick={openModal} disabled={wipStock.length === 0}>
          <Factory size={14} /> Record Production
        </button>
      </div>

      {message && (
        <div style={{ background: message.startsWith("✅") ? "#065F46" : "#7F1D1D", color: "white", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      <div className="wp-section-title">Raw Material Currently in WIP</div>
      <div className="wp-table-wrap">
        <table className="wp-table">
          <thead><tr><th>Code</th><th>Product</th><th>Unit</th><th>Qty Available</th></tr></thead>
          <tbody>
            {wipStock.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>Nothing in WIP yet. Issue material from Material Store first.</td></tr>
            ) : (
              wipStock.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.unit}</td>
                  <td style={{ fontWeight: 600 }}>{r.qty_on_hand.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="wp-section-title">Production Run History</div>
      <div className="wp-table-wrap">
        <table className="wp-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Run #</th>
              <th>Raw Material</th>
              <th>Finished Good</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>No production runs yet.</td></tr>
            ) : (
              runs.map(r => (
                <>
                  <tr key={r.id}>
                    <td><button className="wp-expand-btn" onClick={() => toggleExpand(r.id)}>{expandedRows.has(r.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                    <td style={{ fontWeight: 600 }}>{r.run_number}</td>
                    <td>{productMap[r.raw_material_product_id]?.name || `#${r.raw_material_product_id}`}</td>
                    <td>{productMap[r.finished_good_product_id]?.name || `#${r.finished_good_product_id}`}</td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td><span className="wp-badge">{r.status}</span></td>
                  </tr>
                  {expandedRows.has(r.id) && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--bg)", padding: "12px 24px", fontSize: 12, color: "var(--text-muted)" }}>
                        Consumed: {r.kg_consumed.toFixed(2)} kg &nbsp;•&nbsp;
                        Produced: {r.kg_produced.toFixed(2)} kg &nbsp;•&nbsp;
                        Waste: {r.kg_waste.toFixed(2)} kg &nbsp;•&nbsp;
                        Yield: {r.ratio ? r.ratio.toFixed(1) : "—"}%
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
              <h2 style={{ fontSize: 16, margin: 0 }}>Record Production</h2>
              <button className="wp-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <label className="field-label">Raw Material (from WIP)</label>
            <select className="input-field" style={{ marginBottom: 14 }} value={form.raw_product_id} onChange={e => setForm({ ...form, raw_product_id: e.target.value, consumed_qty: "" })}>
              <option value="">— Select —</option>
              {wipStock.map(p => <option key={p.id} value={p.id}>{p.name} (avail: {p.qty_on_hand} {p.unit})</option>)}
            </select>

            {rawProduct && (
              <>
                <label className="field-label">Quantity Consumed ({rawProduct.unit})</label>
                <input className="input-field" type="number" value={form.consumed_qty} onChange={e => setForm({ ...form, consumed_qty: e.target.value })} placeholder="0" />
                {rawMissingFactor ? (
                  <div className="kg-warning"><AlertTriangle size={12} /> No KG conversion factor set for this product — fix on Products page first.</div>
                ) : (
                  <div className="kg-preview">= {consumedKg.toFixed(2)} kg</div>
                )}
              </>
            )}

            <label className="field-label">Finished Good Produced</label>
            <select className="input-field" style={{ marginBottom: 14 }} value={form.fg_product_id} onChange={e => setForm({ ...form, fg_product_id: e.target.value, produced_qty: "" })}>
              <option value="">— Select —</option>
              {fgProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {fgProduct && (
              <>
                <label className="field-label">Quantity Produced ({fgProduct.unit})</label>
                <input className="input-field" type="number" value={form.produced_qty} onChange={e => setForm({ ...form, produced_qty: e.target.value })} placeholder="0" />
                {fgMissingFactor ? (
                  <div className="kg-warning"><AlertTriangle size={12} /> No KG conversion factor set for this product — fix on Products page first.</div>
                ) : (
                  <div className="kg-preview">= {producedKg.toFixed(2)} kg</div>
                )}
              </>
            )}

            {form.consumed_qty && form.produced_qty && !rawMissingFactor && !fgMissingFactor && (
              <div className="ratio-box">
                <div className="ratio-row"><span>Consumed</span><strong>{consumedKg.toFixed(2)} kg</strong></div>
                <div className="ratio-row"><span>Produced</span><strong>{producedKg.toFixed(2)} kg</strong></div>
                <div className="ratio-row" style={{ color: wasteKg < 0 ? "#EF4444" : "inherit" }}>
                  <span>Waste (to RC Store)</span><strong>{wasteKg.toFixed(2)} kg</strong>
                </div>
                <div className="ratio-row"><span>Yield</span><strong>{consumedKg > 0 ? ((producedKg / consumedKg) * 100).toFixed(1) : "0"}%</strong></div>
              </div>
            )}

            <label className="field-label">Batch Reference (optional)</label>
            <input className="input-field" style={{ marginBottom: 14 }} value={form.batch_ref} onChange={e => setForm({ ...form, batch_ref: e.target.value })} placeholder="e.g. BATCH-045" />

            <label className="field-label">Notes (optional)</label>
            <input className="input-field" style={{ marginBottom: 16 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

            <button className="wp-btn wp-btn-primary" onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "10px", justifyContent: "center" }}>
              {saving ? "Saving…" : "Save Production Run"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}