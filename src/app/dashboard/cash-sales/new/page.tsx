"use client"
import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, CheckCircle } from "lucide-react"
import EntityPicker from "@/components/entity-picker/EntityPicker"
import { applyLineEdit, setLineLock, lineDisplay, getLock, type CalcLock } from "@/lib/line-calc"
import LineCalcInput from "@/components/LineCalcInput"

function NewCashSalePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")
  const isEditMode = !!editId
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loadingEdit, setLoadingEdit] = useState(isEditMode)
  const [editSaleNo, setEditSaleNo] = useState("")
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [customerId, setCustomerId] = useState<number | null>(null)

  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [bankAccountId, setBankAccountId] = useState<number | null>(null)

  const [items, setItems] = useState<any[]>([])
  const [stockErrors, setStockErrors] = useState<Record<number, string>>({})

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)
  const [savedSaleNo, setSavedSaleNo] = useState<string | null>(null)

  const [allAccounts, setAllAccounts] = useState<any[]>([])
  const [discountAmount, setDiscountAmount] = useState<number | "">(0)
  const [discountAccountId, setDiscountAccountId] = useState<number | null>(null)
  const [selectedDiscountAccount, setSelectedDiscountAccount] = useState<any>(null)
  const [receivedOverride, setReceivedOverride] = useState<number | null>(null) // null = full net total (default)

  // Read-only display for edit mode (discount/received are fixed once created; edit only changes line items)
  const [editSaleDiscount, setEditSaleDiscount] = useState<number>(0)
  const [editSaleAmountReceived, setEditSaleAmountReceived] = useState<number>(0)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)
      const { data: banks } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_number")
        .eq("company_id", cid)
        .eq("is_active", true)
      if (banks) setBankAccounts(banks)
      const { data: accts } = await supabase
        .from("accounts")
        .select("id, code, name")
        .eq("company_id", cid)
      if (accts) {
        setAllAccounts(accts)
        const suggested = accts.find((a: any) => /discount/i.test(a.name))
        if (suggested) {
          setDiscountAccountId(suggested.id)
          setSelectedDiscountAccount(suggested)
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!companyId || !editId) return
    setLoadingEdit(true)
    supabase
      .from("cash_sales")
      .select("*")
      .eq("id", editId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data: cs }) => {
        if (!cs) { setError("Cash sale not found"); setLoadingEdit(false); return }
        // A returned cash sale is locked: send the user to its read-only page instead
        if (cs.status === "returned") { router.replace("/dashboard/cash-sales/" + cs.id); return }

        setEditSaleNo(cs.sale_no)
        setSaleDate(cs.date)
        setReference(cs.reference || "")
        setNotes(cs.notes || "")
        setBankAccountId(cs.bank_account_id)
        setEditSaleDiscount(Number(cs.discount_amount || 0))
        setEditSaleAmountReceived(Number(cs.amount_received ?? cs.total ?? 0))

        if (cs.party_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("id, name")
            .eq("id", cs.party_id)
            .single()
          if (cust) { setCustomerId(cust.id); setSelectedCustomer(cust) }
        }

        const { data: saleItems } = await supabase
          .from("cash_sale_items")
          .select("*")
          .eq("cash_sale_id", cs.id)

        if (saleItems && saleItems.length > 0) {
          const productIds = saleItems.map((i: any) => i.product_id).filter((id: any) => id != null)
          let productMap: Record<number, any> = {}
          if (productIds.length > 0) {
            const { data: products } = await supabase
              .from("products")
              .select("id, code, name, qty_on_hand, unit")
              .in("id", productIds)
            if (products) products.forEach((p: any) => { productMap[p.id] = p })
          }
          setItems(saleItems.map((item: any) => {
            const prod = item.product_id ? productMap[item.product_id] : null
            return {
              product_id: item.product_id,
              description: item.description,
              qty: item.qty,
              unit_price: item.unit_price,
              total: item.total,
              // this sale's own qty is still deducted from qty_on_hand right now,
              // so add it back to show what will actually be available once this edit reverses it
              available: prod ? Number(prod.qty_on_hand || 0) + Number(item.qty || 0) : undefined,
              unit: prod?.unit || "PCS",
            }
          }))
        }
        setLoadingEdit(false)
      })
  }, [companyId, editId])

  useEffect(() => {
    const errors: Record<number, string> = {}
    items.forEach((item, idx) => {
      if (item.product_id && item.qty > 0 && item.available !== undefined) {
        if (item.qty > item.available) {
          errors[idx] = "Insufficient stock: available " + item.available
        }
      }
    })
    setStockErrors(errors)
  }, [items])

  const addProductItem = (prod: any) => {
    setItems([...items, {
      product_id: prod.id,
      description: prod.code + " - " + prod.name,
      qty: "",
      unit_price: prod.sale_price || 0,
      total: 0,
      available: prod.qty_on_hand || 0,
      unit: prod.unit || "PCS",
    }])
  }

  const addManualItem = () => {
    setItems([...items, {
      product_id: null,
      description: "",
      qty: 1,
      unit_price: 0,
      total: 0,
      available: undefined,
      unit: "",
    }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === "qty" || field === "unit_price" || field === "total") {
      updated[idx] = applyLineEdit(updated[idx], field, value)
    }
    setItems(updated)
  }

  const toggleLineLock = (idx: number, lock: CalcLock) => {
    const updated = [...items]
    updated[idx] = setLineLock(updated[idx], lock)
    setItems(updated)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const totalAmount = items.reduce((s, i) => s + (i.total || 0), 0)
  const hasStockErrors = Object.keys(stockErrors).length > 0

  const netTotal = Math.max(0, totalAmount - (Number(discountAmount) || 0))
  const amountReceived = isEditMode
    ? editSaleAmountReceived
    : (receivedOverride === null ? netTotal : Math.min(Math.max(0, receivedOverride), netTotal))
  const dueAmount = isEditMode
    ? Math.max(0, netTotal - editSaleAmountReceived)
    : Math.max(0, netTotal - amountReceived)
  const needsCustomer = !isEditMode && dueAmount > 0 && !customerId
  const needsDiscountAccount = !isEditMode && Number(discountAmount) > 0 && !discountAccountId

  const handleSubmit = async () => {
    if (items.length === 0) { setError("Add at least one item"); return }
    if (items.some((i: any) => i.qty === "" || !Number(i.qty) || i.unit_price === "")) { setError("Enter Qty and Rate for every item"); return }
    if (hasStockErrors) { setError("Cannot save: some items have insufficient stock."); return }
    if (!isEditMode && needsDiscountAccount) { setError("A discount account must be selected when a discount is entered."); return }
    if (!isEditMode && needsCustomer) { setError("A customer must be selected for a partially paid cash sale."); return }
    setSaving(true); setError("")
    try {
      const payloadItems = items.map(i => ({
        product_id: i.product_id || null,
        description: i.description,
        qty: i.qty,
        unit_price: i.unit_price,
      }))
      let rpcResult
      if (isEditMode) {
        const { data: { user } } = await supabase.auth.getUser()
        rpcResult = await supabase.rpc("update_cash_sale_transaction", {
          p_sale_id: Number(editId),
          p_company_id: companyId,
          p_sale_date: saleDate,
          p_items: payloadItems,
          p_party_id: customerId,
          p_bank_account_id: bankAccountId,
          p_reference: reference || "",
          p_notes: notes || "",
          p_user_email: user?.email || "system",
        })
      } else {
        rpcResult = await supabase.rpc("create_cash_sale_transaction", {
          p_company_id: companyId,
          p_sale_date: saleDate,
          p_items: payloadItems,
          p_party_id: customerId,
          p_bank_account_id: bankAccountId,
          p_reference: reference || "",
          p_notes: notes || "",
          p_user_email: "system",
          p_discount_amount: Number(discountAmount) || 0,
          p_discount_account_id: Number(discountAmount) > 0 ? discountAccountId : null,
          p_amount_received: amountReceived,
        })
      }
      const { data, error: rpcError } = rpcResult
      if (rpcError) { setError(rpcError.message || "Failed to save cash sale"); setSaving(false); return }
      if (!data || !data.success) { setError(data?.error || "Failed to save cash sale"); setSaving(false); return }

      if (isEditMode) {
        setSaving(false)
        router.push("/dashboard/cash-sales/" + editId)
        return
      }

      setSavedSaleNo(data.sale_no)
      setFlash("Cash sale " + data.sale_no + " posted successfully.")
      setItems([])
      setSelectedCustomer(null)
      setCustomerId(null)
      setBankAccountId(null)
      setReference("")
      setNotes("")
      setDiscountAmount(0)
      setReceivedOverride(null)
      setSaving(false)
    } catch (err: any) {
      setError(err.message || "Network error")
      setSaving(false)
    }
  }

  return (
    <div className="cs-page">
      <style>{`
        .cs-page { padding: 20px 16px; overflow: visible; }
        @media (max-width: 480px) { .cs-page { padding: 12px; } }

        .cs-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
        .cs-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
        .cs-input { width: 100%; height: 38px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 13px; }
        .cs-btn { height: 38px; padding: 0 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--text); font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .cs-btn-primary { background: var(--primary); color: #fff; border: none; font-weight: 600; justify-content: center; width: 100%; }

        .cs-header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 1024px) { .cs-header-grid { display: block; } .cs-desktop-summary { display: none !important; } .cs-mobile-sticky { display: flex !important; } .cs-input, .cs-btn { font-size: 16px; } }
        @media (min-width: 1025px) { .cs-desktop-summary { display: flex; flex-direction: column; gap: 12px; } .cs-mobile-sticky { display: none !important; } }

        .cs-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 600px) { .cs-two-col { grid-template-columns: 1fr; } }

        .cs-add-item-row { display: flex; gap: 10px; }
        @media (max-width: 480px) { .cs-add-item-row { flex-direction: column; } .cs-add-item-row .cs-btn { width: 100%; justify-content: center; } }

        .cs-item-header { display: grid; grid-template-columns: 2fr 80px 100px 100px 40px; gap: 8px; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
        @media (max-width: 640px) { .cs-item-header { display: none; } }

        .cs-item-row { display: grid; grid-template-columns: 2fr 80px 100px 100px 40px; gap: 8px; align-items: center; margin-bottom: 6px; }
        @media (max-width: 640px) {
          .cs-item-row { grid-template-columns: 1fr 1fr; row-gap: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
          .cs-item-row .cs-desc { grid-column: 1 / -1; }
          .cs-item-row .cs-total { grid-column: 1 / -1; }
          .cs-item-row .cs-remove { justify-self: end; }
        }

        .cs-mobile-sticky { display: none; position: sticky; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--border); padding: 10px 16px; align-items: center; justify-content: space-between; gap: 12px; z-index: 50; margin-top: 16px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="cs-btn" onClick={() => router.push("/dashboard")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            {isEditMode ? "Edit Cash Sale" + (editSaleNo ? " " + editSaleNo : "") : "New Cash Sale"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {isEditMode ? "Saving will reverse the original entry and post a corrected one." : "Receive cash immediately against a product sale"}
          </p>
        </div>
      </div>

      {loadingEdit && <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>Loading cash sale...</div>}

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div className="cs-header-grid">
        <div>
          <div className="cs-card">
            <div style={{ marginBottom: 14 }}>
              <label className="cs-label">Customer (optional - walk-in if blank)</label>
              <EntityPicker
                entityType="customer"
                value={selectedCustomer}
                onChange={(record: any) => {
                  if (record) { setCustomerId(Number(record.id)); setSelectedCustomer(record) }
                  else { setCustomerId(null); setSelectedCustomer(null) }
                }}
                label=""
              />
            </div>

            <div className="cs-two-col" style={{ marginBottom: 14 }}>
              <div>
                <label className="cs-label">Sale Date</label>
                <input className="cs-input" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
              </div>
              <div>
                <label className="cs-label">Receive Into</label>
                <select className="cs-input" value={bankAccountId ?? ""} onChange={e => setBankAccountId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Cash in Hand (default)</option>
                  {bankAccounts.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? " - " + b.account_number : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cs-two-col">
              <div>
                <label className="cs-label">Reference</label>
                <input className="cs-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional reference" />
              </div>
              <div>
                <label className="cs-label">Notes</label>
                <input className="cs-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
          </div>

          <div className="cs-card">
            <label className="cs-label">Add Item</label>
            <div className="cs-add-item-row">
              <div style={{ flex: 1 }}>
                <EntityPicker
                  entityType="product"
                  value={null}
                  onChange={(record: any) => { if (record) addProductItem(record) }}
                  placeholder="Search product..."
                  label=""
                  clearCacheOnOpen
                />
              </div>
              <button className="cs-btn" onClick={addManualItem}><Plus size={14} /> Manual</button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="cs-card">
              <div className="cs-item-header">
                <span>Description</span>
                <span style={{ textAlign: "center" }}>Qty</span>
                <span style={{ textAlign: "right" }}>Rate</span>
                <span style={{ textAlign: "right" }}>Total</span>
                <span></span>
              </div>
              {items.map((item, idx) => (
                <div key={idx}>
                  <div className="cs-item-row">
                    <input className="cs-input cs-desc" style={{ height: 34 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Description" />
                    <LineCalcInput className="cs-input" style={{ height: 34, textAlign: "center", borderColor: stockErrors[idx] ? "#EF4444" : undefined }} value={lineDisplay(item, "qty")} locked={getLock(item) === "qty"} onChange={v => updateItem(idx, "qty", v)} onLock={() => toggleLineLock(idx, "qty")} />
                    <LineCalcInput className="cs-input" style={{ height: 34, textAlign: "right" }} value={lineDisplay(item, "unit_price")} locked={getLock(item) === "rate"} onChange={v => updateItem(idx, "unit_price", v)} onLock={() => toggleLineLock(idx, "rate")} />
                    <LineCalcInput className="cs-input cs-total" style={{ height: 34, textAlign: "right", fontWeight: 600 }} value={lineDisplay(item, "total")} locked={getLock(item) === "total"} onChange={v => updateItem(idx, "total", v)} onLock={() => toggleLineLock(idx, "total")} />
                    <button className="cs-remove" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }} onClick={() => removeItem(idx)}><Trash2 size={14} /></button>
                  </div>
                  {stockErrors[idx] && <div style={{ fontSize: 11, color: "#EF4444", marginTop: -4, marginBottom: 8 }}>{stockErrors[idx]}</div>}
                </div>
              ))}
            </div>
          )}

          {!isEditMode && (
            <div className="cs-card">
              <label className="cs-label">Discount & Payment Received</label>
              <div className="cs-two-col" style={{ marginBottom: discountAmount ? 10 : 0 }}>
                <div>
                  <label className="cs-label" style={{ fontWeight: 400 }}>Discount Amount</label>
                  <input
                    className="cs-input"
                    type="number"
                    min={0}
                    value={discountAmount}
                    onChange={e => setDiscountAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
                {Number(discountAmount) > 0 && (
                  <div>
                    <label className="cs-label" style={{ fontWeight: 400 }}>Discount Account</label>
                    <EntityPicker
                      entityType="account"
                      value={selectedDiscountAccount}
                      onChange={(record: any) => {
                        setDiscountAccountId(record ? Number(record.id) : null)
                        setSelectedDiscountAccount(record)
                      }}
                      placeholder="Select GL account..."
                      compact
                      allowCreate={false}
                    />
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="cs-label" style={{ fontWeight: 400 }}>Amount Received (defaults to full net amount)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="cs-input"
                    type="number"
                    min={0}
                    max={netTotal}
                    value={receivedOverride === null ? netTotal : receivedOverride}
                    onChange={e => setReceivedOverride(e.target.value === "" ? 0 : Number(e.target.value))}
                  />
                  {receivedOverride !== null && (
                    <button type="button" className="cs-btn" onClick={() => setReceivedOverride(null)}>Full</button>
                  )}
                </div>
              </div>

              {dueAmount > 0 && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, color: "#F59E0B", fontSize: 12 }}>
                  Balance of PKR {dueAmount.toLocaleString()} will remain due.
                  {needsCustomer && " A customer must be selected to save a partial cash sale."}
                </div>
              )}
            </div>
          )}

          {isEditMode && (editSaleDiscount > 0 || dueAmount > 0 || editSaleAmountReceived < totalAmount) && (
            <div className="cs-card">
              <label className="cs-label">Discount & Payment (fixed at creation — not editable here)</label>
              <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
                {editSaleDiscount > 0 && <div>Discount: PKR {editSaleDiscount.toLocaleString()}</div>}
                <div>Received so far: PKR {editSaleAmountReceived.toLocaleString()}</div>
                <div>Due after this edit: PKR {dueAmount.toLocaleString()}</div>
              </div>
            </div>
          )}

          <div className="cs-mobile-sticky">
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{!isEditMode && dueAmount > 0 ? "Due" : "Total"}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>
                PKR {(!isEditMode && dueAmount > 0 ? dueAmount : (isEditMode ? totalAmount : netTotal)).toLocaleString()}
              </div>
            </div>
            <button className="cs-btn cs-btn-primary" style={{ width: "auto", padding: "0 20px" }} onClick={handleSubmit} disabled={saving || loadingEdit || hasStockErrors || items.length === 0 || needsCustomer || needsDiscountAccount}>
              {saving ? "..." : (isEditMode ? "Update" : "Post")}
            </button>
          </div>
        </div>

        <div className="cs-desktop-summary">
          <div className="cs-card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>Total</span>
              <span>PKR {totalAmount.toLocaleString()}</span>
            </div>
            {!isEditMode && Number(discountAmount) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                <span>Discount</span>
                <span>− PKR {Number(discountAmount).toLocaleString()}</span>
              </div>
            )}
            {!isEditMode && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <span>Net Total</span>
                  <span>PKR {netTotal.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                  <span>Received</span>
                  <span>PKR {amountReceived.toLocaleString()}</span>
                </div>
                {dueAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#F59E0B", fontWeight: 600, marginTop: 4 }}>
                    <span>Due</span>
                    <span>PKR {dueAmount.toLocaleString()}</span>
                  </div>
                )}
              </>
            )}
            {hasStockErrors && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#EF4444", fontSize: 11 }}>Some items have insufficient stock</div>
            )}
          </div>
          <div className="cs-card">
            <button className="cs-btn cs-btn-primary" onClick={handleSubmit} disabled={saving || loadingEdit || hasStockErrors || items.length === 0 || needsCustomer || needsDiscountAccount}>
              {saving ? (isEditMode ? "Updating..." : "Posting...") : (isEditMode ? "Update Cash Sale" : "Post Cash Sale")}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}

export default function NewCashSalePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading cash sale form...</div>}>
      <NewCashSalePageContent />
    </Suspense>
  )
}