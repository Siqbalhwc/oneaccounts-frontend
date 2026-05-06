"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

export default function BusinessTypePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")
  const [selectedType, setSelectedType] = useState<"ngo" | "service" | "trading" | "">("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
    })
  }, [])

  const handleSave = async () => {
    if (!selectedType || !companyId) return
    setSaving(true)
    await supabase.from("companies").update({ business_type: selectedType }).eq("id", companyId)
    router.push("/dashboard")
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", fontFamily: "Arial"
    }}>
      <div style={{
        background: "white", borderRadius: 24, padding: 40, maxWidth: 500, width: "90%",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", textAlign: "center"
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1E293B", marginBottom: 8 }}>
          Welcome to OneAccounts
        </h1>
        <p style={{ color: "#64748B", marginBottom: 28, fontSize: 15 }}>
          Choose your business type to get started.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(["ngo", "service", "trading"] as const).map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                padding: "16px 20px", borderRadius: 14, border: selectedType === type ? "3px solid #1D4ED8" : "1px solid #E5E7EB",
                background: selectedType === type ? "#EFF6FF" : "white",
                textAlign: "left", cursor: "pointer",
                transition: "all 0.2s", display: "flex", alignItems: "center", gap: 14
              }}
            >
              <span style={{ fontSize: 28 }}>
                {type === "ngo" ? "🏥" : type === "service" ? "💼" : "📦"}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: "#1E293B" }}>
                  {type === "ngo" ? "NGO" : type === "service" ? "Service Business" : "Trading Business"}
                </div>
                <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
                  {type === "ngo"
                    ? "Donor‑funded projects, budget vs actuals, analytic tags."
                    : type === "service"
                    ? "Track expenses, revenue, and simple accounting."
                    : "Inventory management, products, sales & purchases."}
                </div>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={!selectedType || saving}
          style={{
            marginTop: 28, width: "100%", padding: 14, borderRadius: 12,
            background: !selectedType ? "#CBD5E1" : "#1D4ED8",
            color: "white", fontWeight: 700, fontSize: 16, border: "none", cursor: "pointer"
          }}
        >
          {saving ? "Saving..." : "Continue →"}
        </button>
      </div>
    </div>
  )
}