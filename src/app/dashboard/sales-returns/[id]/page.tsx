"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"
import { useCompany } from "@/contexts/CompanyContext"

interface ReturnItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
  product_id: number | null
  product_code?: string
  product_name?: string
  product_image?: string | null
}

interface SalesReturn {
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
  original_invoice_id?: number
  customer?: {
    name: string
    code: string
    phone?: string
  }
  items?: ReturnItem[]
}

export default function SalesReturnDetailPage() {
  const router = useRouter()
  const params = useParams()
  const returnId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [ret, setRet] = useState<SalesReturn | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !returnId) return
    setLoading(true)
    supabase
      .from("invoices")
      .select("*")
      .eq("id", returnId)
      .eq("company_id", companyId)
      .eq("type", "sale_return")
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }
        const retData: SalesReturn = data

        if (retData.party_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name, code, phone")
            .eq("id", retData.party_id)
            .single()
          retData.customer = cust || undefined
        }

        const { data: items } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", retData.id)

        if (items) {
          retData.items = items.map((item: any) => ({
            ...item,
            product_code: "",
            product_name: "",
            product_image: null,
          }))
        } else {
          retData.items = []
        }

        setRet(retData)
        setLoading(false)
      })
  }, [companyId, returnId])

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!ret) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Return not found</div>

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
        .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
        .badge-return { background: #065F46; color: #6EE7B7; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/sales-returns")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Return #{ret.invoice_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{ret.customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Return Details</h3>
        <div className="row"><span className="label">Date</span><span className="value">{ret.date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{ret.customer?.code} – {ret.customer?.name}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {ret.total?.toLocaleString()}</span></div>
        <div className="row">
          <span className="label">Status</span>
          <span className={`badge badge-return`}>{ret.status}</span>
        </div>
        {ret.reference && <div className="row"><span className="label">Reference</span><span className="value">{ret.reference}</span></div>}
        {ret.notes && <div className="row"><span className="label">Notes</span><span className="value">{ret.notes}</span></div>}
        {ret.original_invoice_id && (
          <div className="row">
            <span className="label">Original Invoice</span>
            <span className="value">
              <a href={`/dashboard/invoices/${ret.original_invoice_id}`} style={{ color: "var(--primary)" }}>
                View Invoice
              </a>
            </span>
          </div>
        )}
      </div>

      {ret.items && ret.items.length > 0 && (
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
              {ret.items.map(item => (
                <tr key={item.id}>
                  <td>{item.description || item.product_name || "—"}</td>
                  <td style={{ textAlign: "center" }}>{item.qty}</td>
                  <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
        <RecordHistory tableName="invoices" recordId={String(ret.id)} />
      </div>
    </div>
  )
}