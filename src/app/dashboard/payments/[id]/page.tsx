"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"

interface Payment {
  id: number
  payment_no: string
  date: string
  amount: number
  payment_method: string
  reference?: string
  notes?: string
  party_id: number
  supplier?: {
    name: string
    code: string
    phone?: string
    email?: string
  }
  allocations?: {
    invoice_id: number
    invoice_no: string
    amount: number
  }[]
}

export default function PaymentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const paymentId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  // Company settings for PDF
  const [companySettings, setCompanySettings] = useState<any>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !paymentId) return
    setLoading(true)

    supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (!data) { setLoading(false); return }

        const pmt: Payment = data

        // Fetch supplier
        if (pmt.party_id) {
          supabase
            .from("suppliers")
            .select("name, code, phone, email")
            .eq("id", pmt.party_id)
            .single()
            .then(({ data: supp }) => {
              pmt.supplier = supp || undefined
            })
            .then(() => {
              // Fetch allocations
              supabase
                .from("payment_allocations")
                .select("amount, invoice_id, invoices(invoice_no)")
                .eq("payment_id", pmt.id)
                .then(({ data: allocs }) => {
                  pmt.allocations = (allocs || []).map((a: any) => ({
                    invoice_id: a.invoice_id,
                    invoice_no: a.invoices?.invoice_no || "—",
                    amount: a.amount,
                  }))
                  setPayment(pmt)
                  setLoading(false)
                })
            })
        } else {
          setPayment(pmt)
          setLoading(false)
        }
      })

    // Fetch company settings for PDF
    supabase
      .from("company_settings")
      .select("company_name, address, phone, email, tagline, logo_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCompanySettings(data)
      })
  }, [companyId, paymentId])

  const getWhatsAppLink = () => {
    if (!payment || !payment.supplier) return ""
    const phone = (payment.supplier.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${payment.supplier.name},\n\nYour payment ${payment.payment_no} for PKR ${payment.amount?.toLocaleString()} has been processed.\nDate: ${payment.date}\nMethod: ${payment.payment_method}\n${payment.notes ? "Notes: " + payment.notes : ""}\n\nThank you.\n— OneAccounts`
    return `https://wa.me/92${phone}?text=${encodeURIComponent(msg)}`
  }

  const handlePrintPDF = async () => {
    if (!payment) return
    const supplier = payment.supplier

    const pdfData = {
      companyName:    companySettings.company_name || "OneAccounts",
      companyAddress: companySettings.address || "",
      companyPhone:   companySettings.phone || "",
      companyEmail:   companySettings.email || "",
      companyTagline: companySettings.tagline || "",
      logoUrl:        companySettings.logo_url || null,
      invoiceNo:      payment.payment_no,
      date:           payment.date,
      dueDate:        "",
      customerName:    supplier?.name || "Supplier",
      customerAddress: "",
      customerPhone:   supplier?.phone || "",
      customerEmail:   supplier?.email || "",
      items:          (payment.allocations || []).map(a => ({
        description: `Bill: ${a.invoice_no}`,
        qty:          1,
        unit_price:   a.amount,
        total:        a.amount,
      })),
      subtotal:   payment.amount,
      total:      payment.amount,
      paid:       payment.amount,
      balanceDue: 0,
      status:     "Paid",
    }

    const doc = await generateInvoicePDF(pdfData)
    doc.save(`Payment_${payment.payment_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", color: "var(--text-muted)" }}>Loading…</div>
  if (!payment) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", color: "var(--text-muted)" }}>Payment not found</div>

  const waLink = getWhatsAppLink()

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 130px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-success { background: #25D366; color: white; border-color: #25D366; }
        .btn-success:hover { background: #22C55E; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/payments")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Payment #{payment.payment_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{payment.supplier?.name || "Unknown Supplier"}</p>
          </div>
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

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Payment Details</h3>
        <div className="row"><span className="label">Payment No.</span><span className="value">{payment.payment_no}</span></div>
        <div className="row"><span className="label">Date</span><span className="value">{payment.date}</span></div>
        <div className="row"><span className="label">Supplier</span><span className="value">{payment.supplier?.code} – {payment.supplier?.name}</span></div>
        <div className="row"><span className="label">Amount</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {payment.amount?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Method</span><span className="value">{payment.payment_method}</span></div>
        <div className="row"><span className="label">Reference</span><span className="value">{payment.reference || "—"}</span></div>
        <div className="row"><span className="label">Notes</span><span className="value">{payment.notes || "—"}</span></div>
      </div>

      {payment.allocations && payment.allocations.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Applied to Bills</h3>
          <table>
            <thead>
              <tr>
                <th>Bill Number</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.map((alloc, idx) => (
                <tr key={idx}>
                  <td>{alloc.invoice_no}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {alloc.amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}