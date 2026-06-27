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

  return (
    <div style={{ padding: "22px 28px 60px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "var(--text)", maxWidth: 1280, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        .layout-grid { display: grid; grid-template-columns: 1fr 300px; gap: 18px; align-items: start; }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 10px; box-shadow: var(--shadow-sm); margin-bottom: 16px;
        }
        .card-pad { padding: 18px 20px; }
        .card-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; border-bottom: 1px solid var(--border);
        }
        .card-head h2 { font-size: 13px; font-weight: 700; margin: 0; }
        .card-head .hint { font-size: 11.5px; color: var(--text-muted); }

        .field { margin-bottom: 14px; }
        .field:last-child { margin-bottom: 0; }
        .field label {
          display: block; font-size: 10.5px; font-weight: 700; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px;
        }
        .field label .req { color: #EF4444; margin-left: 2px; }
        .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .input, .select {
          width: 100%; height: 40px; border-radius: 8px; border: 1.5px solid var(--border);
          background: var(--bg); color: var(--text); font-size: 13.5px; font-family: inherit;
          padding: 0 12px; outline: none; transition: border-color .15s, box-shadow .15s;
        }
        .input::placeholder { color: var(--text-muted); }
        .input:focus, .select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
        input[type="date"] { color-scheme: dark; }

        .group-label {
          font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
          color: var(--text-muted); margin: 18px 0 10px; display: flex; align-items: center; gap: 8px;
        }
        .group-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }
        .field-first-group { margin-top: 0; }

        .add-item-row { display: flex; gap: 10px; align-items: flex-end; }
        .add-item-row .grow { flex: 1; max-width: 400px; }

        .btn {
          display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 16px;
          border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer;
          border: 1.5px solid var(--border); background: transparent; color: var(--text);
          white-space: nowrap; font-family: inherit; transition: all .15s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
        .btn-primary:hover { background: #3B74F0; }
        .btn-block { width: 100%; justify-content: center; height: 44px; font-size: 13.5px; }
        .btn-success { background: #1E8E5A; border-color: #1E8E5A; color: #fff; }
        .btn-success:hover { background: #22A065; }

        .items-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
        .items-section-head h3 { font-size: 14px; font-weight: 700; margin: 0; }
        .items-count { font-size: 11.5px; color: var(--text-muted); }

        .empty-items {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 46px 20px; text-align: center; color: var(--text-muted);
        }
        .empty-items .icon-wrap {
          width: 48px; height: 48px; border-radius: 50%; background: rgba(37,99,235,0.08);
          display: flex; align-items: center; justify-content: center; margin-bottom: 14px; color: var(--primary);
        }
        .empty-items .t1 { font-size: 13.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; }
        .empty-items .t2 { font-size: 12px; max-width: 280px; line-height: 1.5; }

        table.items-table { width: 100%; border-collapse: collapse; }
        table.items-table thead th {
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
          color: var(--text-muted); text-align: left; padding: 0 10px 10px; border-bottom: 1.5px solid var(--border);
        }
        table.items-table thead th.num { text-align: right; }
        table.items-table thead th.center { text-align: center; }
        table.items-table tbody td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        table.items-table tbody tr:last-child td { border-bottom: none; }
        .cell-input { height: 34px; font-size: 12.5px; }
        .cell-num { text-align: right; font-variant-numeric: tabular-nums; }
        .prod-cell { display: flex; align-items: center; gap: 8px; }
        .prod-thumb {
          width: 26px; height: 26px; border-radius: 6px; background: var(--border);
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          color: var(--text-muted); overflow: hidden;
        }
        .prod-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .prod-name { font-size: 12.5px; font-weight: 600; }
        .row-total { font-weight: 700; }
        .tax-pill {
          font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 20px;
          background: rgba(56,189,248,0.12); color: #38BDF8;
          border: 1px solid rgba(56,189,248,0.25); white-space: nowrap;
        }
        .tax-pill.none { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .del-btn {
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          padding: 6px; border-radius: 6px;
        }
        .del-btn:hover { color: #EF4444; background: rgba(239,68,68,0.08); }
        .stock-flag {
          font-size: 10px; color: #EF4444; background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.25); padding: 1px 8px; border-radius: 20px;
          display: inline-block; margin-top: 4px;
        }

        .summary-card { padding: 18px 20px; }
        .summary-card h3 { font-size: 13px; font-weight: 700; margin: 0 0 14px; }
        .sum-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; padding: 7px 0; }
        .sum-row.muted { color: var(--text-muted); font-size: 12px; }
        .sum-row.total {
          font-size: 18px; font-weight: 800; border-top: 1px dashed var(--border);
          margin-top: 6px; padding-top: 12px;
        }
        .sum-row .lbl { color: var(--text-muted); font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
        .sum-row.total .lbl { color: var(--text); font-size: 13px; text-transform: none; font-weight: 700; letter-spacing: 0; }

        .actions-card { padding: 16px; display: flex; flex-direction: column; gap: 8px; }

        .warn-banner {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3);
          color: #FCA5A5; padding: 9px 12px; border-radius: 8px; font-size: 12px; margin-top: 10px;
        }
        .flash-banner {
          display: flex; align-items: center; gap: 8px;
          background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3);
          color: #6EE7B7; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px;
        }

        .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .back-btn {
          width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border);
          background: var(--card); display: flex; align-items: center; justify-content: center;
          color: var(--text-muted); cursor: pointer; flex-shrink: 0;
        }
        .back-btn:hover { background: var(--card-hover); color: var(--text); }
        .page-header h1 { font-size: 18px; font-weight: 700; margin: 0; }
        .page-header .sub { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }
        .header-spacer { flex: 1; }
        .ghost-btn {
          display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px;
          border-radius: 8px; border: 1px solid var(--border); background: transparent;
          color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .ghost-btn:hover { background: var(--card-hover); color: var(--text); }

        .price-history-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 8px;
          padding: 10px 14px; margin-top: 12px; font-size: 12px;
        }
        .price-history-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border); }
        .price-history-item:last-child { border-bottom: none; }

        .project-info-row {
          font-size: 10px; color: var(--text-muted); padding: 4px 0 6px 10px;
          display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
        }
        .project-chip {
          display: inline-flex; align-items: center; gap: 4px;
          background: rgba(255,255,255,0.04); border: 1px solid var(--border);
          border-radius: 4px; padding: 1px 6px; font-size: 10px;
        }

        @media (max-width: 1024px) {
          .layout-grid { grid-template-columns: 1fr; }
          .page-header { flex-wrap: wrap; }
        }
        @media (max-width: 640px) {
          .row-2 { grid-template-columns: 1fr; }
          .add-item-row { flex-wrap: wrap; }
          .add-item-row .grow { max-width: 100%; flex: 100%; }
        }
      `}</style>

      {/* ── Page Header ── */}
      <div className="page-header">
        <button className="back-btn" onClick={() => router.push("/dashboard/invoices")}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>{editId ? "Edit Sales Invoice" : "New Sales Invoice"}</h1>
          <div className="sub">{editId ? "Modify invoice details and items" : "Add customer details and items, then post to the ledger"}</div>
        </div>
        <div className="header-spacer"></div>
        <button className="ghost-btn" onClick={() => router.push("/dashboard/invoices")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
          View list
        </button>
      </div>

      {/* ── Flash / Error Messages ── */}
      {error && (
        <div className="warn-banner" style={{ marginBottom: 16 }}>
          <span>⚠</span> {error}
        </div>
      )}
      {flash && (
        <div className="flash-banner">
          <CheckCircle size={16} /> {flash}
          {savedInvoiceId && !editId && (
            <button className="ghost-btn" style={{ marginLeft: 8, borderColor: "#6EE7B7", color: "#6EE7B7" }} onClick={() => router.push(`/dashboard/invoices/${savedInvoiceId}`)}>
              <ExternalLink size={14} /> View Invoice
            </button>
          )}
        </div>
      )}

      {/* ── Layout Grid ── */}
      <div className="layout-grid">
        {/* LEFT COLUMN */}
        <div>
          {/* Customer + Dates Card */}
          <div className="card card-pad">
            <div className="field field-first-group">
              <label>Customer <span className="req">*</span></label>
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
                placeholder="Search customer by name, code or phone…"
              />
            </div>

            <div className="group-label">Dates &amp; reference</div>
            <div className="row-2">
              <div className="field">
                <label>Invoice date <span className="req">*</span></label>
                <input className="input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Due date</label>
                <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label>Reference</label>
                <input className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Customer PO #" />
              </div>
              <div className="field">
                <label>Notes</label>
                <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" />
              </div>
            </div>

            {/* Price History */}
            {showHistory && lastSelectedProduct && (
              <div className="price-history-card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  {lastSelectedProduct.image_path && <img src={lastSelectedProduct.image_path} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />}
                  <span style={{ fontWeight: 600, fontSize: 12 }}>📋 Price history for {lastSelectedProduct.name}</span>
                  <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }} onClick={() => setShowHistory(false)}><X size={14} /></button>
                </div>
                {priceHistory.length > 0 ? priceHistory.map((h: any, i: number) => (
                  <div key={i} className="price-history-item">
                    <span>{h.invoice_no} - {h.date}</span>
                    <span style={{ fontWeight: 600 }}>PKR {h.unit_price.toLocaleString()}</span>
                  </div>
                )) : <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No previous sales to this customer</div>}
              </div>
            )}
          </div>

          {/* Add Item Card */}
          {showProducts ? (
            <div className="card card-pad">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Add item</label>
                <div className="add-item-row">
                  <div className="grow">
                    <EntityPicker
                      entityType="product"
                      value={null}
                      onChange={(record) => { if (record) addProductItem(record); }}
                      placeholder="Search product by name or code…"
                      allowCreate={false}
                    />
                  </div>
                  <button className="btn" onClick={addManualItem}>
                    <Plus size={14} /> Manual line
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card card-pad">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Add item</label>
                <button className="btn" onClick={addManualItem}>
                  <Plus size={14} /> Manual line
                </button>
              </div>
            </div>
          )}

          {/* Items Section */}
          <div className="items-section-head">
            <h3>Items</h3>
            <span className="items-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
          </div>

          {items.length > 0 ? (
            <div className="card">
              <table className="items-table">
                <thead>
                  <tr>
                    <th style={{ width: 46 }}></th>
                    <th>Description</th>
                    <th className="center" style={{ width: 70 }}>Qty</th>
                    <th className="num" style={{ width: 100 }}>Price</th>
                    {taxEnabled && <th className="center" style={{ width: 110 }}>Tax</th>}
                    <th className="num" style={{ width: 110 }}>Total</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const stockError = stockErrors[idx]
                    const taxBadge = taxEnabled && item.tax_code_id
                    const taxCode = taxBadge ? taxCodes.find((t: any) => String(t.id) === item.tax_code_id) : null

                    return (
                      <Fragment key={idx}>
                        <tr>
                          {/* Image / Project selector */}
                          <td>
                            {item.product_id ? (
                              <div className="prod-thumb">
                                {item.product_image ? (
                                  <img src={item.product_image} alt="" />
                                ) : (
                                  <ImageIcon size={13} />
                                )}
                              </div>
                            ) : isNGO ? (
                              <EntityPicker
                                entityType="project"
                                value={projects.find(p => p.id === item.project_id) || null}
                                onChange={(record) => { updateItem(idx, "project_id", record ? Number(record.id) : null); }}
                                placeholder="Project"
                                compact
                                allowCreate={false}
                              />
                            ) : null}
                          </td>

                          {/* Description */}
                          <td>
                            {item.product_id ? (
                              <>
                                <div className="prod-name">{item.product_name || "—"}</div>
                                <input
                                  className="input cell-input"
                                  style={{ marginTop: 2, width: '100%' }}
                                  value={item.description}
                                  onChange={e => updateItem(idx, "description", e.target.value)}
                                  placeholder="Description"
                                />
                                {stockError && <span className="stock-flag">⚠ {stockError}</span>}
                              </>
                            ) : (
                              <input
                                className="input cell-input"
                                style={{ width: '100%' }}
                                value={item.description}
                                onChange={e => updateItem(idx, "description", e.target.value)}
                                placeholder="Description"
                              />
                            )}
                          </td>

                          {/* Qty */}
                          <td>
                            <input
                              className="input cell-input"
                              style={{ textAlign: "center", borderColor: stockError ? "#EF4444" : undefined }}
                              type="number"
                              value={item.qty}
                              onChange={e => updateItem(idx, "qty", Number(e.target.value))}
                            />
                          </td>

                          {/* Price */}
                          <td>
                            <input
                              className="input cell-input cell-num"
                              type="number"
                              value={item.unit_price}
                              onChange={e => updateItem(idx, "unit_price", Number(e.target.value))}
                            />
                          </td>

                          {/* Tax */}
                          {taxEnabled && (
                            <td style={{ textAlign: "center" }}>
                              <select
                                className="input cell-input"
                                style={{ width: '100%', fontSize: 11, textAlign: "center", padding: '0 4px' }}
                                value={item.tax_code_id || ""}
                                onChange={e => updateTax(idx, e.target.value || null)}
                              >
                                <option value="">No tax</option>
                                {taxCodes.map((tc: any) => (
                                  <option key={tc.id} value={String(tc.id)}>{tc.code}</option>
                                ))}
                              </select>
                              {taxBadge && (
                                <span className={taxBadge ? "tax-pill" : "tax-pill none"} style={{ marginTop: 3, display: 'inline-block' }}>
                                  {taxCode?.rate || item.tax_rate}%
                                </span>
                              )}
                            </td>
                          )}

                          {/* Total */}
                          <td className="cell-num row-total">PKR {item.total.toLocaleString()}</td>

                          {/* Delete */}
                          <td>
                            <button className="del-btn" onClick={() => removeItem(idx)}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>

                        {/* NGO Project Info Row */}
                        {isNGO && !item.product_id && item.project_id && (
                          <tr>
                            <td colSpan={taxEnabled ? 7 : 6} style={{ padding: '4px 10px 6px' }}>
                              <div className="project-info-row">
                                <span className="project-chip">📁 {getProjectName(item.project_id)}</span>
                                {item.donor_id && (
                                  <span className="project-chip" style={{ color: "var(--primary)" }}>🤝 {getDonorName(item.donor_id)}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card">
              <div className="empty-items">
                <div className="icon-wrap">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                  </svg>
                </div>
                <div className="t1">No items added yet</div>
                <div className="t2">Search for a product above, or add a manual line to start building this invoice.</div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Summary Card */}
          <div className="card summary-card">
            <h3>Summary</h3>
            <div className="sum-row muted">
              <span className="lbl">Subtotal</span>
              <span>PKR {totalAmount.toLocaleString()}</span>
            </div>
            {taxEnabled && totalTaxAmount > 0 && (
              <div className="sum-row muted">
                <span className="lbl">Tax</span>
                <span>PKR {totalTaxAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="sum-row total">
              <span className="lbl">Total</span>
              <span>PKR {(totalAmount + totalTaxAmount).toLocaleString()}</span>
            </div>
            {hasStockErrors && (
              <div className="warn-banner">
                <span>⚠</span> Some items have insufficient stock
              </div>
            )}
          </div>

          {/* Actions Card */}
          <div className="card actions-card">
            <button
              className="btn btn-primary btn-block"
              onClick={handleSubmit}
              disabled={saving || hasStockErrors}
            >
              {saving ? "Posting..." : editId ? "Update invoice" : "Post invoice"}
            </button>
            <button className="btn btn-block" onClick={handleBeforeSavePdf}>
              <Download size={14} /> PDF preview
            </button>
            {selectedCustomer && hasFeature("whatsapp_invoice") && (
              <button className="btn btn-success btn-block" onClick={handleWhatsAppWithPDF}>
                <Send size={14} /> Send on WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit History ── */}
      {editId && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
          <RecordHistory tableName="invoices" recordId={editId} />
        </div>
      )}
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