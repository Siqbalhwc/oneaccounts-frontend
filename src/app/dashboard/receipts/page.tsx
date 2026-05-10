"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

export default function ReceiptsListPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    supabase
      .from("receipts")
      .select("id, receipt_no, date, amount, notes, party_id, bank_id")
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setReceipts([])
          setLoading(false)
          return
        }

        const customerIds = [...new Set(data.map(r => r.party_id))]
        const bankIds = [...new Set(data.map(r => r.bank_id).filter(Boolean))]

        Promise.all([
          customerIds.length > 0
            ? supabase.from("customers").select("id, name").in("id", customerIds).eq("company_id", companyId)
            : { data: [] },
          bankIds.length > 0
            ? supabase.from("bank_accounts").select("id, bank_name").in("id", bankIds).eq("company_id", companyId)
            : { data: [] },
        ]).then(([custRes, bankRes]) => {
          const customerMap = new Map(custRes.data?.map((c: any) => [c.id, c.name]) || [])
          const bankMap = new Map(bankRes.data?.map((b: any) => [b.id, b.bank_name]) || [])

          const enriched = data.map(r => ({
            ...r,
            customer_name: customerMap.get(r.party_id) || "—",
            bank_name: bankMap.get(r.bank_id) || "—",
          }))
          setReceipts(enriched)
          setLoading(false)
        })
      })
  }, [companyId])

  // Combined guard: wait for both company and role
  if (!companyId || roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 10px 12px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📥 Receipts</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>All customer receipts recorded</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/dashboard/receipts/new")}>
          + New Receipt
        </button>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 24 }}>Loading receipts...</div>
        ) : receipts.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "#94A3B8" }}>
            No receipts yet. Create your first receipt above.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Bank</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.receipt_no}</td>
                  <td>{r.date}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.bank_name}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {r.amount?.toLocaleString()}</td>
                  <td>{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}