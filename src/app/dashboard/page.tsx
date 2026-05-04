"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  TrendingUp, TrendingDown, Building2, AlertTriangle,
  Clock, Package, Users, CreditCard, ArrowUpRight,
  RefreshCw, WifiOff, CheckCircle2, MessageCircle,
} from "lucide-react"

interface MonthlyData { labels: string[]; values: number[] }

const PKR = (n: number) => "PKR " + new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n)
const SHORT = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (a >= 1_000)     return (n / 1_000).toFixed(0) + "K"
  return String(n)
}
const waLink = (phone: string, no: string, bal: number, name: string) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(`Dear ${name},\nPayment of PKR ${bal.toLocaleString()} for invoice ${no} is overdue.\nPlease clear at your earliest convenience. 🙏`)}`

// ── DB‑validated active company ID (matches Data Management) ──
async function getActiveCompanyId(supabase: any): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return '00000000-0000-0000-0000-000000000001'

    const cookieMatch = document.cookie.match(/(?:^| )active_company_id=([^;]+)/)
    const candidateId = cookieMatch ? cookieMatch[2] : (user.app_metadata as any)?.company_id

    const { data: activeRole } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (activeRole?.company_id) return activeRole.company_id

    if (candidateId) {
      const { data: anyRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .eq('company_id', candidateId)
        .maybeSingle()
      if (anyRole) return candidateId
    }

    const { data: first } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    return first?.company_id || '00000000-0000-0000-0000-000000000001'
  } catch {
    return '00000000-0000-0000-0000-000000000001'
  }
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return null
  const W = 200, H = 32, P = 3
  const mn = Math.min(...values), mx = Math.max(...values), rng = mx - mn || 1
  const pts = values.map((v, i) => ({ x: P + (i / (values.length - 1)) * (W - P * 2), y: H - P - ((v - mn) / rng) * (H - P * 2) }))
  const line = pts.map(p => `${p.x},${p.y}`).join(" ")
  const area = `${P},${H} ${line} ${W - P},${H}`
  const uid  = `s${color.replace("#", "")}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 32, display: "block", marginTop: 4 }}>
      <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={area} fill={`url(#${uid})`}/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function BarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  const max = Math.max(...values.map(Math.abs), 1)
  const hasNeg = values.some(v => v < 0)
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, padding: "0 2px" }}>
      {values.map((v, i) => {
        const pct = Math.abs(v) / max, barH = Math.max(pct * (hasNeg ? 42 : 78), 3), neg = v < 0
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: hasNeg ? "center" : "flex-end" }}>
            {neg
              ? <><div style={{ flex: 1 }}/><div style={{ width: "100%", height: barH, background: "#EF4444", borderRadius: "0 0 3px 3px", opacity: .8 }}/><div style={{ width: "100%", height: 1, background: "#E2E8F0" }}/></>
              : <><div style={{ flex: 1 }}/><div style={{ width: "100%", height: barH, background: color, borderRadius: "3px 3px 0 0", opacity: .85 }}/>{hasNeg && <div style={{ width: "100%", height: 1, background: "#E2E8F0" }}/>}</>
            }
            <span style={{ fontSize: 9, color: "#94A3B8", marginTop: 3, whiteSpace: "nowrap" }}>{labels[i]}</span>
          </div>
        )
      })}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, marginTop: 2 }}>
      <div style={{ width: 3, height: 14, background: "#1E3A8A", borderRadius: 2, flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1E3A8A" }}>{children}</span>
    </div>
  )
}

