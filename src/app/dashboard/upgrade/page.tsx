"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Check, Clock, ArrowRight, Plus, ShieldCheck, Zap, AlertTriangle, Star, TrendingUp, X } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"

/* ─── Constants ──────────────────────────────────────────────── */

const BENCHMARK_NOTE =
  "Competitor plans start at PKR 10,000+ / user / month (Odoo, QuickBooks, Zoho). You save up to 70% with OneAccounts."

// Hard-coded pricing per business type (mirrors DB; used as fallback / display)
const PLAN_PRICING: Record<string, { monthly: number; half_yearly: number; yearly: number }> = {
  service: { monthly: 3000,  half_yearly: 16000, yearly: 30000 },
  trading: { monthly: 3000,  half_yearly: 16000, yearly: 30000 },
  ngo:     { monthly: 5000,  half_yearly: 28000, yearly: 50000 },
}

const TOPUP_PRICE_MONTHLY = 500 // PKR per user per month

// Discount % for topup on 6-month / yearly plans — same as base plan
function topupDiscountedPrice(baseMonthly: number, period: BillingPeriod): number {
  if (period === "monthly")     return baseMonthly
  if (period === "half_yearly") {
    // same % discount as base plan 6-month
    // e.g. service: 16000 / (3000*6) = 88.9%, so discount ~11.1%
    // We derive the ratio from PLAN_PRICING for the current business type
    // But topup is universal, so we use the average discount applied to the base plan
    // Simplest: apply same flat discount of 16/18 ratio (≈11%) for 6m, 30/36 (≈17%) for 12m
    return Math.round(baseMonthly * 6 * (16000 / 18000))
  }
  // yearly
  return Math.round(baseMonthly * 12 * (30000 / 36000))
}

const TOPUP_FEATURES = [
  {
    code: "asset_management",
    name: "Fixed Asset Management",
    icon: "🏗️",
    desc: "Register assets, post depreciation automatically, record disposals, and run the asset schedule report.",
  },
  {
    code: "purchase_orders",
    name: "Purchase Orders",
    icon: "📦",
    desc: "Full PO workflow — raise, approve, receive (GRN), and auto-post supplier bills on receipt.",
  },
  {
    code: "whatsapp",
    name: "WhatsApp Integration",
    icon: "💬",
    desc: "Send invoices, payment receipts, and overdue reminders directly to customers via WhatsApp.",
  },
  {
    code: "invoice_automation",
    name: "Invoice Automation",
    icon: "⚡",
    desc: "Set up recurring invoices and scheduled billing runs — OneAccounts posts them automatically.",
  },
  {
    code: "profit_allocation",
    name: "Profit Allocation",
    icon: "💰",
    desc: "Define partner or investor shares and allocate net profit to capital accounts in one click.",
  },
  {
    code: "investors",
    name: "Investors Module",
    icon: "📈",
    desc: "Track investor capital, returns, and statements. Generate investor-facing reports at any date.",
  },
]

const PLAN_FEATURES = [
  {
    label: "CRM",
    items: ["Customers", "Sales invoices", "Receipts", "Vendors", "Bills", "Payments"],
    icon: "users",
  },
  {
    label: "Banking",
    items: ["Bank accounts", "Deposits & withdrawals", "Inter-bank transfers", "Bank reconciliation"],
    icon: "building-bank",
  },
  {
    label: "Accounting",
    items: ["Chart of accounts", "Journal entries", "General ledger"],
    icon: "calculator",
  },
  {
    label: "Reports",
    items: ["Trial balance", "Profit & loss", "Balance sheet", "Customer & vendor ledgers"],
    icon: "report-analytics",
  },
  {
    label: "Settings",
    items: ["Company branding & logo", "Address & contact info", "Fiscal year"],
    icon: "settings",
  },
]

type BillingPeriod = "monthly" | "half_yearly" | "yearly"

const PERIOD_META: Record<BillingPeriod, { label: string; unit: string; months: number }> = {
  monthly:     { label: "Monthly",   unit: "month",    months: 1  },
  half_yearly: { label: "6 Months",  unit: "6 months", months: 6  },
  yearly:      { label: "12 Months", unit: "year",     months: 12 },
}

