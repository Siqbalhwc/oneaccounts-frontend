"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Bell, RefreshCw, TrendingUp, TrendingDown } from "lucide-react"
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

// ── Previous-period dates, for trend deltas on KPI cards ────
// Returns the immediately-preceding period of the same length as `key`,
// so "This Month" compares to last month, "This Quarter" to the prior
// quarter, etc. Returns nulls for "all" since there's no prior window.
function getPreviousPeriodDates(key: PeriodKey): { start: string | null; end: string | null } {
  const now   = new Date()
  const y     = now.getFullYear()
  const m     = now.getMonth()
  const pad   = (n: number) => String(n).padStart(2, "0")
  const ymd   = (d: Date)   => d.toISOString().split("T")[0]
  const qStart = (q: number, yr: number) => new Date(yr, q * 3, 1)
  const qEnd   = (q: number, yr: number) => new Date(yr, q * 3 + 3, 0)
  const cq     = Math.floor(m / 3)

  switch (key) {
    case "this_month": {
      const lm = m === 0 ? 11 : m - 1
      const ly = m === 0 ? y - 1 : y
      return { start: `${ly}-${pad(lm + 1)}-01`, end: ymd(new Date(ly, lm + 1, 0)) }
    }
    case "last_month": {
      const lm2 = m - 2
      const d   = new Date(y, lm2, 1)
      return { start: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), end: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
    }
    case "this_quarter": {
      const lq  = cq === 0 ? 3 : cq - 1
      const lqy = cq === 0 ? y - 1 : y
      return { start: ymd(qStart(lq, lqy)), end: ymd(qEnd(lq, lqy)) }
    }
    case "last_quarter": {
      const lq   = cq === 0 ? 3 : cq - 1
      const lqy  = cq === 0 ? y - 1 : y
      const lq2  = lq === 0 ? 3 : lq - 1
      const lqy2 = lq === 0 ? lqy - 1 : lqy
      return { start: ymd(qStart(lq2, lqy2)), end: ymd(qEnd(lq2, lqy2)) }
    }
    case "this_year":
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    case "last_year":
      return { start: `${y - 2}-01-01`, end: `${y - 2}-12-31` }
    case "last_12_months": {
      const end   = new Date(now); end.setFullYear(end.getFullYear() - 1)
      const start = new Date(end); start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() + 1)
      return { start: ymd(start), end: ymd(end) }
    }
    case "all":
    default:
      return { start: null, end: null }
  }
}

// ── Trend delta helper (for KPI cards) ───────────────────────
function computeDelta(current: number, previous: number | null): { pct: number; up: boolean } | null {
  if (previous === null || previous === undefined) return null
  if (previous === 0) {
    if (current === 0) return null
    return { pct: 100, up: current > 0 }
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  return { pct, up: pct >= 0 }
}

function TrendBadge({ delta, goodWhenUp = true }: { delta: { pct: number; up: boolean } | null; goodWhenUp?: boolean }) {
  if (!delta) return null
  const isGood = goodWhenUp ? delta.up : !delta.up
  const color  = isGood ? "#10B981" : "#EF4444"
  const Icon   = delta.up ? TrendingUp : TrendingDown
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 4, fontSize: "0.72rem", fontWeight: 700, color }}>
      <Icon size={12} strokeWidth={2.5} />
      {Math.abs(delta.pct).toFixed(1)}% <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>vs last period</span>
    </div>
  )
}

