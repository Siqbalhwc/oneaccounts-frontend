"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"

interface BillItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
}

interface Bill {
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
  items?: BillItem[]
  supplier?: {
    name: string
    code: string
    phone?: string
    address?: string
    email?: string
  }
}

export default function BillDetailPage() {
  const router = useRouter()
  const params = useParams()
  const billId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [bill, setBill] = useState<Bill | null>(null)
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
    if (!companyId || !billId) return
    setLoading(true)

    // 1. Fetch bill (no join)
    supabase
      .from("invoices")
      .select("*")
      .eq("id", billId)
      .eq("company_id", companyId)
      .eq("type", "purchase")
      .single()
      .then(({ data }) => {
        if (!data) { setLoading(false); return }

        const b: Bill = data

        // 2. Fetch supplier separately using party_id
        if (b.party_id) {
          supabase
            .from("suppliers")
            .select("name, code, phone, address, email")
            .eq("id", b.party_id)
            .single()
            .then(({ data: supp }) => {
              b.supplier = supp || undefined
            })
            .finally(() => {
              // 3. Fetch items
              supabase
                .from("invoice_items")
                .select("*")
                .eq("invoice_id", b.id)
                .eq("company_id", companyId)
                .then(({ data: items }) => {
                  b.items = items || []
                  setBill(b)
                  setLoading(false)
                })
            })
        } else {
          b.items = []
          setBill(b)
          setLoading(false)
        }
      })

    // 4. Fetch company settings
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
  }, [companyId, billId])

  const getWhatsAppLink = () => {
    if (!bill || !bill.supplier) return ""
    const phone = (bill.supplier.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    // Suppliers don't have country_code, default to +92
    const msg = `Dear ${bill.supplier.name},\n\nYour purchase bill ${bill.invoice_no} for PKR ${bill.total?.toLocaleString()} is ready.\nDate: ${bill.date}\nDue: ${bill.due_date}\n\nThank you for your business.\n— OneAccounts`
    return `https://wa.me/92${phone}?text=${encodeURIComponent(msg)}`
  }

  const handlePrintPDF = () => {
    if (!bill) return
    const supplier = bill.supplier
    const subTotal = bill.items?.reduce((s, i) => s + i.total, 0) || 0

    const pdfData = {
      companyName: companySettings.name || "OneAccounts",
      companyAddress: companySettings.address,
      companyPhone: companySettings.phone,
      companyEmail: companySettings.email,
      logoUrl: companySettings.logo_url,
      invoiceNo: bill.invoice_no,
      date: bill.date,
      dueDate: bill.due_date,
      reference: bill.reference,
      notes: bill.notes,
      customerName: supplier?.name || "Unknown",
      customerAddress: supplier?.address,
      customerPhone: supplier?.phone,
      customerEmail: supplier?.email,
      items: (bill.items || []).map(item => ({
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        total: item.total,
      })),
      subtotal: subTotal,
      total: bill.total,
      paid: bill.paid || 0,
      balanceDue: bill.total - (bill.paid || 0),
      status: bill.status,
    }

    const doc = generateInvoicePDF(pdfData)
    doc.save(`Bill_${bill.invoice_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>
  if (!bill) return <div style={{ padding: 24, textAlign: "center" }}>Bill not found</div>

  const balanceDue = bill.total - (bill.paid || 0)
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
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-success { background: #25D366; color: white; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/bills")}>
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Bill #{bill.invoice_no}</h1>
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
        <div className="row"><span className="label">Date</span><span className="value">{bill.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{bill.due_date}</span></div>
        <div className="row"><span className="label">Supplier</span><span className="value">{bill.supplier?.code} – {bill.supplier?.name || "Unknown"}</span></div>
        <div className="row"><span className="label">Total</span><span className="value">PKR {bill.total?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Paid</span><span className="value">PKR {bill.paid?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Due</span><span className="value">PKR {balanceDue.toLocaleString()}</span></div>
        <div className="row"><span className="label">Status</span><span className="value">{bill.status}</span></div>
      </div>

      {bill.items && bill.items.length > 0 && (
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
              {bill.items.map(item => (
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
    </div>
  )
}