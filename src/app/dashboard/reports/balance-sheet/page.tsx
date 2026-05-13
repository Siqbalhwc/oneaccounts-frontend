"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import PremiumGuard from "@/components/PremiumGuard"

// Fallback category mapper (same as Trial Balance)
function getCategory(account: any): string {
  if (account.category) return account.category
  const code = account.code
  const num = parseFloat(code)
  if (isNaN(num)) return "Other"
  if (num >= 1000 && num <= 1099) return "Cash & Bank"
  if (num >= 1100 && num <= 1199) return "Accounts Receivable"
  if (num >= 1200 && num <= 1299) return "Inventory"
  if (num >= 1300 && num <= 1399) return "Other Current Assets"
  if (num >= 1400 && num <= 1499) return "Fixed Assets"
  if (num >= 1500 && num <= 1599) return "Vehicles"
  if (num >= 2000 && num <= 2099) return "Accounts Payable"
  if (num >= 2100 && num <= 2199) return "Other Current Liabilities"
  if (num >= 3000 && num <= 3099) return "Equity"
  return "Other"
}

function BalanceSheetContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => r.data && setAccounts(r.data))
  }, [])

  // Group accounts by category
  const grouped = accounts.reduce((acc: Record<string, any[]>, a) => {
    const cat = getCategory(a)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(a)
    return acc
  }, {})

  const assetCategories = ["Cash & Bank", "Accounts Receivable", "Inventory", "Other Current Assets", "Fixed Assets", "Vehicles"]
  const liabilityCategories = ["Accounts Payable", "Other Current Liabilities"]
  const equityCategories = ["Equity"]

  const assetsTotal = accounts.filter(a => a.type === "Asset").reduce((s, a) => s + (a.balance || 0), 0)
  const liabilitiesTotal = accounts.filter(a => a.type === "Liability").reduce((s, a) => s + (a.balance || 0), 0)
  const equityTotal = accounts.filter(a => a.type === "Equity").reduce((s, a) => s + (a.balance || 0), 0)

  const navigateToTrialBalance = (type: string, category?: string) => {
    const params = new URLSearchParams()
    params.set("type", type)
    if (category) params.set("category", category)
    router.push(`/dashboard/reports/trial-balance?${params.toString()}`)
  }

  const Section = ({ title, categories, type, total }: any) => (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1E293B", marginBottom: 12, cursor: "pointer" }}
          onClick={() => navigateToTrialBalance(type)}>
        {title}
      </h3>
      {categories.map((cat: string) => {
        const items = grouped[cat] || []
        const catTotal = items.reduce((s, a) => s + (a.balance || 0), 0)
        return items.length > 0 ? (
          <div key={cat} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 600, fontSize: 13, color: "#334155", cursor: "pointer" }}
                 onClick={() => navigateToTrialBalance(type, cat)}>
              <span>{cat}</span>
              <span>PKR {catTotal.toLocaleString()}</span>
            </div>
            {items.map(a => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", paddingLeft: 16, fontSize: 12, color: "#64748B", borderBottom: "1px solid #F1F5F9" }}>
                <span>{a.code} – {a.name}</span>
                <span>PKR {(a.balance || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : null
      })}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, fontSize: 15, borderTop: "2px solid #E2E8F0", marginTop: 8 }}>
        <span>Total {title}</span>
        <span>PKR {total.toLocaleString()}</span>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .clickable { cursor: pointer; transition: color 0.15s; }
        .clickable:hover { color: #1D4ED8; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")} className="clickable" style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📊 Balance Sheet</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Assets = Liabilities + Equity</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 1000, margin: "0 auto" }}>
        {/* Assets side */}
        <div className="card">
          <Section title="Assets" categories={assetCategories} type="Asset" total={assetsTotal} />
        </div>

        {/* Liabilities + Equity side */}
        <div className="card">
          <Section title="Liabilities" categories={liabilityCategories} type="Liability" total={liabilitiesTotal} />
          <Section title="Equity" categories={equityCategories} type="Equity" total={equityTotal} />
        </div>
      </div>

      {/* Bottom total bands */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 1000, margin: "20px auto 0" }}>
        <div style={{ background: "#1E3A8A", borderRadius: 8, padding: 14, color: "white", fontWeight: 700, fontSize: 16 }}>
          TOTAL ASSETS: PKR {assetsTotal.toLocaleString()}
        </div>
        <div style={{ background: "#8B5CF6", borderRadius: 8, padding: 14, color: "white", fontWeight: 700, fontSize: 16 }}>
          TOTAL LIABILITIES + EQUITY: PKR {(liabilitiesTotal + equityTotal).toLocaleString()}
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