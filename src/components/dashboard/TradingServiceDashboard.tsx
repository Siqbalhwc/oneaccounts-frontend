"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Bell, Building2, UserPlus, FileText, CreditCard } from "lucide-react"
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
      <div style={{
        fontSize: 9, marginTop: 3, fontWeight: hasItems ? 700 : 400,
        color: hasItems ? "#EF4444" : "var(--text-muted)",
      }}>
        {label}
      </div>
      {open && hasItems && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 10px)", right: 0,
            width: 290,
            background: isDark ? "#1E293B" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            borderRadius: 12,
            boxShadow: isDark ? "0 16px 48px rgba(0,0,0,0.7)" : "0 16px 48px rgba(0,0,0,0.15)",
            zIndex: 999,
            overflow: "hidden",
          }}
        >
          <div style={{
            padding: "9px 14px 8px",
            borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {count} Overdue {label}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onViewAll() }}
              style={{ fontSize: "0.7rem", color: "#93C5FD", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
            >
              View All →
            </button>
          </div>
          <div style={{ maxHeight: 230, overflowY: "auto" }}>
            {items.slice(0, 8).map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 14px",
                  borderBottom: i < Math.min(items.length, 8) - 1
                    ? `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}` : "none",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)" }}>{item.title}</div>
                  <div style={{ fontSize: "0.68rem", color: "#EF4444", marginTop: 2 }}>{item.subtitle}</div>
                </div>
                {item.amount && (
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                    {item.amount}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Interfaces ──────────────────────────────────────────────
interface MonthlyProfit  { month: string; profit: number }
interface TopCustomer    { name: string; revenue: number; outstanding: number }

// ── Main component ──────────────────────────────────────────
export default function TradingServiceDashboard({ role }: { role: string }) {
  const router = useRouter()
  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark"
  const { companyId } = useCompany()
  const companyError = !companyId

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [userDisplayName, setUserDisplayName]   = useState("")
  const [businessType,    setBusinessType]       = useState("")
  const [loading,         setLoading]            = useState(true)
  const [selectedPeriod,  setSelectedPeriod]     = useState<PeriodKey>("all")

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

  // Overdue detail lists for bell dropdowns
  const [overdueInvoiceItems, setOverdueInvoiceItems] = useState<any[]>([])
  const [overdueBillItems,    setOverdueBillItems]    = useState<any[]>([])

  // ── User ──────────────────────────────────────────────────
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

  // ── Dashboard metrics (re-fetch on period change, with safety timeout) ─────────
  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    const { start, end } = getPeriodDates(selectedPeriod)

    let finished = false
    const safetyTimer = setTimeout(() => {
      if (!finished) {
        finished = true
        setLoading(false)
      }
    }, 8000) // 8 seconds max

    const fetchDashboard = async () => {
      try {
        const { data, error } = await supabase.rpc("get_dashboard_metrics", {
          p_company_id: companyId,
          ...(start ? { p_date_from: start } : {}),
          ...(end   ? { p_date_to:   end   } : {}),
        })
        if (!finished) {
          if (error) { console.error("RPC error:", error); }
          else if (!data) { console.error("No data returned"); }
          else {
            setRevenueTotal(data.revenueTotal || 0)
            setExpenseTotal(data.expenseTotal || 0)
            setCashBalance(data.cashBalance || 0)
            setTotalReceivables(data.totalReceivables || 0)
            setTotalPayables(data.totalPayables || 0)
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
  }, [companyId, selectedPeriod])

  // ── Overdue lists (fixed: two‑step fetch without parties join) ─────
  useEffect(() => {
    if (!companyId) return
    const today = new Date().toISOString().split("T")[0]

    const fetchOverdue = async () => {
      // Fetch overdue invoices (sale)
      const invRes = await Promise.resolve(
        supabase.from("invoices")
          .select("id, invoice_no, total, due_date, party_id")
          .eq("company_id", companyId)
          .eq("type", "sale")
          .in("status", ["Unpaid", "Partial"])
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(10)
      ).catch(() => ({ data: [] }))

      const invoices = invRes.data || []

      // Get customer names for these party_ids
      const partyIds = invoices.map((inv: any) => inv.party_id).filter(Boolean)
      let customerMap: Record<number, string> = {}
      if (partyIds.length > 0) {
        const custRes = await Promise.resolve(
          supabase.from("customers").select("id, name").in("id", partyIds)
        ).catch(() => ({ data: [] }))
        ;(custRes.data || []).forEach((c: any) => { customerMap[c.id] = c.name })
      }

      setOverdueInvoiceItems(invoices.map((inv: any) => ({
        id: inv.id,
        invoice_no: inv.invoice_no,
        due_date: inv.due_date,
        total: inv.total,
        customer_name: customerMap[inv.party_id] || "—",
      })))
      setOverdueInvoicesCount(invoices.length)

      // Fetch overdue bills (purchase)
      const billRes = await Promise.resolve(
        supabase.from("invoices")
          .select("id, invoice_no, total, due_date, party_id")
          .eq("company_id", companyId)
          .eq("type", "purchase")
          .in("status", ["Unpaid", "Partial"])
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(10)
      ).catch(() => ({ data: [] }))

      const bills = billRes.data || []
      const billPartyIds = bills.map((b: any) => b.party_id).filter(Boolean)
      let supplierMap: Record<number, string> = {}
      if (billPartyIds.length > 0) {
        const supRes = await Promise.resolve(
          supabase.from("suppliers").select("id, name").in("id", billPartyIds)
        ).catch(() => ({ data: [] }))
        ;(supRes.data || []).forEach((s: any) => { supplierMap[s.id] = s.name })
      }

      setOverdueBillItems(bills.map((b: any) => ({
        id: b.id,
        invoice_no: b.invoice_no,
        due_date: b.due_date,
        total: b.total,
        supplier_name: supplierMap[b.party_id] || "—",
      })))
      setOverdueBillsCount(bills.length)
    }

    fetchOverdue()
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

  // New company check
  const isEmpty = !loading &&
    revenueTotal === 0 &&
    expenseTotal === 0 &&
    cashBalance === 0 &&
    totalReceivables === 0 &&
    totalPayables === 0 &&
    overdueInvoicesCount === 0 &&
    overdueBillsCount === 0 &&
    monthlyProfit.length === 0 &&
    topCustomers.length === 0

  const invoiceBellItems = overdueInvoiceItems.map(inv => ({
    title: inv.invoice_no || `INV-${inv.id}`,
    subtitle: `Due ${inv.due_date} · ${inv.customer_name}`,
    amount: formatPKR(inv.total || 0),
  }))
  const billBellItems = overdueBillItems.map(bill => ({
    title: bill.invoice_no || `BILL-${bill.id}`,
    subtitle: `Due ${bill.due_date} · ${bill.supplier_name}`,
    amount: formatPKR(bill.total || 0),
  }))

  if (companyError) return (
    <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
      <div style={{ fontSize: "1.2rem", color: "#F87171" }}>Could not load dashboard</div>
      <div style={{ fontSize: "0.85rem", marginTop: 8 }}>Account not linked to a company. Contact your administrator.</div>
    </div>
  )

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--border)", borderTop: "3px solid #A78BFA", animation: "spin 1.2s linear infinite" }} />
      <div>Loading your dashboard…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (isEmpty) {
    return (
      <div style={{ background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)", padding: "2rem" }}>
        <div style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Welcome to OneAccounts!</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>Your workspace is ready. Start by setting up the basics.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div onClick={() => router.push("/dashboard/settings")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <Building2 size={20} color="var(--primary)"/>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>Company Settings</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Add your logo, business name, and tax info</div>
              </div>
            </div>
            <div onClick={() => router.push("/dashboard/customers/new")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <UserPlus size={20} color="var(--primary)"/>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>Add First Customer</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Create a customer to start invoicing</div>
              </div>
            </div>
            <div onClick={() => router.push("/dashboard/invoices/new")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <FileText size={20} color="var(--primary)"/>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>Create First Invoice</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Send an invoice to your customer</div>
              </div>
            </div>
            <div onClick={() => router.push("/dashboard/banking/bank-accounts")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <CreditCard size={20} color="var(--primary)"/>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>Set Up Bank Account</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Connect your bank for payments</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)", padding: "1rem 1.5rem" }}>
      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes bellShake  {
          0%,100% { transform: rotate(0deg); }
          15%     { transform: rotate(-12deg); }
          30%     { transform: rotate(10deg); }
          45%     { transform: rotate(-8deg); }
          60%     { transform: rotate(6deg); }
          75%     { transform: rotate(-4deg); }
        }

        .tsd * { box-sizing: border-box; }

        .tsd .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 14px;
          padding: 20px; box-shadow: var(--shadow-sm);
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          cursor: pointer; display: flex; flex-direction: column;
        }
        .tsd .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          border-color: var(--primary);
        }

        .tsd .hero {
          background: var(--card); border: 1px solid var(--border); border-radius: 14px;
          padding: 0.9rem 1.4rem; margin-bottom: 1.5rem;
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 0.8rem;
        }
        .tsd .hero-left h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 2px; }
        .tsd .hero-left p  { font-size: 0.82rem; color: var(--text-muted); margin: 0; }

        .tsd .hero-right {
          display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
        }

        .tsd .period-select {
          -webkit-appearance: none; appearance: none;
          background: ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"};
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 0.28rem 1.8rem 0.28rem 0.75rem;
          font-size: 0.78rem; font-weight: 600;
          color: var(--text); font-family: inherit;
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.55rem center;
          transition: border-color 0.15s, background 0.15s;
          color-scheme: ${isDark ? "dark" : "light"};
        }
        .tsd .period-select:focus { outline: none; border-color: #A78BFA; }

        .tsd .bells-group {
          display: flex; align-items: flex-start; gap: 10px;
          padding-left: 1rem;
          border-left: 1px solid var(--border);
        }

        .tsd .kpi-row {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;
        }
        .tsd .kpi-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 6px; }
        .tsd .kpi-value { font-size: 1.65rem; font-weight: 800; }

        .tsd .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .tsd .two-col .card:first-child {
          overflow-x: auto;
        }
        .tsd .top-customers-table {
          min-width: 300px;
          width: 100%;
          border-collapse: collapse;
        }
        .tsd .quick-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          flex: 1;
          align-items: stretch;
        }
        .tsd .quick-action-btn {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          padding: 16px 8px; text-align: center;
          font-size: 0.85rem; font-weight: 600; color: var(--text);
          cursor: pointer; transition: 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .tsd .quick-action-btn:hover { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }

        .tsd table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .tsd th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 600; font-size: 0.65rem; text-transform: uppercase; }
        .tsd td { padding: 8px 12px; border-bottom: 1px solid var(--border); }

        .tsd .chart-container { padding: 8px 0 12px; overflow-x: auto; }
        .tsd .bar-chart        { display: flex; align-items: flex-end; gap: 12px; height: 200px; padding: 0 8px; min-width: 600px; }
        .tsd .bar-column       { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .tsd .bar              { width: 100%; background: linear-gradient(180deg, #6366f1, #818cf8); border-radius: 6px 6px 0 0; min-height: 4px; }
        .tsd .bar.negative     { background: linear-gradient(180deg, #ef4444, #f87171); }
        .tsd .bar-value        { font-size: 10px; font-weight: 700; color: var(--text); white-space: nowrap; }
        .tsd .bar-label        { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
        .tsd .trend-summary    { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 0.75rem; font-weight: 600; }

        .customer-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }

        @media (max-width: 1024px) {
          .tsd .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .tsd .two-col { grid-template-columns: 1fr; gap: 16px; }
          .customer-name { max-width: 140px; }
        }
        @media (max-width: 768px) {
          .tsd .hero-right { width: 100%; justify-content: space-between; }
          .tsd .bells-group { border-left: none; padding-left: 0; }
        }
        @media (max-width: 640px) {
          .tsd .kpi-row { grid-template-columns: 1fr 1fr; }
          .tsd .hero    { flex-direction: column; align-items: flex-start; }
          .customer-name { max-width: 120px; }
          .tsd .quick-action-btn { padding: 12px 8px; font-size: 0.75rem; }
          .tsd .quick-actions { grid-template-columns: 1fr; }
        }
        @media (max-width: 380px) {
          .tsd .kpi-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="tsd">

        {/* ── Hero ── */}
        <div className="hero">
          <div className="hero-left">
            <h2>{getGreeting()}, {userDisplayName}</h2>
            <p>{businessType === "trading" ? "Trading Dashboard" : "Service Dashboard"}</p>
          </div>

          <div className="hero-right">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Period:</span>
              <select
                className="period-select"
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(e.target.value as PeriodKey)}
              >
                {PERIOD_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="bells-group">
              <BellNotification
                count={overdueInvoicesCount}
                label="Invoices"
                items={invoiceBellItems}
                onViewAll={() => router.push("/dashboard/invoices?status=Unpaid&overdue=true")}
                isDark={isDark}
              />
              <BellNotification
                count={overdueBillsCount}
                label="Bills"
                items={billBellItems}
                onViewAll={() => router.push("/dashboard/bills?status=Unpaid&overdue=true")}
                isDark={isDark}
              />
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="kpi-row">
          {[
            { label: "💰 Total Revenue",   value: formatPKR(animRevenue), color: "#10B981", link: "/dashboard/reports/profit-loss" },
            { label: "📤 Total Expenses",  value: formatPKR(animExpense), color: "#EF4444", link: "/dashboard/reports/profit-loss" },
            { label: "📈 Gross Profit",    value: formatPKR(animProfit),  color: grossProfit >= 0 ? "#10B981" : "#EF4444", link: "/dashboard/reports/profit-loss" },
            { label: "🏦 Cash & Bank",     value: formatPKR(animCash),   color: "#A78BFA", link: "/dashboard/banking/bank-accounts" },
            { label: "🧾 Receivables",     value: formatPKR(animRecv),   color: "#F97316", link: "/dashboard/customers" },
            { label: "📋 Payables",        value: formatPKR(animPay),    color: "#EF4444", link: "/dashboard/suppliers" },
            {
              label: "⚠️ Overdue Inv.",
              value: overdueInvoicesCount.toString(),
              color: overdueInvoicesCount > 0 ? "#EF4444" : "#10B981",
              link: "/dashboard/invoices?status=Unpaid&overdue=true",
              sub: overdueInvoicesCount > 0 ? "Needs attention" : "All clear",
            },
            {
              label: "⚠️ Overdue Bills",
              value: overdueBillsCount.toString(),
              color: overdueBillsCount > 0 ? "#EF4444" : "#10B981",
              link: "/dashboard/bills?status=Unpaid&overdue=true",
              sub: overdueBillsCount > 0 ? "Needs attention" : "All clear",
            },
          ].map((kpi: any) => (
            <div key={kpi.label} className="card" onClick={() => router.push(kpi.link)}>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
              {kpi.sub && (
                <div style={{ fontSize: "0.72rem", marginTop: 4, color: kpi.color, fontWeight: 600 }}>{kpi.sub}</div>
              )}
            </div>
          ))}
        </div>

        {/* ── Two columns: Top Customers + Quick Actions ── */}
        <div className="two-col">
          <div className="card" style={{ cursor: "default" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>🏆 Top 5 Customers</span>
              <button
                onClick={() => router.push("/dashboard/customers")}
                style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", fontSize: "0.75rem" }}
              >
                View All →
              </button>
            </div>
            <div style={{ overflowX: "auto", flex: 1 }}>
              <table className="top-customers-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th style={{ textAlign: "right" }}>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)" }}>No customer data</td>
                    </tr>
                  ) : (
                    topCustomers.map((c, i) => (
                      <tr key={i}>
                        <td><span className="customer-name" title={c.name}>{c.name}</span></td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: c.outstanding > 0 ? "#EF4444" : "#10B981" }}>
                          {formatPKR(c.outstanding)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ cursor: "default" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 12 }}>⚡ Quick Actions</div>
            <div className="quick-actions">
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/invoices/new")}>➕ New Invoice</div>
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/bills/new")}>📦 New Bill</div>
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/receipts/new")}>💰 Receive Payment</div>
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/payments/new")}>💳 Record Payment</div>
            </div>
          </div>
        </div>

        {/* ── Monthly Profit Trend ── */}
        <div className="full-width">
          <div className="card" style={{ cursor: "default" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>📊 Monthly Profit Trend</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{periodLabel}</span>
            </div>
            {monthlyProfit.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No profit data for selected period
              </div>
            ) : (
              <>
                <div className="chart-container">
                  <div className="bar-chart">
                    {monthlyProfit.map((m, i) => (
                      <div key={i} className="bar-column">
                        <div
                          className={`bar${m.profit < 0 ? " negative" : ""}`}
                          style={{ height: `${(Math.abs(m.profit) / maxProfit) * 140 + 4}px` }}
                        />
                        <div className="bar-value">{formatPKR(m.profit)}</div>
                        <div className="bar-label">{m.month}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="trend-summary">
                  <span>📈 Best: <strong>{monthlyProfit.reduce((a, b) => a.profit > b.profit ? a : b).month}</strong> ({formatPKR(Math.max(...monthlyProfit.map(m => m.profit)))})</span>
                  <span>📉 Worst: <strong>{monthlyProfit.reduce((a, b) => a.profit < b.profit ? a : b).month}</strong> ({formatPKR(Math.min(...monthlyProfit.map(m => m.profit)))})</span>
                  <span>📊 Avg: <strong>{formatPKR(monthlyProfit.reduce((s, m) => s + m.profit, 0) / monthlyProfit.length)}</strong></span>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}