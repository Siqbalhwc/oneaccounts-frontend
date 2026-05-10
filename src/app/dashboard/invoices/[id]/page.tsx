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
}

interface Invoice {
  id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  status: string
  reference?: string
  notes?: string
  party_id: number
  items?: InvoiceItem[]
  customer?: {
    name: string
    code: string
    phone?: string
    country_code?: string
    address?: string
    email?: string
  }
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
    name?: string
    address?: string
    phone?: string
    email?: string
    logo_url?: string
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
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (!data) { setLoading(false); return }
        const inv: Invoice = data

        if (inv.party_id) {
          supabase
            .from("customers")
            .select("name, code, phone, country_code, address, email")
            .eq("id", inv.party_id)
            .single()
            .then(({ data: cust }) => {
              inv.customer = cust || undefined
            })
            .finally(() => {
              supabase
                .from("invoice_items")
                .select("*")
                .eq("invoice_id", inv.id)
                .eq("company_id", companyId)
                .then(({ data: items }) => {
                  inv.items = items || []
                  setInvoice(inv)
                  setLoading(false)
                })
            })
        } else {
          inv.items = []
          setInvoice(inv)
          setLoading(false)
        }
      })

    supabase
      .from("company_settings")
      .select("company_name, address, phone, email, logo_url")
      .limit(1)
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

  const getWhatsAppLink = () => {
    if (!invoice || !invoice.customer) return ""
    const code = (invoice.customer.country_code || "+92").replace(/\D/g, "")
    const phone = (invoice.customer.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${invoice.customer.name},\n\nYour invoice ${invoice.invoice_no} for PKR ${invoice.total?.toLocaleString()} is ready.\nDate: ${invoice.date}\nDue: ${invoice.due_date}\n\nThank you for your business.\n— OneAccounts`
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  const getReminderLink = () => {
    if (!invoice || invoice.status !== "Overdue" || !invoice.customer) return ""
    const code = (invoice.customer.country_code || "+92").replace(/\D/g, "")
    const phone = (invoice.customer.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${invoice.customer.name},\n\nThis is a friendly reminder that your invoice ${invoice.invoice_no} for PKR ${invoice.total?.toLocaleString()} is overdue since ${invoice.due_date}. Please arrange payment at your earliest convenience.\n\nThank you.\n— OneAccounts`
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  const handlePrintPDF = () => {
    if (!invoice) return
    const customer = invoice.customer
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
  const remindLink = getReminderLink()

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .card {
          background: white; border-radius: 14px; border: 1px solid #d6e0eb;
          padding: 24px; margin-bottom: 16px;
          box-shadow: 0 2px 8px rgba(0,25,45,0.04);
        }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; }
        .label { width: 130px; color: #2c5778; font-weight: 600; }
        .value { color: #0a2940; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px 12px; background: #f8fafc; font-weight: 700; color: #2c5778; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #d6e0eb; }
        td { padding: 10px 12px; border-bottom: 1px solid #f0f3f7; font-size: 13px; }
        .btn { padding: 8px 18px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; }
        .btn-outline { background: white; border: 1.5px solid #d6e0eb; color: #2c5778; }
        .btn-primary { background: #1e3a8a; color: white; }
        .btn-success { background: #25D366; color: white; }
        .btn-warning { background: #F59E0B; color: white; }
        .badge {
          display: inline-block; padding: 3px 12px; border-radius: 20px;
          font-size: 11px; font-weight: 600; text-transform: uppercase;
        }
        .badge-paid { background: #dcfce7; color: #166534; }
        .badge-unpaid { background: #fef3c7; color: #92400e; }
        .badge-overdue { background: #fee2e2; color: #991b1b; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/invoices")}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0a2940", margin: 0 }}>Invoice #{invoice.invoice_no}</h1>
            <p style={{ color: "#2c5778", fontSize: 13, margin: 0 }}>{invoice.customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {remindLink && (
            <a href={remindLink} target="_blank" rel="noopener noreferrer" className="btn btn-warning">
              <Send size={16} /> Remind
            </a>
          )}
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

      <div className="card">
        <div className="row"><span className="label">Date</span><span className="value">{invoice.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{invoice.due_date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{invoice.customer?.code} – {invoice.customer?.name}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700 }}>PKR {invoice.total?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Paid</span><span className="value">PKR {invoice.paid?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Due</span><span className="value" style={{ color: balanceDue > 0 ? "#dc2626" : "#166534" }}>PKR {balanceDue.toLocaleString()}</span></div>
        <div className="row">
          <span className="label">Status</span>
          <span className={`badge ${
            invoice.status === "Paid" ? "badge-paid" :
            invoice.status === "Overdue" ? "badge-overdue" : "badge-unpaid"
          }`}>{invoice.status}</span>
        </div>
      </div>

      {invoice.items && invoice.items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "#0a2940", marginBottom: 12 }}>Items</h3>
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
                  <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}