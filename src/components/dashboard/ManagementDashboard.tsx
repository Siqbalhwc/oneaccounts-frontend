"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle, Bell } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "@/contexts/ThemeContext"
import { useCompany } from "@/contexts/CompanyContext"
import { useDashboardData } from "@/hooks/useDashboardData"
import { createBrowserClient } from "@supabase/ssr"

// ── Period options ──────────────────────────────────────────
type PeriodKey = "all" | "this_month" | "this_quarter" | "this_year" | "last_month" | "last_quarter" | "last_year" | "fy"

interface PeriodOption {
  label: string
  key: PeriodKey
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: "All Time",       key: "all" },
  { label: "This Month",     key: "this_month" },
  { label: "This Quarter",   key: "this_quarter" },
  { label: "This Year",      key: "this_year" },
  { label: "Last Month",     key: "last_month" },
  { label: "Last Quarter",   key: "last_quarter" },
  { label: "Last Year",      key: "last_year" },
  { label: "Fiscal Year",    key: "fy" },
]

function getPeriodDateRange(key: PeriodKey, fiscalYear: number): { start: string | null; end: string | null } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const pad = (n: number) => String(n).padStart(2, "0")
  const iso = (d: Date) => d.toISOString().split("T")[0]

  const quarterStart = (q: number, yr: number) => new Date(yr, q * 3, 1)
  const quarterEnd   = (q: number, yr: number) => new Date(yr, q * 3 + 3, 0)
  const currentQ = Math.floor(m / 3)

  switch (key) {
    case "all":
      return { start: null, end: null }
    case "this_month":
      return { start: `${y}-${pad(m + 1)}-01`, end: iso(new Date(y, m + 1, 0)) }
    case "this_quarter":
      return { start: iso(quarterStart(currentQ, y)), end: iso(quarterEnd(currentQ, y)) }
    case "this_year":
      return { start: `${y}-01-01`, end: `${y}-12-31` }
    case "last_month": {
      const lm = m === 0 ? 11 : m - 1
      const ly = m === 0 ? y - 1 : y
      return { start: `${ly}-${pad(lm + 1)}-01`, end: iso(new Date(ly, lm + 1, 0)) }
    }
    case "last_quarter": {
      const lq = currentQ === 0 ? 3 : currentQ - 1
      const lqy = currentQ === 0 ? y - 1 : y
      return { start: iso(quarterStart(lq, lqy)), end: iso(quarterEnd(lq, lqy)) }
    }
    case "last_year":
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    case "fy":
      return { start: `${fiscalYear}-01-01`, end: `${fiscalYear}-12-31` }
    default:
      return { start: null, end: null }
  }
}

// ── Animated number hook ────────────────────────────────────
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

