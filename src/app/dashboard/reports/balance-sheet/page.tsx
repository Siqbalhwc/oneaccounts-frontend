"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function BalanceSheetPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<any[]>([])

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => r.data && setAccounts(r.data))
  }, [])

  const assets = accounts.filter(a => a.type === "Asset")
  const liabilities = accounts.filter(a => a.type === "Liability")
  const equity = accounts.filter(a => a.type === "Equity")

  const totalAssets = assets.reduce((s, a) => s + (a.balance || 0), 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + (a.balance || 0), 0)
  const totalEquity = equity.reduce((s, a) => s + (a.balance || 0), 0)
  const rightSide = totalLiabilities + totalEquity

  const Section = ({ title, data, total, color }: any) => (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ color, marginBottom: 8, fontSize: 14 }}>{title}</h3>
      {data.map((a: any) => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F1F5F9", fontSize: 12 }}>
          <span>{a.code} - {a.name}</span>
          <span style={{ fontWeight: 600 }}>PKR {(a.balance || 0).toLocaleString()}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 700, borderTop: "1px solid #E2E8F0" }}>
        <span>Total {title}</span>
        <span>PKR {total.toLocaleString()}</span>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📊 Balance Sheet</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Assets = Liabilities + Equity</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0" }}>
          <Section title="Assets" data={assets} total={totalAssets} color="#1E3A8A" />
          <div style={{ background: "#1E3A8A", borderRadius: 8, padding: 14, color: "white", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
            <span>TOTAL ASSETS</span><span>PKR {totalAssets.toLocaleString()}</span>
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0" }}>
          <Section title="Liabilities" data={liabilities} total={totalLiabilities} color="#EF4444" />
          <Section title="Equity" data={equity} total={totalEquity} color="#8B5CF6" />
          <div style={{ background: "#8B5CF6", borderRadius: 8, padding: 14, color: "white", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
            <span>TOTAL LIAB + EQUITY</span><span>PKR {rightSide.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}