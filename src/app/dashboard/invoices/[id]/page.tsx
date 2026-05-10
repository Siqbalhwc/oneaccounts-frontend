"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"

interface InvoiceItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
  image_path?: string | null
}

interface Invoice {
  id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  status: string
  party_id: number
  reference?: string
  notes?: string
  customers?: { name: string; code: string; address?: string; phone?: string; email?: string; country_code?: string }
  items?: InvoiceItem[]
  journal_entries?: { id: number; entry_no: string; date: string }[]
}

export default function InvoiceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  const [companySettings, setCompanySettings] = useState<{
    name?: string; address?: string; phone?: string; email?: string; logo_url?: string
  }>({})

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
    supabase
      .from("invoices")
      .select("*, customers(name, code, address, phone, email, country_code)")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (data) {
          const inv: Invoice = data
          supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", inv.id)
            .eq("company_id", companyId)
            .then(({ data: items }) => {
              inv.items = items || []
              supabase
                .from("journal_entries")
                .select("id, entry_no, date")
                .eq("company_id", companyId)
                .like("description", `%${inv.invoice_no}%`)
                .order("date", { ascending: false })
                .then(({ data: entries }) => {
                  inv.journal_entries = entries || []
                  setInvoice(inv)
                  setLoading(false)
                })
            })
        } else {
          setLoading(false)
        }
      })

    supabase
      .from("company_settings")
      .select("logo_url, company_name, address, phone, email")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCompanySettings({
            name: data.company_name || "OneAccounts",
            address: data.address || "",
            phone: data.phone || "",
            email: data.email || "",
            logo_url: data.logo_url || null,
          })
        }
      })
  }, [companyId, invoiceId])

  // ── WhatsApp link generator ──
  const getWhatsAppLink = () => {
    if (!invoice || !invoice.customers) return ""
    const countryCode = (invoice.customers.country_code || "+92").replace(/\D/g, "")
    const phone = (invoice.customers.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const fullPhone = countryCode + phone
    const msg = `Dear ${invoice.customers.name},\n\nYour invoice ${invoice.invoice_no} for PKR ${invoice.total?.toLocaleString()} is ready.\nDate: ${invoice.date}\nDue: ${invoice.due_date}\n\nThank you for your business.\n— OneAccounts`
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`
  }

  // ── PDF generation ──
  const handlePrintPDF = () => {
    if (!invoice) return
    const customer = invoice.customers
    const subTotal = invoice.items?.reduce((s, i) => s + i.total, 0) || 0

    const pdfData = {
      companyName: companySettings.name || "OneAccounts",
      companyAddress: companySettings.address,
      companyPhone: companySettings.phone,
      companyEmail: companySettings.email,
      logoUrl: companySettings.logo_url,
      invoiceNo: invoice.invoice_no,
      date: invoice.date,
      dueDate: invoice.due_date,
      reference: invoice.reference,
      notes: invoice.notes,
      customerName: customer?.name || "Unknown",
      customerAddress: customer?.address,
      customerPhone: customer?.phone,
      customerEmail: customer?.email,
      items: (invoice.items || []).map(item => ({
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        total: item.total,
        image_path: item.image_path || null,
      })),
      subtotal: subTotal,
      total: invoice.total,
      paid: invoice.paid || 0,
      balanceDue: invoice.total - (invoice.paid || 0),
      status: invoice.status,
    }

    const doc = generateInvoicePDF(pdfData)
    doc.save(`Invoice_${invoice.invoice_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>
  if (!invoice) return <div style={{ padding: 24, textAlign: "center" }}>Invoice not found</div>

  const balanceDue = invoice.total - (invoice.paid || 0)
  const waLink = getWhatsAppLink()

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 20px; margin-bottom: 16px; }
        .row { display: flex; margin-bottom: 8px; font-size: 13px; }
        .label { width: 120px; color: #64748B; font-weight: 600; }
        .value { color: #1E293B; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 8px 12px; border-bottom: 1px solid #E2E8F0; background: #F8FAFC; font-weight: 600; color: #475569; }
        td { padding: 8px 12px; border-bottom: 1px solid #F1F5F9; }
        .total-row { font-weight: 700; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-success { background: #25D366; color: white; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/invoices")}>
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Invoice #{invoice.invoice_no}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success">
              <Send size={16} /> WhatsApp
            </a>
          )}
          <button className="btn btn-primary" onClick={handlePrintPDF}>
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="card">
        <div className="row"><span className="label">Date</span><span className="value">{invoice.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{invoice.due_date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{invoice.customers?.code} – {invoice.customers?.name}</span></div>
        <div className="row"><span className="label">Total</span><span className="value">PKR {invoice.total?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Paid</span><span className="value">PKR {invoice.paid?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Due</span><span className="value">PKR {balanceDue.toLocaleString()}</span></div>
        <div className="row"><span className="label">Status</span><span className="value">{invoice.status}</span></div>
      </div>

      {/* Items */}
      {invoice.items && invoice.items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700 }}>Items</h3>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map(item => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td style={{ textAlign: "center" }}>{item.qty}</td>
                  <td style={{ textAlign: "right" }}>{item.unit_price?.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Journal entries */}
      {invoice.journal_entries && invoice.journal_entries.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700 }}>Related Journal Entries</h3>
          <table>
            <thead>
              <tr>
                <th>Entry No</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {invoice.journal_entries.map(entry => (
                <tr key={entry.id}>
                  <td>{entry.entry_no}</td>
                  <td>{entry.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}