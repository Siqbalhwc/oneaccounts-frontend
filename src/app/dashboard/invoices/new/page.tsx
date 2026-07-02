"use client"

import { Suspense } from "react"
import { useState, useEffect, useRef, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft, Plus, Trash2, Send, Search, X, Download, CheckCircle,
  Image as ImageIcon, RefreshCw, ExternalLink,
} from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import EntityPicker from "@/components/entity-picker/EntityPicker"

function getCreditDays(term?: string | null): number {
  if (!term) return 30
  const s = term.toLowerCase()
  if (s.includes("receipt")) return 0
  if (s.includes("net 7")) return 7
  if (s.includes("net 15")) return 15
  if (s.includes("net 30")) return 30
  if (s.includes("net 60")) return 60
  return 30
}

function NewInvoicePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const showProducts = hasFeature("inventory")
  const taxEnabled = hasFeature("tax_management")
  const automationFeatureEnabled = hasFeature("invoice_automation")

  const [companyId, setCompanyId] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<any>(null)

  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerList, setShowCustomerList] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerRef = useRef<HTMLDivElement>(null)

  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState("")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [showProductList, setShowProductList] = useState(false)

  const [priceHistory, setPriceHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [lastSelectedProduct, setLastSelectedProduct] = useState<any>(null)
  const [refreshingCustomers, setRefreshingCustomers] = useState(false)

  const [savedInvoiceId, setSavedInvoiceId] = useState<number | null>(null)

  const [taxCodes, setTaxCodes] = useState<any[]>([])

  const [bankAccounts, setBankAccounts] = useState<any[]>([])

  const isNGO = businessType === "ngo"
  const invoiceIdForLink = savedInvoiceId || (editId ? Number(editId) : null)

  const [stockErrors, setStockErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(({ data }) => { if (data) setBusinessType(data.business_type || "") })

      supabase.from("customers")
        .select("id,code,name,phone,balance,country_code,payment_terms")
        .eq("company_id", cid)
        .order("name")
        .then(r => { if (r.data) setCustomers(r.data) })

      if (showProducts) {
        supabase.from("products")
          .select("id,code,name,sale_price,cost_price,qty_on_hand,image_path,default_tax_code_id")
          .eq("company_id", cid)
          .is("deleted_at", null)
          .order("name")
          .then(r => r.data && setProducts(r.data))
      }

      supabase.from("company_settings")
        .select("*").eq("company_id", cid).single()
        .then(r => {
          if (r.data) setCompany(r.data)
          else {
            supabase.from("companies")
              .select("name, logo_url, tagline, address, business_type")
              .eq("id", cid).single()
              .then(r2 => r2.data && setCompany(r2.data))
          }
        })

      supabase.from("projects").select("id,name,donor_id").eq("company_id", cid).not("donor_id", "is", null).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("donors").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setDonors(r.data))

      if (taxEnabled) {
        supabase.from("tax_codes")
          .select("id, code, name, rate, tax_account_id")
          .eq("company_id", cid)
          .order("code")
          .then(r => r.data && setTaxCodes(r.data))
      }

      supabase.from("bank_accounts")
        .select("bank_name, account_title, account_number, show_on_invoice")
        .eq("company_id", cid)
        .eq("show_on_invoice", true)
        .then(({ data: banks }) => {
          if (banks) setBankAccounts(banks)
        })

      setLoading(false)
    })
  }, [showProducts, taxEnabled])

  useEffect(() => {
    const errors: Record<number, string> = {}
    items.forEach((item, idx) => {
      if (item.product_id && item.qty > 0) {
        const product = products.find(p => p.id === item.product_id)
        if (product && item.qty > (product.qty_on_hand || 0)) {
          errors[idx] = `Insufficient stock: available ${product.qty_on_hand}`
        }
      }
    })
    setStockErrors(errors)
  }, [items, products])

  useEffect(() => {
    if (!editId || !companyId) return
    supabase.from("invoices")
      .select("*")
      .eq("id", editId)
      .eq("company_id", companyId)
      .single()
      .then(({ data: bill }) => {
        if (!bill) return
        setCustomerId(bill.party_id)
        const cust = customers.find((s: any) => s.id === bill.party_id)
        if (cust) { setSelectedCustomer(cust); setCustomerSearch(cust.name) }
        setInvoiceDate(bill.date)
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
                product_id: item.product_id,
                description: item.description,
                product_name: "",
                product_image: null,
                qty: item.qty,
                unit_price: item.unit_price,
                cost_price: item.cost_price || 0,
                total: item.total,
                project_id: item.project_id || null,
                donor_id: item.donor_id || null,
                tax_code_id: item.tax_code_id ? String(item.tax_code_id) : null,
                tax_rate: item.tax_rate || 0,
                tax_amount: item.tax_amount || 0,
              }))
              setItems(loaded)
            }
          })
      })
  }, [editId, companyId, customers])

  useEffect(() => {
    if (!invoiceDate || !selectedCustomer) return
    const days = getCreditDays(selectedCustomer.payment_terms)
    const dt = new Date(invoiceDate)
    dt.setDate(dt.getDate() + days)
    setDueDate(dt.toISOString().split("T")[0])
  }, [invoiceDate, selectedCustomer])

  useEffect(() => {
    if (customerId && lastSelectedProduct) {
      fetchPriceHistory(lastSelectedProduct.id, customerId)
    }
  }, [customerId])

  const refreshCustomers = () => {
    if (!companyId) return
    setRefreshingCustomers(true)
    supabase.from("customers")
      .select("id,code,name,phone,balance,country_code,payment_terms")
      .eq("company_id", companyId)
      .order("name")
      .then(r => {
        if (r.data) setCustomers(r.data)
        setRefreshingCustomers(false)
        if (selectedCustomer) {
          const updated = r.data?.find((c: any) => c.id === selectedCustomer.id)
          if (updated) setSelectedCustomer(updated)
        }
      })
  }

  // ✅ Callback to update parent's product list when EntityPicker refetches
  const handleProductsRefreshed = (records: any[]) => {
    setProducts(records)
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.code.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone || "").includes(customerSearch)
  )

  const selectCustomer = (c: any) => {
    setCustomerId(c.id)
    setSelectedCustomer(c)
    setCustomerSearch(c.name)
    setShowCustomerList(false)
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setSelectedCustomer(null)
    setCustomerSearch("")
    setShowCustomerList(true)
  }

  const filteredProducts = products.filter((p: any) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  )

  const addProductItem = (prod: any) => {
    let newTaxCodeId = prod.default_tax_code_id ? String(prod.default_tax_code_id) : null
    let newTaxRate = 0
    let newTaxAmount = 0

    if (newTaxCodeId && taxEnabled) {
      const taxCode = taxCodes.find((t: any) => String(t.id) === newTaxCodeId)
      if (taxCode) {
        newTaxRate = taxCode.rate
        newTaxAmount = (prod.sale_price * newTaxRate) / 100
      }
    }

    setItems([...items, {
      product_id: prod.id,
      description: `${prod.code} - ${prod.name}`,
      product_name: prod.name,
      product_image: prod.image_path || null,
      qty: 1,
      unit_price: prod.sale_price,
      cost_price: prod.cost_price,
      total: prod.sale_price,
      project_id: null,
      donor_id: null,
      tax_code_id: newTaxCodeId,
      tax_rate: newTaxRate,
      tax_amount: newTaxAmount,
    }])
    setProductSearch("")
    setShowProductList(false)
    setLastSelectedProduct(prod)
    if (customerId) fetchPriceHistory(prod.id, customerId)
    else setShowHistory(false)
  }

  const addManualItem = () => {
    setItems([...items, {
      product_id: null,
      description: "",
      product_name: "",
      product_image: null,
      qty: 1,
      unit_price: 0,
      cost_price: 0,
      total: 0,
      project_id: null,
      donor_id: null,
      tax_code_id: null,
      tax_rate: 0,
      tax_amount: 0,
    }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }

    if (field === "qty" || field === "unit_price") {
      updated[idx].total = updated[idx].qty * updated[idx].unit_price
      if (updated[idx].tax_rate > 0) {
        updated[idx].tax_amount = (updated[idx].qty * updated[idx].unit_price * updated[idx].tax_rate) / 100
      } else {
        updated[idx].tax_amount = 0
      }
    }

    if (field === "project_id" && value) {
      const project = projects.find(p => p.id == value)
      if (project) {
        updated[idx].donor_id = project.donor_id || null
      } else {
        updated[idx].donor_id = null
      }
    }

    setItems(updated)
  }

  const updateTax = (idx: number, codeId: string | null) => {
    const updated = [...items]
    if (codeId) {
      const taxCode = taxCodes.find((t: any) => String(t.id) === codeId)
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

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const fetchPriceHistory = async (productId: number, custId: number) => {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("id, invoice_id, unit_price")
      .eq("product_id", productId)
      .order("id", { ascending: false })
      .limit(20)
    if (!items || items.length === 0) { setPriceHistory([]); setShowHistory(true); return }
    const invoiceIds = [...new Set(items.map((i: any) => i.invoice_id))]
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, date")
      .in("id", invoiceIds)
      .eq("party_id", custId)
    if (!invoices || invoices.length === 0) { setPriceHistory([]); setShowHistory(true); return }
    const invMap: Record<number, any> = {}
    invoices.forEach((inv: any) => { invMap[inv.id] = inv })
    const history = items
      .filter((item: any) => invMap[item.invoice_id])
      .map((item: any) => ({
        unit_price: item.unit_price,
        invoice_no: invMap[item.invoice_id].invoice_no,
        date: invMap[item.invoice_id].date,
      }))
      .slice(0, 5)
    setPriceHistory(history)
    setShowHistory(true)
  }

  const totalAmount = items.reduce((s, i) => s + i.total, 0)
  const totalTaxAmount = items.reduce((s, i) => s + (i.tax_amount || 0), 0)

  const hasStockErrors = Object.keys(stockErrors).length > 0

  const handleSubmit = async () => {
    if (!customerId) { setError("Please select a customer"); return }
    if (items.length === 0) { setError("Add at least one item"); return }
    if (hasStockErrors) {
      setError("Cannot save: some items have insufficient stock. Please adjust quantities.");
      return
    }

    setSaving(true); setError("")

    if (editId) {
      try {
        const url = `/api/invoices?id=${editId}`
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editId,
            party_id: customerId,
            invoice_date: invoiceDate,
            due_date: dueDate,
            items: items.map(i => ({
              product_id: i.product_id,
              description: i.description,
              qty: i.qty,
              unit_price: i.unit_price,
              cost_price: i.cost_price,
              project_id: i.project_id || null,
              donor_id: i.donor_id || null,
              tax_code_id: taxEnabled ? (i.tax_code_id || null) : undefined,
              tax_rate: taxEnabled ? (i.tax_rate || 0) : undefined,
              tax_amount: taxEnabled ? (i.tax_amount || 0) : undefined,
            })),
            reference,
            notes,
          }),
        })
        const result = await res.json()
        if (!result.success) {
          setError(result.error || "Failed to update invoice")
          setSaving(false)
          return
        }
        const newInvoiceId = result.invoice?.id
        setSavedInvoiceId(newInvoiceId || null)
        setFlash(`✅ Invoice updated successfully!`)
        router.push(`/dashboard/invoices/${editId}`)
      } catch {
        setError("Network error")
        setSaving(false)
      }
      return
    }

    try {
      let automationConfig = {}
      let automationAllowed = false
      if (automationFeatureEnabled) {
        const { data: settings } = await supabase
          .from("company_settings")
          .select("invoice_automation_config")
          .eq("company_id", companyId)
          .maybeSingle()
        automationConfig = settings?.invoice_automation_config || {}
        automationAllowed = true
      }

      const payloadItems = items.map(i => ({
        product_id: i.product_id || null,
        description: i.description,
        qty: i.qty,
        unit_price: i.unit_price,
        cost_price: i.cost_price || 0,
        project_id: i.project_id || null,
        donor_id: i.donor_id || null,
        tax_code_id: taxEnabled ? (i.tax_code_id || null) : null,
        tax_rate: taxEnabled ? (i.tax_rate || 0) : 0,
        tax_amount: taxEnabled ? (i.tax_amount || 0) : 0,
      }))

      const { data, error: rpcError } = await supabase.rpc('create_invoice_transaction', {
        p_company_id: companyId,
        p_party_id: customerId,
        p_invoice_date: invoiceDate,
        p_due_date: dueDate,
        p_items: payloadItems,
        p_reference: reference || '',
        p_notes: notes || '',
        p_user_email: selectedCustomer?.email || 'system',
        p_tax_enabled: taxEnabled,
        p_automation_config: automationConfig,
        p_automation_allowed: automationAllowed,
        p_business_type: businessType,
      })

      if (rpcError) {
        setError(rpcError.message || "Failed to save invoice")
        setSaving(false)
        return
      }

      if (!data || !data.success) {
        setError(data?.error || "Failed to save invoice")
        setSaving(false)
        return
      }

      const newInvoiceId = data.invoice_id
      setSavedInvoiceId(newInvoiceId || null)
      setFlash(`✅ Invoice saved successfully!`)
      setSaving(false)

    } catch (err: any) {
      setError(err.message || "Network error")
      setSaving(false)
    }
  }

  const waLink = () => {
    if (!selectedCustomer) return ""
    const code = (selectedCustomer.country_code || "+92").replace(/\D/g, "")
    const phone = (selectedCustomer.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const invoiceLink = invoiceIdForLink
      ? `https://www.oneaccountsbysiqbal.com/invoice/${invoiceIdForLink}`
      : null
    const customerDisplayName = selectedCustomer.name?.trim() || selectedCustomer.phone || "Customer"
    const actualCompanyName = company?.name || company?.company_name || "OneAccounts"
    const msg = [
      `Dear ${customerDisplayName},`,
      ``,
      `Your invoice of PKR ${totalAmount.toLocaleString()} has been generated.`,
      invoiceLink ? `` : `(Save the invoice first to get a link.)`,
      invoiceLink ? `📄 View Online: ${invoiceLink}` : "",
      `📅 Date: ${invoiceDate}`,
      `📆 Due: ${dueDate}`,
      ``,
      `Thank you for your business.`,
      `— ${actualCompanyName}`,
    ].filter(line => line !== "").join("\n")
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  const handleWhatsAppWithPDF = async () => {
    if (!selectedCustomer) return
    const phone = (selectedCustomer.phone || "").replace(/\D/g, "")
    if (!phone) { alert("No phone number for this customer."); return }
    const invoiceLink = invoiceIdForLink
      ? `https://www.oneaccountsbysiqbal.com/invoice/${invoiceIdForLink}`
      : null
    const customerDisplayName = selectedCustomer.name?.trim() || selectedCustomer.phone || "Customer"
    const actualCompanyName = company?.name || company?.company_name || "OneAccounts"

    const pdfData = {
      companyName: actualCompanyName,
      companyAddress: company?.address || "",
      companyPhone: company?.phone || "",
      companyEmail: company?.email || "",
      companyTagline: company?.tagline || "",
      logoUrl: company?.logo_url || null,
      businessType: company?.business_type || "",
      invoiceNo: "PREVIEW",
      date: invoiceDate,
      dueDate: dueDate,
      customerName: customerDisplayName,
      customerPhone: selectedCustomer.phone || "",
      customerAddress: selectedCustomer.address || "",
      customerEmail: selectedCustomer.email || "",
      paymentTerms: selectedCustomer.payment_terms || null,
      items: items.map(i => ({
        description: i.description || "",
        qty: i.qty || 0,
        unit_price: i.unit_price || 0,
        total: i.total || 0,
        image_path: i.product_image || null,
        product_id: i.product_id || null,
        product_name: i.product_name || "",
        tax_rate: i.tax_rate || 0,
        tax_amount: i.tax_amount || 0,
      })),
      subtotal: totalAmount,
      total: totalAmount + totalTaxAmount,
      status: "Unpaid",
      paid: 0,
      balanceDue: totalAmount + totalTaxAmount,
      bankAccounts: bankAccounts.map((b: any) => ({
        bankName: b.bank_name,
        accountTitle: b.account_title,
        accountNumber: b.account_number,
        showOnInvoice: b.show_on_invoice
      }))
    }
    const doc = await generateInvoicePDF(pdfData)
    const blob = doc.output("blob")
    const filePath = `invoices/${Date.now()}-${Math.random().toString(36).substr(2,5)}.pdf`
    try {
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("invoice-pdfs")
        .upload(filePath, blob, { contentType: "application/pdf", upsert: false })
      if (!uploadErr) {
        const { data: publicUrlData } = supabase.storage
          .from("invoice-pdfs")
          .getPublicUrl(filePath)
        const pdfLink = publicUrlData.publicUrl
        const msg = [
          `Dear ${customerDisplayName},`,
          ``,
          `Your invoice of PKR ${(totalAmount + totalTaxAmount).toLocaleString()} has been generated.`,
          invoiceLink ? `📄 View Online: ${invoiceLink}` : "",
          `📎 Download PDF: ${pdfLink}`,
          `📅 Date: ${invoiceDate}`,
          `📆 Due: ${dueDate}`,
          ``,
          `Thank you for your business.`,
          `— ${actualCompanyName}`,
        ].filter(line => line !== "").join("\n")
        const waURL = `https://wa.me/${(selectedCustomer.country_code || "+92").replace(/\D/g, "")}${phone}?text=${encodeURIComponent(msg)}`
        window.open(waURL, "_blank")
        return
      }
    } catch (e) { console.warn("Upload failed, fallback to text only") }
    window.open(waLink(), "_blank")
  }

  const handleBeforeSavePdf = async () => {
    if (!selectedCustomer) return
    const pdfData = {
      companyName: company?.name || company?.company_name || "OneAccounts",
      companyAddress: company?.address || "",
      companyPhone: company?.phone || "",
      companyEmail: company?.email || "",
      companyTagline: company?.tagline || "",
      logoUrl: company?.logo_url || null,
      businessType: company?.business_type || "",
      invoiceNo: "PREVIEW",
      date: invoiceDate,
      dueDate: dueDate,
      customerName: selectedCustomer.name || "Customer",
      customerPhone: selectedCustomer.phone || "",
      customerAddress: selectedCustomer.address || "",
      customerEmail: selectedCustomer.email || "",
      paymentTerms: selectedCustomer.payment_terms || null,
      items: items.map(i => ({
        description: i.description || "",
        qty: i.qty || 0,
        unit_price: i.unit_price || 0,
        total: i.total || 0,
        image_path: i.product_image || null,
        product_id: i.product_id || null,
        product_name: i.product_name || "",
        tax_rate: i.tax_rate || 0,
        tax_amount: i.tax_amount || 0,
      })),
      subtotal: totalAmount,
      total: totalAmount + totalTaxAmount,
      status: "Unpaid",
      paid: 0,
      balanceDue: totalAmount + totalTaxAmount,
      bankAccounts: bankAccounts.map((b: any) => ({
        bankName: b.bank_name,
        accountTitle: b.account_title,
        accountNumber: b.account_number,
        showOnInvoice: b.show_on_invoice
      }))
    }
    const doc = await generateInvoicePDF(pdfData)
    doc.save(`invoice-preview.pdf`)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerList(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading invoice form…</div>
  }

  const getProjectName = (projectId: number | null) => {
    if (!projectId) return ""
    const proj = projects.find(p => p.id == projectId)
    return proj?.name || ""
  }
  const getDonorName = (donorId: number | null) => {
    if (!donorId) return ""
    const don = donors.find(d => d.id == donorId)
    return don?.name || ""
  }

  // Responsive column tracks: fixed px for narrow, fixed-width columns (thumbnail, qty, tax select, delete),
  // minmax(floor, fr) for columns that should grow to fill extra width on large screens
  // (Product, Description, Price, Total, Tax Amt, Cost) while still guaranteeing a
  // usable minimum so the horizontal-scroll wrapper kicks in correctly on small screens.
  const tableCols = taxEnabled
    ? "60px minmax(180px,1.2fr) minmax(240px,2fr) 80px minmax(110px,0.8fr) 110px minmax(120px,0.9fr) minmax(120px,0.9fr) minmax(110px,0.8fr) 50px"
    : "60px minmax(180px,1.2fr) minmax(240px,2fr) 80px minmax(110px,1fr) minmax(120px,1fr) minmax(110px,1fr) 50px"

  return (
    <div className="invoice-page" style={{ padding: "12px 16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { width: 100%; margin: 0; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px; overflow: visible; }
        .inv-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; }
        /* color-scheme for input[type=date] is now set globally per data-theme
           (see global stylesheet) so the calendar icon matches whichever of the
           3 themes (light / dark / oneaccounts) is active. Do not hardcode it here. */
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; transition: all 0.15s; white-space: nowrap; text-decoration: none; }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn-success { background: #25D366; color: white; border-color: #25D366; }
        .inv-btn-success:hover { background: #22C55E; }
        .inv-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); font-weight: 700; }
        .inv-btn-primary:hover { background: var(--primary-hover, var(--primary)); filter: brightness(1.08); }
        .inv-btn-primary:disabled, .inv-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .group-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin: 16px 0 10px; display: flex; align-items: center; gap: 8px; }
        .group-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }
        .group-label:first-child { margin-top: 0; }

        .cust-wrap { position: relative; }
        .cust-input-row { position: relative; display: flex; align-items: center; }
        .cust-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--card); border: 1.5px solid var(--border); border-radius: 10px; max-height: 220px; overflow-y: auto; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
        .cust-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .cust-option:last-child { border-bottom: none; }
        .cust-option:hover { background: var(--card-hover); }
        .cust-option-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .cust-option-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .cust-option-bal { font-size: 12px; font-weight: 600; color: var(--primary); white-space: nowrap; }
        .cust-selected-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1.5px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: var(--text); width: 100%; cursor: pointer; position: relative; overflow: hidden; }
        .cust-selected-badge .cust-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

        .table-scroll-wrap { overflow-x: auto; width: 100%; padding-bottom: 4px; scrollbar-color: var(--border) var(--bg); scrollbar-width: thin; }
        .table-scroll-wrap::-webkit-scrollbar { height: 10px; }
        .table-scroll-wrap::-webkit-scrollbar-track { background: var(--bg); border-radius: 8px; }
        .table-scroll-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }

        .inv-item-header, .inv-item-row { display: grid; grid-template-columns: ${tableCols}; gap: 6px; align-items: center; padding: 6px 4px; }
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
        .inv-item-row .inv-cell-cost { justify-content: flex-end; color: var(--text-muted); font-size: 11px; }
        .inv-item-row .delete-btn { background: none; border: none; cursor: pointer; color: #EF4444; display: flex; align-items: center; justify-content: center; padding: 4px; min-height: 34px; }
        .inv-item-row .tax-wrapper { display: flex; align-items: center; gap: 6px; width: 100%; }
        .inv-item-row .tax-wrapper select { flex: 1; min-width: 60px; }
        .tax-badge { font-size: 10px; font-weight: 600; padding: 2px 10px; border-radius: 12px; background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.2); white-space: nowrap; flex-shrink: 0; }
        .tax-badge.no-tax { background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border-color: var(--border); }
        .stock-warning { color: #EF4444; font-size: 10px; font-weight: 600; white-space: nowrap; background: rgba(239, 68, 68, 0.1); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.2); flex-shrink: 0; }

        .items-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
        .items-count { font-size: 11.5px; color: var(--text-muted); font-weight: 600; }
        .empty-items { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; text-align: center; color: var(--text-muted); }
        .empty-items .icon-wrap { width: 44px; height: 44px; border-radius: 50%; background: rgba(37,99,235,0.08); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: var(--primary); }
        .empty-items .t1 { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .empty-items .t2 { font-size: 12px; max-width: 280px; line-height: 1.5; color: var(--text-muted); }

        .prod-thumb-cell { width: 26px; height: 26px; border-radius: 6px; background: var(--border); display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0; overflow: hidden; }
        .prod-thumb-cell img { width: 100%; height: 100%; object-fit: cover; }

        .mobile-sticky-summary { display: none; position: sticky; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--border); padding: 12px 16px; align-items: center; justify-content: space-between; z-index: 50; margin-top: 16px; }
        .mobile-sticky-summary .total-left { flex: 1; min-width: 0; }
        .mobile-sticky-summary .total-amount { font-size: 18px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mobile-sticky-summary .total-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
        .mobile-sticky-summary .post-btn { flex-shrink: 0; margin-left: 12px; background: var(--primary); color: var(--primary-text); border-color: var(--primary); padding: 12px 24px; font-weight: 700; }

        .price-history { background: var(--card); border-radius: 8px; padding: 10px 14px; margin-top: 12px; font-size: 12px; border: 1px solid var(--border); }
        .price-history-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border); }
        .project-info-row { font-size: 10px; color: var(--text-muted); margin-top: 2px; padding-left: 8px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .project-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 10px; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        .desktop-summary { display: flex; flex-direction: column; gap: 12px; }

        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; overflow: visible; }
        .inv-customer-section { overflow: visible; }
        .inv-content-wrapper { overflow: visible; }

        @media (min-width: 1025px) { .desktop-summary { display: flex; flex-direction: column; gap: 12px; } .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; } .mobile-sticky-summary { display: none !important; } }
        @media (max-width: 1024px) { .header-grid { display: block; } .desktop-summary { display: none !important; } .mobile-sticky-summary { display: flex !important; } .inv-card { padding: 12px; } .inv-input, .inv-select { height: 44px; font-size: 16px; } .inv-btn { padding: 10px 16px; font-size: 14px; } .cust-dropdown { max-height: 180px; } }
        @media (max-width: 640px) { .inv-row { grid-template-columns: 1fr; } }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/invoices")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">{editId ? "✏️ Edit Sales Invoice" : "🧾 New Sales Invoice"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{editId ? "Modify invoice details and items" : "Create invoice with full accounting automation"}</div>
          </div>
          <button className="inv-btn" onClick={() => router.push("/dashboard/invoices")}>View List</button>
        </div>

        {error && <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
            {savedInvoiceId && !editId && <button className="inv-btn" style={{ marginLeft: 8, borderColor: "#ECFDF5", color: "#ECFDF5" }} onClick={() => router.push(`/dashboard/invoices/${savedInvoiceId}`)}><ExternalLink size={14} /> View Invoice</button>}
          </div>
        )}

        <div className="inv-content-wrapper">
          <div className="header-grid inv-customer-section">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="inv-card">
                <EntityPicker
                  entityType="customer"
                  value={selectedCustomer}
                  onChange={(record) => {
                    if (record) {
                      setCustomerId(Number(record.id))
                      setSelectedCustomer(record)
                      setCustomerSearch(record.name)
                      setShowCustomerList(false)
                    } else {
                      clearCustomer()
                    }
                  }}
                  label="Customer"
                  required
                />

                <div className="group-label">Dates &amp; reference</div>
                <div className="inv-row">
                  <div><label className="inv-label">Invoice Date *</label><input className="inv-input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
                  <div><label className="inv-label">Due Date</label><input className="inv-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
                </div>
                <div className="inv-row" style={{ marginTop: 10 }}>
                  <div><label className="inv-label">Reference</label><input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Customer PO #" /></div>
                  <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" /></div>
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
                          clearCacheOnOpen
                          onRecordsRefreshed={handleProductsRefreshed}
                        />
                      </div>
                      <button className="inv-btn" style={{ height: 38, flexShrink: 0 }} onClick={addManualItem}><Plus size={14} /> Manual</button>
                    </div>
                  </div>
                ) : (
                  <div><label className="inv-label">Add Item</label><button className="inv-btn" onClick={addManualItem}><Plus size={14} /> Manual</button></div>
                )}

                {showHistory && lastSelectedProduct && (
                  <div className="price-history">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      {lastSelectedProduct.image_path && <img src={lastSelectedProduct.image_path} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />}
                      <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>📋 Price history for {lastSelectedProduct.name}</span>
                      <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }} onClick={() => setShowHistory(false)}><X size={14} /></button>
                    </div>
                    {priceHistory.length > 0 ? priceHistory.map((h: any, i: number) => (
                      <div key={i} className="price-history-item"><span>{h.invoice_no} - {h.date}</span><span style={{ fontWeight: 600 }}>PKR {h.unit_price.toLocaleString()}</span></div>
                    )) : <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No previous sales to this customer</div>}
                  </div>
                )}
              </div>
            </div>

            <div className="desktop-summary">
              <div className="inv-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}><span>Total</span><span>PKR {(totalAmount + totalTaxAmount).toLocaleString()}</span></div>
                {taxEnabled && totalTaxAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}><span>Tax</span><span>PKR {totalTaxAmount.toLocaleString()}</span></div>}
                {hasStockErrors && (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#EF4444", fontSize: 11 }}>⚠️ Some items have insufficient stock</div>
                )}
              </div>
              <div className="inv-card">
                <button className="inv-btn inv-btn-primary" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={saving || hasStockErrors}>
                  {saving ? "Posting..." : editId ? "💾 UPDATE Invoice" : "💾 POST Invoice"}
                </button>
                <button className="inv-btn" style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }} onClick={handleBeforeSavePdf}><Download size={14} /> PDF Preview</button>
                {selectedCustomer && hasFeature("whatsapp_invoice") && <button className="inv-btn inv-btn-success" style={{ justifyContent: "center", padding: 9, marginTop: 8, width: "100%" }} onClick={handleWhatsAppWithPDF}><Send size={14} /> WhatsApp (PDF)</button>}
              </div>
            </div>
          </div>

          <div className="inv-items-section" style={{ marginBottom: 12 }}>
            <div className="items-section-head">
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Items</span>
              {items.length > 0 && <span className="items-count">{items.length} item{items.length > 1 ? "s" : ""}</span>}
            </div>
            {items.length === 0 && (
              <div className="inv-card">
                <div className="empty-items">
                  <div className="icon-wrap">
                    <ImageIcon size={20} />
                  </div>
                  <div className="t1">No items added yet</div>
                  <div className="t2">Search for a product above, or add a manual line to start building this invoice.</div>
                </div>
              </div>
            )}
            {items.length > 0 && (
              <div className="inv-card" style={{ padding: "16px 12px" }}>
                <div className="table-scroll-wrap">
                  <div style={{ minWidth: taxEnabled ? '1180px' : '950px' }}>
                    <div className="inv-item-header">
                      <span className="header-center"></span>
                      <span>Product</span>
                      <span>Description</span>
                      <span className="header-center">Qty</span>
                      <span className="header-right">Price</span>
                      {taxEnabled && <span className="header-center">Tax %</span>}
                      <span className="header-right">Total</span>
                      {taxEnabled && <span className="header-right">Tax Amt</span>}
                      <span className="header-right">Cost</span>
                      <span className="header-center"></span>
                    </div>

                    {items.map((item, idx) => {
                      const stockError = stockErrors[idx]
                      const taxBadge = taxEnabled && item.tax_code_id ? `${item.tax_rate}%` : null

                      return (
                        <Fragment key={idx}>
                        <div className="inv-item-row" style={stockError ? { background: "rgba(239,68,68,0.05)", borderRadius: "6px" } : {}}>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <div className="prod-thumb-cell">
                              {item.product_image ? <img src={item.product_image} alt="" /> : <ImageIcon size={13} />}
                            </div>
                          </div>

                          {item.product_id ? (
                            <div className="inv-cell" style={{ paddingLeft: 8 }}>{item.product_name || "—"}</div>
                          ) : (
                            <div>
                              {isNGO ? (
                                <EntityPicker
                                  entityType="project"
                                  value={projects.find(p => p.id === item.project_id) || null}
                                  onChange={(record) => { updateItem(idx, "project_id", record ? Number(record.id) : null); }}
                                  placeholder="— Select Project —"
                                  compact
                                  allowCreate={false}
                                />
                              ) : (
                                <div className="inv-cell" style={{ paddingLeft: 8 }}>—</div>
                              )}
                            </div>
                          )}

                          <input className="inv-input" style={{ height: 32, fontSize: 12 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Description" />
                          <input className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "center", borderColor: stockError ? "#EF4444" : undefined }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />
                          <input className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />

                          {taxEnabled && (
                            <div className="tax-wrapper">
                              <select className="inv-select" style={{ height: 32, fontSize: 11, flex: 1, minWidth: 60 }} value={item.tax_code_id || ""} onChange={e => updateTax(idx, e.target.value || null)}>
                                <option value="">No Tax</option>
                                {taxCodes.map((tc: any) => <option key={tc.id} value={String(tc.id)}>{tc.code} ({tc.rate}%)</option>)}
                              </select>
                              {taxBadge ? <span className="tax-badge">{taxBadge}</span> : <span className="tax-badge no-tax">No Tax</span>}
                            </div>
                          )}

                          <div className="inv-cell inv-cell-total">PKR {item.total.toLocaleString()}</div>

                          {taxEnabled && (
                            <div className="inv-cell inv-cell-tax">
                              {item.tax_amount > 0 ? `PKR ${item.tax_amount.toLocaleString()}` : "—"}
                            </div>
                          )}

                          <div className="inv-cell inv-cell-cost">
                            {item.product_id ? `PKR ${(item.cost_price * item.qty).toLocaleString()}` : "—"}
                          </div>

                          <button className="delete-btn" onClick={() => removeItem(idx)}><Trash2 size={14} /></button>
                        </div>

                        {stockError && (
                          <div style={{ fontSize: 11, color: "#EF4444", padding: "2px 0 4px 8px", background: "rgba(239,68,68,0.05)", borderRadius: "0 0 6px 6px" }}>
                            ⚠️ {stockError}
                          </div>
                        )}

                        {isNGO && !item.product_id && item.project_id && (
                          <div className="project-info-row">
                            <span className="project-chip">📁 {getProjectName(item.project_id)}{item.donor_id && <span style={{ color: "var(--primary)", marginLeft: 4 }}>· 🤝 {getDonorName(item.donor_id)}</span>}</span>
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
              <div className="total-amount">PKR {(totalAmount + totalTaxAmount).toLocaleString()}</div>
              {taxEnabled && totalTaxAmount > 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>incl. tax PKR {totalTaxAmount.toLocaleString()}</div>}
              {hasStockErrors && <div style={{ fontSize: 10, color: "#EF4444" }}>⚠️ Stock issues</div>}
            </div>
            <button className="inv-btn post-btn" onClick={handleSubmit} disabled={saving || hasStockErrors}>
              {saving ? "Posting..." : "POST"}
            </button>
          </div>
        </div>

        {editId && (
          <div className="inv-card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
            <RecordHistory tableName="invoices" recordId={editId} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading invoice form...</div>}>
      <NewInvoicePageContent />
    </Suspense>
  )
}