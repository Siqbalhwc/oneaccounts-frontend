"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"

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
  created_by?: string
  updated_by?: string
  created_at?: string
  updated_at?: string
}

export default function BillDetailPage() {
  const router = useRouter()
  const params = useParams()
  const billId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()

  const [bill, setBill] = useState<Bill | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  const [companySettings, setCompanySettings] = useState<{
    name?: string
    address?: string
    phone?: string
    email?: string
    tagline?: string
    logo_url?: string | null
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

    supabase
      .from("invoices")
      .select("*")
      .eq("id", billId)
      .eq("company_id", companyId)
      .eq("type", "purchase")
      .single()
      .then(({ data }) => {
        if (!data) {
          setLoading(false)
          return
        }
        const b: Bill = data

        if (b.party_id) {
          supabase
            .from("suppliers")
            .select("name, code, phone, address, email")
            .eq("id", b.party_id)
            .single()
            .then(({ data: supp }) => {
              b.supplier = supp || undefined
            })
            .then(() => {
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
        }
      })

    supabase
      .from("company_settings")
      .select("company_name, address, phone, email, tagline, logo_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCompanySettings({
            name: data.company_name || "OneAccounts",
            address: data.address || "",
            phone: data.phone || "",
            email: data.email || "",
            tagline: data.tagline || "",
            logo_url: data.logo_url || null,
          })
        }
      })
  }, [companyId, billId])

  const getWhatsAppLink = () => {
    if (!bill || !bill.supplier) return ""
    const phone = (bill.supplier.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${bill.supplier.name},\n\nYour purchase bill ${bill.invoice_no} for PKR ${bill.total?.toLocaleString()} is ready.\nDate: ${bill.date}\nDue: ${bill.due_date}\n\nThank you for your business.\n— OneAccounts`
    return `https://wa.me/92${phone}?text=${encodeURIComponent(msg)}`
  }

  const handlePrintPDF = async () => {
    if (!bill) return
    const supplier = bill.supplier
    const subTotal = bill.items?.reduce((s, i) => s + i.total, 0) || 0

    const pdfData = {
      companyName:    companySettings.name || "OneAccounts",
      companyAddress: companySettings.address || "",
      companyPhone:   companySettings.phone || "",
      companyEmail:   companySettings.email || "",
      companyTagline: companySettings.tagline || "",
      logoUrl:        companySettings.logo_url || null,
      invoiceNo:      bill.invoice_no,
      date:           bill.date,
      dueDate:        bill.due_date,
      reference:      bill.reference || "",
      notes:          bill.notes || "",
      customerName:    supplier?.name || "Unknown",
      customerAddress: supplier?.address || "",
      customerPhone:   supplier?.phone || "",
      customerEmail:   supplier?.email || "",
      items: (bill.items || []).map(item => ({
        description: item.description,
        qty:          item.qty,
        unit_price:   item.unit_price,
        total:        item.total,
      })),
      subtotal:   subTotal,
      total:      bill.total,
      paid:       bill.paid || 0,
      balanceDue: bill.total - (bill.paid || 0),
      status:     bill.status,
    }

    const doc = await generateInvoicePDF(pdfData)
    doc.save(`Bill_${bill.invoice_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  if (!bill) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Bill not found</div>

  const balanceDue = bill.total - (bill.paid || 0)
  const waLink = getWhatsAppLink()

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
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/bills")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Bill #{bill.invoice_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{bill.supplier?.name || "Unknown Supplier"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => router.push(`/dashboard/bills/new?id=${bill.id}`)}>
            ✏️ Edit
          </button>
          {waLink && hasFeature("whatsapp_invoice") && (
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
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Bill Details</h3>
        <div className="row"><span className="label">Date</span><span className="value">{bill.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{bill.due_date}</span></div>
        <div className="row"><span className="label">Supplier</span><span className="value">{bill.supplier?.code} – {bill.supplier?.name || "Unknown"}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {bill.total?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Paid</span><span className="value">PKR {bill.paid?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Due</span><span className="value" style={{ color: balanceDue > 0 ? "#EF4444" : "#10B981", fontWeight: 600 }}>PKR {balanceDue.toLocaleString()}</span></div>
        <div className="row"><span className="label">Status</span><span className="value">{bill.status}</span></div>
        {bill.reference && <div className="row"><span className="label">Reference</span><span className="value">{bill.reference}</span></div>}
        {bill.notes && <div className="row"><span className="label">Notes</span><span className="value">{bill.notes}</span></div>}
        {bill.created_by && (
          <div className="row">
            <span className="label">Created by</span>
            <span className="value">{bill.created_by}</span>
          </div>
        )}
        {bill.updated_by && (
          <div className="row">
            <span className="label">Last updated by</span>
            <span className="value">{bill.updated_by}</span>
          </div>
        )}
      </div>

      {bill.items && bill.items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Items</h3>
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
                  <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bill && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <div className="record-history">
            <RecordHistory tableName="invoices" recordId={String(bill.id)} />
          </div>
        </div>
      )}
    </div>
  )
}