"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle } from "lucide-react"
import { motion } from "framer-motion"
import { useTheme } from "@/contexts/ThemeContext"
import { useCompany } from "@/contexts/CompanyContext"
import { useDashboardData } from "@/hooks/useDashboardData"
import { createBrowserClient } from "@supabase/ssr"

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
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")

  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])

  useEffect(() => {
    if (!companyId) return
    supabase.from("projects").select("id, name").eq("company_id", companyId).order("name")
      .then(({ data }) => data && setProjects(data))
    supabase.from("donors").select("id, name").eq("company_id", companyId).order("name")
      .then(({ data }) => data && setDonors(data))
  }, [companyId])

  const { data: dashData, isLoading, isError } = useDashboardData(companyId, fiscalYear)

  // ── Original aggregate values (work without filter) ─────────────────
  const totalBudgetOrig = dashData?.totalBudget || 0
  const totalSpentOrig = dashData?.totalSpent || 0
  const monthlySpendingOrig = dashData?.monthlySpending || 0

  // ── Raw arrays for filtered calculations ───────────────────────────
  const allBudgets = dashData?.allBudgets || []
  const allJournalLines = dashData?.allJournalLines || []
  const allDonors = dashData?.allDonors || []
  const allProjects = dashData?.allProjects || []
  const allActivities = dashData?.allActivities || []

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const startOfMonthISO = new Date(Date.UTC(now.getFullYear(), currentMonth - 1, 1)).toISOString().split("T")[0]
  const todayISO = now.toISOString().split("T")[0]

  // ── Filter helpers ─────────────────────────────────────────────────
  const isFiltered = selectedProjectId !== "" || selectedDonorId !== ""

  const filteredBudgets = useMemo(() => {
    if (!isFiltered) return allBudgets
    return allBudgets.filter((b: any) => {
      if (selectedProjectId && String(b.project_id) !== selectedProjectId) return false
      if (selectedDonorId && String(b.donor_id) !== selectedDonorId) return false
      return true
    })
  }, [allBudgets, selectedProjectId, selectedDonorId, isFiltered])

  const filteredJournalLines = useMemo(() => {
    if (!isFiltered) return allJournalLines
    return allJournalLines.filter((jl: any) => {
      if (selectedProjectId && String(jl.project_id) !== selectedProjectId) return false
      if (selectedDonorId && String(jl.donor_id) !== selectedDonorId) return false
      return true
    })
  }, [allJournalLines, selectedProjectId, selectedDonorId, isFiltered])

  // ── KPIs: use original values when unfiltered, filtered otherwise ──
  const totalBudget = isFiltered
    ? filteredBudgets.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0)
    : totalBudgetOrig

  const totalSpent = isFiltered
    ? filteredJournalLines.reduce((s: number, jl: any) => s + (jl.debit || 0) - (jl.credit || 0), 0)
    : totalSpentOrig

  const monthlySpending = isFiltered
    ? filteredJournalLines
        .filter((jl: any) => jl.journal_entries?.date >= startOfMonthISO && jl.journal_entries?.date <= todayISO)
        .reduce((s: number, jl: any) => s + (jl.debit || 0) - (jl.credit || 0), 0)
    : monthlySpendingOrig

  // Last month spending (unchanged, from RPC)
  const lastMonthSpending = dashData?.lastMonthSpending || 0
  const spendingTrend = dashData?.spendingTrend || 0

  // ── Donor balances (always from filtered data) ─────────────────────
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

  // ── Project utilization (always from filtered data) ────────────────
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

  // ── Underspent activities (always from filtered data) ──────────────
  const activityNameMap: Record<number, string> = {}
  allActivities.forEach((a: any) => { activityNameMap[a.id] = a.name })

  const budgetByAct: Record<number, number> = {}
  const actualByAct: Record<number, number> = {}
  const actProjectMap: Record<number, number> = {}

  filteredBudgets.forEach((b: any) => {
    const aid = b.activity_id
    budgetByAct[aid] = (budgetByAct[aid] || 0) + (b.budgeted_amount || 0)
    if (!actProjectMap[aid] && b.project_id) {
      actProjectMap[aid] = b.project_id
    }
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
        return {
          id,
          name: activityNameMap[id] || `Activity ${id}`,
          budget,
          actual,
          remaining,
          spentPct,
          unspentPct,
          projectId: actProjectMap[id] || null,
        }
      })
      .filter((a) => a.budget > 0 && a.spentPct < 100)
      .sort((a, b) => a.spentPct - b.spentPct)
      .slice(0, 5)
  }, [budgetByAct, actualByAct, activityNameMap, actProjectMap])

  // ── Receivables / Payables (unchanged) ────────────────────────────
  const totalReceivables = dashData?.totalReceivables || 0
  const totalPayables = dashData?.totalPayables || 0
  const overdueInvoicesCount = dashData?.overdueInvoicesCount || 0
  const lastUpdated = dashData?.lastUpdated || ""

  const remainingFunds = totalBudget - totalSpent
  const spentPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0

  const projectsSorted = [...projectRows].sort((a: any, b: any) => b.pct - a.pct)
  const highestProject = projectsSorted[0] || null
  const lowestProject = projectsSorted[projectsSorted.length - 1] || null

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
    const params = new URLSearchParams({ fy: String(fiscalYear) })
    if (selectedProjectId) params.set("project", selectedProjectId)
    if (selectedDonorId) params.set("donor", selectedDonorId)
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return "?" + params.toString()
  }

  const Trend = ({ value, positive = false, negative = false }: { value: number; positive?: boolean; negative?: boolean }) => {
    if (value === 0) return <Minus size={14} style={{ color: "#94A3B8" }} />
    if (value > 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: positive ? "#2DD4BF" : "#F97316", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingUp size={14} /> {Math.abs(value)}%
    </span>
    if (value < 0) return <span style={{ display: "flex", alignItems: "center", gap: 2, color: negative ? "#F97316" : "#2DD4BF", fontSize: "0.75rem", fontWeight: 600 }}>
      <TrendingDown size={14} /> {Math.abs(value)}%
    </span>
    return null
  }

  const animBudget = useAnimatedNumber(totalBudget / 1_000_000, 600)
  const animSpent = useAnimatedNumber(totalSpent / 1_000_000, 600)
  const animRemaining = useAnimatedNumber(Math.abs(totalBudget - totalSpent) / 1_000_000, 600)
  const animMonthly = useAnimatedNumber(monthlySpending / 1_000_000, 600)

  const fmtM = (valueInMillions: number): string => {
    const sign = valueInMillions < 0 ? "-" : ""
    return `${sign}PKR ${Math.abs(valueInMillions).toFixed(1)}M`
  }

  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.45 },
    }),
  }

  const hoverScale = {
    whileHover: {
      scale: 1.03,
      y: -6,
      boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.12)",
      transition: { duration: 0.25 },
    },
  }

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
          white-space: normal;
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
          max-width: 150px;
        }
        .mgmt .filter-pill:focus { outline: none; border-color: var(--border-strong); }

        .mgmt .warning-banner {
          background: var(--warn-bg, #FEF3C7);
          border: 1px solid var(--warn-border, #FDE68A);
          border-left: 6px solid #EF4444;
          border-radius: 10px; padding: 8px 16px;
          margin-bottom: 1rem; display: flex;
          align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
          font-size: 0.9rem; color: var(--warn-text, #92400E);
          font-weight: 500;
        }
        .mgmt .warning-btn {
          background: #374151;
          color: white; border: none;
          border-radius: 6px; padding: 6px 14px;
          font-weight: 600; cursor: pointer; font-size: 0.8rem;
          white-space: nowrap; font-family: inherit;
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
            display: flex;
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            gap: 0.8rem;
            padding-bottom: 0.5rem;
          }
          .dashboard-grid-32 > .card {
            flex: 0 0 auto;
            width: 85vw;
            max-width: 340px;
          }
        }

        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.7rem; font-weight: 700; color: var(--text); line-height: 1.2; }
        .kpi-meta { font-size: 0.8rem; color: var(--text-soft); display: flex; align-items: center; gap: 0.3rem; }

        .progress-bg { height: 5px; background: var(--border); border-radius: 10px; flex: 1; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; background: #2DD4BF; }

        .clickable { color: #93C5FD; text-decoration: underline; cursor: pointer; }

        .overdue-banner {
          background: var(--card); border: 1px solid var(--border); border-left: 4px solid #EF4444;
          border-radius: 8px; padding: 0.5rem 1rem; margin-bottom: 1rem;
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; font-size: 0.85rem; color: var(--text); font-weight: 500;
          flex-wrap: nowrap;
        }
        .overdue-banner strong { color: #EF4444; white-space: nowrap; }
        .overdue-btn {
          background: #EF4444; color: white; border: none;
          border-radius: 6px; padding: 5px 12px;
          font-weight: 600; cursor: pointer; font-size: 0.78rem;
          white-space: nowrap; font-family: inherit;
        }

        @media (max-width: 1100px) {
          .dashboard-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 800px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .hero { flex-direction: column; align-items: flex-start; }
          .hero-filters { width: 100%; }
        }
        @media (max-width: 640px) {
          .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
          .hero { padding: 1rem; }
          .hero-greeting h2 { font-size: 1.1rem; }
          .hero-greeting p { font-size: 0.8rem; }
          .hero-filters { width: 100%; justify-content: space-between; gap: 0.3rem; }
          .filter-label { font-size: 0.7rem; }
          .filter-pill { font-size: 0.7rem; padding: 0.15rem 0.4rem; padding-right: 1.4rem; background-position: right 0.3rem center; max-width: 120px; }
          .card { padding: 1rem; }
          .kpi-value { font-size: 1.4rem; }
        }
        @media (max-width: 380px) {
          .dashboard-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="mgmt" style={{ padding: "0.8rem 1.2rem" }}>
        {/* ── Hero ── */}
        <motion.div
          className="hero"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="hero-greeting">
            <h2>{getGreeting()}, siqbalhwc</h2>
            <p>Here's what's happening with your NGO portfolio today</p>
          </div>
          <div className="hero-filters">
            <span className="filter-label">Period:</span>
            <select className="filter-pill" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
              {[2024,2025,2026,2027].map((y: number) => <option key={y} value={y}>FY {y}</option>)}
            </select>
            <span className="filter-label">Projects:</span>
            <select className="filter-pill" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="filter-label">Donors:</span>
            <select className="filter-pill" value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
              <option value="">All Donors</option>
              {donors.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </motion.div>

        {/* Overdue invoices banner */}
        {overdueInvoicesCount > 0 && (
          <motion.div className="overdue-banner" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0, boxShadow: ["0 0 0 rgba(239,68,68,0)", "0 0 20px rgba(239,68,68,0.3)", "0 0 0 rgba(239,68,68,0)"] }} transition={{ boxShadow: { repeat: Infinity, duration: 2.5 } }}>
            <span>⚠️ <strong>{overdueInvoicesCount} overdue {overdueInvoicesCount === 1 ? "invoice" : "invoices"}</strong></span>
            <button className="overdue-btn" onClick={() => router.push("/dashboard/invoices?status=Unpaid&overdue=true")}>View overdue invoices →</button>
          </motion.div>
        )}

        {/* Overspent warning banner */}
        {overspentCount > 0 && (
          <motion.div className="warning-banner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
            <span>⚠️ Portfolio overspent by {formatPKR(totalSpent - totalBudget)}. {overspentCount} {overspentCount === 1 ? "project" : "projects"} need review.</span>
            <button className="warning-btn" onClick={() => router.push("/dashboard/reports/overspent" + detailQuery())}>View overspent projects →</button>
          </motion.div>
        )}

        {/* KPI cards */}
        <div className="dashboard-grid">
          {[
            { label: "Total Budget", value: fmtM(animBudget), meta: `${projectRows.length} projects`, color: "#A78BFA", link: "/dashboard/reports/budget-summary" },
            { label: "Total Spent", value: fmtM(animSpent), meta: `${spentPct}% of budget`, color: "#F97316", link: "/dashboard/reports/spending-detail" },
            { label: remainingFunds < 0 ? "Overspent" : "Remaining", value: fmtM(animRemaining), meta: `${Math.abs(Math.round((remainingFunds / Math.max(totalBudget, 1)) * 100))}% ${remainingFunds < 0 ? "over" : "left"}`, color: remainingFunds >= 0 ? "#2DD4BF" : "#F87171", link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null },
            { label: "Portfolio Health", value: overspentCount > 0 ? "⚠️ Needs Attention" : "Healthy", meta: `${Math.round((1 - overspentCount / Math.max(projectRows.length, 1)) * 100)}% health score`, color: overspentCount > 0 ? "#F97316" : "#2DD4BF", link: "/dashboard/reports/overspent" },
            { label: "📆 Monthly Spending", value: monthlySpending > 0 ? fmtM(animMonthly) : "—", meta: monthlySpending === 0 ? "No transactions this month" : `vs. ${formatPKR(lastMonthSpending)} last month`, color: monthlySpending > 0 ? "#F97316" : "#94A3B8", link: "/dashboard/reports/spending-detail" },
          ].map((kpi: any, i: number) => (
            <motion.div key={kpi.label} className="card" custom={i} initial="hidden" animate="visible" variants={cardVariant} {...hoverScale} onClick={() => kpi.link && router.push(kpi.link + detailQuery())}>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="kpi-meta">
                {kpi.meta}
                {kpi.label === "📆 Monthly Spending" && monthlySpending > 0 && <Trend value={spendingTrend} positive={spendingTrend < 0} negative={spendingTrend > 0} />}
              </div>
              {kpi.label === "Total Spent" && highestProject && lowestProject && highestProject.id !== lowestProject.id && (
                <div style={{ fontSize: "0.65rem", color: "#93C5FD", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  🔺 {highestProject.name} {highestProject.pct}% · 🔻 {lowestProject.name} {lowestProject.pct}%
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Project Utilization + Donor Balances */}
        <div className="dashboard-grid-32">
          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>📊 Top 5 Project Utilization</div>
            {projectRows.slice(0, 5).map((p: any, idx: number) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}&fy=${fiscalYear}`)} style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: "var(--card)", borderRadius: "12px", padding: "0.5rem 1rem", border: "1px solid var(--border)", cursor: "pointer", marginBottom: "0.5rem", flexWrap: "wrap" }}>
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
                <button className="warning-btn" style={{ background: "transparent", color: "#93C5FD", border: "1px solid #334155", padding: "4px 12px" }} onClick={() => router.push("/dashboard/settings/budgets" + detailQuery())}>View All Projects →</button>
              </div>
            )}
          </motion.div>

          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.8rem" }}>💧 Donor Balances</div>
            {donorBalances.map((d: any, idx: number) => (
              <div key={idx} onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}&fy=${fiscalYear}`)} style={{ display: "flex", alignItems: "center", gap: "0.8rem", background: "var(--card)", borderRadius: "12px", padding: "0.5rem 1rem", border: "1px solid var(--border)", cursor: "pointer", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.overspent ? "#F87171" : "#A78BFA", flexShrink: 0 }}></div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{d.name}</span>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{d.monthsPassed}/{d.monthsTotal} months · {d.health === "slow" ? <span style={{ color: "#F87171", fontWeight: 600 }}>Slow: only {d.pct}% spent</span> : d.health === "ok" ? <span style={{ color: "#F97316", fontWeight: 600 }}>OK</span> : <span style={{ color: "#2DD4BF", fontWeight: 600 }}>On Track</span>}</div>
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
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No activities with remaining budget this month.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", gap: 8, fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                  <span>Activity</span><span>Budget</span><span>Actual</span><span>Unspent</span>
                </div>
                {underspentActivities.map((act: any, idx: number) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
                    <span className="clickable" onClick={(e) => { e.stopPropagation(); router.push(act.projectId ? `/dashboard/settings/budgets?project=${act.projectId}&activity=${act.id}` : `/dashboard/reports/spending-detail?activity=${act.id}&fy=${fiscalYear}`) }}>
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
                  <button className="warning-btn" style={{ background: "transparent", color: "#93C5FD", border: "1px solid #334155", padding: "4px 12px" }} onClick={() => router.push("/dashboard/reports/budget-vs-actual" + detailQuery())}>View all →</button>
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
                  <span style={{ color: "#2DD4BF" }}>Healthy — Receivables exceed Payables by {formatPKR(totalReceivables - totalPayables)}</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} style={{ color: "#F87171" }} />
                  <span style={{ color: "#F87171" }}>Unhealthy — Payables exceed Receivables by {formatPKR(totalPayables - totalReceivables)}</span>
                </>
              )}
            </div>
          </motion.div>
        </div>

        {/* Footer summary */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.5 }} style={{ background: "var(--card)", borderRadius: 12, padding: "0.6rem 1.2rem", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
          <span>⚠️ Portfolio Health: {overspentCount > 0 ? "Needs Attention" : "Healthy"}</span>
          <span>💰 Total Budget: {formatPKR(totalBudget)}</span>
          <span>📈 Utilized: {spentPct}%</span>
          <span>📁 Projects: {projectRows.length}</span>
          <span style={{ marginLeft: "auto" }}>Last updated: {lastUpdated}</span>
        </motion.div>
      </div>
    </div>
  )
}