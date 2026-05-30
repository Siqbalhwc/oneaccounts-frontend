"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"

export default function ReceiptDetailPage() {
  const router = useRouter()
  const params = useParams()
  const receiptId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [receipt, setReceipt] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const cid = (user?.app_metadata as any)?.company_id
        if (cid) setCompanyId(cid)
      }
    })
  }, [])

  useEffect(() => {
    if (!receiptId || !companyId) return
    setLoading(true)

    supabase
      .from("receipts")
      .select("*")
      .eq("id", receiptId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }

        const rec = data

        // Fetch customer info
        if (rec.party_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name, code, phone, country_code, address, email, payment_terms")
            .eq("id", rec.party_id)
            .single()
          rec.customer = cust || undefined
        }

        setReceipt(rec)
        setLoading(false)
      })
  }, [companyId, receiptId])

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  if (!receipt) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Receipt not found</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; flex-wrap: wrap; }
        .label { width: 130px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        @media (max-width: 640px) {
          .label { width: 100px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/receipts")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Receipt #{receipt.receipt_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{receipt.customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Receipt Details</h3>
        <div className="row"><span className="label">Date</span><span className="value">{receipt.date}</span></div>
        <div className="row"><span className="label">Customer</span><span className="value">{receipt.customer?.code} – {receipt.customer?.name}</span></div>
        <div className="row"><span className="label">Amount</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#10B981" }}>PKR {receipt.amount?.toLocaleString()}</span></div>
        <div className="row"><span className="label">Method</span><span className="value">{receipt.payment_method || "—"}</span></div>
        {receipt.reference && <div className="row"><span className="label">Reference</span><span className="value">{receipt.reference}</span></div>}
        {receipt.notes && <div className="row"><span className="label">Notes</span><span className="value">{receipt.notes}</span></div>}
      </div>

      {receipt && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
          <div className="record-history">
            <RecordHistory tableName="receipts" recordId={String(receipt.id)} />
          </div>
        </div>
      )}
    </div>
  )
}