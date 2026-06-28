"use client"

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Search, X, Download, CheckCircle,
  RefreshCw,
} from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import EntityPicker from "@/components/entity-picker/EntityPicker"

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
  const taxEnabled = hasFeature("tax_management")

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

  const [allProjects, setAllProjects] = useState<any[]>([])
  const [allDonors, setAllDonors] = useState<any[]>([])

  const [budgetInfo, setBudgetInfo] = useState<Record<string, { budget: number; spent: number; available: number; hasBudget: boolean }>>({})
  const [budgetError, setBudgetError] = useState("")

  const [locationActivitiesMap, setLocationActivitiesMap] = useState<Record<number, number[]>>({})

  const [comboCache, setComboCache] = useState<Record<string, { project_id: number; donor_id: number; projectName: string; donorName: string | null }[]>>({})

  const [whtTaxCodes, setWhtTaxCodes] = useState<any[]>([])
  const [selectedWhtTaxCodeId, setSelectedWhtTaxCodeId] = useState<string>("")
  const [whtRate, setWhtRate] = useState<number>(0)
  const [whtAmount, setWhtAmount] = useState<number>(0)

  const [inputTaxCodes, setInputTaxCodes] = useState<any[]>([])

  const fiscalYear = new Date().getFullYear()

  const budgetKey = (actId: number, locId: number | null, accId: number) =>
    `${actId}_${locId ?? "none"}_${accId}`

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

  useEffect(() => {
    if (taxEnabled && companyId) {
      supabase.from("tax_codes")
        .select("id, code, name, rate")
        .eq("company_id", companyId)
        .eq("tax_category_code", "wht")
        .order("code")
        .then(r => { if (r.data) setWhtTaxCodes(r.data) })

      supabase.from("tax_codes")
        .select("id, code, name, rate")
        .eq("company_id", companyId)
        .in("tax_category_code", ["sales_tax", "vat", "gst"])
        .order("code")
        .then(r => { if (r.data) setInputTaxCodes(r.data) })
    }
  }, [taxEnabled, companyId])

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

        if (taxEnabled) {
          const { data: wht } = await supabase
            .from("bill_withholding")
            .select("*")
            .eq("bill_id", bill.id)
            .maybeSingle()
          if (wht) {
            setSelectedWhtTaxCodeId(wht.wht_tax_code_id || "")
            setWhtRate(wht.wht_rate || 0)
            setWhtAmount(wht.wht_amount || 0)
          }
        }

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
            project_id: null,
            donor_id: null,
            tax_code_id: item.tax_code_id || null,
            tax_rate: item.tax_rate || 0,
            tax_amount: item.tax_amount || 0,
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
  }, [editId, companyId, suppliers, taxEnabled])

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
      tax_code_id: null,
      tax_rate: 0,
      tax_amount: 0,
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
      tax_code_id: null,
      tax_rate: 0,
      tax_amount: 0,
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
      tax_code_id: null,
      tax_rate: 0,
      tax_amount: 0,
    }])
  }

  const removeItem = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx)
    setItems(updated)
  }

  const fetchCombosForLine = async (locId: number, actId: number) => {
    const key = `${locId}_${actId}`
    if (comboCache[key] !== undefined) return

    setComboCache(prev => ({ ...prev, [key]: [] }))

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

      const { data: spentRows } = await spentQuery
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

  const updateTax = (idx: number, codeId: string | null) => {
    const updated = [...items]
    if (codeId) {
      const taxCode = inputTaxCodes.find((t: any) => String(t.id) === codeId)
      if (taxCode) {
        const taxRate = taxCode.rate
        const taxAmt = (updated[idx].qty * updated[idx].unit_price * taxRate) / 100
        updated[idx] = {
          ...updated[idx],
          tax_code_id: codeId,
          tax_rate: taxRate,
          tax_amount: taxAmt,
        }
      }
    } else {
      updated[idx] = {
        ...updated[idx],
        tax_code_id: null,
        tax_rate: 0,
        tax_amount: 0,
      }
    }
    setItems(updated)
  }

  const updateItem = async (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }

    if (field === "qty" || field === "unit_price") {
      updated[idx].total = updated[idx].qty * updated[idx].unit_price
      if (taxEnabled && updated[idx].tax_code_id) {
        const tc = inputTaxCodes.find(t => t.id === updated[idx].tax_code_id)
        if (tc) {
          updated[idx].tax_rate = tc.rate
          updated[idx].tax_amount = (updated[idx].qty * updated[idx].unit_price) * tc.rate / 100
        }
      }
    }

    if (field === "location_id" || field === "activity_id") {
      updated[idx].project_id = null
      updated[idx].donor_id = null
      if (updated[idx].location_id && updated[idx].activity_id) {
        const locId = Number(updated[idx].location_id)
        const actId = Number(updated[idx].activity_id)
        fetchCombosForLine(locId, actId)
      }
    }

    if (field === "project_select") {
      const selectedCombo = JSON.parse(value) as { project_id: number; donor_id: number }
      updated[idx].project_id = selectedCombo.project_id
      updated[idx].donor_id = selectedCombo.donor_id
    }

    setItems(updated)

    if ((field === "account_id" || field === "activity_id" || field === "location_id") && updated[idx].activity_id && updated[idx].account_id) {
      const actId = Number(updated[idx].activity_id)
      const accId = Number(updated[idx].account_id)
      const locId = updated[idx].location_id ? Number(updated[idx].location_id) : null
      await fetchBudget(actId, accId, locId)
    }
  }

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

  const netTotal = items.reduce((s, i) => s + i.total, 0)
  const totalTaxAmount = items.reduce((s, i) => s + (i.tax_amount || 0), 0)
  const grossTotal = netTotal + totalTaxAmount

  useEffect(() => {
    if (taxEnabled && whtRate > 0) {
      setWhtAmount(grossTotal * (whtRate / 100))
    }
  }, [grossTotal, whtRate, taxEnabled])

  const handleSubmit = async () => {
    if (!supplierId) { setError("Please select a supplier"); return }
    if (items.length === 0) { setError("Add at least one item"); return }

    if (editId) {
      for (const item of items) {
        if (!item.product_id) {
          const showLoc = isNGO || locations.length > 0
          const showAct = isNGO || activities.length > 0
          if (showLoc && !item.location_id) { setError("Each manual line must have Location selected"); return }
          if (showAct && !item.activity_id) { setError("Each manual line must have Activity selected"); return }
          if (!item.account_id) { setError("Each manual line must have a GL Account selected"); return }
          const key = `${item.location_id}_${item.activity_id}`
          const combos = comboCache[key]
          if (combos && combos.length > 1 && !item.project_id) {
            setError("Please select a Project/Donor for each manual line with multiple options."); return
          }
        }
      }

      if (budgetError) { setError("Cannot save: some lines exceed the available budget."); return }
      if (poId && poRemaining > 0 && grossTotal > poRemaining) {
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
        tax_code_id: taxEnabled ? (i.tax_code_id || null) : undefined,
        tax_rate: taxEnabled ? (i.tax_rate || 0) : undefined,
        tax_amount: taxEnabled ? (i.tax_amount || 0) : undefined,
      }))

      try {
        const res = await fetch(`/api/bills?id=${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editId,
            party_id: supplierId,
            invoice_date: billDate,
            due_date: dueDate,
            items: payloadItems,
            reference,
            notes,
            po_id: poId || null,
            wht_tax_code_id: taxEnabled ? selectedWhtTaxCodeId || null : undefined,
            wht_rate: taxEnabled ? whtRate : undefined,
            wht_amount: taxEnabled ? whtAmount : undefined,
          }),
        })
        const result = await res.json()
        if (!result.success) { setError(result.error || "Failed to update bill"); setSaving(false); return }
        setFlash(`✅ Bill updated successfully!`)
        loadSuppliers()
        setSaving(false)
        setTimeout(() => router.push(`/dashboard/bills/${editId}`), 800)
        return
      } catch {
        setError("Network error")
        setSaving(false)
        return
      }
    }

    for (const item of items) {
      if (!item.product_id) {
        const showLoc = isNGO || locations.length > 0
        const showAct = isNGO || activities.length > 0
        if (showLoc && !item.location_id) { setError("Each manual line must have Location selected"); return }
        if (showAct && !item.activity_id) { setError("Each manual line must have Activity selected"); return }
        if (!item.account_id) { setError("Each manual line must have a GL Account selected"); return }
        const key = `${item.location_id}_${item.activity_id}`
        const combos = comboCache[key]
        if (combos && combos.length > 1 && !item.project_id) {
          setError("Please select a Project/Donor for each manual line with multiple options."); return
        }
      }
    }

    if (budgetError) { setError("Cannot save: some lines exceed the available budget."); return }
    if (poId && poRemaining > 0 && grossTotal > poRemaining) {
      setError(`Bill total exceeds remaining PO balance.`)
      return
    }

    setSaving(true); setError("")

    const payloadItems = items.map(i => ({
      product_id: i.product_id || null,
      description: i.description,
      qty: i.qty,
      unit_price: i.unit_price,
      account_id: i.account_id || null,
      location_id: i.location_id || null,
      activity_id: i.activity_id || null,
      tax_code_id: taxEnabled ? (i.tax_code_id || null) : null,
      tax_rate: taxEnabled ? (i.tax_rate || 0) : 0,
      tax_amount: taxEnabled ? (i.tax_amount || 0) : 0,
      is_recoverable: true,
    }))

    try {
      const { data, error: rpcError } = await supabase.rpc('create_bill_transaction', {
        p_company_id: companyId,
        p_party_id: supplierId,
        p_bill_date: billDate,
        p_due_date: dueDate,
        p_items: payloadItems,
        p_reference: reference || '',
        p_notes: notes || '',
        p_po_id: poId || null,
        p_wht_tax_code_id: taxEnabled ? (selectedWhtTaxCodeId || null) : null,
        p_wht_rate: taxEnabled ? whtRate : 0,
        p_wht_amount: taxEnabled ? whtAmount : 0,
        p_business_type: businessType,
        p_tax_enabled: taxEnabled,
      })

      if (rpcError) {
        setError(rpcError.message || "Failed to save bill")
        setSaving(false)
        return
      }

      if (!data || !data.success) {
        setError(data?.error || "Failed to save bill")
        setSaving(false)
        return
      }

      const newBillId = data.bill_id
      setFlash(`✅ Bill saved successfully!`)
      loadSuppliers()
      setSaving(false)
      setTimeout(() => router.push(`/dashboard/bills/${newBillId}`), 800)

    } catch (err: any) {
      setError(err.message || "Network error")
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
        tax_rate: i.tax_rate || 0,
        tax_amount: i.tax_amount || 0,
      })),
      subtotal: netTotal,
      total: grossTotal,
      totalTax: totalTaxAmount,
      status: "Unpaid",
      paid: 0,
      balanceDue: grossTotal,
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

  const tableCols = () => {
    let cols = "280px 80px 120px "
    if (taxEnabled) cols += "120px "
    if (isNGO || locations.length > 0) cols += "120px "
    if (isNGO || activities.length > 0) cols += "120px "
    cols += "140px 140px 50px"
    return cols
  }

  const fixedCols = () => {
    let cols = "minmax(200px, 280px) 80px 120px "
    if (taxEnabled) cols += "120px "
    if (isNGO || locations.length > 0) cols += "120px "
    if (isNGO || activities.length > 0) cols += "120px "
    cols += "140px 140px 50px"
    return cols
  }

  return (
    <div style={{ padding: "12px 16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { max-width: 100%; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px; overflow: visible; }
        .inv-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; }
        /* color-scheme for input[type=date] is set globally per data-theme
           (see global stylesheet) — was previously missing entirely on this
           page, which made the calendar icon invisible. Do not add it here;
           it should inherit from the global rule like every other theme value. */
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .inv-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); font-weight: 700; }
        .inv-btn-primary:hover { filter: brightness(1.08); }
        .inv-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

        .group-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin: 16px 0 10px; display: flex; align-items: center; gap: 8px; }
        .group-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }
        .group-label:first-child { margin-top: 0; }

        .po-banner { display: flex; align-items: center; justify-content: space-between; background: var(--bg); border: 1.5px solid var(--border-strong, var(--border)); border-radius: 9px; padding: 10px 14px; margin-top: 6px; flex-wrap: wrap; gap: 6px; }
        .po-banner .po-no { font-weight: 700; }
        .po-banner .po-remaining { font-size: 12.5px; color: var(--text-muted); }
        .po-banner .po-remaining strong { color: var(--text); }

        .wht-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .wht-grid { display: grid; grid-template-columns: 1.5fr 0.8fr 1.2fr; gap: 12px; }
        .wht-result-row { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
        .wht-result-row strong { font-size: 15px; }

        .items-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
        .items-count { font-size: 11.5px; color: var(--text-muted); font-weight: 600; }
        .empty-items { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; text-align: center; color: var(--text-muted); }
        .empty-items .icon-wrap { width: 44px; height: 44px; border-radius: 50%; background: rgba(37,99,235,0.08); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: var(--primary); }
        .empty-items .t1 { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .empty-items .t2 { font-size: 12px; max-width: 280px; line-height: 1.5; color: var(--text-muted); }

        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--card); border: 1.5px solid var(--border); border-radius: 10px; max-height: 220px; overflow-y: auto; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
        .cust-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: var(--card-hover); }
        .cust-option-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .cust-option-meta { font-size: 11px; color: var(--text-muted); }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: var(--primary); white-space: nowrap; }
        .cust-selected-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1.5px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: var(--text); width: 100%; cursor: pointer; overflow: hidden; }
        .cust-selected-badge .cust-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; overflow: visible; }
        .inv-customer-section { overflow: visible; }
        .inv-content-wrapper { overflow: visible; }

        .budget-warning { background: var(--card); border: 1px solid #EF4444; color: #FCA5A5; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }

        .table-scroll-wrap { overflow-x: auto; width: 100%; padding-bottom: 4px; scrollbar-color: var(--border) var(--bg); scrollbar-width: thin; }
        .table-scroll-wrap::-webkit-scrollbar { height: 10px; }
        .table-scroll-wrap::-webkit-scrollbar-track { background: var(--bg); border-radius: 8px; }
        .table-scroll-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }

        .inv-item-header, .inv-item-row { display: grid; grid-template-columns: ${fixedCols()}; gap: 6px; align-items: center; padding: 6px 4px; }

        /* Cap visible item rows to roughly 5 before scrolling internally.
           Header stays outside this wrapper so it never scrolls away. */
        .items-body-scroll { max-height: 280px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .items-body-scroll::-webkit-scrollbar { width: 8px; }
        .items-body-scroll::-webkit-scrollbar-track { background: transparent; }
        .items-body-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }
        .items-body-scroll::-webkit-scrollbar-thumb:hover { background: var(--border-strong, var(--text-faint)); }
        .inv-item-header { font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); border-bottom: 2px solid var(--border); letter-spacing: 0.04em; padding-bottom: 8px; margin-bottom: 4px; }
        .inv-item-header span { display: flex; align-items: center; padding: 0 8px; }
        .inv-item-header .header-right { justify-content: flex-end; text-align: right; }
        .inv-item-header .header-center { justify-content: center; text-align: center; }

        .inv-item-row { border-bottom: 1px solid var(--border); padding: 6px 4px; }
        .inv-item-row > * { padding: 0 8px; min-height: 34px; display: flex; align-items: center; }
        .inv-item-row .inv-cell { border: 1.5px solid var(--border); border-radius: 8px; padding: 0 8px; font-size: 12px; font-family: inherit; background: var(--bg); color: var(--text); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; box-sizing: border-box; height: 34px; width: 100%; }
        .inv-item-row input, .inv-item-row select { height: 34px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 8px; font-size: 12px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; width: 100%; }
        .inv-item-row input:focus, .inv-item-row select:focus { border-color: var(--primary); }
        .inv-item-row .inv-cell-total { justify-content: flex-end; font-weight: 600; }
        .inv-item-row .inv-cell-tax { justify-content: flex-end; color: var(--text-muted); font-size: 11px; }

        .inv-item-row .delete-btn { background: none; border: none; cursor: pointer; color: #EF4444; display: flex; align-items: center; justify-content: center; padding: 4px; min-height: 34px; }
        .inv-item-row .delete-btn:hover { color: #DC2626; }

        .tax-wrapper { display: flex; align-items: center; gap: 6px; width: 100%; }
        .tax-wrapper select { flex: 1; min-width: 60px; }
        .tax-badge { font-size: 10px; font-weight: 600; padding: 2px 10px; border-radius: 12px; background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.2); white-space: nowrap; flex-shrink: 0; }
        .tax-badge.no-tax { background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border-color: var(--border); }

        .line-info-row { font-size: 10px; color: var(--text-muted); margin-left: 4px; display: flex; gap: 14px; padding: 3px 0 5px 0; flex-wrap: wrap; align-items: center; }
        .line-info-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 10px; }
        .over-budget-chip { border-color: #EF4444 !important; color: #FCA5A5 !important; }
        .ok-budget-chip { border-color: #059669 !important; color: #6EE7B7 !important; }
        .project-select-small { height: 24px; font-size: 10px; padding: 0 4px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); margin-left: 6px; }

        .mobile-sticky-summary { display: none; position: sticky; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--border); padding: 12px 16px; align-items: center; justify-content: space-between; z-index: 50; margin-top: 16px; }
        .mobile-sticky-summary .total-left { flex: 1; min-width: 0; }
        .mobile-sticky-summary .total-amount { font-size: 18px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mobile-sticky-summary .total-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
        .mobile-sticky-summary .post-btn { flex-shrink: 0; margin-left: 12px; background: var(--primary); color: var(--primary-text); border-color: var(--primary); padding: 12px 24px; font-weight: 700; }

        .desktop-summary { display: flex; flex-direction: column; gap: 12px; }

        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }

        @media (min-width: 1025px) { .desktop-summary { display: flex; flex-direction: column; gap: 12px; } .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; } .mobile-sticky-summary { display: none !important; } }
        @media (max-width: 1024px) { .header-grid { display: block; } .desktop-summary { display: none !important; } .mobile-sticky-summary { display: flex !important; } .inv-card { padding: 12px; } .inv-input, .inv-select { height: 44px; font-size: 16px; } .inv-btn { padding: 10px 16px; font-size: 14px; } .cust-dropdown { max-height: 180px; } .inv-item-header, .inv-item-row { min-width: 750px; } }
        @media (max-width: 640px) { .inv-row { grid-template-columns: 1fr; } }
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

        <div className="inv-content-wrapper">
          <div className="header-grid inv-customer-section">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="inv-card">
                <EntityPicker
                  entityType="supplier"
                  value={selectedSupplier}
                  onChange={(record) => {
                    if (record) {
                      setSupplierId(Number(record.id))
                      setSelectedSupplier(record)
                      setSupplierSearch(record.name)
                      setShowSupplierList(false)
                      setPoId(null)
                      setPoRemaining(0)
                    } else {
                      clearSupplier()
                    }
                  }}
                  label="Supplier"
                  required
                />

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
                      <div className="po-banner">
                        <span>Linked: <span className="po-no">{openPOs.find(p => p.id === poId)?.po_no}</span></span>
                        <span className="po-remaining">Remaining balance: <strong>PKR {poRemaining.toLocaleString()}</strong></span>
                      </div>
                    )}
                  </div>
                )}

                <div className="group-label">Dates &amp; reference</div>
                <div className="inv-row">
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

              <div className="inv-card">
                {showProducts ? (
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <EntityPicker
                          entityType="product"
                          value={null}
                          onChange={(record) => { if (record) addProductItem(record); }}
                          placeholder="Search product…"
                          label="Add Item"
                          allowCreate={false}
                        />
                      </div>
                      <button className="inv-btn" style={{ height: 38, flexShrink: 0 }} onClick={addManualItem}><Plus size={14} /> Manual</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="inv-label">Add Item</label>
                    <button className="inv-btn" onClick={addManualItem}><Plus size={14} /> Manual</button>
                  </div>
                )}
              </div>

              {taxEnabled && (
                <div className="inv-card">
                  <div className="wht-card-head">
                    <label className="inv-label" style={{ margin: 0 }}>Withholding Tax — Section 153 (WHT)</label>
                  </div>
                  <div className="wht-grid">
                    <div>
                      <label className="inv-label">Tax Code</label>
                      <select
                        className="inv-select"
                        value={selectedWhtTaxCodeId}
                        onChange={e => {
                          const id = e.target.value
                          setSelectedWhtTaxCodeId(id)
                          if (id) {
                            const tc = whtTaxCodes.find(t => t.id === id)
                            if (tc) {
                              setWhtRate(tc.rate)
                              setWhtAmount(grossTotal * (tc.rate / 100))
                            }
                          } else {
                            setWhtRate(0)
                            setWhtAmount(0)
                          }
                        }}
                      >
                        <option value="">No WHT</option>
                        {whtTaxCodes.map(tc => (
                          <option key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="inv-label">Rate %</label>
                      <input
                        className="inv-input"
                        type="number"
                        placeholder="Rate %"
                        value={whtRate}
                        onChange={e => {
                          const r = Number(e.target.value)
                          setWhtRate(r)
                          setWhtAmount(grossTotal * (r / 100))
                        }}
                        style={{ textAlign: "right" }}
                      />
                    </div>
                    <div>
                      <label className="inv-label">Amount Deducted</label>
                      <input
                        className="inv-input"
                        type="number"
                        value={whtAmount}
                        onChange={e => setWhtAmount(Number(e.target.value))}
                        style={{ textAlign: "right", fontWeight: 600 }}
                      />
                    </div>
                  </div>
                  {whtAmount > 0 && (
                    <div className="wht-result-row">
                      <span style={{ color: "var(--text-muted)" }}>Net payable after WHT</span>
                      <strong>PKR {(grossTotal - whtAmount).toLocaleString()}</strong>
                    </div>
                  )}
                </div>
              )}

              {editId && (
                <div className="inv-card" style={{ marginTop: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
                  <RecordHistory tableName="invoices" recordId={editId} />
                </div>
              )}
            </div>

            <div className="desktop-summary">
              <div className="inv-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px 0" }}>Summary</h3>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600 }}>
                  <span>Total (Net)</span>
                  <span>PKR {netTotal.toLocaleString()}</span>
                </div>
                {taxEnabled && totalTaxAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    <span>Input Tax</span>
                    <span>PKR {totalTaxAmount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                  <span>Gross Total</span>
                  <span>PKR {grossTotal.toLocaleString()}</span>
                </div>
                {whtAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    <span>WHT</span>
                    <span>-PKR {whtAmount.toLocaleString()}</span>
                  </div>
                )}
                {whtAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 600, marginTop: 4, borderTop: "1px dashed var(--border)", paddingTop: 6 }}>
                    <span>Net Payable</span>
                    <span>PKR {(grossTotal - whtAmount).toLocaleString()}</span>
                  </div>
                )}
                {budgetError && (
                  <div className="budget-warning" style={{ marginTop: 8 }}>⚠️ {budgetError}</div>
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
                  className="inv-btn"
                  style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }}
                  onClick={handleBeforeSavePdf}
                >
                  <Download size={14} /> PDF Preview
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="items-section-head">
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Items</span>
              {items.length > 0 && <span className="items-count">{items.length} item{items.length > 1 ? "s" : ""}</span>}
            </div>
            {items.length === 0 && (
              <div className="inv-card">
                <div className="empty-items">
                  <div className="icon-wrap">
                    <Plus size={20} />
                  </div>
                  <div className="t1">No items added yet</div>
                  <div className="t2">Search for a product above, or add a manual line to start building this bill.</div>
                </div>
              </div>
            )}
            {items.length > 0 && (
              <div className="inv-card" style={{ padding: "16px 12px" }}>
                <div className="table-scroll-wrap">
                  <div className="inv-item-header">
                    <span>Description</span>
                    <span className="header-center">Qty</span>
                    <span className="header-right">Price</span>
                    {taxEnabled && <span className="header-center">Tax %</span>}
                    {(isNGO || locations.length > 0) && <span>Location</span>}
                    {(isNGO || activities.length > 0) && <span>Activity</span>}
                    <span>GL Acc</span>
                    <span className="header-right">Total</span>
                    <span className="header-center"></span>
                  </div>

                  <div className="items-body-scroll">
                  {items.map((item, idx) => {
                    const budgetData = getLineBudgetData(item)
                    const overBudget = isLineOverBudget(item, budgetData)
                    const filteredActs = getFilteredActivities(item.location_id)
                    const combos = getCombosForLine(item)
                    const selectedProject = item.project_id
                      ? allProjects.find(p => p.id === item.project_id)
                      : null
                    const selectedDonor = item.donor_id
                      ? allDonors.find(d => d.id === item.donor_id)
                      : null

                    const showInfoRow = isNGO && !item.product_id && !!item.activity_id
                    const taxBadge = taxEnabled && item.tax_code_id ? `${item.tax_rate}%` : null

                    return (
                      <Fragment key={idx}>
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

                          {taxEnabled && (
                            <div className="tax-wrapper">
                              <select
                                className="inv-select"
                                style={{ height: 34, fontSize: 11, flex: 1, minWidth: 60 }}
                                value={item.tax_code_id || ""}
                                onChange={e => updateTax(idx, e.target.value || null)}
                              >
                                <option value="">No Tax</option>
                                {inputTaxCodes.map(tc => (
                                  <option key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</option>
                                ))}
                              </select>
                              {taxBadge ? <span className="tax-badge">{taxBadge}</span> : <span className="tax-badge no-tax">No Tax</span>}
                            </div>
                          )}

                          {(isNGO || locations.length > 0) && (
                            item.product_id ? (
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
                            ) : (
                              <EntityPicker
                                entityType="location"
                                value={locations.find(l => l.id == item.location_id) || null}
                                onChange={(record) => { updateItem(idx, "location_id", record ? record.id : ""); }}
                                placeholder="—"
                                compact
                                allowCreate={false}
                              />
                            )
                          )}

                          {(isNGO || activities.length > 0) && (
                            item.product_id ? (
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
                            ) : (
                              <EntityPicker
                                entityType="activity"
                                value={filteredActs.find(a => a.id == item.activity_id) || null}
                                onChange={(record) => { updateItem(idx, "activity_id", record ? record.id : ""); }}
                                placeholder="—"
                                compact
                                allowCreate={false}
                              />
                            )
                          )}

                          {item.product_id ? (
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Inventory</span>
                          ) : (
                            <EntityPicker
                              entityType="account"
                              value={allAccounts.find(a => a.id === item.account_id) || null}
                              onChange={(record) => { updateItem(idx, "account_id", record ? Number(record.id) : null); }}
                              placeholder="—"
                              compact
                              allowCreate={false}
                            />
                          )}

                          <div className="inv-cell inv-cell-total" style={{ color: overBudget ? "#FCA5A5" : undefined }}>
                            PKR {item.total.toLocaleString()}
                          </div>

                          <button className="delete-btn" onClick={() => removeItem(idx)}><Trash2 size={14} /></button>
                        </div>

                        {showInfoRow && (
                          <div className="line-info-row">
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

                            {budgetData && !budgetData.hasBudget && (
                              <span className="line-info-chip over-budget-chip">🚫 No budget defined</span>
                            )}
                            {budgetData && budgetData.hasBudget && (
                              <>
                                <span className="line-info-chip">Budget: PKR {budgetData.budget.toLocaleString()}</span>
                                <span className="line-info-chip">Spent: PKR {budgetData.spent.toLocaleString()}</span>
                                {getLineDisplayAvailable(item, budgetData) !== null && (
                                  <span className={`line-info-chip ${overBudget ? "over-budget-chip" : "ok-budget-chip"}`}>
                                    {overBudget
                                      ? "⚠️ Over by PKR " + (item.total - getLineDisplayAvailable(item, budgetData)!).toLocaleString()
                                      : "✓ Available: PKR " + getLineDisplayAvailable(item, budgetData)!.toLocaleString()}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </Fragment>
                    )
                  })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mobile-sticky-summary">
            <div className="total-left">
              <div className="total-label">Total</div>
              <div className="total-amount">PKR {(netTotal + totalTaxAmount).toLocaleString()}</div>
              {taxEnabled && totalTaxAmount > 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>incl. tax PKR {totalTaxAmount.toLocaleString()}</div>}
              {budgetError && <div style={{ fontSize: 10, color: "#EF4444" }}>⚠️ Budget overrun</div>}
            </div>
            <button
              className="inv-btn post-btn"
              onClick={handleSubmit}
              disabled={saving || budgetError !== ""}
            >
              {saving ? "Posting..." : "POST"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}