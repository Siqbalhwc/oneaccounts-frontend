"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus } from "lucide-react"

export default function AccountsPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("All")

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  const types = ["All", "Asset", "Liability", "Equity", "Revenue", "Expense"]
  const filtered = filter === "All" ? accounts : accounts.filter(a => a.type === filter)

  const typeColors: Record<string, string> = {
    Asset: "#1E3A8A", Liability: "#EF4444", Equity: "#8B5CF6", Revenue: "#10B981", Expense: "#F59E0B"
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📊 Chart of Accounts</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Manage your chart of accounts</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid #E2E8F0", background: filter === t ? "#1E3A8A" : "white", color: filter === t ? "white" : "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 100px 120px", padding: "10px 16px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
            <span>Code</span><span>Name</span><span>Type</span><span style={{ textAlign: "right" }}>Balance</span>
          </div>
          {filtered.map((a, i) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 100px 120px", padding: "10px 16px", borderBottom: i < filtered.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 13, alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{a.code}</span>
              <span>{a.name}</span>
              <span>
                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: (typeColors[a.type] || "#64748B") + "18", color: typeColors[a.type] || "#64748B" }}>{a.type}</span>
              </span>
              <span style={{ textAlign: "right", fontWeight: 600 }}>PKR {(a.balance || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      }
    </div>
  )
}