function KpiCard({ label, value, subtitle, accent, icon, isCurrency = true, trend, href }: {
  label: string; value: number; subtitle: string; accent: string;
  icon: React.ReactNode; isCurrency?: boolean; trend?: number[]; href?: string
}) {
  const display = isCurrency ? `PKR ${SHORT(value)}` : value.toLocaleString()
  return (
    <div
      style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", borderTop: `3px solid ${accent}`, display: "flex", flexDirection: "column", transition: "box-shadow .15s,transform .15s", cursor: href ? "pointer" : "default", overflow: "hidden", height: "100%" }}
      onClick={() => { if (href) window.location.href = href }}
      onMouseEnter={e => { if (href) { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow = "0 4px 18px rgba(30,58,138,.11)"; d.style.transform = "translateY(-1px)" } }}
      onMouseLeave={e => { if (href) { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow = "none"; d.style.transform = "none" } }}
    >
      <div style={{ padding: "10px 12px 0", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>{label}</span>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        <div style={{ fontSize: "clamp(13px,1.4vw,20px)", fontWeight: 800, color: accent, lineHeight: 1.1, marginBottom: 2 }}>{display}</div>
        <div style={{ fontSize: "clamp(9px,0.7vw,11px)", color: "#94A3B8", marginBottom: 5 }}>{subtitle}</div>
        {trend && trend.length >= 2 && (
          <div style={{ marginLeft: -12, marginRight: -12 }}>
            <Sparkline values={trend} color={accent}/>
          </div>
        )}
      </div>
      <div style={{ padding: "4px 12px", background: "#F8FAFC", borderTop: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "clamp(9px,0.7vw,11px)", fontWeight: 600, color: href ? "#1E3A8A" : "#475569" }}>
        <span>{href ? "Open" : "View details"}</span>
        {href && <ArrowUpRight size={12}/>}
      </div>
    </div>
  )
}

function ChartCard({ title, badge, badgeColor, labels, values, color }: {
  title: string; badge: string; badgeColor: string; labels: string[]; values: number[]; color: string
}) {
  return (
    <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: "10px 12px 9px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: "clamp(11px,0.9vw,13px)", fontWeight: 700, color: "#1E293B" }}>{title}</span>
        <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: badgeColor + "22", color: badgeColor, border: `1px solid ${badgeColor}44` }}>{badge}</span>
      </div>
      {labels.length
        ? <BarChart labels={labels} values={values} color={color}/>
        : <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", fontSize: 12 }}>No data yet</div>
      }
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [kpis,        setKpis]        = useState({ assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0, profit: 0 })
  const [ops,         setOps]         = useState({ receivables: 0, unpaid_invoices: 0, partial_invoices: 0, payables: 0, low_stock: 0, total_products: 0, total_customers: 0, total_suppliers: 0 })
  const [incomeChart, setIncomeChart] = useState<MonthlyData>({ labels: [], values: [] })
  const [profitChart, setProfitChart] = useState<MonthlyData>({ labels: [], values: [] })
  const [overdue,     setOverdue]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [online,      setOnline]      = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [companyId,   setCompanyId]   = useState<string | null>(null)

  const fetchData = async (cid: string) => {
    setRefreshing(true)
    const today = new Date().toISOString().split("T")[0]

    const monthRanges = Array.from({ length: 6 }, (_, i) => {
      const d = new Date()
      d.setMonth(d.getMonth() - (5 - i))
      return {
        label: d.toLocaleString("default", { month: "short" }),
        start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
        end:   new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0],
      }
    })

    try {
      const accountPromise = supabase.from("accounts").select("type,balance").eq("company_id", cid)
      const custCountPromise = supabase.from("customers").select("*", { count: "exact", head: true }).eq("company_id", cid)
      const suppCountPromise = supabase.from("suppliers").select("*", { count: "exact", head: true }).eq("company_id", cid)
      const prodCountPromise = supabase.from("products").select("*", { count: "exact", head: true }).eq("company_id", cid)
      const unpaidInvsPromise = supabase.from("invoices").select("total,paid,status").eq("company_id", cid).eq("type", "sale").neq("status", "Paid")
      const payablesPromise = supabase.from("accounts").select("balance").eq("company_id", cid).eq("code", "2000").single()
      const prodsPromise = supabase.from("products").select("qty_on_hand,reorder_level").eq("company_id", cid)
      const overduePromise = supabase.from("invoices").select("id,invoice_no,total,paid,due_date,party_id").eq("company_id", cid).eq("type", "sale").lt("due_date", today).neq("status", "Paid").limit(5)
      const monthlyPromises = monthRanges.flatMap(({ start, end }) => [
        supabase.from("invoices").select("total").eq("company_id", cid).eq("type", "sale").gte("date", start).lte("date", end),
        supabase.from("invoices").select("total").eq("company_id", cid).eq("type", "purchase").gte("date", start).lte("date", end),
      ])

      const [accountsRes, custCountRes, suppCountRes, prodCountRes,
             unpaidInvsRes, payablesRes, prodsRes, overdueRes, ...monthlyRes] =
        await Promise.all([
          accountPromise, custCountPromise, suppCountPromise, prodCountPromise,
          unpaidInvsPromise, payablesPromise, prodsPromise, overduePromise,
          ...monthlyPromises,
        ].map(p => Promise.resolve(p).catch(e => { console.warn("Dashboard sub-fetch failed", e); return null })))

      // ── Accounts → KPIs (safe with guard) ────────────────
      const rawAccounts = accountsRes?.data
      if (!Array.isArray(rawAccounts)) {
        setKpis({ assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0, profit: 0 })
      } else {
        const a = { Asset: 0, Liability: 0, Equity: 0, Revenue: 0, Expense: 0 }
        rawAccounts.forEach((acc: any) => {
          if (acc?.type && acc.type in a) {
            a[acc.type as keyof typeof a] += Number(acc.balance || 0)
          }
        })
        setKpis({
          assets: a.Asset,
          liabilities: a.Liability,
          equity: a.Equity,
          revenue: a.Revenue,
          expenses: a.Expense,
          profit: a.Revenue - a.Expense,
        })
      }

      // ── Operations (receivables) ─────────────────────────
      const unpaidData = unpaidInvsRes?.data
      let receivables = 0, unpaid = 0, partial = 0
      if (Array.isArray(unpaidData)) {
        unpaidData.forEach((inv: any) => {
          receivables += (inv.total || 0) - (inv.paid || 0)
          if (inv.status === "Unpaid") unpaid++
          if (inv.status === "Partial") partial++
        })
      }

      // ── Payables (safe extraction) ───────────────────────
      const payablesData = payablesRes?.data
      const payables = (!Array.isArray(payablesData) && payablesData?.balance != null) ? payablesData.balance : 0

      // ── Low stock ────────────────────────────────────────
      const prodsData = prodsRes?.data
      const lowStock = Array.isArray(prodsData)
        ? prodsData.filter((p: any) => p.qty_on_hand > 0 && p.qty_on_hand <= p.reorder_level).length
        : 0

      // ── All operations in one update ─────────────────────
      setOps({
        receivables,
        unpaid_invoices: unpaid,
        partial_invoices: partial,
        payables,
        low_stock: lowStock,
        total_products: (prodCountRes as any)?.count || 0,
        total_customers: (custCountRes as any)?.count || 0,
        total_suppliers: (suppCountRes as any)?.count || 0,
      })

      // ── Overdue invoices (safe map) ──────────────────────
      const overdueData = Array.isArray(overdueRes?.data) ? overdueRes.data : []
      const partyIds = overdueData.map((i: any) => i.party_id).filter(Boolean)

      let customerMap: Record<number, { name: string; phone: string }> = {}
      if (partyIds.length > 0) {
        try {
          const { data: custData } = await supabase.from("customers").select("id,name,phone").in("id", partyIds).eq("company_id", cid)
          if (Array.isArray(custData)) {
            custData.forEach((c: any) => { customerMap[c.id] = { name: c.name, phone: c.phone } })
          }
        } catch {}
      }
      setOverdue(
        overdueData.map((inv: any) => ({
          id: inv.id,
          invoice_no: inv.invoice_no,
          customer_name: customerMap[inv.party_id]?.name || "Unknown",
          customer_phone: customerMap[inv.party_id]?.phone || "",
          balance: (inv.total || 0) - (inv.paid || 0),
          due_date: inv.due_date,
        }))
      )

      // ── Monthly charts (safe reduce) ─────────────────────
      const months: string[] = [], revValues: number[] = [], profitValues: number[] = []
      monthRanges.forEach(({ label }, i) => {
        const revData = (monthlyRes[i * 2] as any)?.data
        const expData = (monthlyRes[i * 2 + 1] as any)?.data
        const rev = Array.isArray(revData) ? revData.reduce((s: number, r: any) => s + (r.total || 0), 0) : 0
        const exp = Array.isArray(expData) ? expData.reduce((s: number, r: any) => s + (r.total || 0), 0) : 0
        months.push(label); revValues.push(rev); profitValues.push(rev - exp)
      })
      setIncomeChart({ labels: months, values: revValues })
      setProfitChart({ labels: months, values: profitValues })

    } catch (e) { console.error("Dashboard fetch error", e) }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    getActiveCompanyId(supabase).then(cid => {
      setCompanyId(cid)
      fetchData(cid)
    })
  }, [])

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener("online", on); window.addEventListener("offline", off)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [])

  useEffect(() => {
    if (!companyId) return
    const interval = setInterval(() => fetchData(companyId), 30000)
    return () => clearInterval(interval)
  }, [companyId])

  if (loading) return (
    <div style={{ padding: "8px", background: "#EFF4FB", minHeight: "100%", width: "100%" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 7, marginBottom: 10 }}>
        {[...Array(8)].map((_, i) => <div key={i} style={{ height: 100, background: "#F1F5F9", borderRadius: 10, animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 80}ms` }}/>)}
      </div>
      <div style={{ height: 140, background: "#F1F5F9", borderRadius: 10, animation: "pulse 1.5s ease-in-out infinite" }}/>
    </div>
  )

  const profitable = kpis.profit >= 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 7px;
          margin-bottom: 7px;
          width: 100%;
        }
        .chart-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 7px;
          margin-bottom: 7px;
          width: 100%;
        }
        .ov-header { display: grid; grid-template-columns: 1fr 110px 140px 100px; padding: 7px 12px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #94A3B8; }
        .ov-row { display: grid; grid-template-columns: 1fr 110px 140px 100px; padding: 9px 12px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: clamp(11px,0.9vw,12.5px); }
        .ov-row:last-child { border-bottom: none; }
        .ov-row:hover { background: #FAFBFF; }
        .ov-bal-inline { display: none; }

        @media (max-width: 900px) {
          .kpi-grid   { grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 6px; }
          .chart-grid { grid-template-columns: 1fr; gap: 6px; }
          .ov-header  { grid-template-columns: 1fr 110px 100px; }
          .ov-row     { grid-template-columns: 1fr 110px 100px; }
          .ov-col-bal { display: none !important; }
          .ov-bal-inline { display: block !important; }
        }
        @media (max-width: 600px) {
          .kpi-grid   { gap: 5px; margin-bottom: 5px; }
          .chart-grid { gap: 5px; margin-bottom: 5px; }
        }
        @media (max-width: 480px) {
          .ov-header { display: none !important; }
          .ov-row { grid-template-columns: 1fr 1fr !important; grid-template-rows: auto auto; gap: 4px; padding: 8px 10px; }
        }
        @media (max-width: 360px) {
          .kpi-grid { grid-template-columns: 1fr; }
        }
        @media (min-width: 2560px) {
          .dash-content { max-width: 2200px; margin: 0 auto; }
        }
      `}</style>

      <div style={{
        padding: "4px 6px 8px",
        background: "#EFF4FB",
        minHeight: "100%",
        width: "100%",
        fontFamily: "'Plus Jakarta Sans',sans-serif",
      }}>
        <div className="dash-content">

          {!online && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "7px 12px", borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
              <WifiOff size={14}/> You are offline
            </div>
          )}

          {/* Financial Overview + Refresh */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, marginTop: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 3, height: 14, background: "#1E3A8A", borderRadius: 2, flexShrink: 0 }}/>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1E3A8A" }}>Financial Overview</span>
            </div>
            <button onClick={() => companyId && fetchData(companyId)} disabled={refreshing}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "white", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 11, fontWeight: 600, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}>
              <RefreshCw size={12} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}/> Refresh
            </button>
          </div>

          <div className="kpi-grid">
            <KpiCard label="Total Assets"      value={kpis.assets}      subtitle="All company resources"   accent="#1E3A8A" icon={<Building2 size={13}/>}   trend={incomeChart.values} href="/dashboard/reports/balance-sheet"/>
            <KpiCard label="Total Liabilities" value={kpis.liabilities} subtitle="Outstanding obligations" accent="#EF4444" icon={<TrendingDown size={13}/>} trend={incomeChart.values.map(v => v * 0.4)} href="/dashboard/reports/balance-sheet"/>
            <KpiCard label="Owner's Equity"    value={kpis.equity}      subtitle="Net worth"               accent="#1D4ED8" icon={<CreditCard size={13}/>}   trend={incomeChart.values.map(v => v * 0.5)} href="/dashboard/reports/balance-sheet"/>
            <KpiCard label="Net Profit"        value={kpis.profit}      subtitle="Revenue − Expenses"      accent={profitable ? "#10B981" : "#EF4444"} icon={profitable ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} trend={profitChart.values} href="/dashboard/reports/profit-loss"/>
          </div>

          <SectionLabel>Operations</SectionLabel>
          <div className="kpi-grid">
            <KpiCard label="Receivables" value={ops.receivables}     subtitle={`${ops.unpaid_invoices} unpaid · ${ops.partial_invoices} partial`} accent="#F59E0B" icon={<Clock size={13}/>}        trend={incomeChart.values.map(v => v * 0.2)}  href="/dashboard/reports/ar-aging"/>
            <KpiCard label="Payables"    value={ops.payables}        subtitle="Outstanding supplier bills" accent="#EF4444" icon={<TrendingDown size={13}/>} trend={incomeChart.values.map(v => v * 0.15)} href="/dashboard/reports/ar-aging"/>
            <KpiCard label="Low Stock"   value={ops.low_stock}       subtitle={`of ${ops.total_products} products`} accent="#F97316" icon={<Package size={13}/>} isCurrency={false} trend={incomeChart.values.map(v => Math.max(0, v * 0.01))} href="/dashboard/products"/>
            <KpiCard label="Customers"   value={ops.total_customers} subtitle={`${ops.total_suppliers} suppliers · ${ops.total_products} SKUs`} accent="#0EA5E9" icon={<Users size={13}/>} isCurrency={false} trend={incomeChart.values.map(v => Math.max(1, v * 0.03))} href="/dashboard/customers"/>
          </div>

          <SectionLabel>Monthly Trends</SectionLabel>
          <div className="chart-grid">
            <ChartCard title="Monthly Revenue" badge="Last 6 months" badgeColor="#1D4ED8" labels={incomeChart.labels} values={incomeChart.values} color="#1D4ED8"/>
            <ChartCard title="Monthly Profit"  badge="Last 6 months" badgeColor="#10B981" labels={profitChart.labels} values={profitChart.values} color={profitChart.values.every(v => v >= 0) ? "#10B981" : "#1D4ED8"}/>
          </div>

          <SectionLabel>Overdue Invoice Reminders</SectionLabel>
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 8, width: "100%" }}>
            {overdue.length === 0
              ? <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, color: "#10B981", fontSize: 13, fontWeight: 500 }}><CheckCircle2 size={16}/> No overdue invoices — all clear!</div>
              : <>
                  <div className="ov-header">
                    <span>Invoice / Customer</span><span>Due Date</span>
                    <span className="ov-col-bal" style={{ textAlign: "right" }}>Balance</span>
                    <span style={{ textAlign: "right" }}>Action</span>
                  </div>
                  {overdue.map(inv => (
                    <div key={inv.id} className="ov-row">
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: "#1E293B" }}>{inv.invoice_no}</span>
                        <span style={{ color: "#64748B", marginLeft: 6, fontSize: 11 }}>{inv.customer_name}</span>
                        <div className="ov-bal-inline" style={{ fontSize: 11, color: "#1E293B", fontWeight: 700, marginTop: 2 }}>{PKR(inv.balance)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#EF4444", fontWeight: 600, fontSize: 11 }}>
                        <AlertTriangle size={11}/> {inv.due_date}
                      </div>
                      <div className="ov-col-bal" style={{ textAlign: "right", fontWeight: 700, color: "#1E293B", fontSize: 12 }}>{PKR(inv.balance)}</div>
                      <div style={{ textAlign: "right" }}>
                        {inv.customer_phone
                          ? <a href={waLink(inv.customer_phone, inv.invoice_no, inv.balance, inv.customer_name)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#25D366", color: "white", padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}><MessageCircle size={11}/> Remind</a>
                          : <span style={{ fontSize: 10, color: "#CBD5E1" }}>No phone</span>
                        }
                      </div>
                    </div>
                  ))}
                </>
            }
          </div>

          <div style={{ background: "white", borderRadius: 8, border: "1px solid #E2E8F0", padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: profitable ? "#10B981" : "#EF4444", boxShadow: `0 0 0 3px ${profitable ? "#10B98133" : "#EF444433"}`, flexShrink: 0 }}/>
              <span style={{ fontSize: 12, color: "#64748B" }}>Business Health: <strong style={{ color: profitable ? "#10B981" : "#EF4444" }}>{profitable ? "Profitable" : "Loss-Making"}</strong></span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[["Revenue", PKR(kpis.revenue)], ["Expenses", PKR(kpis.expenses)], ["Products", String(ops.total_products)], ["Customers", String(ops.total_customers)]].map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, color: "#64748B" }}>{k}: <strong style={{ color: "#1E293B" }}>{v}</strong></span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}