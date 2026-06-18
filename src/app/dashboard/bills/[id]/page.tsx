"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateBillPDF } from "@/lib/pdf/billPDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

interface BillItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
  tax_code_id?: string | null
  tax_code_snapshot?: string
  tax_name_snapshot?: string
  tax_rate?: number
  tax_amount?: number
}

interface Bill {
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
  items?: BillItem[]
  supplier?: {
    name: string
    code: string
    phone?: string
    address?: string
    email?: string
    payment_terms?: string
  }
  created_by?: string
  updated_by?: string
}

interface WhtData {
  wht_tax_code_id: string
  wht_rate: number
  wht_amount: number
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
  const taxEnabled = hasFeature("tax_management")
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [bill, setBill] = useState<Bill | null>(null)
  const [whtData, setWhtData] = useState<WhtData | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

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
            .select("name, code, phone, address, email, payment_terms")
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
                })
            })

          // Fetch WHT data if tax is enabled
          if (taxEnabled) {
            supabase
              .from("bill_withholding")
              .select("*")
              .eq("bill_id", b.id)
              .maybeSingle()
              .then(({ data: wht }) => {
                if (wht) {
                  setWhtData({
                    wht_tax_code_id: wht.wht_tax_code_id,
                    wht_rate: wht.wht_rate,
                    wht_amount: wht.wht_amount,
                  })
                }
              })
          }
        } else {
          supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", b.id)
            .eq("company_id", companyId)
            .then(({ data: items }) => {
              b.items = items || []
              setBill(b)
            })
        }
        setLoading(false)
      })
  }, [companyId, billId, taxEnabled])

  const waLink = bill && bill.supplier
    ? getWhatsAppLink(
        bill.supplier.phone || "",
        `Dear ${bill.supplier.name},\n\nYour purchase bill ${bill.invoice_no} for PKR ${bill.total?.toLocaleString()} is ready.\nDate: ${bill.date}\nDue: ${bill.due_date}\n\nThank you for your business.\n— OneAccounts`
      )
    : ""

  const handlePrintPDF = async () => {
    if (!bill) return
    const supplier = bill.supplier
    const subTotal = bill.items?.reduce((s, i) => s + i.total, 0) || 0

    const pdfData = {
      companyName:    companyName || "",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      billNo:         bill.invoice_no,
      date:           bill.date,
      dueDate:        bill.due_date,
      supplierName:    supplier?.name || "Unknown",
      supplierAddress: supplier?.address || "",
      supplierPhone:   supplier?.phone || "",
      supplierEmail:   supplier?.email || "",
      paymentTerms:    supplier?.payment_terms || null,
      notes:          bill.notes || null,
      status:         bill.status,
      items: (bill.items || []).map(item => ({
        description: item.description,
        qty:          item.qty,
        unit_price:   item.unit_price,
        total:        item.total,
        tax_rate:     item.tax_rate || 0,
        tax_amount:   item.tax_amount || 0,
      })),
      subtotal:   subTotal,
      total:      bill.total,
      totalTax:   bill.total_tax || 0,
      paid:       bill.paid || 0,
      balanceDue: bill.total - (bill.paid || 0),
      whtRate:    whtData?.wht_rate,
      whtAmount:  whtData?.wht_amount,
    }

    const doc = await generateBillPDF(pdfData)
    doc.save(`Bill_${bill.invoice_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  if (!bill) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Bill not found</div>

  const balanceDue = bill.total - (bill.paid || 0)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
        .value { font-size: 14px; font-weight: 500; color: var(--text); }
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
        .wht-card { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; margin-top: 12px; }
        @media (max-width: 640px) {
          .grid-2col { grid-template-columns: 1fr; }
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
        <div className="grid-2col">
          <div>
            <div className="label">Date</div>
            <div className="value">{bill.date}</div>
          </div>
          <div>
            <div className="label">Due Date</div>
            <div className="value">{bill.due_date}</div>
          </div>
          <div>
            <div className="label">Supplier</div>
            <div className="value">{bill.supplier?.code} – {bill.supplier?.name || "Unknown"}</div>
          </div>
          <div>
            <div className="label">Total</div>
            <div className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {bill.total?.toLocaleString()}</div>
          </div>
          {taxEnabled && bill.total_tax > 0 && (
            <div>
              <div className="label">Input Tax</div>
              <div className="value">PKR {bill.total_tax?.toLocaleString()}</div>
            </div>
          )}
          <div>
            <div className="label">Paid</div>
            <div className="value">PKR {bill.paid?.toLocaleString()}</div>
          </div>
          <div>
            <div className="label">Due</div>
            <div className="value" style={{ color: balanceDue > 0 ? "#EF4444" : "#10B981", fontWeight: 600 }}>PKR {balanceDue.toLocaleString()}</div>
          </div>
          <div>
            <div className="label">Status</div>
            <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: bill.status === "Paid" ? "#065F46" : "#7C2D12", color: bill.status === "Paid" ? "#6EE7B7" : "#FCA5A5" }}>{bill.status}</span>
          </div>
          {bill.reference && <div><div className="label">Reference</div><div className="value">{bill.reference}</div></div>}
          {bill.notes && <div><div className="label">Notes</div><div className="value">{bill.notes}</div></div>}
          {bill.created_by && <div><div className="label">Created by</div><div className="value">{bill.created_by}</div></div>}
          {bill.updated_by && <div><div className="label">Last updated by</div><div className="value">{bill.updated_by}</div></div>}
        </div>

        {/* WHT Details */}
        {taxEnabled && whtData && (
          <div className="wht-card">
            <div className="label" style={{ marginBottom: 8, color: "#EF4444" }}>Withholding Tax (WHT)</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div className="label">Rate</div>
                <div className="value" style={{ color: "#EF4444", fontWeight: 600 }}>{whtData.wht_rate}%</div>
              </div>
              <div>
                <div className="label">Amount</div>
                <div className="value" style={{ color: "#EF4444", fontWeight: 600 }}>PKR {whtData.wht_amount.toLocaleString()}</div>
              </div>
              <div>
                <div className="label">Net Payable</div>
                <div className="value" style={{ color: "#10B981", fontWeight: 600 }}>PKR {(bill.total - whtData.wht_amount).toLocaleString()}</div>
              </div>
            </div>
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
                {taxEnabled && <th style={{ textAlign: "right" }}>Tax Rate</th>}
                <th style={{ textAlign: "right" }}>Total</th>
                {taxEnabled && <th style={{ textAlign: "right" }}>Tax</th>}
              </tr>
            </thead>
            <tbody>
              {bill.items.map(item => (
                <tr key={item.id}>
                  <td>{item.description}</td>
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
            {taxEnabled && bill.total_tax > 0 && (
              <tfoot>
                <tr style={{ background: "var(--card-hover)", fontWeight: 700 }}>
                  <td colSpan={taxEnabled ? 5 : 3} style={{ textAlign: "right" }}>Total Tax</td>
                  <td style={{ textAlign: "right", color: "#EF4444" }}>PKR {bill.total_tax.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
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