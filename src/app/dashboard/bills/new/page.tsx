"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, Search, X, Download, CheckCircle } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"

export default function NewBillPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")
  const [businessType, setBusinessType] = useState<string>("")

  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const supplierRef = useRef<HTMLDivElement>(null)

  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const [productSearch, setProductSearch] = useState("")
  const [showProductList, setShowProductList] = useState(false)

  // Analytic tags – order: Location, Project, Donor (if NGO), Activity, Expense Account
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")
  const [selectedActivityId, setSelectedActivityId] = useState<string>("")
  const [expenseAccountId, setExpenseAccountId] = useState<number | null>(null)

  // Master data
  const [allAccounts, setAllAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [filteredActivities, setFilteredActivities] = useState<any[]>([])  // activities that have budget in the selected project+location

  const [fiscalYear] = useState(new Date().getFullYear())

  // ── Load master data & business type ──────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => { if (r.data) setBusinessType(r.data.business_type || "") })

      supabase.from("suppliers").select("id,code,name,phone,balance,default_project_id,default_location_id,default_activity_id")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setSuppliers(r.data))

      supabase.from("products").select("id,code,name,cost_price,qty_on_hand").eq("company_id", cid).order("name")
        .then(r => r.data && setProducts(r.data))

      supabase.from("accounts").select("id,code,name,type").eq("company_id", cid).order("code")
        .then(r => { if (r.data) setAllAccounts(r.data) })

      supabase.from("projects").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("locations").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
      supabase.from("donors").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setDonors(r.data))
    })
  }, [])

  // ── Filter activities when both project and location are selected ──
  useEffect(() => {
    if (!companyId || !selectedProjectId || !selectedLocationId) {
      setFilteredActivities([])
      return
    }
    // Fetch distinct activity IDs from budgets for this project+location+fiscal year
    let query = supabase
      .from("budgets")
      .select("activity_id, activities!inner(name)")
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .eq("location_id", selectedLocationId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
    
    if (businessType === "ngo" && selectedDonorId) {
      query = query.eq("donor_id", selectedDonorId)
    }

    query.then(({ data }) => {
      if (data) {
        // data is array of { activity_id, activities: { name } }
        const distinct = new Map<number, string>()
        data.forEach((row: any) => {
          if (row.activity_id && row.activities) {
            distinct.set(row.activity_id, row.activities.name)
          }
        })
        setFilteredActivities(Array.from(distinct.entries()).map(([id, name]) => ({ id, name })))
      } else {
        setFilteredActivities([])
      }
    })
  }, [companyId, selectedProjectId, selectedLocationId, selectedDonorId, businessType, fiscalYear])

  // Reset activity when project/location changes
  useEffect(() => {
    setSelectedActivityId("")
  }, [selectedProjectId, selectedLocationId])

  // Close supplier dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

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
    // Pre‑fill from supplier defaults if they exist
    setSelectedProjectId(s.default_project_id || "")
    setSelectedLocationId(s.default_location_id || "")
    setSelectedActivityId("")
    setSelectedDonorId("")
    if (s.default_expense_account_id) {
      setExpenseAccountId(s.default_expense_account_id)
    } else {
      setExpenseAccountId(null)
    }
  }

  const clearSupplier = () => {
    setSupplierId(null)
    setSelectedSupplier(null)
    setSupplierSearch("")
    setShowSupplierList(true)
    setSelectedProjectId("")
    setSelectedLocationId("")
    setSelectedActivityId("")
    setSelectedDonorId("")
    setExpenseAccountId(null)
  }

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
      account_id: null,
    }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === "qty" || field === "unit_price") {
      updated[idx].total = updated[idx].qty * updated[idx].unit_price
    }
    setItems(updated)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const getNextBillNo = async (suppCode: string): Promise<string> => {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_no")
      .like("invoice_no", `${suppCode}-%`)
      .eq("type", "purchase")
      .order("invoice_no", { ascending: false })
      .limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const last = data[0].invoice_no
      const parts = last.split("-")
      const num = parseInt(parts[parts.length - 1])
      if (!isNaN(num)) nextNum = num + 1
    }
    return `${suppCode}-${String(nextNum).padStart(2, "0")}`
  }

  const totalAmount = items.reduce((s, i) => s + i.total, 0)

  // ── Budget validation ─────────────────────────────
  const checkBudgetAvailability = async (): Promise<boolean> => {
    if (!selectedProjectId || !selectedLocationId || !selectedActivityId || !expenseAccountId) {
      // If tags or account missing, skip budget check
      return true
    }

    // Get the total amount for this specific activity+location+account combination
    const totalForCombination = items.reduce((sum, item) => {
      // Items may have their own account_id, but for now we use the header expense account as default
      const accId = item.account_id || expenseAccountId
      if (accId === expenseAccountId) {
        return sum + item.total
      }
      return sum
    }, 0)

    if (totalForCombination <= 0) return true

    // Fetch budget row
    const { data: budgetRow } = await supabase
      .from("budgets")
      .select("budgeted_amount")
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .eq("activity_id", selectedActivityId)
      .eq("location_id", selectedLocationId)
      .eq("account_id", expenseAccountId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .maybeSingle()

    const budget = budgetRow?.budgeted_amount || 0

    // Fetch actuals YTD for the same tags
    const startDate = `${fiscalYear}-01-01`
    const endDate = `${fiscalYear}-12-31`

    const { data: actualRows } = await supabase
      .from("journal_lines")
      .select("debit, credit")
      .eq("company_id", companyId)
      .eq("project_id", selectedProjectId)
      .eq("activity_id", selectedActivityId)
      .eq("location_id", selectedLocationId)
      .eq("account_id", expenseAccountId)
      .gte("journal_entries.date", startDate)
      .lte("journal_entries.date", endDate)

    const actual = actualRows?.reduce((s, row) => s + ((row.debit || 0) - (row.credit || 0)), 0) || 0

    const remaining = budget - actual
    if (totalForCombination > remaining) {
      setError(`❌ Budget exceeded! Remaining budget for this activity/location/account is PKR ${remaining.toLocaleString()}. You are trying to spend PKR ${totalForCombination.toLocaleString()}.`)
      return false
    }
    return true
  }

  // ── Submit handler ────────────────────────────────
  const handleSubmit = async () => {
    if (!supplierId) { setError("Please select a supplier"); return }
    if (items.length === 0) { setError("Add at least one item"); return }
    if (businessType === "ngo" && !selectedDonorId) { setError("Donor is required for NGO bills"); return }
    if (!selectedProjectId || !selectedLocationId || !selectedActivityId) {
      setError("Please select Project, Location, and Activity")
      return
    }

    // Budget check
    const budgetOk = await checkBudgetAvailability()
    if (!budgetOk) {
      setLoading(false)
      return
    }

    setLoading(true); setError("")
    const suppCode = selectedSupplier?.code || "BILL"
    const billNo = await getNextBillNo(suppCode)

    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_no: billNo,
          party_id: supplierId,
          invoice_date: billDate,
          due_date: dueDate,
          items: items.map(i => ({
            product_id: i.product_id,
            description: i.description,
            qty: i.qty,
            unit_price: i.unit_price,
            account_id: i.account_id,
          })),
          reference,
          notes,
          expense_account_id: expenseAccountId,
          project_id: selectedProjectId,
          location_id: selectedLocationId,
          activity_id: selectedActivityId,
          donor_id: selectedDonorId || null,
        }),
      })
      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Failed to create bill")
        setLoading(false)
        return
      }
      setFlash(`✅ Bill ${billNo} saved successfully!`)
      setItems([])
      setSupplierId(null)
      setSelectedSupplier(null)
      setSupplierSearch("")
      setReference("")
      setNotes("")
      setSelectedProjectId("")
      setSelectedLocationId("")
      setSelectedActivityId("")
      setSelectedDonorId("")
      setExpenseAccountId(null)
      setLoading(false)
      setTimeout(() => setFlash(null), 4000)
    } catch (e: any) {
      setError("Network error")
      setLoading(false)
    }
  }

  const handleBeforeSavePdf = () => {
    getNextBillNo(selectedSupplier?.code || "BILL").then(billNo => {
      const tempBill = {
        invoice_no: billNo,
        date: billDate,
        due_date: dueDate,
        customers: selectedSupplier || {},
      }
      const doc = generateInvoicePDF(tempBill, items)
      doc.save(`bill-preview-${billNo}.pdf`)
    })
  }

  // Account list for dropdown – for NGO only expense, for others all
  const accountList = businessType === "ngo"
    ? allAccounts.filter(a => a.type === "Expense")
    : allAccounts

  return (
    <div style={{ padding: "16px", background: "#F4F6FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* styles unchanged, omitted for brevity – same as previous version */}
      <style>{`
        .inv-shell { max-width: 1200px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .inv-card { background: white; border-radius: 12px; border: 1px solid #E5EAF2; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .inv-label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input { width: 100%; height: 38px; border: 1.5px solid #E5EAF2; border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; box-sizing: border-box; }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E5EAF2; color: #475569; }
        .inv-btn-danger { background: #EF4444; color: white; }
        .inv-btn-sm { padding: 4px 8px; font-size: 11px; }
        .inv-item-row { display: grid; grid-template-columns: 1fr 65px 80px 65px 40px; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #F1F5F9; }
        .inv-item-header { display: grid; grid-template-columns: 1fr 65px 80px 65px 40px; gap: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; padding-bottom: 6px; }
        .inv-summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
        .inv-summary-row.bold { font-weight: 700; font-size: 14px; border-top: 2px solid #E2E8F0; padding-top: 8px; margin-top: 4px; }
        .inv-grid { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .inv-grid { grid-template-columns: 1fr; } }
        @media (max-width: 600px) { .inv-row { grid-template-columns: 1fr; } .inv-item-row, .inv-item-header { grid-template-columns: 1fr 60px 70px 40px; } }
        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-search-icon { position: absolute; left: 10px; color: #94A3B8; pointer-events: none; }
        .cust-clear { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #94A3B8; display: flex; align-items: center; padding: 4px; border-radius: 4px; }
        .cust-clear:hover { color: #EF4444; background: #FEF2F2; }
        .cust-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white; border: 1.5px solid #C7D2FE; border-radius: 10px; max-height: 220px; overflow-y: auto; z-index: 100; box-shadow: 0 8px 24px rgba(30,58,138,0.12); }
        .cust-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; transition: background 0.1s; }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: #EEF2FF; }
        .cust-option-name { font-size: 13px; font-weight: 600; color: #1E293B; }
        .cust-option-meta { font-size: 11px; color: #94A3B8; margin-top: 2px; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: #1E3A8A; white-space: nowrap; }
        .cust-selected-badge { display: inline-flex; align-items: center; gap: 6px; background: #EEF2FF; border: 1.5px solid #C7D2FE; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #1E3A8A; width: 100%; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/bills")}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">📦 New Purchase Bill</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>
              {businessType === "ngo" ? "Donor‑funded expense – tags required" : "Record a supplier purchase"}
            </div>
          </div>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/bills")}>View List</button>
        </div>

        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="inv-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Supplier */}
            <div className="inv-card">
              <label className="inv-label">Supplier *</label>
              <div className="cust-wrap" ref={supplierRef}>
                {selectedSupplier ? (
                  <div className="cust-selected-badge" onClick={clearSupplier}>
                    <span>👤</span>
                    <span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                    <span style={{ fontSize: 11, color: "#64748B" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                    <button className="cust-clear" onClick={(e) => { e.stopPropagation(); clearSupplier(); }}>
                      <X size={14} />
                    </button>
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
                        autoComplete="off"
                      />
                      {supplierSearch && (
                        <button className="cust-clear" onClick={() => setSupplierSearch("")}>
                          <X size={13} />
                        </button>
                      )}
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

              {/* Tags section – reordered: Location, Project, Donor (if NGO), Activity, Expense Account */}
              {selectedSupplier && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "#F8FAFC", borderRadius: 8, display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {/* Location first */}
                  <div style={{ flex: "1 1 150px" }}>
                    <label className="inv-label">Location *</label>
                    <select className="inv-input" value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)}>
                      <option value="">— Select —</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  {/* Project */}
                  <div style={{ flex: "1 1 150px" }}>
                    <label className="inv-label">Project *</label>
                    <select className="inv-input" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
                      <option value="">— Select —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {/* Donor (NGO only) */}
                  {businessType === "ngo" && (
                    <div style={{ flex: "1 1 150px" }}>
                      <label className="inv-label">Donor *</label>
                      <select className="inv-input" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
                        <option value="">— Select —</option>
                        {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Activity – filtered by project+location */}
                  <div style={{ flex: "1 1 200px" }}>
                    <label className="inv-label">Activity *</label>
                    <select className="inv-input" value={selectedActivityId} onChange={e => setSelectedActivityId(e.target.value)}>
                      <option value="">— {selectedProjectId && selectedLocationId ? "Select" : "Select Project & Location first"} —</option>
                      {filteredActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  {/* Expense Account */}
                  <div style={{ flex: "1 1 200px" }}>
                    <label className="inv-label">Expense Account *</label>
                    <select className="inv-input" value={expenseAccountId ?? ""} onChange={e => setExpenseAccountId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— Select —</option>
                      {accountList.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="inv-row" style={{ marginTop: 10 }}>
                <div>
                  <label className="inv-label">Bill Date *</label>
                  <input className="inv-input" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
                </div>
                <div>
                  <label className="inv-label">Due Date</label>
                  <input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="inv-row" style={{ marginTop: 10 }}>
                <div>
                  <label className="inv-label">Reference</label>
                  <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Supplier Invoice #" />
                </div>
                <div>
                  <label className="inv-label">Notes</label>
                  <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" />
                </div>
              </div>
            </div>

            {/* Product search – only non‑NGO */}
            {businessType !== "ngo" && (
              <div className="inv-card">
                <label className="inv-label">Add Product</label>
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
                      <input
                        className="inv-input"
                        style={{ paddingLeft: 32 }}
                        placeholder="Search product by name or code..."
                        value={productSearch}
                        onChange={e => { setProductSearch(e.target.value); setShowProductList(true) }}
                        onFocus={() => setShowProductList(true)}
                        onBlur={() => setTimeout(() => setShowProductList(false), 200)}
                      />
                    </div>
                    <button className="inv-btn inv-btn-outline" onClick={addManualItem}><Plus size={14} /> Manual</button>
                  </div>
                  {showProductList && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #E2E8F0", borderRadius: 8, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", marginTop: 4 }}>
                      {(productSearch ? filteredProducts : products).map((p: any) => (
                        <div key={p.id} style={{ padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F1F5F9", fontSize: 13 }} onClick={() => addProductItem(p)}>
                          <span><strong>{p.code}</strong> — {p.name}</span>
                          <span style={{ color: "#64748B", fontSize: 12 }}>Cost: PKR {p.cost_price} | Stock: {p.qty_on_hand}</span>
                        </div>
                      ))}
                      {(productSearch ? filteredProducts : products).length === 0 && (
                        <div style={{ padding: 10, color: "#94A3B8", fontSize: 12 }}>No products found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Manual item button for NGO */}
            {businessType === "ngo" && (
              <div className="inv-card" style={{ textAlign: "right" }}>
                <button className="inv-btn inv-btn-outline" onClick={addManualItem}><Plus size={14} /> Add Item</button>
              </div>
            )}

            {/* Items table */}
            {items.length > 0 && (
              <div className="inv-card">
                <div className="inv-item-header">
                  <span>Description</span><span>Qty</span><span>Price</span><span>Total</span><span></span>
                </div>
                {items.map((item: any, idx: number) => (
                  <div key={idx} className="inv-item-row">
                    <input className="inv-input" style={{ height: 34, fontSize: 12 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Item description" />
                    <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "center" }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                    <input className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                    <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>PKR {item.total.toLocaleString()}</span>
                    <button className="inv-btn inv-btn-danger inv-btn-sm" onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 10 }}>Summary</h3>
              <div className="inv-summary-row bold">
                <span>Total</span><span>PKR {totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button className="inv-btn inv-btn-primary" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Posting..." : "💾 POST Bill"}
              </button>
              <button className="inv-btn inv-btn-outline" style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }} onClick={handleBeforeSavePdf}>
                <Download size={14} /> PDF Preview
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}