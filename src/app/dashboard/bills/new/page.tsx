"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Search, X, Download, CheckCircle,
  Image as ImageIcon, RefreshCw,
} from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"

export default function NewBillPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)

  // Suppliers
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const supplierRef = useRef<HTMLDivElement>(null)
  const [refreshingSuppliers, setRefreshingSuppliers] = useState(false)

  // Products
  const [products, setProducts] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [showProductList, setShowProductList] = useState(false)

  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Master data
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [allAccounts, setAllAccounts] = useState<any[]>([])

  // Project/donor cache per activity
  const [projectCache, setProjectCache] = useState<Record<number, { id: number | null; name: string }>>({})
  const [donorCache, setDonorCache] = useState<Record<number, { id: number | null; name: string }>>({})

  // Budget info per activity+account
  const [budgetInfo, setBudgetInfo] = useState<Record<string, { budget: number; spent: number; available: number }>>({})
  const [budgetError, setBudgetError] = useState("")

  const fiscalYear = new Date().getFullYear()

  // ── Load master data ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))

      // Pass cid directly so the functions don't rely on stale state
      loadSuppliers(cid)
      loadProducts(cid)

      supabase.from("accounts")
        .select("id,code,name,type")
        .eq("company_id", cid)
        .in("type", ["Expense","Asset"])
        .order("code")
        .then(r => r.data && setAllAccounts(r.data))

      supabase.from("locations").select("id,name")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))

      supabase.from("activities").select("id,name")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setActivities(r.data))

      setLoading(false)
    })
  }, [])

  // ── Load suppliers (accepts optional cid to avoid stale state) ──
  const loadSuppliers = (cid?: string) => {
    const targetId = cid || companyId
    if (!targetId) return
    supabase.from("suppliers")
      .select("id,code,name,phone,balance,default_project_id,default_location_id,default_activity_id")
      .eq("company_id", targetId)
      .order("name")
      .then(r => {
        if (r.data) setSuppliers(r.data)
      })
  }

  // ── Load products (accepts optional cid to avoid stale state) ──
  const loadProducts = (cid?: string) => {
    const targetId = cid || companyId
    if (!targetId) return
    supabase.from("products")
      .select("id,code,name,cost_price,qty_on_hand,image_path")
      .eq("company_id", targetId)
      .is("deleted_at", null)
      .order("name")
      .then(r => r.data && setProducts(r.data))
  }

  // ── If editing, load existing bill ──
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.from("invoices")
      .select("*")
      .eq("id", editId)
      .eq("company_id", companyId)
      .single()
      .then(({ data: bill }) => {
        if (!bill) return
        setSupplierId(bill.party_id)
        const supp = suppliers.find((s: any) => s.id === bill.party_id)
        if (supp) {
          setSelectedSupplier(supp)
          setSupplierSearch(supp.name)
        }
        setBillDate(bill.date)
        setDueDate(bill.due_date)
        setReference(bill.reference || "")
        setNotes(bill.notes || "")

        supabase.from("invoice_items")
          .select("*")
          .eq("invoice_id", bill.id)
          .order("id")
          .then(({ data: itemsData }) => {
            if (itemsData) {
              const loaded = itemsData.map((item: any) => ({
                product_id: item.product_id || null,
                description: item.description,
                qty: item.qty,
                unit_price: item.unit_price,
                total: item.total,
                location_id: item.location_id || "",
                activity_id: item.activity_id || "",
                account_id: item.account_id || null,
              }))
              setItems(loaded)
            }
          })
      })
  }, [editId, companyId, suppliers])

  // ── Supplier helpers ──
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.code.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone || "").includes(supplierSearch)
  )

  const selectSupplier = (s: any) => {
    setSupplierId(s.id)
    setSelectedSupplier(s)
    setSupplierSearch(s.name)
    setShowSupplierList(false)
  }

  const clearSupplier = () => {
    setSupplierId(null)
    setSelectedSupplier(null)
    setSupplierSearch("")
    setShowSupplierList(true)
  }

  const refreshSuppliers = () => {
    if (!companyId) return
    setRefreshingSuppliers(true)
    supabase.from("suppliers")
      .select("id,code,name,phone,balance,default_project_id,default_location_id,default_activity_id")
      .eq("company_id", companyId)
      .order("name")
      .then(r => {
        if (r.data) setSuppliers(r.data)
        setRefreshingSuppliers(false)
        if (selectedSupplier) {
          const updated = r.data?.find((s: any) => s.id === selectedSupplier.id)
          if (updated) setSelectedSupplier(updated)
        }
      })
  }

  // ── Fetch project/donor for an activity ──
  const fetchProjectAndDonor = async (activityId: number) => {
    if (projectCache[activityId] && donorCache[activityId]) return
    try {
      const { data: actData } = await supabase.from("activities")
        .select("project_id, projects(name)")
        .eq("id", activityId).single()
      const proj = { id: actData?.project_id ?? null, name: (actData?.projects as any)?.name || "" }
      setProjectCache(prev => ({ ...prev, [activityId]: proj }))

      const { data: donorData } = await supabase.from("budgets")
        .select("donor_id, donors(name)")
        .eq("company_id", companyId)
        .eq("activity_id", activityId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
        .order("budgeted_amount", { ascending: false })
        .limit(1)
      const don = { id: donorData?.[0]?.donor_id ?? null, name: (donorData?.[0]?.donors as any)?.name || "" }
      setDonorCache(prev => ({ ...prev, [activityId]: don }))
    } catch { /* ignore */ }
  }

  // ── Fetch budget for activity + account ──
  const fetchBudget = async (activityId: number, accountId: number) => {
    const key = `${activityId}_${accountId}`
    if (budgetInfo[key]) return

    const { data: budgetRows } = await supabase.from("budgets")
      .select("budgeted_amount")
      .eq("company_id", companyId)
      .eq("activity_id", activityId)
      .eq("account_id", accountId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .maybeSingle()

    const { data: spentRows } = await supabase.from("journal_lines")
      .select("debit, credit")
      .eq("company_id", companyId)
      .eq("activity_id", activityId)
      .eq("account_id", accountId)

    const spent = (spentRows || []).reduce((sum, line) => sum + (line.debit || 0) - (line.credit || 0), 0)
    const budget = budgetRows?.budgeted_amount || 0
    const available = budget - spent

    setBudgetInfo(prev => ({ ...prev, [key]: { budget, spent, available } }))
  }

  // ── Product helpers ──
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  )

  const addProductItem = (prod: any) => {
    setItems([...items, {
      product_id: prod.id,
      description: `${prod.code} - ${prod.name}`,
      qty: 1,
      unit_price: prod.cost_price,
      total: prod.cost_price,
      location_id: "",
      activity_id: "",
      account_id: null,
    }])
    setProductSearch("")
    setShowProductList(false)
  }

  const addManualItem = () => {
    setItems([...items, {
      product_id: null,
      description: "",
      qty: 1,
      unit_price: 0,
      total: 0,
      location_id: "",
      activity_id: "",
      account_id: null,
    }])
  }

  const updateItem = async (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === "qty" || field === "unit_price") {
      updated[idx].total = updated[idx].qty * updated[idx].unit_price
    }
    if (field === "activity_id" && value) {
      fetchProjectAndDonor(Number(value))
    }
    if ((field === "activity_id" || field === "account_id") && updated[idx].activity_id && updated[idx].account_id) {
      fetchBudget(Number(updated[idx].activity_id), Number(updated[idx].account_id))
    }
    setItems(updated)
    checkBudgetOverrun(updated)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const checkBudgetOverrun = (currentItems: any[]) => {
    let overBudget = false
    for (const item of currentItems) {
      if (!item.product_id && item.activity_id && item.account_id) {
        const key = `${item.activity_id}_${item.account_id}`
        const info = budgetInfo[key]
        if (info && item.total > info.available) {
          overBudget = true
          break
        }
      }
    }
    setBudgetError(overBudget ? "⚠️ Some lines exceed the available budget" : "")
  }

  const totalAmount = items.reduce((s, i) => s + i.total, 0)

  // ── Bill number (exclude soft‑deleted bills) ──
  const getNextBillNo = async (suppCode: string): Promise<string> => {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_no")
      .like("invoice_no", `${suppCode}-%`)
      .eq("type", "purchase")
      .is("deleted_at", null)
      .order("invoice_no", { ascending: false })
      .limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const last = data[0].invoice_no
      const match = last.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    return `${suppCode}-${String(nextNum).padStart(2, "0")}`
  }

  const handleSubmit = async () => {
    if (!supplierId)          { setError("Please select a supplier"); return }
    if (items.length === 0)   { setError("Add at least one item"); return }

    for (const item of items) {
      if (!item.product_id) {
        if (!item.location_id || !item.activity_id || !item.account_id) {
          setError("Each manual line must have Location, Activity, and GL Account selected")
          return
        }
      }
    }

    if (businessType === "ngo" && items.some(i => !i.product_id && i.activity_id)) {
      const firstActivityId = Number(items.find(i => !i.product_id && i.activity_id)?.activity_id)
      if (firstActivityId) {
        const { data: donorRow } = await supabase.from("budgets")
          .select("donor_id")
          .eq("company_id", companyId)
          .eq("activity_id", firstActivityId)
          .eq("fiscal_year", fiscalYear)
          .is("month", null)
          .limit(1)
        if (!donorRow || donorRow.length === 0) {
          setError("Donor is required for NGO bills. Please select an activity that has a donor.")
          return
        }
      }
    }

    if (budgetError) {
      setError("Cannot save: some lines exceed the available budget. Adjust amounts or select a different activity.")
      return
    }

    setSaving(true); setError("")
    const suppCode = selectedSupplier?.code || "BILL"
    const billNo = editId ? selectedSupplier?.code + "-EDIT" : await getNextBillNo(suppCode)

    const payloadItems = items.map(i => ({
      product_id: i.product_id || null,
      description: i.description,
      qty: i.qty,
      unit_price: i.unit_price,
      location_id: i.location_id || null,
      activity_id: i.activity_id || null,
      account_id: i.account_id || null,
    }))

    const url = editId ? `/api/bills?id=${editId}` : "/api/bills"
    const method = editId ? "PUT" : "POST"

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId || undefined,
          invoice_no: billNo,
          party_id: supplierId,
          invoice_date: billDate,
          due_date: dueDate,
          items: payloadItems,
          reference, notes,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to save bill")
        setSaving(false)
        return
      }

      setFlash(`✅ Bill ${editId ? "updated" : "saved"} successfully!`)
      // Refresh supplier list so balances are up‑to‑date
      loadSuppliers()
      if (editId) {
        router.push(`/dashboard/bills/${editId}`)
      } else {
        setItems([])
        clearSupplier()
      }
      setSaving(false)
      setTimeout(() => setFlash(null), 4000)
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  const handleBeforeSavePdf = () => {
    if (!selectedSupplier) return
    const billNo = editId ? selectedSupplier.code + "-EDIT" : "PREVIEW"
    const pdfData = {
      companyName: "OneAccounts",
      invoiceNo: billNo,
      date: billDate,
      dueDate: dueDate,
      customerName: selectedSupplier.name,
      items: items.map(i => ({
        description: i.description || "",
        qty: i.qty || 0,
        unit_price: i.unit_price || 0,
        total: i.total || 0,
      })),
      subtotal: totalAmount,
      total: totalAmount,
    }
    const doc = generateInvoicePDF(pdfData)
    doc.save(`bill-preview-${billNo}.pdf`)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", background: "#0B1120", minHeight: "100vh" }}>Loading bill form…</div>
  }

  return (
    <div style={{ padding: "16px", background: "#0B1120", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .inv-shell { max-width: 1200px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #F1F5F9; }
        .inv-card {
          background: #111827; border-radius: 12px; border: 1px solid #1E293B;
          padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          margin-bottom: 12px;
        }
        .inv-label {
          font-size: 10px; font-weight: 600; color: #94A3B8;
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;
        }
        .inv-input, .inv-select {
          width: 100%; height: 38px; border: 1.5px solid #334155;
          border-radius: 8px; padding: 0 12px; font-size: 13px;
          font-family: inherit; background: #1E293B; color: #F1F5F9; outline: none; box-sizing: border-box;
        }
        .inv-input:focus, .inv-select:focus { border-color: #64748B; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; border: none;
          font-family: inherit; transition: all 0.15s; white-space: nowrap;
        }
        .inv-btn-primary { background: #1E3A8A; color: white; }
        .inv-btn-primary:hover { background: #1E40AF; }
        .inv-btn-outline { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
        .inv-btn-outline:hover { background: #1E293B; }

        .inv-item-row {
          display: grid;
          grid-template-columns: 2fr 70px 90px 110px 110px 80px 90px 30px;
          gap: 6px; align-items: center; padding: 6px 0;
          border-bottom: 1px solid #1E293B;
        }
        .inv-item-header {
          display: grid;
          grid-template-columns: 2fr 70px 90px 110px 110px 80px 90px 30px;
          gap: 6px; font-size: 9px; font-weight: 700;
          text-transform: uppercase; color: #94A3B8; padding-bottom: 6px;
        }

        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: #111827; border: 1.5px solid #334155; border-radius: 10px;
          max-height: 220px; overflow-y: auto; z-index: 100;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .cust-option {
          padding: 8px 12px; cursor: pointer;
          border-bottom: 1px solid #1E293B;
          display: flex; justify-content: space-between; align-items: center;
        }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: #1E293B; }
        .cust-option-name { font-size: 13px; font-weight: 600; color: #F1F5F9; }
        .cust-option-meta { font-size: 11px; color: #94A3B8; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: #93C5FD; white-space: nowrap; }
        .cust-selected-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: #1E293B; border: 1.5px solid #334155;
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
          font-weight: 600; color: #F1F5F9; width: 100%; cursor: pointer;
        }

        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }

        .budget-warning { background: #1E293B; border: 1px solid #EF4444; color: #FCA5A5; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/bills")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">{editId ? "✏️ Edit Purchase Bill" : "📦 New Purchase Bill"}</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>
              {editId ? "Modify bill details and items" : "Select supplier → add products or manual expenses"}
            </div>
          </div>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/bills")}>View List</button>
        </div>

        {error && (
          <div style={{ background: "#1E293B", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}
        {flash && (
          <div style={{ background: "#064E3B", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        <div className="header-grid">
          {/* LEFT: Supplier + Dates + Product search + Items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <label className="inv-label">Supplier *</label>
              <div className="cust-wrap" ref={supplierRef}>
                {selectedSupplier ? (
                  <div className="cust-selected-badge" onClick={clearSupplier} style={{ position: "relative", paddingRight: 40 }}>
                    <span>🚚</span><span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                    <button className="cust-clear" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clearSupplier(); }}><X size={14} /></button>
                    <button className="cust-clear" style={{ position: "absolute", right: 22, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#93C5FD", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); refreshSuppliers(); }} title="Refresh"><RefreshCw size={13} /></button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} style={{ position: "absolute", left: 10, color: "#94A3B8" }} />
                      <input
                        className="inv-input"
                        style={{ paddingLeft: 32, paddingRight: 32 }}
                        placeholder="Search by name, code or phone..."
                        value={supplierSearch}
                        onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true) }}
                        onFocus={() => setShowSupplierList(true)}
                        onClick={() => setShowSupplierList(true)}
                        autoComplete="off"
                      />
                      {supplierSearch && <button className="cust-clear" onClick={() => setSupplierSearch("")} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}><X size={13} /></button>}
                    </div>
                    {showSupplierList && (
                      <div className="cust-dropdown">
                        {filteredSuppliers.length === 0 ? (
                          <div style={{ padding: "10px 14px", color: "#94A3B8", fontSize: 13 }}>No suppliers found</div>
                        ) : (
                          filteredSuppliers.map(s => (
                            <div key={s.id} className="cust-option" onMouseDown={() => selectSupplier(s)}>
                              <div>
                                <div className="cust-option-name">{s.name}</div>
                                <div className="cust-option-meta">{s.code}{s.phone ? ` · ${s.phone}` : ""}</div>
                              </div>
                              <div className="cust-option-bal">PKR {(s.balance || 0).toLocaleString()}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="inv-row" style={{ marginTop: 14 }}>
                <div><label className="inv-label">Bill Date *</label><input className="inv-input" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} /></div>
                <div><label className="inv-label">Due Date</label><input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              </div>
              <div className="inv-row" style={{ marginTop: 10 }}>
                <div><label className="inv-label">Reference</label><input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Supplier Invoice #" /></div>
                <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" /></div>
              </div>

              {/* Product search + manual */}
              <div style={{ marginTop: 14 }}>
                <label className="inv-label">Add Item</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
                    <input
                      className="inv-input"
                      style={{ paddingLeft: 36 }}
                      placeholder="Search product..."
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowProductList(true) }}
                      onFocus={() => setShowProductList(true)}
                      onBlur={() => setTimeout(() => setShowProductList(false), 200)}
                    />
                    {showProductList && (
                      <div className="cust-dropdown" style={{ marginTop: 4 }}>
                        {filteredProducts.map((p: any) => (
                          <div key={p.id} className="cust-option" onMouseDown={() => addProductItem(p)}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {p.image_path && <img src={p.image_path} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />}
                              <div>
                                <div className="cust-option-name">{p.code} - {p.name}</div>
                                <div className="cust-option-meta">Cost: PKR {p.cost_price} | Stock: {p.qty_on_hand}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {filteredProducts.length === 0 && (
                          <div style={{ padding: 12, color: "#94A3B8", fontSize: 12 }}>No products found</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button className="inv-btn inv-btn-outline" onClick={addManualItem}><Plus size={14} /> Manual</button>
                </div>
              </div>
            </div>

            {/* Change History when editing */}
            {editId && (
              <div className="inv-card">
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>📝 Change History</h3>
                <RecordHistory tableName="invoices" recordId={editId} />
              </div>
            )}
          </div>

          {/* RIGHT: Summary & Post */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", margin: "0 0 10px 0" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600 }}>
                <span>Total</span>
                <span>PKR {totalAmount.toLocaleString()}</span>
              </div>
              {budgetError && (
                <div className="budget-warning" style={{ marginTop: 8 }}>
                  ⚠️ {budgetError}
                </div>
              )}
            </div>
            <div className="inv-card">
              <button
                className="inv-btn inv-btn-primary"
                style={{ justifyContent: "center", padding: 10, width: "100%" }}
                onClick={handleSubmit}
                disabled={saving || budgetError !== ""}
              >
                {saving ? "Posting..." : editId ? "💾 UPDATE Bill" : "💾 POST Bill"}
              </button>
              <button
                className="inv-btn inv-btn-outline"
                style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }}
                onClick={handleBeforeSavePdf}
              >
                <Download size={14} /> PDF Preview
              </button>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9" }}>Items</span>
          </div>
          {items.length > 0 && (
            <div className="inv-card" style={{ overflowX: "auto", padding: "16px 12px" }}>
              <div className="inv-item-header">
                <span>Description</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Location</span>
                <span>Activity</span>
                <span>GL Acc</span>
                <span style={{ textAlign: "right" }}>Total</span>
                <span></span>
              </div>
              {items.map((item, idx) => {
                const budgetKey = item.activity_id && item.account_id ? `${item.activity_id}_${item.account_id}` : null
                const budgetData = budgetKey ? budgetInfo[budgetKey] : null
                return (
                  <div key={idx}>
                    <div className="inv-item-row">
                      <input
                        className="inv-input"
                        style={{ height: 34, fontSize: 12 }}
                        value={item.description}
                        onChange={e => updateItem(idx, "description", e.target.value)}
                        placeholder="Description"
                      />
                      <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                      <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                      {item.product_id ? (
                        <>
                          <span style={{ fontSize: 11, color: "#64748B" }}>—</span>
                          <span style={{ fontSize: 11, color: "#64748B" }}>—</span>
                          <span style={{ fontSize: 11, color: "#64748B" }}>Inventory</span>
                        </>
                      ) : (
                        <>
                          <select className="inv-select" style={{ height: 34, fontSize: 11 }} value={item.location_id} onChange={e => updateItem(idx, "location_id", e.target.value)}>
                            <option value="">—</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                          <select className="inv-select" style={{ height: 34, fontSize: 11 }} value={item.activity_id} onChange={e => updateItem(idx, "activity_id", e.target.value)}>
                            <option value="">—</option>
                            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <select className="inv-select" style={{ height: 34, fontSize: 11 }} value={item.account_id ?? ""} onChange={e => updateItem(idx, "account_id", e.target.value ? Number(e.target.value) : null)}>
                            <option value="">—</option>
                            {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
                          </select>
                        </>
                      )}
                      <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>PKR {item.total.toLocaleString()}</span>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 2 }} onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                    </div>
                    {/* Show project and donor below activity */}
                    {item.activity_id && !item.product_id && (
                      <div style={{ fontSize: 10, color: "#94A3B8", marginLeft: 8, display: "flex", gap: 12, padding: "2px 0" }}>
                        <span>Project: <strong>{projectCache[item.activity_id]?.name || "Fetching…"}</strong></span>
                        <span>Donor: <strong>{donorCache[item.activity_id]?.name || "Fetching…"}</strong></span>
                      </div>
                    )}
                    {/* Budget info */}
                    {budgetData && (
                      <div style={{ fontSize: 10, color: "#94A3B8", marginLeft: 8, display: "flex", gap: 12, padding: "2px 0" }}>
                        <span>Budget: PKR {budgetData.budget.toLocaleString()}</span>
                        <span>Spent: PKR {budgetData.spent.toLocaleString()}</span>
                        <span style={{ color: budgetData.available < item.total ? "#EF4444" : "#10B981" }}>
                          Available: PKR {budgetData.available.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}