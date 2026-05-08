"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"

interface BillItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
}

interface PurchaseBill {
  id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  status: string
  party_id: number
  suppliers?: { name: string; code: string }
  items?: BillItem[]
  journal_entries?: { id: number; entry_no: string; date: string }[]
}

export default function BillDetailPage() {
  const router = useRouter()
  const params = useParams()
  const billId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [bill, setBill] = useState<PurchaseBill | null>(null)
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
    supabase
      .from("invoices")           // bills are stored in invoices table with type='purchase'
      .select("*, suppliers(name, code)")
      .eq("id", billId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (data) {
          const b: PurchaseBill = data
          supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", b.id)
            .eq("company_id", companyId)
            .then(({ data: items }) => {
              b.items = items || []
              supabase
                .from("journal_entries")
                .select("id, entry_no, date")
                .eq("company_id", companyId)
                .like("description", `%${b.invoice_no}%`)
                .order("date", { ascending: false })
                .then(({ data: entries }) => {
                  b.journal_entries = entries || []
                  setBill(b)
                  setLoading(false)
                })
            })
        } else {
          setLoading(false)
        }
      })
  }, [companyId, billId])

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>
  if (!bill) return <div style={{ padding: 24, textAlign: "center" }}>Bill not found</div>

  const balanceDue = bill.total - (bill.paid || 0)

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
        .total-row { font-weight: 700; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/bills")}>
          <ArrowLeft size={16} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Bill #{bill.invoice_no}</h1>
      </div>

      <div className="card">
        <div className="row"><span className="label">Date</span><span className="value">{bill.date}</span></div>
        <div className="row"><span className="label">Due Date</span><span className="value">{bill.due_date}</span></div>
        <div className="row"><span className="label">Supplier</span><span className="value">{bill.suppliers?.code} – {bill.suppliers?.name}</span></div>
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

      {bill.journal_entries && bill.journal_entries.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700 }}>Related Journal Entries</h3>
          <table>
            <thead>
              <tr>
                <th>Entry No</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {bill.journal_entries.map(entry => (
                <tr key={entry.id}>
                  <td>{entry.entry_no}</td>
                  <td>{entry.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}