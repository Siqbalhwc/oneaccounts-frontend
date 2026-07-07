"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { usePlan } from "@/contexts/PlanContext"
import { Send, X, Search, AlertTriangle } from "lucide-react"

interface Product {
  id: number
  code: string
  name: string
  unit: string | null
  reorder_level: number | null
}

interface StockRow extends Product {
  qty_on_hand: number
}

export default function MaterialStorePage() {
  const { hasFeature, loading: planLoading } = usePlan()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [stockRows, setStockRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState("")

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [issueProduct, setIssueProduct] = useState<StockRow | null>(null)
  const [issueQty, setIssueQty] = useState("")
  const [issueNotes, setIssueNotes] = useState("")

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      await loadStock(cid)
      setLoading(false)
    }
    init()
  }, [])

  const loadStock = async (cid: string) => {
    // Get every product that has ever moved through Material Store
    const { data: balances } = await supabase
      .from("mm_stock_balance")
      .select("product_id, qty_on_hand")
      .eq("company_id", cid)
      .eq("store", "material_store")

    if (!balances || balances.length === 0) {
      setStockRows([])
      return
    }

    const productIds = balances.map(b => b.product_id)
    const { data: products } = await supabase
      .from("products")
      .select("id, code, name, unit, reorder_level")
      .in("id", productIds)

    const rows: StockRow[] = (products || []).map(p => {
      const bal = balances.find(b => b.product_id === p.id)
      return { ...p, qty_on_hand: bal?.qty_on_hand || 0 }
    })

    rows.sort((a, b) => a.name.localeCompare(b.name))
    setStockRows(rows)
  }

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 3500)
  }

  const openIssueModal = (product: StockRow) => {
    setIssueProduct(product)
    setIssueQty("")
    setIssueNotes("")
    setShowModal(true)
  }

  const handleIssueToWIP = async () => {
    if (!companyId || !issueProduct) return
    const qty = parseFloat(issueQty)
    if (!qty || qty <= 0) { showMessage("❌ Enter a valid quantity"); return }
    if (qty > issueProduct.qty_on_hand) { showMessage("❌ Cannot issue more than available stock"); return }

    setSaving(true)

    // Out of Material Store
    const { error: outError } = await supabase.from("mm_stock_ledger").insert({
      company_id: companyId,
      product_id: issueProduct.id,
      store: "material_store",
      txn_type: "issued",
      quantity: qty,
      direction: -1,
      reference_type: "store_transfer",
      notes: issueNotes.trim() || "Issued to WIP",
    })

    // Into WIP
    const { error: inError } = await supabase.from("mm_stock_ledger").insert({
      company_id: companyId,
      product_id: issueProduct.id,
      store: "wip",
      txn_type: "received",
      quantity: qty,
      direction: 1,
      reference_type: "store_transfer",
      notes: issueNotes.trim() || "Received from Material Store",
    })

    // Audit trail record
    await supabase.from("mm_store_transfers").insert({
      company_id: companyId,
      from_store: "material_store",
      to_store: "wip",
      product_id: issueProduct.id,
      quantity: qty,
      uom: issueProduct.unit || "kg",
      status: "accepted",
      accepted_at: new Date().toISOString(),
      notes: issueNotes.trim() || null,
    })

    if (outError || inError) {
      showMessage("❌ " + (outError?.message || inError?.message))
    } else {
      showMessage(`✅ Issued ${qty} ${issueProduct.unit || ""} of ${issueProduct.name} to WIP`)
      setShowModal(false)
      await loadStock(companyId)
    }
    setSaving(false)
  }

  const filtered = stockRows.filter(r => {
    const q = search.toLowerCase()
    return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
  })

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
        .ms-header { margin-bottom: 20px; }
        .ms-title { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
        .ms-subtitle { font-size: 13px; color: var(--text-muted); margin: 0; }

        .ms-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 12px; cursor: pointer; background: transparent; color: var(--text-muted); font-family: inherit; }
        .ms-btn:hover { background: var(--card-hover); }
        .ms-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .ms-btn-primary:hover { background: var(--primary-hover); }
        .ms-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .ms-search { display: flex; align-items: center; gap: 6px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; max-width: 320px; margin-bottom: 16px; }
        .ms-search input { border: none; background: transparent; outline: none; color: var(--text); font-size: 13px; width: 100%; }

        .ms-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
        .ms-table { width: 100%; border-collapse: collapse; min-width: 650px; }
        .ms-table th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); border-bottom: 2px solid var(--border); text-transform: uppercase; }
        .ms-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
        .ms-table tr:hover { background: var(--card-hover); }

        .ms-low-stock { display: inline-flex; align-items: center; gap: 4px; color: #F59E0B; font-size: 11px; font-weight: 600; margin-left: 6px; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-box { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 420px; width: 100%; color: var(--text); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
        .input-field { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; margin-bottom: 14px; background: var(--bg); color: var(--text); }
      `}</style>

      <div className="ms-header">
        <h1 className="ms-title">🏬 Material Store</h1>
        <p className="ms-subtitle">Raw material currently held before production — receipts post here automatically from Gate Pass</p>
      </div>

      {message && (
        <div style={{ background: message.startsWith("✅") ? "#065F46" : "#7F1D1D", color: "white", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      <div className="ms-search">
        <Search size={14} color="var(--text-muted)" />
        <input placeholder="Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="ms-table-wrap">
        <table className="ms-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Product</th>
              <th>Unit</th>
              <th>Qty on Hand</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>No stock yet. Create an Inward Gate Pass to receive material.</td></tr>
            ) : (
              filtered.map(r => {
                const isLow = r.reorder_level != null && r.qty_on_hand <= r.reorder_level
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.code}</td>
                    <td>
                      {r.name}
                      {isLow && <span className="ms-low-stock"><AlertTriangle size={11} /> Low stock</span>}
                    </td>
                    <td>{r.unit}</td>
                    <td style={{ fontWeight: 600 }}>{r.qty_on_hand.toLocaleString()}</td>
                    <td>
                      <button className="ms-btn ms-btn-primary" onClick={() => openIssueModal(r)} disabled={r.qty_on_hand <= 0}>
                        <Send size={12} /> Issue to WIP
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && issueProduct && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16, margin: 0 }}>Issue to WIP</h2>
              <button className="ms-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 14 }}>
              <strong>{issueProduct.name}</strong>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Available: {issueProduct.qty_on_hand.toLocaleString()} {issueProduct.unit}
              </div>
            </div>

            <label className="field-label">Quantity to Issue ({issueProduct.unit})</label>
            <input className="input-field" type="number" value={issueQty} onChange={e => setIssueQty(e.target.value)} placeholder="0" />

            <label className="field-label">Notes (optional)</label>
            <input className="input-field" value={issueNotes} onChange={e => setIssueNotes(e.target.value)} placeholder="e.g. For production run PR-2026-001" />

            <button className="ms-btn ms-btn-primary" onClick={handleIssueToWIP} disabled={saving} style={{ width: "100%", padding: "10px", justifyContent: "center" }}>
              {saving ? "Saving…" : "Confirm Issue"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}