"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

interface InvoiceItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
  product_id: number | null
  product_code?: string
  product_name?: string
  product_image?: string | null
  tax_code_id?: string | null
  tax_code_snapshot?: string
  tax_name_snapshot?: string
  tax_rate?: number
  tax_amount?: number
}

interface Invoice {
  id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  total_tax: number
  paid: number
  status: string
  reference?: string
  notes?: string
  party_id: number
  created_by?: string
  items?: InvoiceItem[]
  customer?: {
    name: string
    code: string
    phone?: string
    country_code?: string
    address?: string
    email?: string
    payment_terms?: string
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

  const { hasFeature } = usePlan()
  const taxEnabled = hasFeature("tax_management")
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

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

    // 1. Load invoice (now includes total_tax)
    supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }

        const inv: Invoice = data

        // 2. Load customer
        if (inv.party_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name, code, phone, country_code, address, email, payment_terms")
            .eq("id", inv.party_id)
            .single()
          inv.customer = cust || undefined
        }

        // 3. Load items (now includes tax columns)
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

    // 4. Load journal lines
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
  }, [companyId, invoiceId])

  // WhatsApp message
  const waLink = invoice && invoice.customer
    ? getWhatsAppLink(
        invoice.customer.phone || "",
        [
          `Dear ${invoice.customer.name},`,
          ``,
          `Your invoice ${invoice.invoice_no} of PKR ${invoice.total?.toLocaleString()} has been generated.`,
          ``,
          `📄 View Online: https://www.oneaccountsbysiqbal.com/invoice/${invoice.id}`,
          `📅 Date: ${invoice.date}`,
          `📆 Due: ${invoice.due_date}`,
          ``,
          `Thank you for your business.`,
          `— OneAccounts by Siqbal`,
        ].join("\n")
      )
    : ""

  const reminderLink = invoice && invoice.customer
    ? getWhatsAppLink(
        invoice.customer.phone || "",
        [
          `Dear ${invoice.customer.name},`,
          ``,
          `Friendly reminder: Your invoice ${invoice.invoice_no} for PKR ${invoice.total?.toLocaleString()} is overdue.`,
          ``,
          `📄 View & Pay: https://www.oneaccountsbysiqbal.com/invoice/${invoice.id}`,
          ``,
          `Thank you.`,
          `— OneAccounts by Siqbal`,
        ].join("\n")
      )
    : ""

  const handlePrintPDF = async () => {
    if (!invoice) return

    const customer = invoice.customer
    const subTotal = invoice.items?.reduce((s, i) => s + i.total, 0) || 0

    const pdfData = {
      companyName:    companyName || "",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      businessType:   "",
      invoiceNo:      invoice.invoice_no,
      date:           invoice.date,
      dueDate:        invoice.due_date,
      customerName:    customer?.name    || "Unknown",
      customerAddress: customer?.address || "",
      customerPhone:   customer?.phone   || "",
      customerEmail:   customer?.email   || "",
      paymentTerms:    customer?.payment_terms || null,
      createdBy:       invoice.created_by || "—",
      status:          invoice.status,
      items: (invoice.items || []).map(item => ({
        description:  item.description   || "",
        qty:          item.qty           || 0,
        unit_price:   item.unit_price    || 0,
        total:        item.total         || 0,
        image_path:   item.product_image || null,
        product_id:   item.product_code  || null,
        product_name: item.product_name  || "",
        tax_rate:     item.tax_rate      || 0,
        tax_amount:   item.tax_amount    || 0,
      })),
      subtotal:   subTotal,
      total:      invoice.total,
      totalTax:   invoice.total_tax || 0,
      paid:       invoice.paid || 0,
      balanceDue: invoice.total - (invoice.paid || 0),
    }

    const doc = await generateInvoicePDF(pdfData)
    doc.save(`Invoice_${invoice.invoice_no}.pdf`)
  }

  if (loading)   return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  if (!invoice)  return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Invoice not found</div>

  const balanceDue    = invoice.total - (invoice.paid || 0)
  const isOverdue     = invoice.status !== "Paid" && new Date(invoice.due_date) < new Date()
  const isReturned    = invoice.status === "Returned"

  const totalDebit  = journalLines.reduce((s, l) => s + l.debit,  0)
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 130px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-success { background: #25D366; color: white; border-color: #25D366; }
        .btn-success:hover { background: #22C55E; }
        .btn-warning { background: #F97316; color: white; border-color: #F97316; }
        .btn-warning:hover { background: #EA580C; }
        .btn:disabled, .btn[disabled] { opacity: 0.5; pointer-events: none; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
        .badge-paid    { background: #065F46; color: #6EE7B7; }
        .badge-unpaid  { background: #7C2D12; color: #FCA5A5; }
        .badge-overdue { background: #7C2D12; color: #FCA5A5; }
        .badge-returned { background: #1D4ED8; color: #DBEAFE; }
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/invoices")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Invoice #{invoice.invoice_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{invoice.customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isReturned && (
            <button className="btn" onClick={() => router.push(`/dashboard/invoices/new?id=${invoice.id}`)}>
              ✏️ Edit
            </button>
          )}
          {!isReturned && (
            <button className="btn" onClick={() => router.push(`/dashboard/sales-returns/new?original_invoice_id=${invoice.id}`)}>
              ↩️ Return
            </button>
          )}
          {isReturned && (
            <span className="badge badge-returned">↩️ Returned</span>
          )}
          {waLink && hasFeature("whatsapp_invoice") && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success">
              <Send size={14} /> WhatsApp
            </a>
          )}
          {reminderLink && hasFeature("payment_reminders") && isOverdue && !isReturned && (
            <a href={reminderLink} target="_blank" rel="noopener noreferrer" className="btn btn-warning">
              <Send size={14} /> Remind
            </a>
          )}
          <button className="btn btn-primary" onClick={handlePrintPDF}>
            <Printer size={14} /> Print PDF
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Invoice Details</h3>
        <div className="row"><span className="label">Date</span><span className="value">{invoice.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{invoice.due_date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{invoice.customer?.code} – {invoice.customer?.name}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {invoice.total?.toLocaleString()}</span></div>
        {taxEnabled && invoice.total_tax > 0 && (
          <div className="row"><span className="label">Tax</span><span className="value">PKR {invoice.total_tax?.toLocaleString()}</span></div>
        )}
        <div className="row"><span className="label">Paid</span><span className="value">PKR {invoice.paid?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Due</span><span className="value" style={{ color: balanceDue > 0 ? "#EF4444" : "#10B981", fontWeight: 600 }}>PKR {balanceDue.toLocaleString()}</span></div>
        <div className="row">
          <span className="label">Status</span>
          <span className={`badge ${
            invoice.status === "Paid" ? "badge-paid" :
            invoice.status === "Returned" ? "badge-returned" :
            invoice.status === "Overdue" ? "badge-overdue" : "badge-unpaid"
          }`}>{invoice.status}</span>
        </div>
        {invoice.reference && <div className="row"><span className="label">Reference</span><span className="value">{invoice.reference}</span></div>}
        {invoice.notes     && <div className="row"><span className="label">Notes</span><span className="value">{invoice.notes}</span></div>}
      </div>

      {invoice.items && invoice.items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Items</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Description</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit Price</th>
                {taxEnabled && <th style={{ textAlign: "right" }}>Tax Rate</th>}
                <th style={{ textAlign: "right" }}>Total</th>
                {taxEnabled && <th style={{ textAlign: "right" }}>Tax</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map(item => (
                <tr key={item.id}>
                  <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {item.product_image ? (
                      <img src={item.product_image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, background: "var(--card-hover)", borderRadius: 4 }} />
                    )}
                    <span style={{ fontWeight: 600 }}>{item.product_code ? `${item.product_code} – ${item.product_name || ""}` : item.description}</span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{item.product_code ? item.description : ""}</td>
                  <td style={{ textAlign: "center" }}>{item.qty}</td>
                  <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                                    {taxEnabled && (
                    <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                      {(item.tax_rate ?? 0) > 0 ? `${item.tax_rate}%` : "—"}
                    </td>
                  )}
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                  {taxEnabled && (
                    <td style={{ textAlign: "right", color: (item.tax_amount ?? 0) > 0 ? "#EF4444" : "var(--text-muted)" }}>
                      {(item.tax_amount ?? 0) > 0 ? `PKR ${(item.tax_amount ?? 0).toLocaleString()}` : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {taxEnabled && invoice.total_tax > 0 && (
              <tfoot>
                <tr style={{ background: "var(--card-hover)", fontWeight: 700 }}>
                  <td colSpan={taxEnabled ? 6 : 4} style={{ textAlign: "right" }}>Total Tax</td>
                  <td style={{ textAlign: "right", color: "#EF4444" }}>PKR {invoice.total_tax.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {journalLines.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📒 Journal Entry</h3>
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
                  <td style={{ textAlign: "right", color: line.debit  > 0 ? "#F87171" : "var(--text-muted)" }}>
                    {line.debit  > 0 ? line.debit.toLocaleString()  : "–"}
                  </td>
                  <td style={{ textAlign: "right", color: line.credit > 0 ? "#2DD4BF" : "var(--text-muted)" }}>
                    {line.credit > 0 ? line.credit.toLocaleString() : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--card-hover)", fontWeight: 700 }}>
                <td>Total</td>
                <td style={{ textAlign: "right", color: "#F87171" }}>{totalDebit.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: "#2DD4BF" }}>{totalCredit.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {invoice && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <div className="record-history">
            <RecordHistory tableName="invoices" recordId={String(invoice.id)} />
          </div>
        </div>
      )}
    </div>
  )
}