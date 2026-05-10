"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

export default function PaymentsListPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [payments, setPayments] = useState<any[]>([])
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
    supabase.from("payments")
      .select("*, suppliers(name)")
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setPayments(data || [])
        setLoading(false)
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
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2>📤 Payments</h2>
        <button className="btn" style={{ background: "#1D4ED8", color: "white" }} onClick={() => router.push("/dashboard/payments/new")}>+ New Payment</button>
      </div>

      <div className="card">
        {loading ? (
          <p>Loading...</p>
        ) : payments.length === 0 ? (
          <p style={{ color: "#94A3B8", textAlign: "center" }}>No payments yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td>{p.date}</td>
                  <td>{p.suppliers?.name}</td>
                  <td style={{ fontWeight: 600 }}>PKR {p.amount?.toLocaleString()}</td>
                  <td>{p.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}