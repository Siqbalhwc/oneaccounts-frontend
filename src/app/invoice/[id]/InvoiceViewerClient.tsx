"use client"

import { useEffect, useState } from "react"

export default function InvoiceViewerClient({ id }: { id: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/public/invoice?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoading(false)
      })
      .catch(() => { setError("Failed to load invoice"); setLoading(false) })
  }, [id])

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 14 }}>Loading invoice...</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center", color: "#ef4444" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
        <div style={{ fontSize: 14 }}>{error}</div>
      </div>
    </div>
  )

  const { invoice, items, company } = data
  const balanceDue = (invoice.total || 0) - (invoice.paid || 0)
  const statusColor = invoice.status === "Paid" ? "#10b981" : invoice.status === "Partial" ? "#f59e0b" : "#ef4444"

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const logoSrc = company.logo
    ? company.logo.startsWith("http")
      ? company.logo
      : `${supabaseUrl}/storage/v1/object/public/logos/${company.logo}`
    : null

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "Inter, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Company Header */}
        <div style={{ background: "white", borderRadius: 16, padding: "28px 32px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              {logoSrc && (
                <img src={logoSrc} alt="Logo" style={{ height: 48, objectFit: "contain", marginBottom: 10, display: "block" }} />
              )}
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{company.name}</div>
              {company.tagline && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{company.tagline}</div>}
              {company.address && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{company.address}</div>}
              {company.phone && <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>📞 {company.phone}</div>}
              {company.email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>✉️ {company.email}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sales Invoice</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#1740c8", marginTop: 4 }}>{invoice.invoice_no}</div>
              <div style={{
                display: "inline-block", marginTop: 10,
                padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: statusColor + "18", color: statusColor, border: `1px solid ${statusColor}40`
              }}>
                {invoice.status}
              </div>
            </div>
          </div>
        </div>

        {/* Bill To + Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 10 }}>Bill To</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{invoice.customer_name}</div>
            {invoice.customer_address && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>{invoice.customer_address}</div>}
            {invoice.customer_phone && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>📞 {invoice.customer_phone}</div>}
            {invoice.customer_email && <div style={{ fontSize: 12, color: "#64748b" }}>✉️ {invoice.customer_email}</div>}
          </div>
          <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 10 }}>Invoice Details</div>
            <DetailRow label="Invoice Date" value={invoice.date} />
            <DetailRow label="Due Date" value={invoice.due_date} />
            {invoice.reference && <DetailRow label="Reference" value={invoice.reference} />}
          </div>
        </div>

        {/* Items */}
        <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 14 }}>Items</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                  <th style={{ textAlign: "left", padding: "6px 4px 10px", color: "#64748b", fontWeight: 600, fontSize: 11 }}>Description</th>
                  <th style={{ textAlign: "center", padding: "6px 4px 10px", color: "#64748b", fontWeight: 600, fontSize: 11, width: 55 }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "6px 4px 10px", color: "#64748b", fontWeight: 600, fontSize: 11, width: 110 }}>Unit Price</th>
                  <th style={{ textAlign: "right", padding: "6px 4px 10px", color: "#64748b", fontWeight: 600, fontSize: 11, width: 110 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(items || []).map((item: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "10px 4px", color: "#0f172a", lineHeight: 1.4 }}>
                      {item.description || item.product_name || "—"}
                    </td>
                    <td style={{ padding: "10px 4px", textAlign: "center", color: "#475569" }}>{item.qty}</td>
                    <td style={{ padding: "10px 4px", textAlign: "right", color: "#475569" }}>
                      PKR {Number(item.unit_price).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                      PKR {Number(item.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div style={{ marginTop: 16, borderTop: "2px solid #f1f5f9", paddingTop: 14 }}>
            <TotalRow label="Subtotal" value={invoice.total} />
            {(invoice.paid || 0) > 0 && (
              <TotalRow label="Amount Paid" value={invoice.paid} color="#10b981" />
            )}
            <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
            <TotalRow label="Balance Due" value={balanceDue} bold color={balanceDue > 0 ? "#ef4444" : "#10b981"} />
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{invoice.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", paddingBottom: 32, marginTop: 4 }}>
          Powered by <strong style={{ color: "#64748b" }}>OneAccounts by Siqbal</strong>
        </div>

      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#0f172a" }}>{value || "—"}</span>
    </div>
  )
}

function TotalRow({ label, value, bold, color }: {
  label: string; value: number; bold?: boolean; color?: string
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: bold ? 15 : 13 }}>
      <span style={{ color: "#64748b", fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || "#0f172a" }}>
        PKR {Number(value || 0).toLocaleString()}
      </span>
    </div>
  )
}