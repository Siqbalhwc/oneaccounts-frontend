"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useDashboardData } from "@/hooks/useDashboardData"
import { useRole } from "@/contexts/RoleContext"
import {
  TrendingUp, TrendingDown, AlertTriangle, Users,
  Building2, Truck, Box, DollarSign, BarChart3
} from "lucide-react"

/* ── Format large numbers (millions) ── */
const formatPKR = (val: number) => {
  if (Math.abs(val) >= 1_000_000) return `PKR ${(val / 1_000_000).toFixed(1)}M`
  return `PKR ${val.toLocaleString()}`
}

export default function ManagementDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { data: kpis, isLoading } = useDashboardData()
  // const { role } = useRole() // already passed as prop
  const canEdit = role === "admin" || role === "accountant"

  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingDonors, setLoadingDonors] = useState(true)

  useEffect(() => {
    supabase.from("projects").select("id, name").is("deleted_at", null).order("name")
      .then(r => { setProjects(r.data || []); setLoadingProjects(false) })
    supabase.from("donors").select("id, name").is("deleted_at", null).order("name")
      .then(r => { setDonors(r.data || []); setLoadingDonors(false) })
  }, [])

  if (isLoading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading dashboard…</div>

  const {
    assets = 0, liabilities = 0, equity = 0,
    revenue = 0, expenses = 0, profit = 0,
    receivables = 0, payables = 0, unpaid_count = 0,
    total_customers = 0, total_suppliers = 0, total_products = 0,
    low_stock = 0
  } = kpis || {}

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#0B1120", minHeight: "100vh", color: "#E2E8F0" }}>
      {/* Alert banner – dark background, blue left border */}
      {unpaid_count > 0 && (
        <div style={{
          background: "#1E293B", borderLeft: "4px solid #2563EB",
          padding: "14px 18px", borderRadius: 10, marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          color: "#FCA5A5"
        }}>
          <div>
            <strong>⚠️ Attention:</strong> You have {unpaid_count} unpaid invoices.
            Overspent projects need review.
          </div>
          <button
            onClick={() => router.push("/dashboard/reports/overspent")}
            style={{
              background: "#2563EB", color: "white", border: "none",
              padding: "8px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer"
            }}
          >
            View Overspent
          </button>
        </div>
      )}

      {/* KPI cards – dark cards, light text */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div style={{ background: "#111827", borderRadius: 12, padding: 18, border: "1px solid #1E293B" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>💰 Total Budget</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9" }}>{formatPKR(receivables + payables + revenue)}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>4 projects</div>
        </div>
        <div style={{ background: "#111827", borderRadius: 12, padding: 18, border: "1px solid #1E293B" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>📊 Total Spent</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#FCA5A5" }}>{formatPKR(expenses)}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>143% of total budget</div>
        </div>
        <div style={{ background: "#111827", borderRadius: 12, padding: 18, border: "1px solid #1E293B" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>⚠️ Over Spent</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#EF4444" }}>{formatPKR(expenses - revenue)}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>2 projects</div>
        </div>
        <div style={{ background: "#111827", borderRadius: 12, padding: 18, border: "1px solid #1E293B" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>📈 Portfolio Health</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#F59E0B" }}>75%</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>Health score</div>
        </div>
      </div>

      {/* Two‑column layout: Project Utilization & Donor Balances */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Project Utilization */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>📂 Project Utilization</h3>
          {loadingProjects ? (
            <div style={{ color: "#94A3B8" }}>Loading projects…</div>
          ) : projects.length === 0 ? (
            <div style={{ color: "#94A3B8" }}>No projects found.</div>
          ) : (
            projects.slice(0, 5).map((proj: any) => (
              <div key={proj.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", borderRadius: 8,
                background: "#111827", border: "1px solid #1E293B", marginBottom: 6
              }}>
                <span style={{ fontWeight: 600, color: "#E2E8F0" }}>{proj.name}</span>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>Budget: PKR 1.2M | Spent: PKR 0.8M</span>
                <span style={{ background: "#EF4444", color: "white", borderRadius: 100, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>Over</span>
              </div>
            ))
          )}
        </div>

        {/* Donor Balances */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>🏦 Donor Balances</h3>
          {loadingDonors ? (
            <div style={{ color: "#94A3B8" }}>Loading donors…</div>
          ) : donors.length === 0 ? (
            <div style={{ color: "#94A3B8" }}>No donors found.</div>
          ) : (
            donors.slice(0, 5).map((don: any) => (
              <div key={don.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", borderRadius: 8,
                background: "#111827", border: "1px solid #1E293B", marginBottom: 6
              }}>
                <span style={{ fontWeight: 600, color: "#E2E8F0" }}>{don.name}</span>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>Balance: PKR 2.5M</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CRM Card */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>🧑‍🤝‍🧑 CRM</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div style={{ background: "#111827", borderRadius: 12, padding: 18, border: "1px solid #1E293B" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>👥 Customers</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9" }}>{total_customers}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Active</div>
          </div>
          <div style={{ background: "#111827", borderRadius: 12, padding: 18, border: "1px solid #1E293B" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>💼 Investors</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9" }}>—</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Coming soon</div>
          </div>
          <div style={{ background: "#111827", borderRadius: 12, padding: 18, border: "1px solid #1E293B" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>🚚 Suppliers</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9" }}>{total_suppliers}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Active</div>
          </div>
        </div>
      </div>

      {/* Bottom summary bar – dark bar, light text */}
      <div style={{
        background: "#0F172A", borderTop: "1px solid #1E293B",
        padding: "14px 24px", display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 12, color: "#E2E8F0"
      }}>
        <span>⚠️ Portfolio Health: Needs Attention</span>
        <span>💰 Total Budget: {formatPKR(receivables + payables + revenue)}</span>
        <span>📈 Utilized: 143%</span>
        <span>📁 Projects: {projects.length}</span>
      </div>
    </div>
  )
}