"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Bell } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"
import { useCompany } from "@/contexts/CompanyContext"

// ── Animated number ─────────────────────────────────────────
function useAnimatedNumber(target: number, duration = 500) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const start = prev.current
    const diff = target - start
    if (diff === 0) return
    const startTime = performance.now()
    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + diff * ease)
      if (progress < 1) requestAnimationFrame(tick)
      else prev.current = target
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return display
}

// ── Period types ────────────────────────────────────────────
type PeriodKey = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_year" | "last_year" | "last_12_months" | "all"

interface PeriodOption { label: string; key: PeriodKey }

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: "This Month",     key: "this_month" },
  { label: "Last Month",     key: "last_month" },
  { label: "This Quarter",   key: "this_quarter" },
  { label: "Last Quarter",   key: "last_quarter" },
  { label: "This Year",      key: "this_year" },
  { label: "Last Year",      key: "last_year" },
  { label: "Last 12 Months", key: "last_12_months" },
  { label: "All Time",       key: "all" },
]

function getPeriodDates(key: PeriodKey): { start: string | null; end: string | null } {
  const now   = new Date()
  const y     = now.getFullYear()
  const m     = now.getMonth()
  const pad   = (n: number) => String(n).padStart(2, "0")
  const ymd   = (d: Date)   => d.toISOString().split("T")[0]
  const qStart = (q: number, yr: number) => new Date(yr, q * 3, 1)
  const qEnd   = (q: number, yr: number) => new Date(yr, q * 3 + 3, 0)
  const cq     = Math.floor(m / 3)

  switch (key) {
    case "this_month":
      return { start: `${y}-${pad(m + 1)}-01`, end: ymd(new Date(y, m + 1, 0)) }
    case "last_month": {
      const lm = m === 0 ? 11 : m - 1
      const ly = m === 0 ? y - 1 : y
      return { start: `${ly}-${pad(lm + 1)}-01`, end: ymd(new Date(ly, lm + 1, 0)) }
    }
    case "this_quarter":
      return { start: ymd(qStart(cq, y)), end: ymd(qEnd(cq, y)) }
    case "last_quarter": {
      const lq  = cq === 0 ? 3 : cq - 1
      const lqy = cq === 0 ? y - 1 : y
      return { start: ymd(qStart(lq, lqy)), end: ymd(qEnd(lq, lqy)) }
    }
    case "this_year":
      return { start: `${y}-01-01`, end: `${y}-12-31` }
    case "last_year":
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    case "last_12_months": {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1)
      return { start: ymd(d), end: ymd(now) }
    }
    case "all":
    default:
      return { start: null, end: null }
  }
}

