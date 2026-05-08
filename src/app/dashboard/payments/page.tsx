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
  const { role } = useRole()
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

  if (!companyId) return <div style={{ padding: 40 }}>Loading…</div>
  if (!canView) return <div style={{ padding: 40 }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <h2>📤 Payments</h2>
      <button onClick={() => router.push("/dashboard/payments/new")} style={{ marginBottom: 12 }}>+ New Payment</button>
      {loading ? <p>Loading...</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center" }}>No payments yet.</td></tr>
            ) : (
              payments.map(p => (
                <tr key={p.id}>
                  <td>{p.date}</td>
                  <td>{p.suppliers?.name}</td>
                  <td>PKR {p.amount?.toLocaleString()}</td>
                  <td>{p.notes}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}