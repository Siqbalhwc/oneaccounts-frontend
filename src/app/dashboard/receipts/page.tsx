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
      .select("id, date, amount, notes, customers(name)")
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📥 Receipts</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Recorded customer receipts</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/receipts/new")}
          style={{ padding: "8px 16px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
        >
          + New Receipt
        </button>
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading receipts...</div>
      ) : receipts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No receipts found.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: 8, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#F1F5F9" }}>
              <th style={{ padding: 10, textAlign: "left", fontSize: 12 }}>Date</th>
              <th style={{ padding: 10, textAlign: "left", fontSize: 12 }}>Customer</th>
              <th style={{ padding: 10, textAlign: "right", fontSize: 12 }}>Amount</th>
              <th style={{ padding: 10, textAlign: "left", fontSize: 12 }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #E2E8F0" }}>
                <td style={{ padding: 10 }}>{r.date}</td>
                <td style={{ padding: 10 }}>{r.customers?.name || "—"}</td>
                <td style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>PKR {r.amount?.toLocaleString()}</td>
                <td style={{ padding: 10 }}>{r.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}