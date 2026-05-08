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
  const { role } = useRole()
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
    supabase.from("receipts")
      .select("id, date, amount, notes, customers(name), bank_accounts(name)")
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setReceipts(data || [])
        setLoading(false)
      })
  }, [companyId])

  if (!companyId) return <div style={{ padding: 40 }}>Loading…</div>
  if (!canView) return <div style={{ padding: 40 }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2>📥 Receipts</h2>
        <button style={{ padding: "8px 16px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 6 }} onClick={() => router.push("/dashboard/receipts/new")}>+ New Receipt</button>
      </div>

      <div className="card">
        {loading ? <p>Loading...</p> : receipts.length === 0 ? (
          <p style={{ color: "#94A3B8", textAlign: "center" }}>No receipts yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Bank</th>
                <th>Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map(r => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.customers?.name}</td>
                  <td>{r.bank_accounts?.name}</td>
                  <td>PKR {r.amount?.toLocaleString()}</td>
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