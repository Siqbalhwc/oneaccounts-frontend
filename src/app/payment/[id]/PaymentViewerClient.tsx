"use client"

import { useEffect, useState } from "react"

export default function PaymentViewerClient({ id }: { id: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/public/payment?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoading(false)
      })
      .catch(() => { setError("Failed to load payment"); setLoading(false) })
  }, [id])

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center", color: "#64748b", fontSize: 14 }}>Loading payment...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>
    </div>
  )

  const { payment, company } = data
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const logoSrc = company.logo
    ? company.logo.startsWith("http")
      ? company.logo
      : `${supabaseUrl}/storage/v1/object/public/logos/${company.logo}`
    : null

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "Inter, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>

        <div style={{ background: "white", borderRadius: 16, padding: "28px 32px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              {logoSrc && <img src={logoSrc} alt="Logo" style={{ height: 48, objectFit: "contain", marginBottom: 10, display: "block" }} />}
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{company.name}</div>
              {company.tagline && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{company.tagline}</div>}
              {company.address && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{company.address}</div>}
              {company.phone && <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>Phone: {company.phone}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#1740c8", marginTop: 4 }}>{payment.payment_no}</div>
            </div>
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 10 }}>Paid To</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{payment.supplier_name}</div>
          {payment.supplier_address && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>{payment.supplier_address}</div>}
          {payment.supplier_phone && <div style={{ fontSize: 12, color: "#64748b" }}>Phone: {payment.supplier_phone}</div>}
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <DetailRow label="Date" value={payment.payment_date} />
          <DetailRow label="Method" value={payment.payment_method} />
          {payment.reference && <DetailRow label="Reference" value={payment.reference} />}
          <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
            <span style={{ fontWeight: 700, color: "#64748b" }}>Amount Paid</span>
            <span style={{ fontWeight: 800, color: "#10b981" }}>PKR {Number(payment.amount || 0).toLocaleString()}</span>
          </div>
        </div>

        {payment.notes && (
          <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{payment.notes}</div>
          </div>
        )}

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
      <span style={{ fontWeight: 600, color: "#0f172a" }}>{value || "-"}</span>
    </div>
  )
}