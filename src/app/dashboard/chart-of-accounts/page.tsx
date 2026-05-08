"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

export default function ChartOfAccountsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [companyId, setCompanyId] = useState<string>("")
  const [accounts, setAccounts] = useState<any[]>([])
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
    supabase.from("accounts")
      .select("id, code, name, type")
      .eq("company_id", companyId)
      .order("code")
      .then(({ data }) => {
        setAccounts(data || [])
        setLoading(false)
      })
  }, [companyId])

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading your company…</div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>📊 Chart of Accounts</h2>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No accounts found for your company.</div>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
                <th style={{ padding: "10px 16px", textAlign: "left" }}>Code</th>
                <th style={{ padding: "10px 16px", textAlign: "left" }}>Name</th>
                <th style={{ padding: "10px 16px", textAlign: "left" }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => (
                <tr key={acc.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600 }}>{acc.code}</td>
                  <td style={{ padding: "10px 16px" }}>{acc.name}</td>
                  <td style={{ padding: "10px 16px" }}>{acc.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}