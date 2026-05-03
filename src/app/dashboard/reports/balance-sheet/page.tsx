"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import PremiumGuard from "@/components/PremiumGuard"

function BalanceSheetContent() {
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

  const Row = ({ label, value, bold }: { label: string; value: number; bold?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F1F5F9", fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700 }}>PKR {value.toLocaleString()}</span>
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

      <div style={{ display: "flex", gap: 20, alignItems: "stretch", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0", flex: 1 }}>
            <h3 style={{ color: "#1E3A8A", marginBottom: 8, fontSize: 14 }}>Assets</h3>
            {assets.map(a => (
              <Row key={a.id} label={`${a.code} - ${a.name}`} value={a.balance || 0} />
            ))}
            {assets.length === 0 && <Row label="No assets" value={0} />}
            <Row label="Total Assets" value={totalAssets} bold />
          </div>
          <div style={{ background: "#1E3A8A", borderRadius: 8, padding: 14, color: "white", fontWeight: 700, fontSize: 16, marginTop: 10 }}>
            TOTAL ASSETS: PKR {totalAssets.toLocaleString()}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0", flex: 1 }}>
            <h3 style={{ color: "#EF4444", marginBottom: 8, fontSize: 14 }}>Liabilities</h3>
            {liabilities.map(a => (
              <Row key={a.id} label={`${a.code} - ${a.name}`} value={a.balance || 0} />
            ))}
            {liabilities.length === 0 && <Row label="No liabilities" value={0} />}
            <Row label="Total Liabilities" value={totalLiabilities} bold />

            <h3 style={{ color: "#8B5CF6", marginTop: 20, marginBottom: 8, fontSize: 14 }}>Equity</h3>
            {equity.map(a => (
              <Row key={a.id} label={`${a.code} - ${a.name}`} value={a.balance || 0} />
            ))}
            {equity.length === 0 && <Row label="No equity" value={0} />}
            <Row label="Total Equity" value={totalEquity} bold />
          </div>
          <div style={{ background: "#8B5CF6", borderRadius: 8, padding: 14, color: "white", fontWeight: 700, fontSize: 16, marginTop: 10 }}>
            TOTAL LIABILITIES + EQUITY: PKR {rightSide.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BalanceSheetPage() {
  return (
    <PremiumGuard
      featureCode="balance_sheet"
      featureName="Balance Sheet"
      featureDesc="View your assets, liabilities, and equity."
    >
      <BalanceSheetContent />
    </PremiumGuard>
  )
}