// ── Consolidated notification center (invoices + bills) ─────
function NotificationCenter({
  invoiceCount,
  billCount,
  invoiceItems,
  billItems,
  onViewInvoices,
  onViewBills,
  isDark,
}: {
  invoiceCount: number
  billCount: number
  invoiceItems: { title: string; subtitle: string; amount?: string }[]
  billItems: { title: string; subtitle: string; amount?: string }[]
  onViewInvoices: () => void
  onViewBills: () => void
  isDark: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const totalCount = invoiceCount + billCount
  const hasItems = totalCount > 0

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} style={{ position: "relative", userSelect: "none" }}>
      <div
        onClick={() => setOpen(o => !o)}
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
        title="Notifications"
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
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </div>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 320, background: isDark ? "#1E293B" : "#FFFFFF", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 12, boxShadow: isDark ? "0 16px 48px rgba(0,0,0,0.7)" : "0 16px 48px rgba(0,0,0,0.15)", zIndex: 999, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}` }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text)" }}>Notifications</span>
            {!hasItems && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>You're all caught up 🎉</div>}
          </div>

          {invoiceCount > 0 && (
            <div>
              <div style={{ padding: "8px 14px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.05em" }}>{invoiceCount} Overdue Invoices</span>
                <button onClick={(e) => { e.stopPropagation(); setOpen(false); onViewInvoices() }} style={{ fontSize: "0.68rem", color: "#93C5FD", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>View All →</button>
              </div>
              <div style={{ maxHeight: 150, overflowY: "auto" }}>
                {invoiceItems.slice(0, 5).map((item, i) => (
                  <div key={i} style={{ padding: "7px 14px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text)" }}>{item.title}</div>
                      <div style={{ fontSize: "0.66rem", color: "#EF4444", marginTop: 1 }}>{item.subtitle}</div>
                    </div>
                    {item.amount && <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>{item.amount}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {billCount > 0 && (
            <div>
              <div style={{ padding: "8px 14px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.05em" }}>{billCount} Overdue Bills</span>
                <button onClick={(e) => { e.stopPropagation(); setOpen(false); onViewBills() }} style={{ fontSize: "0.68rem", color: "#93C5FD", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>View All →</button>
              </div>
              <div style={{ maxHeight: 150, overflowY: "auto" }}>
                {billItems.slice(0, 5).map((item, i) => (
                  <div key={i} style={{ padding: "7px 14px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text)" }}>{item.title}</div>
                      <div style={{ fontSize: "0.66rem", color: "#EF4444", marginTop: 1 }}>{item.subtitle}</div>
                    </div>
                    {item.amount && <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>{item.amount}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Odoo-style animated loading screen (first load only) ────
const LOADING_STEPS = [
  { icon: "🏗️", text: "Setting up your workspace…" },
  { icon: "📊", text: "Configuring chart of accounts…" },
  { icon: "🔐", text: "Applying security policies…" },
  { icon: "✨", text: "Almost ready — brewing the numbers…" },
]

function OdooLoader({ isDark }: { isDark: boolean }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [dotCount, setDotCount] = useState(1)

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx(i => (i + 1) % LOADING_STEPS.length)
    }, 1800)
    const dotTimer = setInterval(() => {
      setDotCount(d => (d % 3) + 1)
    }, 400)
    return () => { clearInterval(stepTimer); clearInterval(dotTimer) }
  }, [])

  const step = LOADING_STEPS[stepIdx]
  const dots = ".".repeat(dotCount)

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 0,
      padding: 40,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlide {
          0%  { opacity: 0; transform: translateY(8px); }
          20% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100%{ opacity: 0; transform: translateY(-8px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50%       { opacity: 1;   transform: scale(1.05); }
        }
        @keyframes barGrow {
          0%   { transform: scaleY(0.3); opacity: 0.4; }
          50%  { transform: scaleY(1);   opacity: 1;   }
          100% { transform: scaleY(0.3); opacity: 0.4; }
        }
      `}</style>

      <div style={{ marginBottom: 36, textAlign: "center" }}>
        <div style={{
          width: 72, height: 72,
          borderRadius: 20,
          background: isDark
            ? "linear-gradient(135deg, #6366f1 0%, #8B5CF6 100%)"
            : "linear-gradient(135deg, #6366f1 0%, #8B5CF6 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          boxShadow: "0 8px 32px rgba(99,102,241,0.35)",
        }}>
          <span style={{ fontSize: 34 }}>📒</span>
        </div>
        <div style={{
          fontSize: "1.5rem", fontWeight: 800,
          background: "linear-gradient(135deg, #6366f1, #A78BFA)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-0.02em",
        }}>
          OneAccounts
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
          by Siqbal
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "flex-end", gap: 5,
        height: 48, marginBottom: 36,
      }}>
        {[0.4, 0.7, 0.55, 1.0, 0.65, 0.85, 0.5, 0.75, 0.45, 0.9].map((h, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: `${h * 44}px`,
              borderRadius: 4,
              background: `hsl(${240 + i * 8}, 70%, ${isDark ? "65%" : "55%"})`,
              transformOrigin: "bottom",
              animation: `barGrow ${1.2 + i * 0.15}s ease-in-out ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </div>

      <div style={{
        width: 44, height: 44,
        borderRadius: "50%",
        border: "3px solid var(--border)",
        borderTop: "3px solid #A78BFA",
        animation: "spin 1s linear infinite",
        marginBottom: 28,
      }} />

      <div
        key={stepIdx}
        style={{
          textAlign: "center",
          animation: "fadeSlide 1.8s ease forwards",
        }}
      >
        <div style={{ fontSize: "1.6rem", marginBottom: 8 }}>{step.icon}</div>
        <div style={{
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--text)",
          maxWidth: 320,
          lineHeight: 1.4,
        }}>
          {step.text.replace("…", dots)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 32 }}>
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === stepIdx ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === stepIdx ? "#A78BFA" : isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      <div style={{
        marginTop: 24,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        textAlign: "center",
        maxWidth: 260,
        lineHeight: 1.6,
      }}>
        Building your financial dashboard. This only takes a moment.
      </div>
    </div>
  )
}

// ── New company empty state ─────────────────────────────────
function NewCompanyEmptyState({
  router,
  isDark,
  userDisplayName,
}: {
  router: ReturnType<typeof useRouter>
  isDark: boolean
  userDisplayName: string
}) {
  return (
    <div style={{
      background: "var(--bg)", minHeight: "100%",
      fontFamily: "'Inter', sans-serif", color: "var(--text)",
      padding: "2rem 1.5rem",
    }}>
      <style>{`
        @keyframes floatUp {
          0%   { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .setup-card {
          animation: floatUp 0.5s ease forwards;
        }
        .setup-card:nth-child(2) { animation-delay: 0.1s; opacity: 0; }
        .setup-card:nth-child(3) { animation-delay: 0.2s; opacity: 0; }
        .setup-card:nth-child(4) { animation-delay: 0.3s; opacity: 0; }
        .setup-card:nth-child(5) { animation-delay: 0.4s; opacity: 0; }
        .setup-step-btn {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px 20px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          text-align: left;
          font-family: inherit;
          color: var(--text);
        }
        .setup-step-btn:hover {
          border-color: #A78BFA;
          transform: translateX(4px);
          background: ${isDark ? "rgba(167,139,250,0.08)" : "rgba(167,139,250,0.05)"};
        }
      `}</style>

      <div
        className="setup-card"
        style={{
          background: isDark
            ? "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.1) 100%)"
            : "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 100%)",
          border: `1px solid ${isDark ? "rgba(167,139,250,0.25)" : "rgba(99,102,241,0.15)"}`,
          borderRadius: 16,
          padding: "28px 28px",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>🎉</div>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 8px", lineHeight: 1.2 }}>
          Welcome to OneAccounts{userDisplayName ? `, ${userDisplayName}` : ""}!
        </h2>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-muted)", maxWidth: 480, lineHeight: 1.6 }}>
          Your company workspace is live. Let's set up the essentials so your
          dashboard lights up with real data. It only takes a few minutes.
        </p>
      </div>

      <div className="setup-card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 12 }}>
          ⚡ Quick Setup — 4 steps to your first dashboard
        </div>
      </div>

      {[
        {
          step: "01", icon: "🏢", title: "Add your company details",
          sub: "Logo, address, tax number, and business info",
          link: "/dashboard/settings/company",
        },
        {
          step: "02", icon: "👤", title: "Add your first customer",
          sub: "Start tracking who owes you money",
          link: "/dashboard/customers/new",
        },
        {
          step: "03", icon: "📄", title: "Create your first invoice",
          sub: "Bill a customer and watch receivables populate",
          link: "/dashboard/invoices/new",
        },
        {
          step: "04", icon: "🏦", title: "Link a bank or cash account",
          sub: "Set opening balances so your cash & bank KPI works",
          link: "/dashboard/banking/bank-accounts",
        },
      ].map((item, i) => (
        <div key={i} className="setup-card" style={{ marginBottom: 10 }}>
          <button className="setup-step-btn" onClick={() => router.push(item.link)}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: isDark ? "rgba(167,139,250,0.15)" : "rgba(99,102,241,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.2rem",
            }}>
              {item.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#A78BFA", letterSpacing: "0.05em" }}>
                  STEP {item.step}
                </span>
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>{item.title}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{item.sub}</div>
            </div>
            <div style={{ fontSize: "1.1rem", color: "var(--text-muted)", flexShrink: 0 }}>→</div>
          </button>
        </div>
      ))}

      <div
        className="setup-card"
        style={{
          marginTop: 20,
          padding: "14px 18px",
          background: isDark ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.06)",
          border: `1px solid ${isDark ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.15)"}`,
          borderRadius: 10,
          fontSize: "0.78rem",
          color: "var(--text-muted)",
          lineHeight: 1.6,
        }}
      >
        💡 <strong style={{ color: "#10B981" }}>Tip:</strong> Once you create your first invoice, your Revenue, Receivables, and Profit cards will populate automatically. No manual GL entry needed.
      </div>
    </div>
  )
}

// ── Interfaces ──────────────────────────────────────────────
interface MonthlyProfit  { month: string; profit: number }
interface TopCustomer    { name: string; revenue: number; outstanding: number }
interface OverdueItem    { id: string; invoice_no: string; total: number; due_date: string; customer_name?: string }
interface PrevMetrics    { revenueTotal: number; expenseTotal: number; grossProfit: number }

// ── KPI card skeleton (used only inline during refresh, not first load) ──
function KpiSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div className="card" style={{ cursor: "default" }}>
      <div className="skeleton-line" style={{ width: "60%", height: 10, marginBottom: 10 }} />
      <div className="skeleton-line" style={{ width: "80%", height: 22 }} />
    </div>
  )
}

