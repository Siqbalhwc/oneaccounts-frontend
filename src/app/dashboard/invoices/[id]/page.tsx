"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"

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

interface JournalLine {
  account_id: number
  account_code?: string
  account_name?: string
  debit: number
  credit: number
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
      .then(({ data }) => {
        if (!data) { setLoading(false); return }

        const inv: Invoice = data

        // 2. Load customer
        if (inv.party_id) {
          supabase
            .from("customers")
            .select("name, code, phone, country_code, address, email")
            .eq("id", inv.party_id)
            .single()
            .then(({ data: cust }) => {
              inv.customer = cust || undefined
              // 3. Load items after customer is set
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
          // No customer? Still load items
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
        }
      })

    // 4. Load journal lines for this invoice
    // We look for a journal entry with description matching the invoice
    supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .ilike("description", `%Sales Invoice%${invoiceId}%`)
      .maybeSingle()
      .then(({ data: entry }) => {
        if (entry) {
          supabase
            .from("journal_lines")
            .select("account_id, debit, credit, accounts(code, name)")
            .eq("entry_id", entry.id)
            .then(({ data: lines }) => {
              if (lines) {
                const formatted = lines.map((l: any) => ({
                  account_id: l.account_id,
                  account_code: l.accounts?.code || "",
                  account_name: l.accounts?.name || "",
                  debit: l.debit || 0,
                  credit: l.credit || 0,
                }))
                setJournalLines(formatted)
              }
            })
        }
      })

    // Company settings (for PDF)
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

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "#0B1120", minHeight: "100vh", color: "#94A3B8" }}>Loading…</div>
  if (!invoice) return <div style={{ padding: 24, textAlign: "center", background: "#0B1120", minHeight: "100vh", color: "#94A3B8" }}>Invoice not found</div>

  const balanceDue = invoice.total - (invoice.paid || 0)
  const waLink = getWhatsAppLink()
  const remindLink = getReminderLink()

  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 130px; color: #94A3B8; font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: #E2E8F0; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: #1E293B; font-weight: 700; color: #94A3B8; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #334155; }
        td { padding: 10px 12px; border-bottom: 1px solid #1E293B; font-size: 13px; color: #E2E8F0; }
        tr:hover td { background: rgba(30,41,59,0.5); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid #334155; background: transparent; color: #CBD5E1; font-family: inherit; text-decoration: none; }
        .btn:hover { background: #1E293B; }
        .btn-primary { background: #1E3A8A; color: white; border-color: #1E3A8A; }
        .btn-primary:hover { background: #1E40AF; }
        .btn-success { background: #25D366; color: white; border-color: #25D366; }
        .btn-success:hover { background: #22C55E; }
        .btn-warning { background: #F59E0B; color: white; border-color: #F59E0B; }
        .btn-warning:hover { background: #D97706; }
        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
        }
        .badge-paid { background: #065F46; color: #6EE7B7; }
        .badge-unpaid { background: #7C2D12; color: #FCA5A5; }
        .badge-overdue { background: #7C2D12; color: #FCA5A5; }

        /* Force dark theme inside RecordHistory */
        .card .record-history,
        .card .record-history * {
          background: #0F172A !important;
          color: #E2E8F0 !important;
          border-color: #1E293B !important;
        }
        .card .record-history th {
          background: #1E293B !important;
          color: #94A3B8 !important;
        }
        .card .record-history td {
          background: #0F172A !important;
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/invoices")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>Invoice #{invoice.invoice_no}</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>{invoice.customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => router.push(`/dashboard/invoices/new?id=${invoice.id}`)}>
            ✏️ Edit
          </button>
          {remindLink && (
            <a href={remindLink} target="_blank" rel="noopener noreferrer" className="btn btn-warning">
              <Send size={14} /> Remind
            </a>
          )}
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success">
              <Send size={14} /> WhatsApp
            </a>
          )}
          <button className="btn btn-primary" onClick={handlePrintPDF}>
            <Printer size={14} /> Print PDF
          </button>
        </div>
      </div>

      {/* Details card */}
      <div className="card">
        <div className="row"><span className="label">Date</span><span className="value">{invoice.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{invoice.due_date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{invoice.customer?.code} – {invoice.customer?.name}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {invoice.total?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Paid</span><span className="value">PKR {invoice.paid?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Due</span><span className="value" style={{ color: balanceDue > 0 ? "#EF4444" : "#10B981", fontWeight: 600 }}>PKR {balanceDue.toLocaleString()}</span></div>
        <div className="row">
          <span className="label">Status</span>
          <span className={`badge ${
            invoice.status === "Paid" ? "badge-paid" :
            invoice.status === "Overdue" ? "badge-overdue" : "badge-unpaid"
          }`}>{invoice.status}</span>
        </div>
      </div>

      {/* Items table */}
      {invoice.items && invoice.items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Items</h3>
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
                  <td style={{ textAlign: "right", fontWeight: 600, color: "#E2E8F0" }}>PKR {item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Journal Entry (Head Dr / Head Cr) */}
      {journalLines.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>📒 Journal Entry</h3>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th style={{ textAlign: "right" }}>Debit (PKR)</th>
                <th style={{ textAlign: "right" }}>Credit (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {journalLines.map((line, idx) => (
                <tr key={idx}>
                  <td>{line.account_code} – {line.account_name}</td>
                  <td style={{ textAlign: "right", color: line.debit > 0 ? "#F87171" : "#475569" }}>
                    {line.debit > 0 ? line.debit.toLocaleString() : "–"}
                  </td>
                  <td style={{ textAlign: "right", color: line.credit > 0 ? "#2DD4BF" : "#475569" }}>
                    {line.credit > 0 ? line.credit.toLocaleString() : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#1E293B", fontWeight: 700 }}>
                <td>Total</td>
                <td style={{ textAlign: "right", color: "#F87171" }}>{totalDebit.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: "#2DD4BF" }}>{totalCredit.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Change History */}
      {invoice && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <div className="record-history" style={{ background: "#0F172A", borderRadius: 8, padding: 8 }}>
            <RecordHistory tableName="invoices" recordId={String(invoice.id)} />
          </div>
        </div>
      )}
    </div>
  )
}