// ── Bell with tooltip dropdown ──────────────────────────────
function BellNotification({
  count,
  label,
  items,
  onClick,
  isDark,
}: {
  count: number
  label: string
  items: { title: string; subtitle: string; amount?: string; urgent?: boolean }[]
  onClick: () => void
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

  return (
    <div ref={ref} style={{ position: "relative", textAlign: "center" }}>
      <div
        style={{
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: count > 0
            ? isDark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)"
            : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          border: count > 0
            ? "1px solid rgba(239,68,68,0.3)"
            : "1px solid var(--border)",
          transition: "all 0.2s",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLElement).style.background = count > 0
            ? isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.15)"
            : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLElement).style.background = count > 0
            ? isDark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)"
            : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"
        }}
        onClick={() => count > 0 ? setOpen(!open) : onClick()}
      >
        <Bell
          size={17}
          color={count > 0 ? "#EF4444" : "var(--text-muted)"}
          style={count > 0 ? { animation: "bellShake 0.5s ease" } : undefined}
        />
        {count > 0 && (
          <span style={{
            position: "absolute", top: -3, right: -3,
            background: "#EF4444", color: "white",
            fontSize: 9, fontWeight: 700, borderRadius: 10,
            minWidth: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: "1.5px solid var(--bg)",
          }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, marginTop: 3, color: count > 0 ? "#EF4444" : "var(--text-muted)", fontWeight: count > 0 ? 600 : 400 }}>
        {label}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && count > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              width: 280,
              background: isDark ? "#1E293B" : "#FFFFFF",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
              borderRadius: 12,
              boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.15)",
              zIndex: 1000,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "10px 14px 8px",
              borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {count} Overdue {label}
              </span>
              <button
                onClick={onClick}
                style={{
                  fontSize: "0.7rem", color: "#93C5FD", background: "none",
                  border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit",
                }}
              >
                View All →
              </button>
            </div>

            {/* Items */}
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {items.slice(0, 8).map((item, i) => (
                <div key={i} style={{
                  padding: "8px 14px",
                  borderBottom: i < items.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` : "none",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                }}>
                  <div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)" }}>{item.title}</div>
                    <div style={{ fontSize: "0.68rem", color: "#EF4444", marginTop: 1 }}>{item.subtitle}</div>
                  </div>
                  {item.amount && (
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                      {item.amount}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ManagementDashboard({ role }: { role: string }) {
  const router = useRouter()

  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark"

  const { companyId } = useCompany()
  const companyError = !companyId

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("this_year")
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")
  const [userDisplayName, setUserDisplayName] = useState("")
  const [overdueBillsList, setOverdueBillsList] = useState<any[]>([])
  const [overdueInvoicesList, setOverdueInvoicesList] = useState<any[]>([])

  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])

  // Fetch user name
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const fullName =
        (user.user_metadata as any)?.full_name ||
        (user.user_metadata as any)?.name ||
        user.email?.split("@")[0] ||
        "User"
      setUserDisplayName(fullName)
    })
  }, [])

  // Fetch overdue bills for notification badge + dropdown
  useEffect(() => {
    if (!companyId) return
    const fetchOverdueBills = async () => {
      const todayISO = new Date().toISOString().split("T")[0]
      const { data: overdueBills } = await supabase
        .from("invoices")
        .select("id, invoice_no, party_id, total, due_date, parties(name)")
        .eq("company_id", companyId)
        .eq("type", "purchase")
        .in("status", ["Unpaid", "Partial"])
        .lt("due_date", todayISO)
        .order("due_date", { ascending: true })
        .limit(10)
      setOverdueBillsList(overdueBills || [])
    }
    fetchOverdueBills()
  }, [companyId, supabase])

  // Fetch overdue invoices for notification badge + dropdown
  useEffect(() => {
    if (!companyId) return
    const fetchOverdueInvoices = async () => {
      const todayISO = new Date().toISOString().split("T")[0]
      const { data: overdueInv } = await supabase
        .from("invoices")
        .select("id, invoice_no, party_id, total, due_date, parties(name)")
        .eq("company_id", companyId)
        .eq("type", "sale")
        .in("status", ["Unpaid", "Partial"])
        .lt("due_date", todayISO)
        .order("due_date", { ascending: true })
        .limit(10)
      setOverdueInvoicesList(overdueInv || [])
    }
    fetchOverdueInvoices()
  }, [companyId, supabase])

  useEffect(() => {
    if (!companyId) return
    supabase.from("projects").select("id, name").eq("company_id", companyId).order("name")
      .then(({ data }) => data && setProjects(data))
    supabase.from("donors").select("id, name").eq("company_id", companyId).order("name")
      .then(({ data }) => data && setDonors(data))
  }, [companyId])

  const { data: dashData, isLoading, isError } = useDashboardData(companyId, fiscalYear)

  // Raw arrays from hook
  const allBudgets = dashData?.allBudgets || []
  const allJournalLines = dashData?.allJournalLines || []
  const allDonors = dashData?.allDonors || []
  const allProjects = dashData?.allProjects || []
  const allActivities = dashData?.allActivities || []

  // ── Period-based date filtering ───────────────────────────
  const periodRange = useMemo(() => getPeriodDateRange(selectedPeriod, fiscalYear), [selectedPeriod, fiscalYear])

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const startOfMonthISO = new Date(Date.UTC(currentYear, currentMonth - 1, 1)).toISOString().split("T")[0]
  const todayISO = now.toISOString().split("T")[0]

  const isFiltered = selectedProjectId !== "" || selectedDonorId !== ""

  const filteredBudgets = useMemo(() => {
    let result = allBudgets
    if (selectedProjectId) result = result.filter((b: any) => String(b.project_id) === selectedProjectId)
    if (selectedDonorId)   result = result.filter((b: any) => String(b.donor_id)   === selectedDonorId)
    return result
  }, [allBudgets, selectedProjectId, selectedDonorId])

  const filteredJournalLines = useMemo(() => {
    let result = allJournalLines
    if (selectedProjectId) result = result.filter((jl: any) => String(jl.project_id) === selectedProjectId)
    if (selectedDonorId)   result = result.filter((jl: any) => String(jl.donor_id)   === selectedDonorId)
    // Apply period date filter
    if (periodRange.start || periodRange.end) {
      result = result.filter((jl: any) => {
        const d = jl.journal_entries?.date
        if (!d) return false
        if (periodRange.start && d < periodRange.start) return false
        if (periodRange.end   && d > periodRange.end)   return false
        return true
      })
    }
    return result
  }, [allJournalLines, selectedProjectId, selectedDonorId, periodRange])

  // ── KPI computation ───────────────────────────────────────
  const totalBudget = isFiltered
    ? filteredBudgets.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0)
    : dashData?.totalBudget || 0

  const totalSpent = filteredJournalLines.reduce(
    (s: number, jl: any) => s + (jl.debit || 0) - (jl.credit || 0), 0
  )

  // Monthly spending within selected period (or current month if "all")
  const monthlySpending = useMemo(() => {
    const rangeStart = periodRange.start || startOfMonthISO
    const rangeEnd   = periodRange.end   || todayISO
    return allJournalLines
      .filter((jl: any) => {
        const d = jl.journal_entries?.date
        return d && d >= rangeStart && d <= rangeEnd
      })
      .reduce((s: number, jl: any) => s + (jl.debit || 0) - (jl.credit || 0), 0)
  }, [allJournalLines, periodRange, startOfMonthISO, todayISO])

  const lastMonthSpending = dashData?.lastMonthSpending || 0
  const spendingTrend = dashData?.spendingTrend || 0

  // ── Donor balances ────────────────────────────────────────
  const donorNameMap: Record<string, string> = {}
  allDonors.forEach((d: any) => { donorNameMap[String(d.id)] = d.name })

  const budgetByDonor: Record<string, number> = {}
  filteredBudgets.forEach((b: any) => {
    if (b.donor_id) {
      const key = String(b.donor_id)
      budgetByDonor[key] = (budgetByDonor[key] || 0) + (b.budgeted_amount || 0)
    }
  })

  const actualByDonor: Record<string, number> = {}
  filteredJournalLines.forEach((jl: any) => {
    if (jl.donor_id) {
      const key = String(jl.donor_id)
      actualByDonor[key] = (actualByDonor[key] || 0) + (jl.debit || 0) - (jl.credit || 0)
    }
  })

  const donorDates: Record<string, { start: string; end: string | null }> = {}
  allProjects.forEach((p: any) => {
    if (p.donor_id) {
      const key = String(p.donor_id)
      if (!donorDates[key]) {
        donorDates[key] = { start: p.start_date, end: p.end_date }
      } else {
        if (p.start_date && p.start_date < donorDates[key].start) donorDates[key].start = p.start_date
        if (p.end_date && (!donorDates[key].end || p.end_date > donorDates[key].end)) donorDates[key].end = p.end_date
      }
    }
  })

  const donorBalances = useMemo(() => {
    return Object.keys(budgetByDonor).map((donorId) => {
      const budget = budgetByDonor[donorId] || 0
      const actual = actualByDonor[donorId] || 0
      const percentSpent = budget ? (actual / budget) * 100 : 0

      const dates = donorDates[donorId]
      let monthsPassed = currentMonth
      let monthsTotal = 12
      if (dates && dates.start) {
        const start = new Date(dates.start)
        const end = dates.end ? new Date(dates.end) : new Date(fiscalYear, 11, 31)
        const diffTotal = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
        if (diffTotal > 0) monthsTotal = diffTotal
        const today = new Date()
        const diffPassed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1
        monthsPassed = Math.max(0, Math.min(diffPassed, monthsTotal))
      }

      const timePercent = (monthsPassed / monthsTotal) * 100
      const health = percentSpent > timePercent * 0.8 ? "on track" : percentSpent < timePercent * 0.4 ? "slow" : "ok"

      return {
        donor_id: donorId,
        name: donorNameMap[donorId] || "Unknown",
        budget,
        actual,
        remaining: budget - actual,
        pct: Math.round(percentSpent),
        overspent: actual > budget,
        monthsPassed,
        monthsTotal,
        health,
      }
    }).sort((a, b) => b.remaining - a.remaining)
  }, [budgetByDonor, actualByDonor, donorDates, donorNameMap, currentMonth, fiscalYear])

  // ── Project utilization ───────────────────────────────────
  const budgetByProject: Record<string, number> = {}
  filteredBudgets.forEach((b: any) => {
    if (b.project_id) {
      const key = String(b.project_id)
      budgetByProject[key] = (budgetByProject[key] || 0) + (b.budgeted_amount || 0)
    }
  })

  const actualByProject: Record<string, number> = {}
  filteredJournalLines.forEach((jl: any) => {
    if (jl.project_id) {
      const key = String(jl.project_id)
      actualByProject[key] = (actualByProject[key] || 0) + (jl.debit || 0) - (jl.credit || 0)
    }
  })

  const projectNameMap: Record<string, string> = {}
  allProjects.forEach((p: any) => { projectNameMap[String(p.id)] = p.name })

  const projectRows = useMemo(() => {
    return Object.keys(budgetByProject).map((pid) => {
      const budget = budgetByProject[pid] || 0
      const actual = actualByProject[pid] || 0
      const pct = budget ? Math.round((actual / budget) * 100) : (actual > 0 ? 100 : 0)
      return { id: pid, name: projectNameMap[pid] || "Unknown", budget, actual, pct }
    }).sort((a, b) => b.pct - a.pct).map((p) => ({
      ...p,
      status: p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : (now.getMonth() > 2 && p.pct < 10) ? "At Risk" : "On Track",
    }))
  }, [budgetByProject, actualByProject, projectNameMap, now])

  const overspentCount = projectRows.filter((p: any) => p.actual > p.budget).length

  // ── Underspent activities ─────────────────────────────────
  const activityNameMap: Record<number, string> = {}
  allActivities.forEach((a: any) => { activityNameMap[a.id] = a.name })

  const budgetByAct: Record<number, number> = {}
  const actualByAct: Record<number, number> = {}
  const actProjectMap: Record<number, number> = {}

  filteredBudgets.forEach((b: any) => {
    const aid = b.activity_id
    budgetByAct[aid] = (budgetByAct[aid] || 0) + (b.budgeted_amount || 0)
    if (!actProjectMap[aid] && b.project_id) actProjectMap[aid] = b.project_id
  })

  filteredJournalLines.forEach((jl: any) => {
    if (jl.activity_id) {
      actualByAct[jl.activity_id] = (actualByAct[jl.activity_id] || 0) + (jl.debit || 0) - (jl.credit || 0)
    }
  })

  const underspentActivities = useMemo(() => {
    return Object.keys(budgetByAct)
      .map((aid) => {
        const id = Number(aid)
        const budget = budgetByAct[id] || 0
        const actual = actualByAct[id] || 0
        const spentPct = budget ? Math.round((actual / budget) * 100) : 100
        const remaining = budget - actual
        const unspentPct = 100 - spentPct
        return { id, name: activityNameMap[id] || `Activity ${id}`, budget, actual, remaining, spentPct, unspentPct, projectId: actProjectMap[id] || null }
      })
      .filter((a) => a.budget > 0 && a.spentPct < 100)
      .sort((a, b) => a.spentPct - b.spentPct)
      .slice(0, 5)
  }, [budgetByAct, actualByAct, activityNameMap, actProjectMap])

  // ── Receivables / Payables ────────────────────────────────
  const totalReceivables = dashData?.totalReceivables || 0
  const totalPayables = dashData?.totalPayables || 0
  const lastUpdated = dashData?.lastUpdated || ""

  const remainingFunds = totalBudget - totalSpent
  const spentPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0

  const projectsSorted = [...projectRows].sort((a: any, b: any) => b.pct - a.pct)
  const highestProject = projectsSorted[0] || null
  const lowestProject  = projectsSorted[projectsSorted.length - 1] || null

  const getGreeting = (): string => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const formatPKR = (v: number): string => {
    const sign = v < 0 ? "-" : ""
    const abs = Math.abs(v)
    return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
  }

  const detailQuery = (extra: Record<string, string> = {}): string => {
    const params = new URLSearchParams({ period: selectedPeriod, fy: String(fiscalYear) })
    if (selectedProjectId) params.set("project", selectedProjectId)
    if (selectedDonorId)   params.set("donor",   selectedDonorId)
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return "?" + params.toString()
  }

  const Trend = ({ value, positive = false, negative = false }: { value: number; positive?: boolean; negative?: boolean }) => {
    if (value === 0) return <Minus size={14} style={{ color: "#94A3B8" }} />
    if (value > 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: positive ? "#2DD4BF" : "#F97316", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingUp size={14} /> {Math.abs(value)}%
    </span>
    return <span style={{ display: "flex", alignItems: "center", gap: 2, color: negative ? "#F97316" : "#2DD4BF", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingDown size={14} /> {Math.abs(value)}%
    </span>
  }

  const animBudget    = useAnimatedNumber(totalBudget / 1_000_000, 600)
  const animSpent     = useAnimatedNumber(totalSpent / 1_000_000, 600)
  const animRemaining = useAnimatedNumber(Math.abs(totalBudget - totalSpent) / 1_000_000, 600)
  const animMonthly   = useAnimatedNumber(monthlySpending / 1_000_000, 600)

  const fmtM = (v: number): string => {
    const sign = v < 0 ? "-" : ""
    return `${sign}PKR ${Math.abs(v).toFixed(1)}M`
  }

  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.08, duration: 0.45 },
    }),
  }

  const hoverScale = {
    whileHover: {
      scale: 1.03, y: -6,
      boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.12)",
      transition: { duration: 0.25 },
    },
  }

  // Build bell dropdown items
  const invoiceBellItems = overdueInvoicesList.map((inv: any) => ({
    title: inv.invoice_no || `INV-${inv.id}`,
    subtitle: `Due: ${inv.due_date} · ${(inv.parties as any)?.name || ""}`,
    amount: inv.total ? `PKR ${Number(inv.total).toLocaleString()}` : undefined,
  }))

  const billBellItems = overdueBillsList.map((bill: any) => ({
    title: bill.invoice_no || `BILL-${bill.id}`,
    subtitle: `Due: ${bill.due_date} · ${(bill.parties as any)?.name || ""}`,
    amount: bill.total ? `PKR ${Number(bill.total).toLocaleString()}` : undefined,
  }))

  // Selected period label for display
  const periodLabel = PERIOD_OPTIONS.find(p => p.key === selectedPeriod)?.label || "This Year"

  if (companyError) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "1.2rem", marginBottom: 8, color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem" }}>Your account may not be linked to a company. Please contact your administrator.</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--border)", borderTop: "3px solid #A78BFA" }}
        />
        <div style={{ fontSize: "0.9rem" }}>Loading your dashboard…</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "1.2rem", marginBottom: 8, color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem" }}>Please try refreshing the page.</div>
      </div>
    )
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", flex: 1, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: "var(--text)", transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        @keyframes bellShake {
          0%,100% { transform: rotate(0deg); }
          15%      { transform: rotate(-12deg); }
          30%      { transform: rotate(10deg); }
          45%      { transform: rotate(-8deg); }
          60%      { transform: rotate(6deg); }
          75%      { transform: rotate(-4deg); }
        }

        .mgmt * { box-sizing: border-box; margin: 0; padding: 0; }

        .mgmt .card {
          background: ${isDark ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.7)"};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"};
          border-radius: 18px; padding: 1.2rem 1.3rem;
          box-shadow: ${isDark ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.06)"};
          transition: all 0.3s ease;
          cursor: pointer;
          overflow: hidden;
          position: relative;
        }
        .mgmt .card:hover {
          background: ${isDark ? "rgba(30,41,59,0.8)" : "rgba(255,255,255,0.9)"};
          border-color: ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"};
        }

        .mgmt .hero {
          background: ${isDark ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.7)"};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: 16px; padding: 1rem 1.5rem;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 0.8rem;
        }

        .mgmt .hero-greeting h2 {
          font-size: 1.3rem; font-weight: 700; color: var(--text); margin-bottom: 0.15rem;
        }
        .mgmt .hero-greeting p {
          color: var(--text-muted); font-size: 0.85rem; margin: 0;
        }

        .mgmt .hero-right {
          display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
        }

        .mgmt .hero-filters {
          display: flex; align-items: center; gap: 0.4rem;
          flex-wrap: wrap;
        }
        .mgmt .filter-label {
          font-weight: 600; color: var(--text-muted); font-size: 0.75rem; margin-right: 0.1rem;
        }
        .mgmt .filter-pill {
          background: var(--card); border: 1px solid var(--border);
          padding: 0.2rem 0.5rem; border-radius: 20px;
          font-size: 0.78rem; font-weight: 500; color: var(--text);
          cursor: pointer; transition: 0.15s;
          -webkit-appearance: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          padding-right: 1.6rem;
          font-family: inherit;
          max-width: 160px;
          color-scheme: light;
        }
        .mgmt .filter-pill:focus { outline: none; border-color: var(--border-strong); }
        .mgmt .filter-pill.active {
          border-color: #A78BFA;
          background-color: ${isDark ? "rgba(167,139,250,0.1)" : "rgba(167,139,250,0.08)"};
          color: #A78BFA;
        }

        /* Period badge shown in hero */
        .period-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 20px;
          background: ${isDark ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.1)"};
          border: 1px solid rgba(167,139,250,0.3);
          font-size: 0.72rem; font-weight: 600; color: #A78BFA;
        }

        .mgmt .bells-group {
          display: flex; align-items: flex-start; gap: 12px;
          border-left: 1px solid var(--border); padding-left: 1rem;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .dashboard-grid-32 {
          display: grid;
          grid-template-columns: 3fr 2fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        @media (max-width: 640px) {
          .dashboard-grid-32 {
            display: flex; flex-wrap: nowrap; overflow-x: auto;
            -webkit-overflow-scrolling: touch; gap: 0.8rem; padding-bottom: 0.5rem;
          }
          .dashboard-grid-32 > .card { flex: 0 0 auto; width: 85vw; max-width: 340px; }
        }

        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.7rem; font-weight: 700; color: var(--text); line-height: 1.2; }
        .kpi-meta  { font-size: 0.8rem; color: var(--text-soft); display: flex; align-items: center; gap: 0.3rem; }

        .progress-bg   { height: 5px; background: var(--border); border-radius: 10px; flex: 1; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; background: #2DD4BF; }

        .clickable { color: #93C5FD; text-decoration: underline; cursor: pointer; }

        @media (max-width: 1100px) { .dashboard-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 800px)  {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .hero { flex-direction: column; align-items: flex-start; }
          .hero-right { width: 100%; justify-content: space-between; }
          .mgmt .bells-group { border-left: none; padding-left: 0; border-top: 1px solid var(--border); padding-top: 0.8rem; width: 100%; }
        }
        @media (max-width: 640px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .mgmt .hero { padding: 1rem; }
          .mgmt .hero-greeting h2 { font-size: 1.1rem; }
          .mgmt .hero-greeting p  { font-size: 0.8rem; }
          .mgmt .filter-label     { font-size: 0.7rem; }
          .mgmt .filter-pill      { font-size: 0.7rem; padding: 0.15rem 0.4rem; padding-right: 1.4rem; background-position: right 0.3rem center; max-width: 130px; }
          .card { padding: 1rem; }
          .kpi-value { font-size: 1.4rem; }
        }
        @media (max-width: 380px) { .dashboard-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>

        {/* ── Hero ── */}
        <motion.div
          className="hero"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Left: greeting + period badge */}
          <div className="hero-greeting">
            <h2>{getGreeting()}, {userDisplayName || "User"}</h2>
            <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              NGO portfolio overview
              <span className="period-badge">📅 {periodLabel}</span>
              {(selectedProjectId || selectedDonorId) && (
                <span className="period-badge" style={{ color: "#F97316", borderColor: "rgba(249,115,22,0.3)", background: isDark ? "rgba(249,115,22,0.1)" : "rgba(249,115,22,0.07)" }}>
                  🔍 Filtered
                </span>
              )}
            </p>
          </div>

          {/* Right: filters + bells */}
          <div className="hero-right">
            {/* Filters */}
            <div className="hero-filters">
              <span className="filter-label">Period:</span>
              <select
                className={`filter-pill ${selectedPeriod !== "this_year" ? "active" : ""}`}
                value={selectedPeriod}
                onChange={e => {
                  setSelectedPeriod(e.target.value as PeriodKey)
                  // Auto-set fiscal year if switching to FY mode
                }}
              >
                {PERIOD_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>

              {/* Show FY picker only when period = fy */}
              {selectedPeriod === "fy" && (
                <select
                  className="filter-pill active"
                  value={fiscalYear}
                  onChange={e => setFiscalYear(Number(e.target.value))}
                >
                  {[2023, 2024, 2025, 2026, 2027].map((y: number) => (
                    <option key={y} value={y}>FY {y}</option>
                  ))}
                </select>
              )}

              <span className="filter-label">Project:</span>
              <select
                className={`filter-pill ${selectedProjectId ? "active" : ""}`}
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
              >
                <option value="">All Projects</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <span className="filter-label">Donor:</span>
              <select
                className={`filter-pill ${selectedDonorId ? "active" : ""}`}
                value={selectedDonorId}
                onChange={e => setSelectedDonorId(e.target.value)}
              >
                <option value="">All Donors</option>
                {donors.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              {/* Clear filters button — only when active */}
              {(selectedPeriod !== "this_year" || selectedProjectId || selectedDonorId) && (
                <button
                  onClick={() => {
                    setSelectedPeriod("this_year")
                    setSelectedProjectId("")
                    setSelectedDonorId("")
                  }}
                  style={{
                    background: "none", border: "1px solid var(--border)",
                    borderRadius: 20, padding: "0.2rem 0.6rem",
                    fontSize: "0.72rem", color: "var(--text-muted)",
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#F87171")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  ✕ Clear
                </button>
              )}
            </div>

            {/* Bell icons — separated from filters */}
            <div className="bells-group">
              <BellNotification
                count={overdueInvoicesList.length}
                label="Invoices"
                items={invoiceBellItems}
                onClick={() => router.push("/dashboard/invoices?status=Unpaid&overdue=true")}
                isDark={isDark}
              />
              <BellNotification
                count={overdueBillsList.length}
                label="Bills"
                items={billBellItems}
                onClick={() => router.push("/dashboard/bills?status=Unpaid&overdue=true")}
                isDark={isDark}
              />
            </div>
          </div>
        </motion.div>

        {/* KPI cards */}
        <div className="dashboard-grid">
          {[
            { label: "Total Budget",   value: fmtM(animBudget),   meta: `${projectRows.length} projects`,                    color: "#A78BFA", link: "/dashboard/reports/budget-summary" },
            { label: "Total Spent",    value: fmtM(animSpent),    meta: `${spentPct}% of budget`,                            color: "#F97316", link: "/dashboard/reports/spending-detail" },
            { label: remainingFunds < 0 ? "Overspent" : "Remaining", value: fmtM(animRemaining), meta: `${Math.abs(Math.round((remainingFunds / Math.max(totalBudget, 1)) * 100))}% ${remainingFunds < 0 ? "over" : "left"}`, color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171", link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null },
            { label: "Portfolio Health", value: overspentCount > 0 ? "⚠️ Needs Attention" : "✅ Healthy", meta: `${Math.round((1 - overspentCount / Math.max(projectRows.length, 1)) * 100)}% health score`, color: overspentCount > 0 ? "#F97316" : "#2DD4BF", link: "/dashboard/reports/overspent" },
            { label: "📆 Period Spending", value: monthlySpending > 0 ? fmtM(animMonthly) : "—", meta: monthlySpending === 0 ? `No spend in ${periodLabel}` : `${periodLabel}`, color: monthlySpending > 0 ? "#F97316" : "#94A3B8", link: "/dashboard/reports/spending-detail" },
          ].map((kpi: any, i: number) => (
            <motion.div
              key={kpi.label}
              className="card"
              custom={i}
              initial="hidden"
              animate="visible"
              variants={cardVariant}
              {...hoverScale}
              onClick={() => kpi.link && router.push(kpi.link + detailQuery())}
            >
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="kpi-meta">
                {kpi.meta}
                {kpi.label === "📆 Period Spending" && monthlySpending > 0 && (
                  <Trend value={spendingTrend} positive={spendingTrend < 0} negative={spendingTrend > 0} />
                )}
              </div>
              {kpi.label === "Total Spent" && highestProject && lowestProject && highestProject.id !== lowestProject.id && (
                <div style={{ fontSize: "0.65rem", color: "#93C5FD", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  🔺 {highestProject.name} {highestProject.pct}% · 🔻 {lowestProject.name} {lowestProject.pct}%
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Overspent warning — compact inline, no big banner */}
        {overspentCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, marginBottom: "1rem", flexWrap: "wrap",
              background: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderLeft: "4px solid #EF4444",
              borderRadius: 10, padding: "0.5rem 1rem",
              fontSize: "0.82rem", color: isDark ? "#FCA5A5" : "#991B1B", fontWeight: 500,
            }}
          >
            <span>⚠️ {overspentCount} {overspentCount === 1 ? "project" : "projects"} overspent · Portfolio over by {formatPKR(totalSpent - totalBudget)}</span>
            <button
              onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}
              style={{
                background: "#EF4444", color: "white", border: "none",
                borderRadius: 6, padding: "4px 12px", fontWeight: 600,
                cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit", whiteSpace: "nowrap",
              }}
            >
              View →
            </button>
          </motion.div>
        )}

        {/* Project Utilization + Donor Balances */}
        <div className="dashboard-grid-32">
          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>📊 Top 5 Project Utilization</div>
            {projectRows.slice(0, 5).map((p: any, idx: number) => (
              <div
                key={idx}
                onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}&fy=${fiscalYear}`)}
                style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: "var(--card)", borderRadius: "12px", padding: "0.5rem 1rem", border: "1px solid var(--border)", cursor: "pointer", marginBottom: "0.5rem", flexWrap: "wrap" }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.status === "Overspent" ? "#F87171" : p.status === "Review" ? "#F97316" : p.status === "At Risk" ? "#F97316" : "#2DD4BF", flexShrink: 0 }}></div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{p.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, minWidth: 60, fontSize: "0.8rem", color: "var(--text)" }}>{formatPKR(p.actual)}</span>
                  <span style={{ minWidth: 50, color: p.pct > 100 ? "#F87171" : p.pct > 80 ? "#F97316" : "#2DD4BF", fontSize: "0.8rem" }}>{p.pct}%</span>
                  <span style={{ padding: "0.1rem 0.6rem", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 700, background: p.status === "Overspent" ? "#fee2e2" : p.status === "Review" ? "#fef3c7" : p.status === "At Risk" ? "#fef3c7" : "#dcfce7", color: p.status === "Overspent" ? "#991b1b" : p.status === "Review" ? "#92400e" : p.status === "At Risk" ? "#92400e" : "#166534" }}>{p.status}</span>
                </div>
              </div>
            ))}
            {projectRows.length > 5 && (
              <div style={{ textAlign: "right", marginTop: "0.5rem" }}>
                <button
                  style={{ background: "transparent", color: "#93C5FD", border: "1px solid #334155", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", fontFamily: "inherit" }}
                  onClick={() => router.push("/dashboard/settings/budgets" + detailQuery())}
                >
                  View All Projects →
                </button>
              </div>
            )}
          </motion.div>

          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {donorBalances.map((d: any, idx: number) => (
              <div
                key={idx}
                onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}&fy=${fiscalYear}`)}
                style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: "var(--card)", borderRadius: "12px", padding: "0.5rem 1rem", border: "1px solid var(--border)", cursor: "pointer", marginBottom: "0.5rem", flexWrap: "wrap" }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#F87171" : "#A78BFA", flexShrink: 0 }}></div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{d.name}</span>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                    {d.monthsPassed}/{d.monthsTotal} months ·{" "}
                    {d.health === "slow"
                      ? <span style={{ color: "#F87171", fontWeight: 600 }}>Slow: {d.pct}% spent</span>
                      : d.health === "ok"
                        ? <span style={{ color: "#F97316", fontWeight: 600 }}>OK</span>
                        : <span style={{ color: "#2DD4BF", fontWeight: 600 }}>On Track</span>
                    }
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)" }}>{formatPKR(d.remaining)}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", minWidth: 30, textAlign: "right" }}>{d.pct}%</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Underspend + Receivables/Payables */}
        <div className="dashboard-grid">
          <motion.div className="card" style={{ gridColumn: "span 3" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>💡 Top 5 Underspend Activities</div>
            {underspentActivities.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No activities with remaining budget in selected period.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", gap: 8, fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                  <span>Activity</span><span>Budget</span><span>Actual</span><span>Unspent</span>
                </div>
                {underspentActivities.map((act: any, idx: number) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
                    <span
                      className="clickable"
                      onClick={(e) => { e.stopPropagation(); router.push(act.projectId ? `/dashboard/settings/budgets?project=${act.projectId}&activity=${act.id}` : `/dashboard/reports/spending-detail?activity=${act.id}&fy=${fiscalYear}`) }}
                    >
                      {act.name}
                    </span>
                    <span style={{ color: "var(--text)" }}>{formatPKR(act.budget)}</span>
                    <span style={{ color: "var(--text)" }}>{formatPKR(act.actual)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontWeight: 600, color: "#2DD4BF", fontSize: "0.75rem" }}>{formatPKR(act.remaining)}</span>
                      <span style={{ fontSize: "0.7rem", color: "#2DD4BF", whiteSpace: "nowrap" }}>({act.unspentPct}%)</span>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: "right", marginTop: "0.5rem" }}>
                  <button
                    style={{ background: "transparent", color: "#93C5FD", border: "1px solid #334155", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", fontFamily: "inherit" }}
                    onClick={() => router.push("/dashboard/reports/budget-vs-actual" + detailQuery())}
                  >
                    View all →
                  </button>
                </div>
              </>
            )}
          </motion.div>

          <motion.div className="card" style={{ gridColumn: "span 2" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "1rem" }}>⚖️ Receivables vs Payables</div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginBottom: "0.8rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>Receivables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalReceivables)}</div>
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-soft)" }}>VS</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 2 }}>Payables</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F97316" }}>{formatPKR(totalPayables)}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.75rem", fontWeight: 600 }}>
              {totalReceivables > totalPayables ? (
                <>
                  <CheckCircle size={16} style={{ color: "#2DD4BF" }} />
                  <span style={{ color: "#2DD4BF" }}>Healthy — excess of {formatPKR(totalReceivables - totalPayables)}</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} style={{ color: "#F87171" }} />
                  <span style={{ color: "#F87171" }}>Payables exceed by {formatPKR(totalPayables - totalReceivables)}</span>
                </>
              )}
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          style={{ background: "var(--card)", borderRadius: 12, padding: "0.6rem 1.2rem", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}
        >
          <span>⚠️ Health: {overspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Budget: {formatPKR(totalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {projectRows.length}</span>
          <span>📅 {periodLabel}</span>
          <span style={{ marginLeft: "auto" }}>Updated: {lastUpdated}</span>
        </motion.div>
      </div>
    </div>
  )
}