// ── Monthly profit chart (dependency-free, handles 1-point gracefully) ──
function ProfitTrendChart({
  data,
  formatPKR,
  isDark,
}: {
  data: MonthlyProfit[]
  formatPKR: (v: number) => string
  isDark: boolean
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        No profit data for selected period
      </div>
    )
  }

  // Single month: a sparse bar chart looks broken, so show a focused
  // callout card instead — this is a correct empty-of-comparison state,
  // not a bug, but it needs to *read* that way to the user.
  if (data.length === 1) {
    const only = data[0]
    const isPositive = only.profit >= 0
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 20,
        padding: "20px 24px",
        borderRadius: 12,
        background: isPositive
          ? isDark ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.05)"
          : isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)",
        border: `1px solid ${isPositive ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, flexShrink: 0,
          background: isPositive ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isPositive ? <TrendingUp size={26} color="#10B981" /> : <TrendingDown size={26} color="#EF4444" />}
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {only.month}
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: isPositive ? "#10B981" : "#EF4444", marginTop: 2 }}>
            {formatPKR(only.profit)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
            Only one month of activity in this period — switch to "Last 12 Months" or "This Year" to see a trend.
          </div>
        </div>
      </div>
    )
  }

  const maxProfit  = Math.max(...data.map(m => Math.abs(m.profit)), 1)
  const chartH     = 160
  const gap        = 12
  const barW       = 100 / data.length

  // Build an SVG polyline overlay tracing the profit trend across bars,
  // anchored to the same 0..chartH coordinate space as the bars below.
  const points = data.map((m, i) => {
    const x = (i + 0.5) * barW
    const norm = (m.profit + maxProfit) / (2 * maxProfit) // -max..max -> 0..1
    const y = chartH - norm * chartH
    return `${x},${y}`
  }).join(" ")

  return (
    <>
      <div className="chart-container">
        <div style={{ position: "relative", minWidth: 600 }}>
          {/* gridlines */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", pointerEvents: "none", height: chartH }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ borderTop: `1px dashed ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }} />
            ))}
          </div>

          {/* trend line overlay */}
          <svg
            viewBox={`0 0 100 ${chartH}`}
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: chartH, overflow: "visible", pointerEvents: "none" }}
          >
            <polyline
              points={points}
              fill="none"
              stroke={isDark ? "rgba(167,139,250,0.9)" : "rgba(99,102,241,0.85)"}
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="bar-chart" style={{ height: chartH, gap, position: "relative" }}>
            {data.map((m, i) => (
              <div
                key={i}
                className="bar-column"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ position: "relative" }}
              >
                {hoverIdx === i && (
                  <div style={{
                    position: "absolute", bottom: "100%", marginBottom: 6,
                    background: isDark ? "#1E293B" : "#0F172A", color: "#fff",
                    fontSize: "0.7rem", fontWeight: 700, padding: "4px 8px",
                    borderRadius: 6, whiteSpace: "nowrap", zIndex: 10,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                  }}>
                    {m.month}: {formatPKR(m.profit)}
                  </div>
                )}
                <div
                  className={`bar${m.profit < 0 ? " negative" : ""}`}
                  style={{
                    height: `${(Math.abs(m.profit) / maxProfit) * (chartH - 20) + 4}px`,
                    opacity: hoverIdx === null || hoverIdx === i ? 1 : 0.55,
                    transition: "opacity 0.15s, height 0.4s ease",
                  }}
                />
                <div className="bar-value">{formatPKR(m.profit)}</div>
                <div className="bar-label">{m.month}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="trend-summary">
        <span>📈 Best: <strong>{data.reduce((a, b) => a.profit > b.profit ? a : b).month}</strong> ({formatPKR(Math.max(...data.map(m => m.profit)))})</span>
        <span>📉 Worst: <strong>{data.reduce((a, b) => a.profit < b.profit ? a : b).month}</strong> ({formatPKR(Math.min(...data.map(m => m.profit)))})</span>
        <span>📊 Avg: <strong>{formatPKR(data.reduce((s, m) => s + m.profit, 0) / data.length)}</strong></span>
      </div>
    </>
  )
}

