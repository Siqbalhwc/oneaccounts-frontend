"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function TrialBalancePage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  let totalDebit = 0, totalCredit = 0
  const tb = accounts.map(a => {
    const bal = a.balance || 0
    let debit = 0, credit = 0
    if (["Asset", "Expense"].includes(a.type)) {
      debit = Math.max(bal, 0)
      credit = Math.max(-bal, 0)
    } else {
      credit = Math.max(bal, 0)
      debit = Math.max(-bal, 0)
    }
    totalDebit += debit; totalCredit += credit
    return { ...a, debit, credit }
  })

  const isBalanced = Math.abs(totalDebit - totalCredit) < 1

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>⚖️ Trial Balance</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Debits must equal Credits</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "white", borderRadius: 10, padding: 14, border: "1px solid #E2E8F0", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Total Debits</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#EF4444" }}>PKR {totalDebit.toLocaleString()}</div>
        </div>
        <div style={{ background: "white", borderRadius: 10, padding: 14, border: "1px solid #E2E8F0", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Total Credits</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#10B981" }}>PKR {totalCredit.toLocaleString()}</div>
        </div>
        <div style={{ background: "white", borderRadius: 10, padding: 14, border: "1px solid #E2E8F0", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>Status</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: isBalanced ? "#10B981" : "#EF4444" }}>{isBalanced ? "✅ Balanced" : "❌ Not Balanced"}</div>
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40 }}>Loading...</div> :
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 100px 100px", padding: "10px 16px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
            <span>Code</span><span>Name</span><span>Type</span><span style={{ textAlign: "right" }}>Debit</span><span style={{ textAlign: "right" }}>Credit</span>
          </div>
          {tb.map((a, i) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 100px 100px", padding: "8px 16px", borderBottom: i < tb.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 12, alignItems: "center" }}>
              <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{a.code}</span>
              <span>{a.name}</span>
              <span style={{ fontSize: 10, color: "#64748B" }}>{a.type}</span>
              <span style={{ textAlign: "right", color: a.debit > 0 ? "#EF4444" : "#94A3B8" }}>{a.debit > 0 ? `PKR ${a.debit.toLocaleString()}` : "-"}</span>
              <span style={{ textAlign: "right", color: a.credit > 0 ? "#10B981" : "#94A3B8" }}>{a.credit > 0 ? `PKR ${a.credit.toLocaleString()}` : "-"}</span>
            </div>
          ))}
        </div>
      }
    </div>
  )
}