// ── Bell notification with dropdown ────────────────────────
function BellNotification({
  count,
  label,
  items,
  onViewAll,
  isDark,
}: {
  count: number
  label: string
  items: { title: string; subtitle: string; amount?: string }[]
  onViewAll: () => void
  isDark: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const hasItems = count > 0

  return (
    <div ref={ref} style={{ position: "relative", textAlign: "center", userSelect: "none" }}>
      {/* ... unchanged ... */}
      <div
        onClick={() => (hasItems ? setOpen(o => !o) : onViewAll())}
        style={{
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38, height: 38,
          borderRadius: "50%",
          background: hasItems
            ? isDark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)"
            : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          border: hasItems ? "1px solid rgba(239,68,68,0.35)" : "1px solid var(--border)",
          transition: "all 0.18s",
          position: "relative",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = hasItems
            ? isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.15)"
            : isDark ? "rgba(255,255,255,0.1)"  : "rgba(0,0,0,0.08)"
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = hasItems
            ? isDark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)"
            : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"
        }}
      >
        <Bell size={17} color={hasItems ? "#EF4444" : "var(--text-muted)"} style={hasItems ? { animation: "bellShake 0.6s ease" } : undefined} />
        {hasItems && (
          <span style={{
            position: "absolute", top: -3, right: -3,
            background: "#EF4444", color: "#fff",
            fontSize: 9, fontWeight: 700,
            borderRadius: 10, minWidth: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: "1.5px solid var(--bg)",
          }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </div>
      {/* ... remaining bell dropdown unchanged ... */}
      <div style={{ fontSize: 9, marginTop: 3, fontWeight: hasItems ? 700 : 400, color: hasItems ? "#EF4444" : "var(--text-muted)" }}>{label}</div>
      {open && hasItems && (
        <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 290, background: isDark ? "#1E293B" : "#FFFFFF", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 12, boxShadow: isDark ? "0 16px 48px rgba(0,0,0,0.7)" : "0 16px 48px rgba(0,0,0,0.15)", zIndex: 999, overflow: "hidden" }}>
          <div style={{ padding: "9px 14px 8px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.05em" }}>{count} Overdue {label}</span>
            <button onClick={(e) => { e.stopPropagation(); setOpen(false); onViewAll() }} style={{ fontSize: "0.7rem", color: "#93C5FD", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>View All →</button>
          </div>
          <div style={{ maxHeight: 230, overflowY: "auto" }}>
            {items.slice(0, 8).map((item, i) => (
              <div key={i} style={{ padding: "8px 14px", borderBottom: i < Math.min(items.length, 8) - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)" }}>{item.title}</div>
                  <div style={{ fontSize: "0.68rem", color: "#EF4444", marginTop: 2 }}>{item.subtitle}</div>
                </div>
                {item.amount && <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>{item.amount}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Odoo-style loading screen (unchanged) ──────────────────
const LOADING_STEPS = [
  { icon: "🏗️", text: "Setting up your workspace…" },
  { icon: "📊", text: "Configuring chart of accounts…" },
  { icon: "🔐", text: "Applying security policies…" },
  { icon: "✨", text: "Almost ready — brewing the numbers…" },
]

function OdooLoader({ isDark }: { isDark: boolean }) {
  // ... unchanged ...
}

// ── New company empty state (unchanged) ─────────────────────
function NewCompanyEmptyState({ router, isDark, userDisplayName }: { router: any; isDark: boolean; userDisplayName: string }) {
  // ... unchanged ...
}

// ── Interfaces ──────────────────────────────────────────────
interface MonthlyProfit  { month: string; profit: number }
interface TopCustomer    { name: string; revenue: number; outstanding: number }
interface OverdueItem    { id: string; invoice_no: string; total: number; due_date: string; customer_name?: string }

// ── Main component ──────────────────────────────────────────
export default function TradingServiceDashboard({ role }: { role: string }) {
  const router = useRouter()
  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark"
  const { companyId, isLoading: companyLoading } = useCompany()   // ← now uses loading flag

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [userDisplayName, setUserDisplayName]   = useState("")
  const [businessType,    setBusinessType]       = useState("")
  const [loading,         setLoading]            = useState(true)
  const [selectedPeriod,  setSelectedPeriod]     = useState<PeriodKey>("all")
  const [isNewCompany,    setIsNewCompany]        = useState(false)

  // KPIs
  const [revenueTotal,        setRevenueTotal]        = useState(0)
  const [expenseTotal,        setExpenseTotal]         = useState(0)
  const [cashBalance,         setCashBalance]          = useState(0)
  const [totalReceivables,    setTotalReceivables]     = useState(0)
  const [totalPayables,       setTotalPayables]        = useState(0)
  const [overdueInvoicesCount, setOverdueInvoicesCount] = useState(0)
  const [overdueBillsCount,   setOverdueBillsCount]   = useState(0)
  const [monthlyProfit,       setMonthlyProfit]        = useState<MonthlyProfit[]>([])
  const [topCustomers,        setTopCustomers]         = useState<TopCustomer[]>([])

  // Overdue detail lists
  const [overdueInvoicesList, setOverdueInvoicesList] = useState<OverdueItem[]>([])
  const [overdueBillsList,    setOverdueBillsList]    = useState<OverdueItem[]>([])

  // ── User name ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserDisplayName(
        (user.user_metadata as any)?.full_name ||
        (user.user_metadata as any)?.name ||
        user.email?.split("@")[0] || "User"
      )
    })
  }, [])

  // ── Business type ──────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    Promise.resolve(
      supabase.from("companies").select("business_type").eq("id", companyId).single()
    ).then(({ data }) => {
      if (data) setBusinessType(data.business_type || "")
    }).catch(() => {})
  }, [companyId])

  // ── Dashboard metrics (runs only when companyId is ready) ──
  useEffect(() => {
    if (!companyId || companyLoading) return   // wait for context to load
    setLoading(true)
    const { start, end } = getPeriodDates(selectedPeriod)

    let finished = false
    const safetyTimer = setTimeout(() => {
      if (!finished) {
        finished = true
        setLoading(false)
      }
    }, 8000)

    const fetchDashboard = async () => {
      try {
        const { data, error } = await supabase.rpc("get_dashboard_metrics", {
          p_company_id: companyId,
          ...(start ? { p_date_from: start } : {}),
          ...(end   ? { p_date_to:   end   } : {}),
        })

        if (!finished) {
          if (error) {
            console.error("Dashboard RPC error:", error)
          } else if (data) {
            const revenue = data.revenueTotal || 0
            const expense = data.expenseTotal || 0
            const cash    = data.cashBalance  || 0
            const recv    = data.totalReceivables || 0
            const pay     = data.totalPayables    || 0

            // Detect new company: all KPIs zero AND no monthly data
            const hasAnyData = revenue > 0 || expense > 0 || cash > 0 || recv > 0 || pay > 0 ||
              (Array.isArray(data.monthlyProfit) && data.monthlyProfit.length > 0)
            setIsNewCompany(!hasAnyData)

            setRevenueTotal(revenue)
            setExpenseTotal(expense)
            setCashBalance(cash)
            setTotalReceivables(recv)
            setTotalPayables(pay)
            setOverdueInvoicesCount(data.overdueInvoicesCount || 0)
            setOverdueBillsCount(data.overdueBillsCount || 0)
            setMonthlyProfit(data.monthlyProfit || [])
            setTopCustomers(data.topCustomers || [])
          }
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err)
      } finally {
        if (!finished) {
          finished = true
          clearTimeout(safetyTimer)
          setLoading(false)
        }
      }
    }

    fetchDashboard()

    return () => {
      clearTimeout(safetyTimer)
      finished = true
    }
  }, [companyId, companyLoading, selectedPeriod])

  // ── Overdue lists (fixed two‑step fetch) ──────────────────
  useEffect(() => {
    if (!companyId) return
    const today = new Date().toISOString().split("T")[0]

    const fetchOverdue = async (type: "sale" | "purchase") => {
      try {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_no, total, due_date, party_id")
          .eq("company_id", companyId)
          .eq("type", type)
          .in("status", ["Unpaid", "Partial"])
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(10)

        if (!invoices || invoices.length === 0) return []

        const partyIds = invoices.map((i: any) => i.party_id).filter(Boolean)
        let nameMap: Record<number, string> = {}
        if (partyIds.length > 0) {
          const table = type === "sale" ? "customers" : "suppliers"
          const { data: parties } = await supabase
            .from(table)
            .select("id, name")
            .in("id", partyIds)
            .eq("company_id", companyId)

          if (parties) parties.forEach((p: any) => { nameMap[p.id] = p.name })
        }

        return invoices.map((inv: any) => ({
          id:            inv.id,
          invoice_no:    inv.invoice_no,
          total:         inv.total || 0,
          due_date:      inv.due_date,
          customer_name: nameMap[inv.party_id] || undefined,
        }))
      } catch (err) {
        console.error(`Overdue ${type} fetch error:`, err)
        return []
      }
    }

    fetchOverdue("sale").then(setOverdueInvoicesList)
    fetchOverdue("purchase").then(setOverdueBillsList)
  }, [companyId])

  // ── Helpers ───────────────────────────────────────────────
  const getGreeting = (): string => {
    const h = new Date().getHours()
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
  }

  const formatPKR = (v: number): string => {
    const sign = v < 0 ? "-" : ""
    const abs  = Math.abs(v)
    if (abs >= 1_000_000) return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}PKR ${(abs / 1_000).toFixed(1)}K`
    return `${sign}PKR ${abs.toLocaleString()}`
  }

  const grossProfit  = revenueTotal - expenseTotal
  const animRevenue  = useAnimatedNumber(revenueTotal, 600)
  const animExpense  = useAnimatedNumber(expenseTotal, 600)
  const animProfit   = useAnimatedNumber(grossProfit,  600)
  const animCash     = useAnimatedNumber(cashBalance,  600)
  const animRecv     = useAnimatedNumber(totalReceivables, 600)
  const animPay      = useAnimatedNumber(totalPayables,    600)

  const maxProfit    = Math.max(...monthlyProfit.map(m => Math.abs(m.profit)), 1)
  const periodLabel  = PERIOD_OPTIONS.find(p => p.key === selectedPeriod)?.label || ""

  const invoiceBellItems = overdueInvoicesList.map(inv => ({
    title:    inv.invoice_no || `INV-${inv.id}`,
    subtitle: `Due ${inv.due_date}${inv.customer_name ? " · " + inv.customer_name : ""}`,
    amount:   formatPKR(inv.total || 0),
  }))
  const billBellItems = overdueBillsList.map(bill => ({
    title:    bill.invoice_no || `BILL-${bill.id}`,
    subtitle: `Due ${bill.due_date}${bill.customer_name ? " · " + bill.customer_name : ""}`,
    amount:   formatPKR(bill.total || 0),
  }))

  // ── Render guards ─────────────────────────────────────────
  // If CompanyContext is still loading, show the animated loader
  if (companyLoading) return <OdooLoader isDark={isDark} />

  // If the context has loaded but no companyId could be resolved
  if (!companyId) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "1.2rem", color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem", marginTop: 8 }}>Account not linked to a company. Contact your administrator.</div>
      </div>
    )
  }

  // If the dashboard data is still loading, show the animated loader
  if (loading) return <OdooLoader isDark={isDark} />

  // If it’s a brand‑new company, show the onboarding checklist
  if (isNewCompany) return <NewCompanyEmptyState router={router} isDark={isDark} userDisplayName={userDisplayName} />

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)", padding: "1rem 1.5rem" }}>
      {/* ... styles and JSX unchanged from the latest version ... */}
      {/* (the rest of the dashboard UI as you already have it) */}
    </div>
  )
}