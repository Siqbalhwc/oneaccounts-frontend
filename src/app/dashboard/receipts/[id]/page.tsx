"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"

interface Receipt {
  id: number
  date: string
  amount: number
  customer_id: number
  bank_id: number
  notes: string
  customers?: { name: string; code: string }
  bank_accounts?: { name: string }
  allocations?: { invoice_no: string; amount: number }[]
  journal_entries?: { id: number; entry_no: string; date: string }[]
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !receiptId) return
    supabase
      .from("receipts")
      .select("*, customers(name, code), bank_accounts(name)")
      .eq("id", receiptId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => {
        if (data) {
          const rec: Receipt = data
          // Fetch allocations with invoice numbers
          supabase
            .from("payment_allocations")
            .select("amount, invoices(invoice_no)")
            .eq("receipt_id", rec.id)
            .eq("company_id", companyId)
            .then(({ data: allocs }) => {
              rec.allocations = allocs?.map((a: any) => ({
                invoice_no: a.invoices?.invoice_no,
                amount: a.amount,
              })) || []
              // Fetch related journal entries
              supabase
                .from("journal_entries")
                .select("id, entry_no, date")
                .eq("company_id", companyId)
                .like("description", `%${rec.id}%`)   // entry_no contains JE-REC-xxxx
                .order("date", { ascending: false })
                .then(({ data: entries }) => {
                  rec.journal_entries = entries || []
                  setReceipt(rec)
                  setLoading(false)
                })
            })
        } else {
          setLoading(false)
        }
      })
  }, [companyId, receiptId])

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>
  if (!receipt) return <div style={{ padding: 24, textAlign: "center" }}>Receipt not found</div>

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
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/receipts")}>
          <ArrowLeft size={16} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Receipt #{receipt.id}</h1>
      </div>

      <div className="card">
        <div className="row"><span className="label">Date</span><span className="value">{receipt.date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{receipt.customers?.code} – {receipt.customers?.name}</span></div>
        <div className="row"><span className="label">Bank</span><span className="value">{receipt.bank_accounts?.name}</span></div>
        <div className="row"><span className="label">Amount</span><span className="value">PKR {receipt.amount?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Notes</span><span className="value">{receipt.notes || "—"}</span></div>
      </div>

      {receipt.allocations && receipt.allocations.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700 }}>Applied to Invoices</h3>
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
                  <td style={{ textAlign: "right" }}>{alloc.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {receipt.journal_entries && receipt.journal_entries.length > 0 && (
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
              {receipt.journal_entries.map(entry => (
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