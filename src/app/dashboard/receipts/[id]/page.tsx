"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"

interface Receipt {
  id: number
  receipt_no: string
  date: string
  amount: number
  party_id: number
  bank_id: number
  notes: string
  customer?: { name: string; code: string; phone?: string; country_code?: string }
  bank_accounts?: { bank_name: string }
  allocations?: { invoice_no: string; amount: number }[]
}

export default function ReceiptDetailPage() {
  const router = useRouter()
  const params = useParams()
  const receiptId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [receipt, setReceipt] = useState<Receipt | null>(null)
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
    if (!companyId || !receiptId) return
    setLoading(true)

    supabase.from("receipts")
      .select("*")
      .eq("id", receiptId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (!data) { setLoading(false); return }

        const rec: Receipt = data

        // Fetch customer
        if (rec.party_id) {
          supabase.from("customers")
            .select("name, code, phone, country_code")
            .eq("id", rec.party_id)
            .single()
            .then(({ data: cust }) => { rec.customer = cust || undefined })
        }
        // Fetch bank
        if (rec.bank_id) {
          supabase.from("bank_accounts")
            .select("bank_name")
            .eq("id", rec.bank_id)
            .single()
            .then(({ data: bank }) => { rec.bank_accounts = bank || undefined })
        }
        // Fetch allocations
        supabase.from("payment_allocations")
          .select("amount, invoices(invoice_no)")
          .eq("receipt_id", rec.id)
          .eq("company_id", companyId)
          .then(({ data: allocs }) => {
            rec.allocations = (allocs || []).map((a: any) => ({
              invoice_no: a.invoices?.invoice_no || "—",
              amount: a.amount,
            }))
            setReceipt(rec)
            setLoading(false)
          })
      })

    supabase.from("company_settings")
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
  }, [companyId, receiptId])

  const getWhatsAppLink = () => {
    if (!receipt || !receipt.customer) return ""
    const code = (receipt.customer.country_code || "+92").replace(/\D/g, "")
    const phone = (receipt.customer.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${receipt.customer.name},\n\nWe've received your payment of PKR ${receipt.amount?.toLocaleString()} for receipt ${receipt.receipt_no}.\nDate: ${receipt.date}\n\nThank you.\n— OneAccounts`
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  const handlePrintPDF = () => {
    if (!receipt) return
    const pdfData = {
      companyName: companySettings.name || "OneAccounts",
      companyAddress: companySettings.address,
      companyPhone: companySettings.phone,
      companyEmail: companySettings.email,
      logoUrl: companySettings.logo_url,
      invoiceNo: receipt.receipt_no,
      date: receipt.date,
      dueDate: "",
      customerName: receipt.customer?.name || "Customer",
      customerPhone: receipt.customer?.phone || "",
      items: (receipt.allocations || []).map(a => ({
        description: `Invoice: ${a.invoice_no}`,
        qty: 1,
        unit_price: a.amount,
        total: a.amount,
      })),
      subtotal: receipt.amount,
      total: receipt.amount,
    }
    const doc = generateInvoicePDF(pdfData)
    doc.save(`Receipt_${receipt.receipt_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>
  if (!receipt) return <div style={{ padding: 24, textAlign: "center" }}>Receipt not found</div>

  const waLink = getWhatsAppLink()

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
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/receipts")}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0a2940", margin: 0 }}>Receipt #{receipt.receipt_no}</h1>
            <p style={{ color: "#2c5778", fontSize: 13, margin: 0 }}>{receipt.customer?.name || "Receipt"}</p>
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
        <div className="row"><span className="label">Receipt No.</span><span className="value">{receipt.receipt_no}</span></div>
        <div className="row"><span className="label">Date</span><span className="value">{receipt.date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{receipt.customer?.code} – {receipt.customer?.name || "—"}</span></div>
        <div className="row"><span className="label">Bank</span><span className="value">{receipt.bank_accounts?.bank_name || "—"}</span></div>
        <div className="row"><span className="label">Amount</span><span className="value" style={{ fontSize: 18, fontWeight: 700 }}>PKR {receipt.amount?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Notes</span><span className="value">{receipt.notes || "—"}</span></div>
      </div>

      {receipt.allocations && receipt.allocations.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "#0a2940", marginBottom: 12 }}>Applied to Invoices</h3>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipt.allocations.map((alloc, idx) => (
                <tr key={idx}>
                  <td>{alloc.invoice_no}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {alloc.amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ODOO‑STYLE HISTORY ── */}
      {receipt && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "#0a2940", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <RecordHistory tableName="receipts" recordId={String(receipt.id)} />
        </div>
      )}
    </div>
  )
}