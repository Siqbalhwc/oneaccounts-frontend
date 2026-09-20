"use client"

import { fmtQty } from "@/lib/format-number"
import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"

interface ReturnItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
  product_id: number | null
  product_code?: string
  product_name?: string
}

interface PurchaseReturn {
  id: number
  invoice_no: string
  date: string
  total: number
  total_tax?: number
  status: string
  reference?: string
  notes?: string
  party_id: number
  original_invoice_id?: number
  original_invoice_no?: string
  supplier?: {
    name: string
    code: string
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

export default function PurchaseReturnDetailPage() {
  const router = useRouter()
  const params = useParams()
  const returnId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [ret, setRet] = useState<PurchaseReturn | null>(null)
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
    let cancelled = false

    const load = async () => {
      setLoading(true)

      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", returnId)
        .eq("company_id", companyId)
        .eq("type", "purchase_return")
        .single()

      if (!data) {
        if (!cancelled) setLoading(false)
        return
      }

      const returnData: PurchaseReturn = data

      if (returnData.party_id) {
        const { data: supp } = await supabase
          .from("suppliers")
          .select("name, code")
          .eq("id", returnData.party_id)
          .single()
        returnData.supplier = supp || undefined
      }

      if (returnData.original_invoice_id) {
        const { data: orig } = await supabase
          .from("invoices")
          .select("invoice_no")
          .eq("id", returnData.original_invoice_id)
          .maybeSingle()
        if (orig) returnData.original_invoice_no = orig.invoice_no
      }

      const { data: items } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", returnData.id)
        .eq("company_id", companyId)

      const productIds = (items || []).map((i: any) => i.product_id).filter((id: any) => id != null)
      const productMap: Record<number, any> = {}
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, code, name")
          .in("id", productIds)
        ;(products || []).forEach((p: any) => { productMap[p.id] = p })
      }

      returnData.items = (items || []).map((item: any) => ({
        ...item,
        product_code: productMap[item.product_id]?.code || "",
        product_name: productMap[item.product_id]?.name || "",
      }))

      const { data: lines } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, accounts(code, name)")
        .eq("company_id", companyId)
        .eq("source_type", "purchase_return")
        .eq("source_id", returnData.id)

      if (!cancelled) {
        setRet(returnData)
        setJournalLines((lines || []).map((l: any) => ({
          account_id: l.account_id,
          account_code: l.accounts?.code || "",
          account_name: l.accounts?.name || "",
          debit: l.debit || 0,
          credit: l.credit || 0,
        })))
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [companyId, returnId])

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading...</div>
  if (!ret) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Purchase return not found</div>

  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

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
        .badge-return { background: #1D4ED8; color: #DBEAFE; }
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .table-responsive table { min-width: 560px; margin-top: 0; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn no-print" onClick={() => router.push("/dashboard/purchase-returns")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Purchase Return #{ret.invoice_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{ret.supplier?.name || "Unknown Supplier"}</p>
          </div>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Return Details</h3>
        <div className="row"><span className="label">Date</span><span className="value">{ret.date}</span></div>
        <div className="row"><span className="label">Supplier</span><span className="value">{ret.supplier?.code} – {ret.supplier?.name}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {ret.total?.toLocaleString()}</span></div>
        <div className="row">
          <span className="label">Status</span>
          <span className="badge badge-return">↩️ Returned to supplier</span>
        </div>
        {ret.original_invoice_id && (
          <div className="row">
            <span className="label">Original Bill</span>
            <span className="value">
              <a href={`/dashboard/bills/${ret.original_invoice_id}`} style={{ color: "var(--primary)", fontWeight: 600 }}>
                {ret.original_invoice_no || `Bill #${ret.original_invoice_id}`}
              </a>
            </span>
          </div>
        )}
        {ret.notes && <div className="row"><span className="label">Notes</span><span className="value">{ret.notes}</span></div>}
      </div>

      {ret.items && ret.items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Items Returned</h3>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Product / Description</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Unit Price</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {ret.items.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>
                      {item.product_code ? `${item.product_code} – ${item.product_name || ""}` : item.description}
                    </td>
                    <td style={{ textAlign: "center" }}>{fmtQty(item.qty)}</td>
                    <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {journalLines.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📒 Journal Entry (Reversal)</h3>
          <div className="table-responsive">
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
                    <td style={{ textAlign: "right", color: line.debit > 0 ? "#F87171" : "var(--text-muted)" }}>
                      {line.debit > 0 ? line.debit.toLocaleString() : "–"}
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
        </div>
      )}

      <div className="card no-print">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
        <div className="record-history">
          <RecordHistory tableName="invoices" recordId={String(ret.id)} />
        </div>
      </div>
    </div>
  )
}
