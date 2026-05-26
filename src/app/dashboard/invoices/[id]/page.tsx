"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"

// ... Interfaces unchanged (InvoiceItem, Invoice, JournalLine)

export default function InvoiceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  const [companySettings, setCompanySettings] = useState<{
    name?: string
    address?: string
    phone?: string
    email?: string
    tagline?: string
    logo_url?: string | null
    business_type?: string
  }>({})

  const [journalLines, setJournalLines] = useState<JournalLine[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !invoiceId) return
    setLoading(true)

    // 1. Load invoice
    supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }

        const inv: Invoice = data

        // 2. Customer
        if (inv.party_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name, code, phone, country_code, address, email")
            .eq("id", inv.party_id)
            .single()
          inv.customer = cust || undefined
        }

        // 3. Items
        const { data: items } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", inv.id)

        if (items && items.length > 0) {
          const productIds = items
            .map((i: any) => i.product_id)
            .filter((id: any) => id != null)

          if (productIds.length > 0) {
            const { data: products } = await supabase
              .from("products")
              .select("id, code, name, image_path")
              .in("id", productIds)

            const productMap: Record<number, any> = {}
            if (products) {
              products.forEach((p: any) => { productMap[p.id] = p })
            }

            inv.items = items.map((item: any) => {
              const prod = productMap[item.product_id]
              return {
                ...item,
                product_code:  prod?.code       || "",
                product_name:  prod?.name       || "",
                product_image: prod?.image_path || null,
              }
            })
          } else {
            inv.items = items.map((item: any) => ({
              ...item,
              product_code:  "",
              product_name:  "",
              product_image: null,
            }))
          }
        } else {
          inv.items = []
        }

        setInvoice(inv)
        setLoading(false)
      })

    // 4. Journal lines
    supabase
      .from("journal_lines")
      .select("account_id, debit, credit, accounts(code, name)")
      .eq("company_id", companyId)
      .eq("source_type", "sale_invoice")
      .eq("source_id", invoiceId)
      .then(({ data: lines }) => {
        if (lines && lines.length > 0) {
          const formatted = lines.map((l: any) => ({
            account_id:   l.account_id,
            account_code: l.accounts?.code || "",
            account_name: l.accounts?.name || "",
            debit:        l.debit  || 0,
            credit:       l.credit || 0,
          }))
          setJournalLines(formatted)
        }
      })

    // 5. Company settings – same as the Company Settings page (NO company_id filter)
    supabase
      .from("company_settings")
      .select("business_name, address, phone, email, tagline, logo_url, business_type")
      .single()
      .then(({ data }) => {
        if (data) {
          setCompanySettings({
            name:          data.business_name || "",
            address:       data.address       || "",
            phone:         data.phone         || "",
            email:         data.email         || "",
            tagline:       data.tagline       || "",
            logo_url:      data.logo_url      || null,
            business_type: data.business_type || "",
          })
        }
      })
  }, [companyId, invoiceId])

  // ... WhatsApp and reminder links (unchanged)

  const handlePrintPDF = async () => {
    if (!invoice) return

    const customer = invoice.customer
    const subTotal = invoice.items?.reduce((s, i) => s + i.total, 0) || 0

    // Logo is already a valid data URL or null — pass directly
    let logoUrl = companySettings.logo_url || null

    const pdfData = {
      companyName:    companySettings.name          || "",
      companyAddress: companySettings.address       || "",
      companyPhone:   companySettings.phone         || "",
      companyEmail:   companySettings.email         || "",
      companyTagline: companySettings.tagline       || "",
      logoUrl,
      businessType:   companySettings.business_type || "",
      invoiceNo:      invoice.invoice_no,
      date:           invoice.date,
      dueDate:        invoice.due_date,
      customerName:    customer?.name    || "Unknown",
      customerAddress: customer?.address || "",
      customerPhone:   customer?.phone   || "",
      customerEmail:   customer?.email   || "",
      status: invoice.status,
      items: (invoice.items || []).map(item => ({
        description:  item.description   || "",
        qty:          item.qty           || 0,
        unit_price:   item.unit_price    || 0,
        total:        item.total         || 0,
        image_path:   item.product_image || null,
        product_id:   item.product_code  || null,
        product_name: item.product_name  || "",
      })),
      subtotal:   subTotal,
      total:      invoice.total,
      paid:       invoice.paid || 0,
      balanceDue: invoice.total - (invoice.paid || 0),
    }

    const doc = await generateInvoicePDF(pdfData)
    doc.save(`Invoice_${invoice.invoice_no}.pdf`)
  }

  // ... loading / not found / render (all unchanged)
}