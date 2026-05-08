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

  if (!companyId) return <div style={{ padding: 40 }}>Loading…</div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <h2>📊 Chart of Accounts</h2>
      {loading ? <p>Loading...</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: 8 }}>
          <thead>
            <tr style={{ background: "#F1F5F9" }}>
              <th style={{ padding: 8 }}>Code</th>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(acc => (
              <tr key={acc.id}>
                <td style={{ padding: 8, fontWeight: 600 }}>{acc.code}</td>
                <td style={{ padding: 8 }}>{acc.name}</td>
                <td style={{ padding: 8 }}>{acc.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}