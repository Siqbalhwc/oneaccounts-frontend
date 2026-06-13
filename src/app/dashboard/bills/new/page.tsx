"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Search, X, Download, CheckCircle,
  RefreshCw,
} from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"

export default function NewBillPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabaseRef = useRef(createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))
  const supabase = supabaseRef.current

  const { hasFeature } = usePlan()
  const showProducts = hasFeature("inventory")
  const showPO = hasFeature("purchase_orders")

  const [companyId, setCompanyId] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)

  const isNGO = businessType === "ngo"

  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
  const supplierRef = useRef<HTMLDivElement>(null)
  const [refreshingSuppliers, setRefreshingSuppliers] = useState(false)

  const [openPOs, setOpenPOs] = useState<any[]>([])
  const [poId, setPoId] = useState<number | null>(null)
  const [poRemaining, setPoRemaining] = useState<number>(0)

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

  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [allAccounts, setAllAccounts] = useState<any[]>([])

  // Pre‑loaded lookups
  const [allProjects, setAllProjects] = useState<any[]>([])
  const [allDonors, setAllDonors] = useState<any[]>([])

  // budgetInfo
  const [budgetInfo, setBudgetInfo] = useState<Record<string, { budget: number; spent: number; available: number; hasBudget: boolean }>>({})
  const [budgetError, setBudgetError] = useState("")

  const [locationActivitiesMap, setLocationActivitiesMap] = useState<Record<number, number[]>>({})

  // Combo cache: key = `${locationId}_${activityId}` -> array of {project_id, donor_id, projectName, donorName}
  const [comboCache, setComboCache] = useState<Record<string, { project_id: number; donor_id: number; projectName: string; donorName: string | null }[]>>({})

  const fiscalYear = new Date().getFullYear()

  const budgetKey = (actId: number, locId: number | null, accId: number) =>
    `${actId}_${locId ?? "none"}_${accId}`

  // Pending tracker
  const pendingByKey = useMemo(() => {
    const map: Record<string, number> = {}
    items.forEach(item => {
      if (item.activity_id && item.account_id) {
        const locId = item.location_id ? Number(item.location_id) : null
        const key = budgetKey(Number(item.activity_id), locId, Number(item.account_id))
        const total = (item.qty || 0) * (item.unit_price || 0)
        map[key] = (map[key] || 0) + total
      }
    })
    return map
  }, [items])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => { if (r.data) setBusinessType(r.data.business_type || "") })

      loadSuppliers(cid)

      if (showProducts) loadProducts(cid)
      else setProducts([])

      supabase.from("accounts")
        .select("id,code,name,type")
        .eq("company_id", cid)
        .in("type", ["Expense", "Asset"])
        .order("code")
        .then(r => r.data && setAllAccounts(r.data))

      supabase.from("locations").select("id,name")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))

      supabase.from("activities").select("id,name,project_id")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setActivities(r.data))

      supabase.from("projects").select("id,name,donor_id")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setAllProjects(r.data))

      supabase.from("donors").select("id,name")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setAllDonors(r.data))

      supabase.from("budgets")
        .select("location_id, activity_id")
        .eq("company_id", cid)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
        .then(({ data: budgetRows }) => {
          const map: Record<number, Set<number>> = {}
          if (budgetRows) {
            budgetRows.forEach((b: any) => {
              const locId = b.location_id
              const actId = b.activity_id
              if (locId && actId) {
                if (!map[locId]) map[locId] = new Set()
                map[locId].add(actId)
              }
            })
          }
          const finalMap: Record<number, number[]> = {}
          for (const locId of Object.keys(map)) {
            finalMap[Number(locId)] = Array.from(map[Number(locId)])
          }
          setLocationActivitiesMap(finalMap)
        })

      setLoading(false)
    })
  }, [showProducts])

  const loadSuppliers = (cid?: string) => {
    const targetId = cid || companyId
    if (!targetId) return
    supabase.from("suppliers")
      .select("id,code,name,phone,balance,payment_terms,default_project_id,default_location_id,default_activity_id")
      .eq("company_id", targetId)
      .order("name")
      .then(r => { if (r.data) setSuppliers(r.data) })
  }

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

  // PO logic
  useEffect(() => {
    if (!companyId || !supplierId || !showPO) {
      setOpenPOs([])
      setPoId(null)
      return
    }
    supabase
      .from("purchase_orders")
      .select("id, po_no, expected_delivery, items:purchase_order_items(id,product_id,description,qty,unit_price,total)")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId)
      .eq("status", "Approved")
      .order("po_no")
      .then(async ({ data: pos }) => {
        if (!pos || pos.length === 0) { setOpenPOs([]); return }
        const enriched = []
        for (const po of pos) {
          let items = po.items || []
          if (items.length === 0) {
            const { data: manualItems } = await supabase
              .from("purchase_order_items")
              .select("id,product_id,description,qty,unit_price,total")
              .eq("po_id", po.id)
            items = manualItems || []
          }
          const totalPO = items.reduce((sum: number, i: any) => sum + (i.total || 0), 0)
          const { data: linkedBills } = await supabase
            .from("invoices")
            .select("id, total")
            .eq("type", "purchase")
            .eq("company_id", companyId)
            .eq("po_id", po.id)
            .is("deleted_at", null)
          const billed = (linkedBills || []).reduce((s: number, b: any) => s + (b.total || 0), 0)
          const remaining = totalPO - billed
          enriched.push({ ...po, items, totalPO, billed, remaining })
        }
        setOpenPOs(enriched.filter(po => po.remaining > 0))
      })
  }, [companyId, supplierId, showPO])

  // Load existing bill for editing
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.from("invoices")
      .select("*")
      .eq("id", editId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data: bill }) => {
        if (!bill) return
        setSupplierId(bill.party_id)
        const supp = suppliers.find((s: any) => s.id === bill.party_id)
        if (supp) { setSelectedSupplier(supp); setSupplierSearch(supp.name) }
        setBillDate(bill.date)
        setDueDate(bill.due_date)
        setReference(bill.reference || "")
        setNotes(bill.notes || "")
        setPoId(bill.po_id || null)

        const { data: itemsData } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", bill.id)
          .order("id")

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
            project_id: null,   // we don't know original; let user re-select if needed
            donor_id: null,
          }))
          setItems(loaded)

          loaded.forEach(item => {
            if (item.location_id && item.activity_id) {
              fetchCombosForLine(Number(item.location_id), Number(item.activity_id))
            }
            if (item.activity_id && item.account_id) {
              const locId = item.location_id ? Number(item.location_id) : null
              fetchBudget(Number(item.activity_id), Number(item.account_id), locId)
            }
          })
        }
      })
  }, [editId, companyId, suppliers])

  // AUTO‑COMPUTE DUE DATE
  useEffect(() => {
    if (!selectedSupplier || !billDate) return
    const term = (selectedSupplier.payment_terms || "").toLowerCase()
    let days = 30
    if (term.includes("receipt")) days = 0
    else if (term.includes("net 7")) days = 7
    else if (term.includes("net 15")) days = 15
    else if (term.includes("net 30")) days = 30
    else if (term.includes("net 60")) days = 60
    const dt = new Date(billDate)
    dt.setDate(dt.getDate() + days)
    setDueDate(dt.toISOString().split("T")[0])
  }, [selectedSupplier, billDate])

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
    setPoId(null)
    setPoRemaining(0)
  }

  const clearSupplier = () => {
    setSupplierId(null)
    setSelectedSupplier(null)
    setSupplierSearch("")
    setShowSupplierList(true)
    setPoId(null)
    setPoRemaining(0)
  }

  const refreshSuppliers = () => {
    if (!companyId) return
    setRefreshingSuppliers(true)
    supabase.from("suppliers")
      .select("id,code,name,phone,balance,payment_terms,default_project_id,default_location_id,default_activity_id")
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

  const handleSelectPO = (selectedPOId: number | null) => {
    if (selectedPOId === null) { setPoId(null); setPoRemaining(0); return }
    const selectedPO = openPOs.find(p => p.id === selectedPOId)
    if (!selectedPO) return
    setPoId(selectedPOId)
    setPoRemaining(selectedPO.remaining)
    const poItems = (selectedPO.items || []).map((item: any) => ({
      product_id: item.product_id || null,
      description: item.description || "",
      qty: item.qty,
      unit_price: item.unit_price,
      total: item.total,
      location_id: "",
      activity_id: "",
      account_id: null,
      project_id: null,
      donor_id: null,
    }))
    setItems(poItems)
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
      location_id: "",
      activity_id: "",
      account_id: null,
      project_id: null,
      donor_id: null,
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
      project_id: null,
      donor_id: null,
    }])
  }

  const removeItem = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx)
    setItems(updated)
  }

  // Fetch distinct (project_id, donor_id) combinations for a location+activity
  const fetchCombosForLine = async (locId: number, actId: number) => {
    const key = `${locId}_${actId}`
    if (comboCache[key] !== undefined) return

    setComboCache(prev => ({ ...prev, [key]: [] }))  // placeholder

    const { data: rows } = await supabase
      .from("budgets")
      .select("project_id, donor_id")
      .eq("company_id", companyId)
      .eq("location_id", locId)
      .eq("activity_id", actId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)

    if (!rows || rows.length === 0) {
      setComboCache(prev => ({ ...prev, [key]: [] }))
      return
    }

    // Deduplicate by project_id + donor_id pair
    const seen = new Set<string>()
    const combos: { project_id: number; donor_id: number; projectName: string; donorName: string | null }[] = []

    for (const r of rows) {
      const pid = r.project_id
      const did = r.donor_id
      const uid = `${pid}_${did}`
      if (seen.has(uid)) continue
      seen.add(uid)

      const project = allProjects.find(p => p.id === pid)
      const donor = did ? allDonors.find(d => d.id === did) : null
      combos.push({
        project_id: pid,
        donor_id: did,
        projectName: project?.name || "",
        donorName: donor?.name || null,
      })
    }

    setComboCache(prev => ({ ...prev, [key]: combos }))
  }

  // Auto‑select or show dropdown
  const applyCombosToLine = (idx: number) => {
    const item = items[idx]
    if (!item.location_id || !item.activity_id) return

    const key = `${item.location_id}_${item.activity_id}`
    const combos = comboCache[key]

    const updated = [...items]
    if (!combos || combos.length === 0) {
      // no combo
      updated[idx] = { ...updated[idx], project_id: null, donor_id: null }
    } else if (combos.length === 1) {
      updated[idx] = { ...updated[idx], project_id: combos[0].project_id, donor_id: combos[0].donor_id }
    } else {
      // multiple combos – keep current selection if still valid, else clear
      const current = updated[idx]
      if (current.project_id) {
        const stillValid = combos.some(c => c.project_id === current.project_id && c.donor_id === current.donor_id)
        if (!stillValid) {
          updated[idx] = { ...updated[idx], project_id: null, donor_id: null }
        }
      }
    }
    setItems(updated)
  }

  const fetchBudget = useCallback(async (
    activityId: number,
    accountId: number,
    locationId: number | null
  ) => {
    const key = budgetKey(activityId, locationId, accountId)
    if (budgetInfo[key]) return budgetInfo[key]

    try {
      let budgetQuery = supabase.from("budgets")
        .select("budgeted_amount")
        .eq("company_id", companyId)
        .eq("activity_id", activityId)
        .eq("account_id", accountId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)

      if (locationId) budgetQuery = budgetQuery.eq("location_id", locationId)
      else budgetQuery = budgetQuery.is("location_id", null)

      const { data: budgetRow } = await budgetQuery.maybeSingle()

      let spentQuery = supabase.from("journal_lines")
        .select("debit, credit")
        .eq("company_id", companyId)
        .eq("activity_id", activityId)
        .eq("account_id", accountId)

      if (locationId) spentQuery = spentQuery.eq("location_id", locationId)
      else spentQuery = spentQuery.is("location_id", null)

      const { data: spentRows, error: spentError } = await spentQuery
      if (spentError) console.error("Spent query error:", spentError)

      const actualSpent = (spentRows || []).reduce(
        (sum: number, line: any) => sum + (line.debit || 0) - (line.credit || 0),
        0
      )
      const budget = budgetRow?.budgeted_amount || 0
      const available = budget - actualSpent
      const result = { budget, spent: actualSpent, available, hasBudget: budgetRow !== null }

      setBudgetInfo(prev => ({ ...prev, [key]: result }))
      return result
    } catch (err) {
      console.error("fetchBudget error:", err)
      return null
    }
  }, [companyId, budgetInfo, fiscalYear, supabase])

  const getLineSoftAvailable = (item: any, bdata: ReturnType<typeof getLineBudgetData>) => {
    if (!bdata) return null
    const key = budgetKey(Number(item.activity_id), item.location_id ? Number(item.location_id) : null, Number(item.account_id))
    const totalPending = pendingByKey[key] || 0
    const lineTotal = (item.qty || 0) * (item.unit_price || 0)
    return bdata.available - (totalPending - lineTotal)
  }

  const checkBudgetOverrun = () => {
    let overBudget = false
    for (const item of items) {
      if (!item.product_id && item.activity_id && item.account_id && item.total > 0) {
        const bdata = getLineBudgetData(item)
        if (!bdata) continue
        const softAvail = getLineSoftAvailable(item, bdata)
        if (softAvail !== null && item.total > softAvail) {
          overBudget = true
          break
        }
      }
    }
    setBudgetError(overBudget ? "⚠️ Some lines exceed the available budget" : "")
  }

  const updateItem = async (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }

    if (field === "qty" || field === "unit_price") {
      updated[idx].total = updated[idx].qty * updated[idx].unit_price
    }

    // Reset project/donor when location or activity changes
    if (field === "location_id" || field === "activity_id") {
      updated[idx].project_id = null
      updated[idx].donor_id = null

      // Fetch new combos if both are set
      if (updated[idx].location_id && updated[idx].activity_id) {
        const locId = Number(updated[idx].location_id)
        const actId = Number(updated[idx].activity_id)
        fetchCombosForLine(locId, actId)
      }
    }

    // Handle project selection from dropdown
    if (field === "project_select") {
      const selectedCombo = JSON.parse(value) as { project_id: number; donor_id: number }
      updated[idx].project_id = selectedCombo.project_id
      updated[idx].donor_id = selectedCombo.donor_id
    }

    setItems(updated)

    // Apply auto‑selection after combos load (deferred via useEffect, but we also call applyCombosToLine)
    // We'll rely on the combo fetch completion; apply via useEffect later.

    if ((field === "account_id" || field === "activity_id" || field === "location_id") && updated[idx].activity_id && updated[idx].account_id) {
      const actId = Number(updated[idx].activity_id)
      const accId = Number(updated[idx].account_id)
      const locId = updated[idx].location_id ? Number(updated[idx].location_id) : null
      await fetchBudget(actId, accId, locId)
    }
  }

  // When combos arrive, auto‑select or clear
  useEffect(() => {
    items.forEach((item, idx) => {
      if (item.location_id && item.activity_id && item.project_id === null && item.donor_id === null) {
        const key = `${item.location_id}_${item.activity_id}`
        const combos = comboCache[key]
        if (combos && combos.length === 1) {
          setItems(prev => {
            const updated = [...prev]
            updated[idx] = { ...updated[idx], project_id: combos[0].project_id, donor_id: combos[0].donor_id }
            return updated
          })
        }
      }
    })
  }, [comboCache, items])

  useEffect(() => {
    checkBudgetOverrun()
  }, [items, budgetInfo, pendingByKey])

  const totalAmount = items.reduce((s, i) => s + i.total, 0)

  const handleSubmit = async () => {
    if (!supplierId) { setError("Please select a supplier"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    for (const item of items) {
      if (!item.product_id) {
        const showLoc = isNGO || locations.length > 0
        const showAct = isNGO || activities.length > 0
        if (showLoc && !item.location_id) { setError("Each manual line must have Location selected"); return }
        if (showAct && !item.activity_id) { setError("Each manual line must have Activity selected"); return }
        if (!item.account_id) { setError("Each manual line must have a GL Account selected"); return }
        // If multiple combos, force project selection
        const key = `${item.location_id}_${item.activity_id}`
        const combos = comboCache[key]
        if (combos && combos.length > 1 && !item.project_id) {
          setError("Please select a Project/Donor for each manual line with multiple options."); return
        }
      }
    }

    if (budgetError) { setError("Cannot save: some lines exceed the available budget."); return }
    if (poId && poRemaining > 0 && totalAmount > poRemaining) {
      setError(`Bill total exceeds remaining PO balance.`)
      return
    }

    setSaving(true); setError("")

    const payloadItems = items.map(i => ({
      product_id: i.product_id || null,
      description: i.description,
      qty: i.qty,
      unit_price: i.unit_price,
      location_id: i.location_id || null,
      activity_id: i.activity_id || null,
      account_id: i.account_id || null,
      project_id: i.project_id || null,
      donor_id: i.donor_id || null,
    }))

    const url = editId ? `/api/bills?id=${editId}` : "/api/bills"
    const method = editId ? "PUT" : "POST"

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId || undefined,
          party_id: supplierId,
          invoice_date: billDate,
          due_date: dueDate,
          items: payloadItems,
          reference,
          notes,
          po_id: poId || null,
        }),
      })
      const result = await res.json()
      if (!result.success) { setError(result.error || "Failed to save bill"); setSaving(false); return }

      const savedBillId = result.bill?.id || editId
      setFlash(`✅ Bill ${editId ? "updated" : "saved"} successfully!`)
      loadSuppliers()
      setSaving(false)

      if (savedBillId) {
        setTimeout(() => router.push(`/dashboard/bills/${savedBillId}`), 800)
      } else {
        setTimeout(() => router.push("/dashboard/bills"), 800)
      }
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  const handleBeforeSavePdf = async () => {
    if (!selectedSupplier) return
    const billNo = editId ? selectedSupplier.code + "-EDIT" : "PREVIEW"
    const pdfData = {
      companyName: "OneAccounts",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      companyTagline: "",
      logoUrl: null,
      invoiceNo: billNo,
      date: billDate,
      dueDate: dueDate,
      customerName: selectedSupplier.name,
      customerAddress: "",
      customerPhone: "",
      customerEmail: "",
      items: items.map(i => ({
        description: i.description || "",
        qty: i.qty || 0,
        unit_price: i.unit_price || 0,
        total: i.total || 0,
      })),
      subtotal: totalAmount,
      total: totalAmount,
      status: "Unpaid",
      paid: 0,
      balanceDue: totalAmount,
    }
    const doc = await generateInvoicePDF(pdfData)
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
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        Loading bill form…
      </div>
    )
  }

  const getFilteredActivities = (locationId: string) => {
    const locNum = Number(locationId)
    if (!locNum) return activities
    const allowed = locationActivitiesMap[locNum]
    if (!allowed || allowed.length === 0) return []
    return activities.filter(a => allowed.includes(a.id))
  }

  const getLineBudgetData = (item: any) => {
    if (!item.activity_id || !item.account_id) return null
    const locId = item.location_id ? Number(item.location_id) : null
    const key = budgetKey(Number(item.activity_id), locId, Number(item.account_id))
    return budgetInfo[key] ?? null
  }

  const isLineOverBudget = (item: any, bdata: ReturnType<typeof getLineBudgetData>) => {
    if (!bdata) return false
    const softAvail = getLineSoftAvailable(item, bdata)
    if (softAvail === null) return false
    if (!bdata.hasBudget && item.total > 0) return true
    return item.total > softAvail
  }

  const getLineDisplayAvailable = (item: any, bdata: ReturnType<typeof getLineBudgetData>) => {
    if (!bdata) return null
    const softAvail = getLineSoftAvailable(item, bdata)
    return softAvail !== null ? softAvail : bdata.available
  }

  const getCombosForLine = (item: any) => {
    if (!item.location_id || !item.activity_id) return []
    const key = `${item.location_id}_${item.activity_id}`
    return comboCache[key] || []
  }

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { max-width: 100%; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px; }
        .inv-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; }
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .inv-item-row { display: grid; grid-template-columns: ${isNGO || locations.length > 0 || activities.length > 0 ? "2fr 70px 90px 110px 110px 80px 90px 30px" : "2fr 70px 90px 120px 90px 30px"}; gap: 6px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); }
        .inv-item-header { display: grid; grid-template-columns: ${isNGO || locations.length > 0 || activities.length > 0 ? "2fr 70px 90px 110px 110px 80px 90px 30px" : "2fr 70px 90px 120px 90px 30px"}; gap: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); padding-bottom: 6px; }
        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--card); border: 1.5px solid var(--border); border-radius: 10px; max-height: 220px; overflow-y: auto; z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
        .cust-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: var(--card-hover); }
        .cust-option-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .cust-option-meta { font-size: 11px; color: var(--text-muted); }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: var(--primary); white-space: nowrap; }
        .cust-selected-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1.5px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: var(--text); width: 100%; cursor: pointer; }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }
        .budget-warning { background: var(--card); border: 1px solid #EF4444; color: #FCA5A5; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
        .line-info-row { font-size: 10px; color: var(--text-muted); margin-left: 4px; display: flex; gap: 14px; padding: 3px 0 5px 0; flex-wrap: wrap; align-items: center; }
        .line-info-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 10px; }
        .over-budget-chip { border-color: #EF4444 !important; color: #FCA5A5 !important; }
        .ok-budget-chip { border-color: #059669 !important; color: #6EE7B7 !important; }
        .project-select-small { height: 24px; font-size: 10px; padding: 0 4px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); margin-left: 6px; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/bills")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">{editId ? "✏️ Edit Purchase Bill" : "📦 New Purchase Bill"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
              {editId ? "Modify bill details and items" : "Select supplier → add products or manual expenses"}
            </div>
          </div>
          <button className="inv-btn" onClick={() => router.push("/dashboard/bills")}>View List</button>
        </div>

        {error && (
          <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>
        )}
        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        <div className="header-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <label className="inv-label">Supplier *</label>
              <div className="cust-wrap" ref={supplierRef}>
                {selectedSupplier ? (
                  <div className="cust-selected-badge" onClick={clearSupplier}>
                    <span>🚚</span>
                    <span style={{ flex: 1 }}>{selectedSupplier.code} — {selectedSupplier.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Bal: PKR {(selectedSupplier.balance || 0).toLocaleString()}</span>
                    <button
                      style={{ marginLeft: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); clearSupplier() }}
                    ><X size={14} /></button>
                    <button
                      style={{ marginLeft: 2, background: "none", border: "none", color: "var(--primary)", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); refreshSuppliers() }}
                      title="Refresh"
                    ><RefreshCw size={13} /></button>
                  </div>
                ) : (
                  <>
                    <div className="cust-input-row">
                      <Search size={14} style={{ position: "absolute", left: 10, color: "var(--text-muted)" }} />
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
                      {supplierSearch && (
                        <button onClick={() => setSupplierSearch("")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {showSupplierList && (
                      <div className="cust-dropdown">
                        {filteredSuppliers.length === 0 ? (
                          <div style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 13 }}>No suppliers found</div>
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

              {showPO && selectedSupplier && openPOs.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <label className="inv-label">Link to Purchase Order (optional)</label>
                  <select className="inv-select" value={poId ?? ""} onChange={(e) => handleSelectPO(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— None —</option>
                    {openPOs.map(po => (
                      <option key={po.id} value={po.id}>{po.po_no} — Remaining: PKR {po.remaining.toLocaleString()}</option>
                    ))}
                  </select>
                  {poId && poRemaining > 0 && (
                    <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>
                      PO balance remaining: PKR <strong>{poRemaining.toLocaleString()}</strong>
                    </div>
                  )}
                </div>
              )}

              <div className="inv-row" style={{ marginTop: 14 }}>
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

              {/* Add Item area */}
              {showProducts ? (
                <div style={{ marginTop: 14 }}>
                  <label className="inv-label">Add Item</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "var(--text-muted)" }} />
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
                        </div>
                      )}
                    </div>
                    <button className="inv-btn" onClick={addManualItem}><Plus size={14} /> Manual</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <label className="inv-label">Add Item</label>
                  <button className="inv-btn" onClick={addManualItem}><Plus size={14} /> Manual</button>
                </div>
              )}
            </div>

            {editId && (
              <div className="inv-card" style={{ marginTop: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
                <RecordHistory tableName="invoices" recordId={editId} />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px 0" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600 }}>
                <span>Total</span>
                <span>PKR {totalAmount.toLocaleString()}</span>
              </div>
              {budgetError && (
                <div className="budget-warning" style={{ marginTop: 8 }}>⚠️ {budgetError}</div>
              )}
            </div>
            <div className="inv-card">
              <button
                className="inv-btn"
                style={{ justifyContent: "center", padding: 10, width: "100%" }}
                onClick={handleSubmit}
                disabled={saving || budgetError !== ""}
              >
                {saving ? "Posting..." : editId ? "💾 UPDATE Bill" : "💾 POST Bill"}
              </button>
              <button
                className="inv-btn"
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
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Items</span>
          </div>
          {items.length > 0 && (
            <div className="inv-card" style={{ overflowX: "auto", padding: "16px 12px" }}>
              <div className="inv-item-header">
                <span>Description</span>
                <span>Qty</span>
                <span>Price</span>
                {(isNGO || locations.length > 0) && <span>Location</span>}
                {(isNGO || activities.length > 0) && <span>Activity</span>}
                <span>GL Acc</span>
                <span style={{ textAlign: "right" }}>Total</span>
                <span></span>
              </div>

              {items.map((item, idx) => {
                const budgetData = getLineBudgetData(item)
                const overBudget = isLineOverBudget(item, budgetData)
                const softAvail = getLineDisplayAvailable(item, budgetData)
                const filteredActs = getFilteredActivities(item.location_id)
                const combos = getCombosForLine(item)
                const selectedProject = item.project_id
                  ? allProjects.find(p => p.id === item.project_id)
                  : null
                const selectedDonor = item.donor_id
                  ? allDonors.find(d => d.id === item.donor_id)
                  : null

                const showInfoRow = isNGO && !item.product_id && !!item.activity_id

                return (
                  <div key={idx}>
                    <div className="inv-item-row" style={overBudget ? { background: "rgba(239,68,68,0.04)", borderRadius: 6 } : {}}>
                      <input
                        className="inv-input"
                        style={{ height: 34, fontSize: 12 }}
                        value={item.description}
                        onChange={e => updateItem(idx, "description", e.target.value)}
                        placeholder="Description"
                      />
                      <input
                        className="inv-input"
                        style={{ height: 34, fontSize: 12, textAlign: "center" }}
                        type="number"
                        value={item.qty}
                        onChange={e => updateItem(idx, "qty", Number(e.target.value))}
                      />
                      <input
                        className="inv-input"
                        style={{ height: 34, fontSize: 12, textAlign: "right" }}
                        type="number"
                        value={item.unit_price}
                        onChange={e => updateItem(idx, "unit_price", Number(e.target.value))}
                      />

                      {item.product_id ? (
                        <>
                          {(isNGO || locations.length > 0) && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>}
                          {(isNGO || activities.length > 0) && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>}
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Inventory</span>
                        </>
                      ) : (
                        <>
                          {(isNGO || locations.length > 0) && (
                            <select
                              className="inv-select"
                              style={{ height: 34, fontSize: 11 }}
                              value={item.location_id}
                              onChange={e => updateItem(idx, "location_id", e.target.value)}
                            >
                              <option value="">—</option>
                              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          )}
                          {(isNGO || activities.length > 0) && (
                            <select
                              className="inv-select"
                              style={{ height: 34, fontSize: 11 }}
                              value={item.activity_id}
                              onChange={e => updateItem(idx, "activity_id", e.target.value)}
                            >
                              <option value="">—</option>
                              {filteredActs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          )}
                          <select
                            className="inv-select"
                            style={{ height: 34, fontSize: 11, borderColor: overBudget ? "#EF4444" : undefined }}
                            value={item.account_id ?? ""}
                            onChange={e => updateItem(idx, "account_id", e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">—</option>
                            {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
                          </select>
                        </>
                      )}

                      <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", color: overBudget ? "#FCA5A5" : undefined }}>
                        PKR {item.total.toLocaleString()}
                      </span>
                      <button
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 2 }}
                        onClick={() => removeItem(idx)}
                      ><Trash2 size={12} /></button>
                    </div>

                    {showInfoRow && (
                      <div className="line-info-row">
                        {/* Project/Donor selection */}
                        {combos.length === 0 && (
                          <span className="line-info-chip" style={{ opacity: 0.5 }}>📁 No project linked</span>
                        )}
                        {combos.length === 1 && (
                          <span className="line-info-chip">
                            📁 {combos[0].projectName}
                            {combos[0].donorName && (
                              <span style={{ color: "var(--primary)", marginLeft: 4 }}>· 🤝 {combos[0].donorName}</span>
                            )}
                          </span>
                        )}
                        {combos.length > 1 && (
                          <>
                            <span className="line-info-chip" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              📁
                              <select
                                className="project-select-small"
                                value={item.project_id ? JSON.stringify({ project_id: item.project_id, donor_id: item.donor_id }) : ""}
                                onChange={e => updateItem(idx, "project_select", e.target.value)}
                              >
                                <option value="">Select project…</option>
                                {combos.map((c, i) => (
                                  <option key={i} value={JSON.stringify({ project_id: c.project_id, donor_id: c.donor_id })}>
                                    {c.projectName}{c.donorName ? ` (${c.donorName})` : ""}
                                  </option>
                                ))}
                              </select>
                              {selectedDonor && (
                                <span style={{ color: "var(--primary)", marginLeft: 4 }}>· 🤝 {selectedDonor.name}</span>
                              )}
                            </span>
                          </>
                        )}

                        {/* Budget chips */}
                        {budgetData && !budgetData.hasBudget && (
                          <span className="line-info-chip over-budget-chip">🚫 No budget defined</span>
                        )}
                        {budgetData && budgetData.hasBudget && (
                          <>
                            <span className="line-info-chip">Budget: PKR {budgetData.budget.toLocaleString()}</span>
                            <span className="line-info-chip">Spent: PKR {budgetData.spent.toLocaleString()}</span>
                            {softAvail !== null && (
                              <span className={`line-info-chip ${overBudget ? "over-budget-chip" : "ok-budget-chip"}`}>
                                {overBudget
                                  ? "⚠️ Over by PKR " + (item.total - softAvail).toLocaleString()
                                  : "✓ Available: PKR " + softAvail.toLocaleString()}
                              </span>
                            )}
                          </>
                        )}
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
