"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ArrowRight, BarChart3, Wallet, Scale } from "lucide-react"
import { useRouter } from "next/navigation"

export default function TrialBalancePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(r => {
      if (r.data) setAccounts(r.data)
      setLoading(false)
    })
  }, [])

  let totalDebit = 0,
    totalCredit = 0
  const tb = accounts.map(a => {
    const bal = a.balance || 0
    let debit = 0,
      credit = 0
    if (["Asset", "Expense"].includes(a.type)) {
      debit = Math.max(bal, 0)
      credit = Math.max(-bal, 0)
    } else {
      credit = Math.max(bal, 0)
      debit = Math.max(-bal, 0)
    }
    totalDebit += debit
    totalCredit += credit
    return { ...a, debit, credit }
  })

  const isBalanced = Math.abs(totalDebit - totalCredit) < 1

  // Drill down to ledger for the selected account
  const openLedger = (accountId: number, code: string) => {
    // Pass the accountId and optionally today's date range
    const now = new Date()
    const startDate = `${now.getFullYear()}-01-01`
    const endDate = now.toISOString().split("T")[0]
    router.push(
      `/dashboard/reports/ledger?accountId=${accountId}&startDate=${startDate}&endDate=${endDate}`
    )
  }

  return (
    <div
      style={{
        padding: 24,
        background: "#EFF4FB",
        minHeight: "100vh",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <style>{`
        .tb-card {
          background: white;
          border-radius: 12px;
          border: 1px solid #E2E8F0;
          padding: 16px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .tb-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .tb-summary-item {
          background: white;
          border-radius: 12px;
          padding: 18px 20px;
          border: 1px solid #E2E8F0;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .tb-table-header {
          display: grid;
          grid-template-columns: 80px 1fr 80px 100px 100px 50px;
          padding: 10px 20px;
          background: #F8FAFC;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: #94A3B8;
          border-bottom: 1px solid #E2E8F0;
        }
        .tb-row {
          display: grid;
          grid-template-columns: 80px 1fr 80px 100px 100px 50px;
          padding: 10px 20px;
          border-bottom: 1px solid #F1F5F9;
          font-size: 13px;
          align-items: center;
          transition: background 0.15s;
          cursor: pointer;
        }
        .tb-row:hover {
          background: #FAFBFF;
        }
        .tb-row:last-child { border-bottom: none; }
        .tb-link-icon { opacity: 0; transition: opacity 0.15s; }
        .tb-row:hover .tb-link-icon { opacity: 1; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => router.push("/dashboard/reports")}
          style={{
            background: "white",
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>
            ⚖️ Trial Balance
          </h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>
            All accounts • click any row to view ledger
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="tb-summary-grid">
        <div className="tb-summary-item">
          <div style={{ background: "#FEE2E2", borderRadius: 10, padding: 10 }}>
            <Wallet size={24} color="#EF4444" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
              Total Debits
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4444" }}>
              PKR {totalDebit.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div style={{ background: "#D1FAE5", borderRadius: 10, padding: 10 }}>
            <BarChart3 size={24} color="#10B981" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
              Total Credits
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10B981" }}>
              PKR {totalCredit.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="tb-summary-item">
          <div
            style={{
              background: isBalanced ? "#D1FAE5" : "#FEE2E2",
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Scale size={24} color={isBalanced ? "#10B981" : "#EF4444"} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
              Status
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: isBalanced ? "#10B981" : "#EF4444",
              }}
            >
              {isBalanced ? "✅ Balanced" : "❌ Not Balanced"}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
          Loading accounts…
        </div>
      ) : (
        <div className="tb-card" style={{ padding: 0, overflowX: "auto" }}>
          <div className="tb-table-header">
            <span>Code</span>
            <span>Name</span>
            <span>Type</span>
            <span style={{ textAlign: "right" }}>Debit</span>
            <span style={{ textAlign: "right" }}>Credit</span>
            <span></span> {/* arrow */}
          </div>
          {tb.map((a, i) => (
            <div
              key={a.id}
              className="tb-row"
              onClick={() => openLedger(a.id, a.code)}
              title={`View ledger for ${a.code} – ${a.name}`}
            >
              <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{a.code}</span>
              <span style={{ color: "#334155" }}>{a.name}</span>
              <span style={{ fontSize: 10, color: "#64748B" }}>{a.type}</span>
              <span
                style={{
                  textAlign: "right",
                  color: a.debit > 0 ? "#EF4444" : "#94A3B8",
                  fontWeight: a.debit > 0 ? 600 : 400,
                }}
              >
                {a.debit > 0 ? `PKR ${a.debit.toLocaleString()}` : "-"}
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: a.credit > 0 ? "#10B981" : "#94A3B8",
                  fontWeight: a.credit > 0 ? 600 : 400,
                }}
              >
                {a.credit > 0 ? `PKR ${a.credit.toLocaleString()}` : "-"}
              </span>
              <span
                className="tb-link-icon"
                style={{ textAlign: "center", color: "#1D4ED8" }}
              >
                <ArrowRight size={14} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}