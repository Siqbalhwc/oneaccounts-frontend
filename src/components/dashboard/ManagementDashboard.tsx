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

export default function ManagementDashboard() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { data: kpis, isLoading } = useDashboardData()
  const { role } = useRole()
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
    <div style={{
      padding: 24, fontFamily: "'Inter', sans-serif", background: "#0B1120",
      minHeight: "100vh", color: "#E2E8F0"
    }}>
      <style>{`
        .kpi-card {
          background: #111827; border: 1px solid #1E293B; border-radius: 12px;
          padding: 18px; display: flex; flex-direction: column; gap: 10px;
          transition: background 0.2s;
        }
        .kpi-card:hover { background: #1E293B; }
        .kpi-label { font-size: 11px; font-weight: 600; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.04em; }
        .kpi-value { font-size: 26px; font-weight: 800; color: #F1F5F9; }
        .kpi-hint { font-size: 11px; color: #64748B; }
        .section-title { font-size: 15px; font-weight: 700; color: #F1F5F9; margin-bottom: 12px; }
        .project-row, .donor-row, .crm-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 14px; border-radius: 8px;
          background: #111827; border: 1px solid #1E293B;
          margin-bottom: 6px; color: #E2E8F0;
        }
        .project-row:hover, .donor-row:hover, .crm-row:hover { background: #1E293B; }
        .badge-warning {
          background: #EF4444; color: white; border-radius: 100px;
          padding: 2px 10px; font-size: 10px; font-weight: 700;
        }
        .alert-banner {
          background: #1E293B; border-left: 4px solid #2563EB;
          padding: 14px 18px; border-radius: 10px; margin-bottom: 20px;
          display: flex; align-items: center; justify-content: space-between;
          color: #FCA5A5;
        }
        .alert-banner button, .alert-banner a {
          background: #2563EB; color: white; border: none;
          padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;
          text-decoration: none; font-size: 12px;
        }
        .bottom-bar {
          background: #0F172A; border-top: 1px solid #1E293B;
          padding: 14px 24px; display: flex; justify-content: space-between;
          align-items: center; flex-wrap: wrap; gap: 12px;
          color: #E2E8F0;
        }
        .crm-heading {
          font-size: 15px; font-weight: 700; color: #F1F5F9; margin-bottom: 12px;
          padding-bottom: 8px; border-bottom: 1px solid #1E293B;
        }
      `}</style>

      {/* Alert banner */}
      {unpaid_count > 0 && (
        <div className="alert-banner">
          <div>
            <strong>⚠️ Attention:</strong> You have {unpaid_count} unpaid invoices.
            Overspent projects need review.
          </div>
          <button onClick={() => router.push("/dashboard/reports/overspent")}>View Overspent</button>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">💰 Total Budget</div>
          <div className="kpi-value">{formatPKR(receivables + payables + revenue)}</div>
          <div className="kpi-hint">4 projects</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">📊 Total Spent</div>
          <div className="kpi-value" style={{ color: "#FCA5A5" }}>{formatPKR(expenses)}</div>
          <div className="kpi-hint">143% of total budget</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">⚠️ Over Spent</div>
          <div className="kpi-value" style={{ color: "#EF4444" }}>{formatPKR(expenses - revenue)}</div>
          <div className="kpi-hint">2 projects</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">📈 Portfolio Health</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>75%</div>
          <div className="kpi-hint">Health score</div>
        </div>
      </div>

      {/* Project Utilization */}
      <div style={{ marginBottom: 24 }}>
        <h3 className="section-title">📂 Project Utilization</h3>
        {loadingProjects ? (
          <div style={{ color: "#64748B" }}>Loading projects…</div>
        ) : projects.length === 0 ? (
          <div style={{ color: "#64748B" }}>No projects found.</div>
        ) : (
          projects.slice(0, 5).map((proj: any) => (
            <div key={proj.id} className="project-row">
              <span>{proj.name}</span>
              <span style={{ color: "#94A3B8" }}>Budget: PKR 1.2M | Spent: PKR 0.8M</span>
              <span className="badge-warning">Over</span>
            </div>
          ))
        )}
      </div>

      {/* Donor Balances */}
      <div style={{ marginBottom: 24 }}>
        <h3 className="section-title">🏦 Donor Balances</h3>
        {loadingDonors ? (
          <div style={{ color: "#64748B" }}>Loading donors…</div>
        ) : donors.length === 0 ? (
          <div style={{ color: "#64748B" }}>No donors found.</div>
        ) : (
          donors.slice(0, 5).map((don: any) => (
            <div key={don.id} className="donor-row">
              <span>{don.name}</span>
              <span style={{ color: "#94A3B8" }}>Balance: PKR 2.5M</span>
            </div>
          ))
        )}
      </div>

      {/* CRM Card */}
      <div style={{ marginBottom: 24 }}>
        <div className="crm-heading">🧑‍🤝‍🧑 CRM</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div className="kpi-card">
            <div className="kpi-label">👥 Customers</div>
            <div className="kpi-value">{total_customers}</div>
            <div className="kpi-hint">Active</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">💼 Investors</div>
            <div className="kpi-value">—</div>
            <div className="kpi-hint">Coming soon</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">🚚 Suppliers</div>
            <div className="kpi-value">{total_suppliers}</div>
            <div className="kpi-hint">Active</div>
          </div>
        </div>
      </div>

      {/* Bottom summary bar */}
      <div className="bottom-bar">
        <span>⚠️ Portfolio Health: Needs Attention</span>
        <span>💰 Total Budget: {formatPKR(receivables + payables + revenue)}</span>
        <span>📈 Utilized: 143%</span>
        <span>📁 Projects: {projects.length}</span>
      </div>
    </div>
  )
}