/* ─── Helper: capitalise acronyms ────────────────────────────── */
function fmtBizType(raw: string): string {
  if (!raw) return ""
  return raw
    .split(" ")
    .map((w) =>
      ["ngo", "llc", "pvt", "ltd"].includes(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ")
}

/* ─── Animated counter hook ──────────────────────────────────── */
function useAnimatedNumber(target: number, duration = 420) {
  const [display, setDisplay] = useState(target)
  const prev = useRef(target)

  useEffect(() => {
    const start  = prev.current
    const diff   = target - start
    if (diff === 0) return
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setDisplay(Math.round(start + diff * ease))
      if (progress < 1) requestAnimationFrame(tick)
      else prev.current = target
    }
    requestAnimationFrame(tick)
  }, [target, duration])

  return display
}

/* ─── Feature tooltip ────────────────────────────────────────── */
function FeatureRow({ feature }: { feature: typeof PLAN_FEATURES[0] }) {
  const [open, setOpen] = useState(false)
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 0",
        borderBottom: "1px solid #F1F5F9",
        cursor: "pointer",
        position: "relative",
      }}
      onClick={() => setOpen((o) => !o)}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#334155" }}>
        <span style={{
          width: 22, height: 22, borderRadius: "50%", background: "#DCFCE7",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Check size={11} color="#16A34A" />
        </span>
        {feature.label}
      </span>
      <span style={{ fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 4 }}>
        {open ? "Hide" : "Details"}
        <span style={{ transform: open ? "rotate(180deg)" : "rotate(0)", display: "inline-block", transition: "transform 0.2s" }}>▾</span>
      </span>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          background: "white", border: "1px solid #E2E8F0", borderRadius: 10,
          padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        }}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {feature.items.map((item) => (
              <li key={item} style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "#10B981", fontSize: 14 }}>›</span> {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

/* ─── Main component ─────────────────────────────────────────── */
export default function UpgradePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router       = useRouter()
  const { companyId } = useCompany()

  const [plan, setPlan]                   = useState<any>(null)
  const [subscription, setSubscription]   = useState<any>(null)
  const [activeTopups, setActiveTopups]   = useState<string[]>([])
  const [selectedTopups, setSelectedTopups] = useState<string[]>([])
  const [businessType, setBusinessType]   = useState("")
  const [loading, setLoading]             = useState(true)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly")
  const [highlightCard, setHighlightCard] = useState(false)

  useEffect(() => {
    if (!companyId) return
    const fetchData = async () => {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("business_type, plans(code, name, monthly_price_per_user, half_yearly_price_per_user, yearly_price_per_user, trial_days)")
          .eq("id", companyId)
          .single()

        if (company) {
          setPlan(Array.isArray(company.plans) ? company.plans[0] : company.plans)
          setBusinessType(company.business_type || "")
        }

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle()

        setSubscription(sub)

        if (sub) {
          const { data: topups } = await supabase
            .from("subscription_topups")
            .select("feature_code")
            .eq("subscription_id", sub.id)
            .eq("status", "active")
          if (topups) setActiveTopups(topups.map((t) => t.feature_code))
        }
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    fetchData()
  }, [companyId])

  /* ── Pricing logic ── */
  const bizKey = businessType.toLowerCase() as keyof typeof PLAN_PRICING
  const pricing = PLAN_PRICING[bizKey] || PLAN_PRICING.service

  const getBasePrice = (period: BillingPeriod): number => {
    // prefer DB values, fall back to hard-coded
    if (plan) {
      const v =
        period === "monthly"     ? plan.monthly_price_per_user :
        period === "half_yearly" ? plan.half_yearly_price_per_user :
                                   plan.yearly_price_per_user
      if (v && v > 0) return v
    }
    return pricing[period === "half_yearly" ? "half_yearly" : period]
  }

  const getTopupPrice = (period: BillingPeriod): number => {
    return topupDiscountedPrice(TOPUP_PRICE_MONTHLY, period)
  }

  const totalPrice = (period: BillingPeriod): number => {
    const base   = getBasePrice(period)
    const addons = selectedTopups.length * getTopupPrice(period)
    return base + addons
  }

  const animatedTotal = useAnimatedNumber(totalPrice(billingPeriod))

  // Savings vs monthly equivalent
  const monthlyCost = getBasePrice("monthly")
  const currentCost = getBasePrice(billingPeriod)
  const months      = PERIOD_META[billingPeriod].months
  const fullPrice   = monthlyCost * months
  const saving      = fullPrice > currentCost ? fullPrice - currentCost : 0
  const savingPct   = fullPrice > 0 ? Math.round((saving / fullPrice) * 100) : 0

  const handleUpgrade = () => {
    const price = totalPrice(billingPeriod)
    const topupParams = selectedTopups.map(t => `topups[]=${t}`).join("&")
    router.push(
      `/dashboard/upgrade/payment?amount=${price}&period=${billingPeriod}&plan=${plan?.code || ""}${topupParams ? "&" + topupParams : ""}`
    )
  }

  const handleActivateTopup = (featureCode: string, featureName: string) => {
    router.push(
      `/dashboard/upgrade/payment?amount=${getTopupPrice(billingPeriod)}&period=${billingPeriod}&plan=${plan?.code || ""}&topup=${featureCode}&topup_name=${encodeURIComponent(featureName)}`
    )
  }

  const toggleTopup = (code: string) => {
    setSelectedTopups((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
    // flash upgrade card
    setHighlightCard(true)
    setTimeout(() => setHighlightCard(false), 600)
  }

  const daysLeft = subscription?.end_date
    ? Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : plan?.trial_days ?? 10

  const isExpired = typeof daysLeft === "number" && daysLeft <= 0
  const isUrgent  = typeof daysLeft === "number" && daysLeft > 0 && daysLeft <= 5
  const userCount = subscription?.max_users || 1

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "60vh", gap: 12, color: "#64748B", fontSize: 14,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <span style={{
          width: 18, height: 18, border: "2px solid #E2E8F0",
          borderTopColor: "#1740C8", borderRadius: "50%",
          display: "inline-block", animation: "spin 0.6s linear infinite",
        }} />
        Loading…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  /* ── Styles ── */
  const css = `
    @keyframes spin   { to { transform: rotate(360deg); } }
    @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse  { 0%,100% { box-shadow:0 0 0 0 rgba(23,64,200,0.18); } 50% { box-shadow:0 0 0 8px rgba(23,64,200,0); } }

    .oa-page { padding:28px 28px 56px; background:#F8FAFC; min-height:100vh;
               font-family:'Plus Jakarta Sans',sans-serif; }

    /* header */
    .oa-h1  { font-size:26px; font-weight:800; color:#0F172A; margin:0 0 5px; letter-spacing:-0.5px; }
    .oa-sub { font-size:14px; color:#64748B; margin:0; display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .oa-dot { color:#CBD5E1; }

    /* banners */
    .banner { display:flex; align-items:center; gap:10px; padding:12px 16px;
              border-radius:12px; font-size:13px; font-weight:600;
              margin-bottom:20px; animation:fadeUp .35s ease; }
    .banner-warn  { background:#FFF7ED; border:1px solid #FED7AA; color:#9A3412; }
    .banner-error { background:#FEF2F2; border:1px solid #FECACA; color:#B91C1C; }

    /* period toggle */
    .period-wrap  { margin-bottom:24px; }
    .period-label { font-size:11px; font-weight:800; text-transform:uppercase;
                    letter-spacing:.12em; color:#94A3B8; margin-bottom:10px; }
    .period-toggle { display:inline-flex; border:1.5px solid #E2E8F0; border-radius:12px;
                     overflow:hidden; background:#F8FAFC; }
    .period-btn   { padding:9px 18px; font-size:13px; font-weight:700; border:none;
                    cursor:pointer; background:transparent; color:#64748B;
                    transition:all .18s; font-family:inherit; white-space:nowrap;
                    display:flex; align-items:center; gap:6px; }
    .period-btn:hover { background:#F1F5F9; color:#0F172A; }
    .period-btn.active { background:#1740C8; color:white; border-radius:10px; }
    .save-pill { background:rgba(255,255,255,.22); font-size:10px; font-weight:800;
                 padding:2px 7px; border-radius:20px; }

    /* plan grid */
    .plan-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px;
                 align-items:stretch; margin-bottom:44px; }
    @media(max-width:640px){ .plan-grid { grid-template-columns:1fr; } }

    /* cards */
    .plan-card { background:white; border-radius:20px; padding:28px;
                 border:1.5px solid #E2E8F0; display:flex; flex-direction:column;
                 animation:fadeUp .4s ease; }
    .plan-card-upgrade { border:2px solid #1740C8;
                         box-shadow:0 8px 40px rgba(23,64,200,.10); }
    .plan-card-upgrade.highlight { animation:pulse .6s ease; }

    /* card labels */
    .card-lbl        { font-size:10px; font-weight:800; text-transform:uppercase;
                       letter-spacing:.13em; color:#94A3B8; margin-bottom:5px; }
    .card-lbl-blue   { color:#1740C8; }
    .plan-name-text  { font-size:22px; font-weight:800; color:#0F172A;
                       letter-spacing:-.3px; margin:0 0 4px; }
    .plan-super      { font-size:13px; font-weight:500; color:#94A3B8; vertical-align:super; }

    /* badges */
    .badge           { display:inline-flex; align-items:center; gap:4px;
                       font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; }
    .badge-green     { background:#DCFCE7; color:#166534; }
    .badge-red       { background:#FEF2F2; color:#B91C1C; }
    .badge-amber     { background:#FEF3C7; color:#92400E; }
    .badge-blue      { background:#EFF6FF; color:#1D4ED8; }

    /* feature list */
    .feat-list       { list-style:none; padding:0; margin:16px 0 auto; }
    .feat-item-last  { border-bottom:none !important; }

    /* price */
    .price-wrap      { margin:18px 0 8px; display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
    .price-amount    { font-size:40px; font-weight:800; color:#0F172A;
                       letter-spacing:-1.5px; line-height:1; transition:all .15s; }
    .price-unit      { font-size:13px; color:#94A3B8; }

    /* addon breakdown */
    .breakdown       { background:#F8FAFC; border-radius:10px; padding:10px 14px;
                       margin:10px 0; font-size:12px; color:#475569;
                       display:flex; flex-direction:column; gap:4px; }
    .breakdown-row   { display:flex; justify-content:space-between; }
    .breakdown-total { font-weight:700; color:#0F172A; border-top:1px solid #E2E8F0;
                       padding-top:6px; margin-top:2px; }

    /* benchmark */
    .benchmark       { font-size:12px; color:#475569; background:#F1F5F9;
                       padding:10px 14px; border-radius:10px;
                       border-left:3px solid #1740C8; margin:16px 0 20px;
                       line-height:1.55; }

    /* CTA */
    .btn-upgrade     { width:100%; padding:14px; border-radius:13px;
                       background:linear-gradient(135deg,#1740C8 0%,#071352 100%);
                       color:white; font-size:15px; font-weight:700; border:none;
                       cursor:pointer; font-family:inherit; display:flex;
                       align-items:center; justify-content:center; gap:8px;
                       transition:opacity .2s,transform .15s; margin-top:auto; }
    .btn-upgrade:hover  { opacity:.88; transform:translateY(-1px); }
    .btn-upgrade:active { transform:translateY(0); }
    .btn-upgrade:disabled { opacity:.4; cursor:not-allowed; transform:none; }

    /* trust */
    .trust-row       { display:flex; gap:16px; flex-wrap:wrap; margin-top:12px;
                       justify-content:center; }
    .trust-item      { display:flex; align-items:center; gap:5px;
                       font-size:11px; color:#94A3B8; }

    /* section heading */
    .sec-h           { font-size:20px; font-weight:800; color:#0F172A;
                       letter-spacing:-.3px; margin:0 0 4px; }
    .sec-sub         { font-size:13px; color:#64748B; margin:0 0 20px; }

    /* topup grid */
    .topup-grid      { display:grid;
                       grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
                       gap:14px; }

    /* topup cards */
    .topup-card      { background:white; border-radius:16px; border:1.5px solid #E2E8F0;
                       padding:20px; transition:border-color .2s,box-shadow .2s,transform .2s;
                       display:flex; flex-direction:column; cursor:pointer; }
    .topup-card:hover { border-color:#1740C8;
                        box-shadow:0 4px 20px rgba(23,64,200,.08);
                        transform:translateY(-2px); }
    .topup-card.selected  { border-color:#1740C8; background:#EFF6FF; }
    .topup-card.committed { border-color:#10B981; background:#F0FDF4; }

    .topup-icon      { font-size:22px; width:40px; height:40px; border-radius:10px;
                       background:#F1F5F9; display:flex; align-items:center;
                       justify-content:center; margin-bottom:12px; color:#475569;
                       transition:background .2s; }
    .topup-card.selected  .topup-icon { background:#DBEAFE; color:#1D4ED8; }
    .topup-card.committed .topup-icon { background:#DCFCE7; color:#166534; }

    .topup-name      { font-size:14px; font-weight:700; color:#0F172A; margin-bottom:4px; }
    .topup-desc      { font-size:12px; color:#64748B; line-height:1.45; margin-bottom:12px; flex:1; }
    .topup-price-row { font-size:13px; color:#475569; margin-bottom:12px;
                       display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .topup-orig      { text-decoration:line-through; color:#94A3B8; }

    .btn-select      { width:100%; padding:8px; border-radius:9px; border:none;
                       font-family:inherit; font-size:13px; font-weight:700;
                       display:flex; align-items:center; justify-content:center;
                       gap:6px; transition:all .15s; cursor:pointer; }
    .btn-select-add  { background:#EFF6FF; color:#1D4ED8; }
    .btn-select-add:hover { background:#DBEAFE; }
    .btn-select-rem  { background:#FEE2E2; color:#B91C1C; }
    .btn-select-rem:hover { background:#FECACA; }
    .btn-select-done { background:#DCFCE7; color:#166534; cursor:default; }

    /* selected topups bar */
    .topup-bar       { background:white; border:1.5px solid #1740C8; border-radius:14px;
                       padding:14px 18px; margin-bottom:24px; display:flex;
                       align-items:center; gap:10px; flex-wrap:wrap;
                       animation:fadeUp .3s ease; }
    .topup-tag       { display:flex; align-items:center; gap:5px; background:#EFF6FF;
                       color:#1D4ED8; font-size:12px; font-weight:700;
                       padding:4px 10px; border-radius:20px; }
    .topup-tag-x     { cursor:pointer; color:#93C5FD; }
    .topup-tag-x:hover { color:#1D4ED8; }

    hr.divider       { border:none; border-top:1px solid #F1F5F9; margin:14px 0; }
  `

  return (
    <div className="oa-page">
      <style>{css}</style>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 22 }}>
        <h1 className="oa-h1">💼 Plan &amp; Billing</h1>
        <p className="oa-sub">
          {fmtBizType(businessType)}
          {businessType && <span className="oa-dot">·</span>}
          {plan?.name || "Basic"}
          {typeof daysLeft === "number" && daysLeft > 0 && (
            <>
              <span className="oa-dot">·</span>
              <span style={{ color: isUrgent ? "#DC2626" : "#059669", fontWeight: 700 }}>
                Trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
              </span>
            </>
          )}
          {isExpired && (
            <>
              <span className="oa-dot">·</span>
              <span style={{ color: "#DC2626", fontWeight: 700 }}>Trial expired</span>
            </>
          )}
        </p>
      </div>

      {/* ── Urgency banners ── */}
      {isUrgent && !isExpired && (
        <div className="banner banner-warn">
          <Clock size={16} />
          Your trial expires in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>. Upgrade now to avoid any interruption.
        </div>
      )}
      {isExpired && (
        <div className="banner banner-error">
          <AlertTriangle size={16} />
          Your trial has expired. Upgrade to restore full access.
        </div>
      )}

      {/* ── Selected add-ons bar ── */}
      {selectedTopups.length > 0 && (
        <div className="topup-bar">
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1740C8", marginRight: 4 }}>
            Selected add-ons:
          </span>
          {selectedTopups.map((code) => {
            const f = TOPUP_FEATURES.find((t) => t.code === code)!
            return (
              <span key={code} className="topup-tag">
                {f.name}
                <span className="topup-tag-x" onClick={() => toggleTopup(code)} title="Remove">
                  <X size={12} />
                </span>
              </span>
            )
          })}
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
            +PKR {(selectedTopups.length * getTopupPrice(billingPeriod)).toLocaleString()} added
          </span>
        </div>
      )}

      {/* ── Billing period toggle ── */}
      <div className="period-wrap">
        <div className="period-label">Billing period</div>
        <div className="period-toggle">
          {(["monthly", "half_yearly", "yearly"] as BillingPeriod[]).map((p) => {
            const meta = PERIOD_META[p]
            const pricingForPeriod = getBasePrice(p)
            const fullMonthly = monthlyCost * meta.months
            const pctOff = fullMonthly > 0 ? Math.round(((fullMonthly - pricingForPeriod) / fullMonthly) * 100) : 0
            return (
              <button
                key={p}
                className={`period-btn ${billingPeriod === p ? "active" : ""}`}
                onClick={() => setBillingPeriod(p)}
              >
                {meta.label}
                {pctOff > 0 && (
                  <span className="save-pill">
                    {billingPeriod === p ? `Save ${pctOff}%` : `-${pctOff}%`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div className="plan-grid">

        {/* LEFT — Trial card */}
        <div className="plan-card">
          <div className="card-lbl">Current plan</div>
          <h2 className="plan-name-text">
            Trial
            <sup className="plan-super"> {plan?.trial_days || 10} days</sup>
          </h2>

          {/* Trial status badge */}
          {!isExpired && typeof daysLeft === "number" && (
            <span
              className={`badge ${daysLeft <= 5 ? "badge-red" : "badge-green"}`}
              style={{ alignSelf: "flex-start", marginBottom: 6 }}
            >
              <Clock size={11} />
              {daysLeft} day{daysLeft !== 1 ? "s" : ""} {daysLeft <= 5 ? "— expiring soon" : "remaining"}
            </span>
          )}
          {isExpired && (
            <span className="badge badge-red" style={{ alignSelf: "flex-start", marginBottom: 6 }}>
              Expired
            </span>
          )}

          <ul className="feat-list">
            {PLAN_FEATURES.map((f, i) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
            <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#334155" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={11} color="#16A34A" />
              </span>
              {userCount} user{userCount !== 1 ? "s" : ""}
            </li>
            {businessType === "ngo" && (
              <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#334155" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color="#16A34A" />
                </span>
                NGO toolkit — Projects, activities, locations, budget vs actual
              </li>
            )}
            {businessType === "trading" && (
              <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", fontSize: 13, color: "#334155", borderBottom: "none" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color="#16A34A" />
                </span>
                Inventory &amp; products
              </li>
            )}
          </ul>

          <hr className="divider" />
          <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>
            Includes all features for the full {plan?.trial_days || 10}-day trial period.
          </p>
        </div>

        {/* RIGHT — Upgrade card */}
        <div className={`plan-card plan-card-upgrade${highlightCard ? " highlight" : ""}`}>
          <div className="card-lbl card-lbl-blue">Upgrade to paid</div>
          <h2 className="plan-name-text">{plan?.name || "Basic"}</h2>

          {/* Animated price */}
          <div className="price-wrap">
            <span className="price-amount">PKR {animatedTotal.toLocaleString()}</span>
            <span className="price-unit">/ user / {PERIOD_META[billingPeriod].unit}</span>
          </div>

          {/* Savings badge */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
            {billingPeriod === "yearly" && (
              <span className="badge badge-amber"><Star size={10} /> Best offer</span>
            )}
            {savingPct > 0 && (
              <span className="badge badge-green"><TrendingUp size={10} /> Save {savingPct}% vs monthly</span>
            )}
          </div>

          {/* Breakdown when addons selected */}
          {selectedTopups.length > 0 && (
            <div className="breakdown">
              <div className="breakdown-row">
                <span>Base plan ({PERIOD_META[billingPeriod].label})</span>
                <span>PKR {getBasePrice(billingPeriod).toLocaleString()}</span>
              </div>
              {selectedTopups.map((code) => {
                const f = TOPUP_FEATURES.find((t) => t.code === code)!
                return (
                  <div key={code} className="breakdown-row">
                    <span>{f.name}</span>
                    <span>+PKR {getTopupPrice(billingPeriod).toLocaleString()}</span>
                  </div>
                )
              })}
              <div className="breakdown-row breakdown-total">
                <span>Total / user / {PERIOD_META[billingPeriod].unit}</span>
                <span>PKR {totalPrice(billingPeriod).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Features included */}
          <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", fontSize: 13, color: "#334155", display: "flex", flexDirection: "column", gap: 5 }}>
            {[
              "Everything in your trial — no feature removed",
              "Unlimited invoices, bills & transactions",
              "Priority support",
              "Data export (CSV & PDF)",
            ].map((item) => (
              <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <Check size={10} color="#16A34A" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="benchmark">{BENCHMARK_NOTE}</div>

          <button
            className="btn-upgrade"
            onClick={handleUpgrade}
            disabled={getBasePrice(billingPeriod) === 0}
          >
            Upgrade Now — PKR {animatedTotal.toLocaleString()} <ArrowRight size={16} />
          </button>

          <div className="trust-row">
            <span className="trust-item"><ShieldCheck size={13} /> Secure payment</span>
            <span className="trust-item"><Zap size={13} /> Activated in 2 hrs</span>
            <span className="trust-item"><Clock size={13} /> 7-day refund policy</span>
          </div>
        </div>
      </div>

      {/* ── Add-on features ── */}
      <div style={{ marginBottom: 20 }}>
        <h2 className="sec-h">🔧 Optional Add-On Features</h2>
        <p className="sec-sub">
          Select add-ons below — price updates instantly in the upgrade card above.
          {billingPeriod !== "monthly" && (
            <> Same {savingPct}% discount applied as your {PERIOD_META[billingPeriod].label.toLowerCase()} plan.</>
          )}
        </p>
      </div>

      <div className="topup-grid">
        {TOPUP_FEATURES.map((topup) => {
          const isCommitted = activeTopups.includes(topup.code)
          const isSelected  = selectedTopups.includes(topup.code)
          const topupMonthly = TOPUP_PRICE_MONTHLY
          const topupPeriodic = getTopupPrice(billingPeriod)
          const showDiscount  = billingPeriod !== "monthly"

          return (
            <div
              key={topup.code}
              className={`topup-card ${isCommitted ? "committed" : isSelected ? "selected" : ""}`}
              onClick={() => !isCommitted && toggleTopup(topup.code)}
            >
              <div className="topup-icon">
                <i className={`ti ti-${topup.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
              </div>
              <div className="topup-name">{topup.name}</div>
              <div className="topup-desc">{topup.desc}</div>

              <div className="topup-price-row">
                {showDiscount && (
                  <span className="topup-orig">PKR {topupMonthly * PERIOD_META[billingPeriod].months}</span>
                )}
                <span style={{ fontWeight: 700, color: "#0F172A" }}>
                  PKR {topupPeriodic.toLocaleString()}
                </span>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>/ user / {PERIOD_META[billingPeriod].unit}</span>
                {showDiscount && (
                  <span className="badge badge-green" style={{ fontSize: 10, padding: "2px 7px" }}>
                    -{savingPct}%
                  </span>
                )}
              </div>

              {isCommitted ? (
                <div className="btn-select btn-select-done">
                  <Check size={13} /> Active
                </div>
              ) : isSelected ? (
                <button className="btn-select btn-select-rem" onClick={(e) => { e.stopPropagation(); toggleTopup(topup.code) }}>
                  <X size={13} /> Remove
                </button>
              ) : (
                <button className="btn-select btn-select-add" onClick={(e) => { e.stopPropagation(); toggleTopup(topup.code) }}>
                  <Plus size={13} /> Add to plan
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
