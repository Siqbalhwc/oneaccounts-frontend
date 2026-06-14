"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
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
  original_invoice_no?: string
  customer?: {
    name: string
    code: string
    phone?: string
  }
  items?: ReturnItem[]
}

interface JournalLine {
  account_id: number
  account_code?: string
  account_name?: string
  debit: number
  credit: number
}

export default function SalesReturnDetailPage() {
  const router = useRouter()
  const params = useParams()
  const returnId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [ret, setRet] = useState<SalesReturn | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")
  const [journalLines, setJournalLines] = useState<JournalLine[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !returnId) return
    setLoading(true)

    // Load return header
    supabase
      .from("invoices")
      .select("*")
      .eq("id", returnId)
      .eq("company_id", companyId)
      .eq("type", "sale_return")
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }

        const returnData: SalesReturn = data

        // Customer
        if (returnData.party_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name, code, phone")
            .eq("id", returnData.party_id)
            .single()
          returnData.customer = cust || undefined
        }

        // Original invoice number (for linking)
        if (returnData.original_invoice_id) {
          const { data: orig } = await supabase
            .from("invoices")
            .select("invoice_no")
            .eq("id", returnData.original_invoice_id)
            .maybeSingle()
          if (orig) {
            returnData.original_invoice_no = orig.invoice_no
          }
        }

        // Items
        const { data: items } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", returnData.id)

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

            returnData.items = items.map((item: any) => {
              const prod = productMap[item.product_id]
              return {
                ...item,
                product_code:  prod?.code       || "",
                product_name:  prod?.name       || "",
                product_image: prod?.image_path || null,
              }
            })
          } else {
            returnData.items = items.map((item: any) => ({
              ...item,
              product_code:  "",
              product_name:  "",
              product_image: null,
            }))
          }
        } else {
          returnData.items = []
        }

        setRet(returnData)
        setLoading(false)
      })

    // Load journal lines for this return
    supabase
      .from("journal_lines")
      .select("account_id, debit, credit, accounts(code, name)")
      .eq("company_id", companyId)
      .eq("source_type", "sale_return")
      .eq("source_id", returnId)
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
  }, [companyId, returnId])

  if (loading)   return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  if (!ret)      return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Return not found</div>

  const balanceDue = ret.total - (ret.paid || 0)
  const totalDebit  = journalLines.reduce((s: number, l: JournalLine) => s + l.debit,  0)
  const totalCredit = journalLines.reduce((s: number, l: JournalLine) => s + l.credit, 0)

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
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/sales-returns")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Return #{ret.invoice_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{ret.customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Return Details</h3>
        <div className="row"><span className="label">Date</span><span className="value">{ret.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{ret.due_date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{ret.customer?.code} – {ret.customer?.name}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {ret.total?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Paid</span><span className="value">PKR {ret.paid?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Due</span><span className="value" style={{ color: balanceDue > 0 ? "#EF4444" : "#10B981", fontWeight: 600 }}>PKR {balanceDue.toLocaleString()}</span></div>
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
                {ret.original_invoice_no || `Invoice #${ret.original_invoice_id}`}
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
                <th>Product</th>
                <th>Description</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {ret.items.map(item => (
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
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {journalLines.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📒 Journal Entry (Reversal)</h3>
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

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
        <div className="record-history">
          <RecordHistory tableName="invoices" recordId={String(ret.id)} />
        </div>
      </div>
    </div>
  )
}