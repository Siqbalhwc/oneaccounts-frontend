"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Printer, Download } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"

export default function PublicInvoicePage() {
  const params = useParams()
  const raw = params?.invoice_no as string[]
const invoiceNo = raw?.join("/") || ""

  const [invoice, setInvoice] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [company, setCompany] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!invoiceNo) return
    fetch(`https://www.oneaccountsbysiqbal.com/api/public/invoice?invoice_no=${encodeURIComponent(invoiceNo)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setInvoice(data.invoice)
          setItems(data.items || [])
          setCompany(data.company || {})
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Failed to load invoice")
        setLoading(false)
      })
  }, [invoiceNo])

  const handlePrintPDF = async () => {
    if (!invoice) return
    const pdfData = {
      companyName: company.name || "OneAccounts",
      companyAddress: company.address || "",
      companyPhone: company.phone || "",
      companyEmail: company.email || "",
      companyTagline: company.tagline || "",
      logoUrl: company.logo || null,
      invoiceNo: invoice.invoice_no,
      date: invoice.date,
      dueDate: invoice.due_date,
      customerName: invoice.customer_name || "Customer",
      customerAddress: invoice.customer_address || "",
      customerPhone: invoice.customer_phone || "",
      customerEmail: invoice.customer_email || "",
      items: items.map((i: any) => ({
        description: i.product_name ? `${i.product_code} – ${i.product_name}` : i.description,
        qty: i.qty,
        unit_price: i.unit_price,
        total: i.total,
      })),
      subtotal: invoice.total,
      total: invoice.total,
      status: invoice.status,
      paid: invoice.paid || 0,
      balanceDue: invoice.total - (invoice.paid || 0),
    }
    const doc = await generateInvoicePDF(pdfData)
    doc.save(`Invoice_${invoice.invoice_no}.pdf`)
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "'Inter', sans-serif", background: "#f5f7fb" }}>
        <p style={{ color: "#64748b" }}>Loading invoice…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "'Inter', sans-serif", background: "#f5f7fb" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: "#1e293b", marginBottom: 8 }}>Invoice Not Found</h2>
          <p style={{ color: "#64748b" }}>{error}</p>
        </div>
      </div>
    )
  }

  const balanceDue = invoice.total - (invoice.paid || 0)

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px", fontFamily: "'Inter', sans-serif", background: "#f5f7fb", minHeight: "100vh" }}>
      <style>{`
        .inv-card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .inv-header img { width: 48px; height: 48px; border-radius: 8px; object-fit: contain; }
        .inv-header h1 { font-size: 20px; font-weight: 800; color: #1e293b; }
        .inv-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
        .inv-label { color: #64748b; }
        .inv-value { font-weight: 600; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: #f8fafc; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
        td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
        .btn { padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0; background: white; color: #334155; font-family: inherit; }
        .btn:hover { background: #f1f5f9; }
        .btn-primary { background: #1e3a8a; color: white; border-color: #1e3a8a; }
        .btn-primary:hover { background: #1e40af; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; }
        .badge-paid { background: #dcfce7; color: #166534; }
        .badge-unpaid { background: #fee2e2; color: #991b1b; }
        @media (max-width: 640px) {
          .inv-header { flex-direction: column; gap: 12px; }
        }
      `}</style>

      <div className="inv-card">
        <div className="inv-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {company.logo && <img src={company.logo} alt="Logo" />}
            <div>
              <h1 style={{ margin: 0 }}>{company.name || "OneAccounts"}</h1>
              {company.tagline && <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{company.tagline}</p>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#1e293b", margin: 0 }}>Invoice</h2>
            <p style={{ fontSize: 14, color: "#1e3a8a", fontWeight: 600, margin: "4px 0" }}>{invoice.invoice_no}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Bill To</p>
            <p style={{ fontWeight: 600 }}>{invoice.customer_name}</p>
            {invoice.customer_address && <p style={{ color: "#64748b", fontSize: 13 }}>{invoice.customer_address}</p>}
            {invoice.customer_phone && <p style={{ color: "#64748b", fontSize: 13 }}>{invoice.customer_phone}</p>}
            {invoice.customer_email && <p style={{ color: "#64748b", fontSize: 13 }}>{invoice.customer_email}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="inv-row"><span className="inv-label">Date:</span><span className="inv-value">{invoice.date}</span></div>
            <div className="inv-row"><span className="inv-label">Due Date:</span><span className="inv-value">{invoice.due_date}</span></div>
            <div className="inv-row">
              <span className="inv-label">Status:</span>
              <span className={`badge ${invoice.status === "Paid" ? "badge-paid" : "badge-unpaid"}`}>{invoice.status}</span>
            </div>
          </div>
        </div>

        {items.length > 0 && (
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
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.product_name ? `${item.product_code || ""} – ${item.product_name}` : item.description}</td>
                  <td style={{ textAlign: "center" }}>{item.qty}</td>
                  <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ borderTop: "2px solid #e2e8f0", marginTop: 16, paddingTop: 16, textAlign: "right" }}>
          <div className="inv-row"><span className="inv-label">Subtotal:</span><span className="inv-value">PKR {invoice.total?.toLocaleString()}</span></div>
          <div className="inv-row"><span className="inv-label">Paid:</span><span className="inv-value">PKR {(invoice.paid || 0).toLocaleString()}</span></div>
          <div className="inv-row" style={{ fontSize: 16, fontWeight: 800, color: balanceDue > 0 ? "#ef4444" : "#10b981" }}>
            <span className="inv-label">Balance Due:</span>
            <span className="inv-value" style={{ fontSize: 16 }}>PKR {balanceDue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handlePrintPDF}>
          <Printer size={16} /> Print / Download PDF
        </button>
      </div>
    </div>
  )
}