// ── Main component ──────────────────────────────────────────
export default function TradingServiceDashboard({ role }: { role: string }) {
  const router = useRouter()
  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark"
  const { companyId } = useCompany()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [userDisplayName, setUserDisplayName]   = useState("")
  const [businessType,    setBusinessType]       = useState("")
  const [loading,         setLoading]            = useState(true)   // first-ever load only
  const [refreshing,      setRefreshing]         = useState(false)  // subsequent period/refresh fetches
  const [selectedPeriod,  setSelectedPeriod]     = useState<PeriodKey>("all")
  const [isNewCompany,    setIsNewCompany]        = useState(false)
  const [lastUpdated,     setLastUpdated]         = useState<Date | null>(null)
  const hasLoadedOnce = useRef(false)

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

  // Previous-period comparison, for KPI trend badges (revenue/expense/profit only)
  const [prevMetrics, setPrevMetrics] = useState<PrevMetrics | null>(null)

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

  // ── Dashboard metrics (extracted so the refresh button can call it too) ──
  const fetchDashboard = useCallback(async () => {
    if (!companyId) return
    const { start, end } = getPeriodDates(selectedPeriod)

    // First-ever load shows the full animated loader; every subsequent
    // fetch (period switch, manual refresh) just dims the existing
    // content instead of remounting the whole page.
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)

    let finished = false
    const safetyTimer = setTimeout(() => {
      if (!finished) {
        finished = true
        setLoading(false)
        setRefreshing(false)
      }
    }, 8000)

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

          // Diagnostic flag: cash showing 0 while receivables/payables have
          // real balances usually means get_dashboard_metrics isn't summing
          // bank/cash GL accounts correctly for this company — worth a look
          // in the RPC rather than in this component.
          if (cash === 0 && (recv > 0 || pay > 0)) {
            console.warn(
              "[Dashboard] Cash & Bank returned 0 while Receivables/Payables are non-zero. " +
              "This likely means get_dashboard_metrics isn't summing bank/cash GL accounts " +
              "correctly for company", companyId
            )
          }

          setRevenueTotal(revenue)
          setExpenseTotal(expense)
          setCashBalance(cash)
          setTotalReceivables(recv)
          setTotalPayables(pay)
          setOverdueInvoicesCount(data.overdueInvoicesCount || 0)
          setOverdueBillsCount(data.overdueBillsCount || 0)
          setMonthlyProfit(data.monthlyProfit || [])
          setTopCustomers(data.topCustomers || [])
          setLastUpdated(new Date())
        }
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err)
    } finally {
      if (!finished) {
        finished = true
        clearTimeout(safetyTimer)
        setLoading(false)
        setRefreshing(false)
        hasLoadedOnce.current = true
      }
    }

    // Previous-period comparison for the Revenue / Expense / Gross Profit
    // trend badges. Skipped for "All Time" since there's no prior window.
    // Fetched separately (not Promise.all'd with the main call above) so a
    // failure here never blocks the primary KPIs from rendering.
    const { start: prevStart, end: prevEnd } = getPreviousPeriodDates(selectedPeriod)
    if (prevStart && prevEnd) {
      try {
        const { data: prevData, error: prevError } = await supabase.rpc("get_dashboard_metrics", {
          p_company_id: companyId,
          p_date_from: prevStart,
          p_date_to: prevEnd,
        })
        if (!prevError && prevData) {
          const pRevenue = prevData.revenueTotal || 0
          const pExpense = prevData.expenseTotal || 0
          setPrevMetrics({ revenueTotal: pRevenue, expenseTotal: pExpense, grossProfit: pRevenue - pExpense })
        } else {
          setPrevMetrics(null)
        }
      } catch (err) {
        console.error("Previous-period fetch error:", err)
        setPrevMetrics(null)
      }
    } else {
      setPrevMetrics(null)
    }

    return () => {
      clearTimeout(safetyTimer)
      finished = true
    }
  }, [companyId, selectedPeriod])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

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

  const formatRelativeTime = (d: Date | null): string => {
    if (!d) return ""
    const secs = Math.floor((Date.now() - d.getTime()) / 1000)
    if (secs < 10) return "just now"
    if (secs < 60) return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins} min ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ago`
  }

  const grossProfit  = revenueTotal - expenseTotal
  const animRevenue  = useAnimatedNumber(revenueTotal, 600)
  const animExpense  = useAnimatedNumber(expenseTotal, 600)
  const animProfit   = useAnimatedNumber(grossProfit,  600)
  const animCash     = useAnimatedNumber(cashBalance,  600)
  const animRecv     = useAnimatedNumber(totalReceivables, 600)
  const animPay      = useAnimatedNumber(totalPayables,    600)

  const periodLabel  = PERIOD_OPTIONS.find(p => p.key === selectedPeriod)?.label || ""

  const revenueDelta = prevMetrics ? computeDelta(revenueTotal, prevMetrics.revenueTotal) : null
  const expenseDelta = prevMetrics ? computeDelta(expenseTotal, prevMetrics.expenseTotal) : null
  const profitDelta  = prevMetrics ? computeDelta(grossProfit,  prevMetrics.grossProfit)  : null

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
  if (!companyId) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "1.2rem", color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem", marginTop: 8 }}>Account not linked to a company. Contact your administrator.</div>
      </div>
    )
  }

  // First-ever load: full animated loader (unchanged behavior)
  if (loading) return <OdooLoader isDark={isDark} />

  // If it's a brand‑new company, show the onboarding checklist
  if (isNewCompany) return <NewCompanyEmptyState router={router} isDark={isDark} userDisplayName={userDisplayName} />

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
        @keyframes shimmer {
          0%   { background-position: -200px 0; }
          100% { background-position: calc(200px + 100%) 0; }
        }

        .tsd * { box-sizing: border-box; }

        .tsd .skeleton-line {
          border-radius: 6px;
          background: ${isDark
            ? "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.13) 37%, rgba(255,255,255,0.06) 63%)"
            : "linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.11) 37%, rgba(0,0,0,0.06) 63%)"};
          background-size: 400px 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }

        .tsd .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 14px;
          padding: 20px; box-shadow: var(--shadow-sm);
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.2s ease;
          cursor: pointer; display: flex; flex-direction: column;
          min-height: 0; /* prevents flex children's grid content (quick-actions) from being clipped on mobile */
        }
        .tsd .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          border-color: var(--primary);
        }
        .tsd.is-refreshing .kpi-row .card,
        .tsd.is-refreshing .two-col .card,
        .tsd.is-refreshing .full-width .card {
          opacity: 0.55;
          pointer-events: none;
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

        .tsd .refresh-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 8px;
          background: ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"};
          border: 1px solid var(--border); cursor: pointer;
          color: var(--text-muted); transition: all 0.15s;
        }
        .tsd .refresh-btn:hover { color: var(--text); border-color: #A78BFA; }
        .tsd .refresh-btn.spinning svg { animation: spin 0.7s linear infinite; }

        .tsd .last-updated {
          font-size: 0.68rem; color: var(--text-muted);
          display: flex; align-items: center; gap: 6px;
        }

        .tsd .bells-group {
          display: flex; align-items: center; gap: 10px;
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
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          align-items: stretch;
        }
        .tsd .quick-action-btn {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          padding: 14px 8px; text-align: center;
          font-size: 0.82rem; font-weight: 600; color: var(--text);
          cursor: pointer; transition: 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .tsd .quick-action-btn:hover { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }

        .tsd table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .tsd th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 600; font-size: 0.65rem; text-transform: uppercase; }
        .tsd td { padding: 8px 12px; border-bottom: 1px solid var(--border); }

        .tsd .chart-container { padding: 8px 0 12px; overflow-x: auto; }
        .tsd .bar-chart        { display: flex; align-items: flex-end; gap: 12px; min-width: 600px; }
        .tsd .bar-column       { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .tsd .bar              { width: 100%; background: linear-gradient(180deg, #6366f1, #818cf8); border-radius: 6px 6px 0 0; min-height: 4px; }
        .tsd .bar.negative     { background: linear-gradient(180deg, #ef4444, #f87171); }
        .tsd .bar-value        { font-size: 10px; font-weight: 700; color: var(--text); white-space: nowrap; }
        .tsd .bar-label        { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
        .tsd .trend-summary    { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 0.75rem; font-weight: 600; flex-wrap: wrap; gap: 8px; }

        .customer-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }

        @media (max-width: 1024px) {
          .tsd .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .tsd .two-col { grid-template-columns: 1fr; gap: 16px; }
          .customer-name { max-width: 140px; }
        }

        /* ── MOBILE FIX: Show all 6 action buttons ── */
        @media (max-width: 768px) {
          .tsd .hero-right { width: 100%; justify-content: space-between; }
          .tsd .bells-group { border-left: none; padding-left: 0; }

          .tsd .quick-actions { 
            grid-template-columns: repeat(2, 1fr);
            grid-auto-rows: minmax(0, auto);
            gap: 8px;
            flex: 1 0 auto;
            height: auto;
          }
          .tsd .quick-action-btn {
            padding: 10px 6px;
            font-size: 0.72rem;
          }
        }

        @media (max-width: 640px) {
          .tsd .kpi-row { grid-template-columns: 1fr 1fr; }
          .tsd .hero    { flex-direction: column; align-items: flex-start; }
          .customer-name { max-width: 120px; }
        }

        @media (max-width: 380px) {
          .tsd .kpi-row { grid-template-columns: 1fr; }
          .tsd .quick-actions { 
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }
          .tsd .quick-action-btn {
            padding: 8px 4px;
            font-size: 0.65rem;
          }
        }
      `}</style>

      <div className={`tsd${refreshing ? " is-refreshing" : ""}`}>

        {/* ── Hero ── */}
        <div className="hero">
          <div className="hero-left">
            <h2>{getGreeting()}, {userDisplayName}</h2>
            <p>{businessType === "trading" ? "Trading Dashboard" : "Service Dashboard"}</p>
          </div>

          <div className="hero-right">
            <div className="last-updated">
              Updated {formatRelativeTime(lastUpdated)}
              <button
                className={`refresh-btn${refreshing ? " spinning" : ""}`}
                onClick={fetchDashboard}
                title="Refresh dashboard"
                disabled={refreshing}
              >
                <RefreshCw size={13} />
              </button>
            </div>

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
              <NotificationCenter
                invoiceCount={overdueInvoicesCount}
                billCount={overdueBillsCount}
                invoiceItems={invoiceBellItems}
                billItems={billBellItems}
                onViewInvoices={() => router.push("/dashboard/invoices?status=Unpaid&overdue=true")}
                onViewBills={() => router.push("/dashboard/bills?status=Unpaid&overdue=true")}
                isDark={isDark}
              />
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="kpi-row">
          {[
            { label: "💰 Total Revenue",   value: formatPKR(animRevenue), color: "#10B981", link: "/dashboard/reports/profit-loss", delta: revenueDelta, goodWhenUp: true },
            { label: "📤 Total Expenses",  value: formatPKR(animExpense), color: "#EF4444", link: "/dashboard/reports/profit-loss", delta: expenseDelta, goodWhenUp: false },
            { label: "📈 Gross Profit",    value: formatPKR(animProfit),  color: grossProfit >= 0 ? "#10B981" : "#EF4444", link: "/dashboard/reports/profit-loss", delta: profitDelta, goodWhenUp: true },
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
              {kpi.delta !== undefined && <TrendBadge delta={kpi.delta} goodWhenUp={kpi.goodWhenUp} />}
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
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/customers/new")}>👤 Add Customer</div>
              <div className="quick-action-btn" onClick={() => router.push("/dashboard/suppliers/new")}>🚚 Add Supplier</div>
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
            <ProfitTrendChart data={monthlyProfit} formatPKR={formatPKR} isDark={isDark} />
          </div>
        </div>

      </div>
    </div>
  )
}