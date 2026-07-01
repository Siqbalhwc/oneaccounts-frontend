"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Check, Clock, ArrowRight, Plus, ShieldCheck, Zap, AlertTriangle, Star, TrendingUp, X, Minus } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"

const BENCHMARK_NOTE =
  "Competitor plans start at PKR 10,000+ / user / month (Odoo, QuickBooks, Zoho). You save up to 70% with OneAccounts."

const PLAN_PRICING: Record<string, { monthly: number; half_yearly: number; yearly: number }> = {
  service: { monthly: 3000, half_yearly: 16000, yearly: 30000 },
  trading: { monthly: 3000, half_yearly: 16000, yearly: 30000 },
  ngo:     { monthly: 5000, half_yearly: 28000, yearly: 50000 },
}

const ADDITIONAL_USER_PRICE_MONTHLY = 500

const TOPUP_PRICE_MONTHLY = 500

function topupDiscountedPrice(baseMonthly: number, period: BillingPeriod): number {
  if (period === "monthly")     return baseMonthly
  if (period === "half_yearly") return Math.round(baseMonthly * 6 * (16000 / 18000))
  return Math.round(baseMonthly * 12 * (30000 / 36000))
}

const TOPUP_FEATURES = [
  { code: "asset_management", name: "Fixed Asset Management", icon: "🏗️", desc: "Register assets, post depreciation automatically, record disposals, and run the asset schedule report." },
  { code: "purchase_orders", name: "Purchase Orders", icon: "📦", desc: "Full PO workflow — raise, approve, receive (GRN), and auto-post supplier bills on receipt." },
  { code: "whatsapp_invoice", name: "WhatsApp Integration", icon: "💬", desc: "Send invoices, payment receipts, and overdue reminders directly to customers via WhatsApp." },
  { code: "invoice_automation", name: "Invoice Automation", icon: "⚡", desc: "Set up recurring invoices and scheduled billing runs — OneAccounts posts them automatically." },
  { code: "profit_allocation", name: "Profit Allocation", icon: "💰", desc: "Define partner or investor shares and allocate net profit to capital accounts in one click." },
  { code: "investors", name: "Investors Module", icon: "📈", desc: "Track investor capital, returns, and statements. Generate investor-facing reports at any date." },
]

const PLAN_FEATURES = [
  { label: "CRM", items: ["Customers", "Sales invoices", "Receipts", "Vendors", "Bills", "Payments"], icon: "users" },
  { label: "Banking", items: ["Bank accounts", "Deposits & withdrawals", "Inter-bank transfers", "Bank reconciliation"], icon: "building-bank" },
  { label: "Accounting", items: ["Chart of accounts", "Journal entries", "General ledger"], icon: "calculator" },
  { label: "Reports", items: ["Trial balance", "Profit & loss", "Balance sheet", "Customer & vendor ledgers"], icon: "report-analytics" },
  { label: "Settings", items: ["Company branding & logo", "Address & contact info", "Fiscal year"], icon: "settings" },
]

type BillingPeriod = "monthly" | "half_yearly" | "yearly"

const PERIOD_META: Record<BillingPeriod, { label: string; unit: string; months: number }> = {
  monthly:     { label: "Monthly",   unit: "month",    months: 1  },
  half_yearly: { label: "6 Months",  unit: "6 months", months: 6  },
  yearly:      { label: "12 Months", unit: "year",     months: 12 },
}

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

function useAnimatedNumber(target: number, duration = 420) {
  const [display, setDisplay] = useState(target)
  const prev = useRef(target)
  useEffect(() => {
    const start = prev.current
    const diff = target - start
    if (diff === 0) return
    const startTime = performance.now()
    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + diff * ease))
      if (progress < 1) requestAnimationFrame(tick)
      else prev.current = target
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return display
}

function FeatureRow({ feature }: { feature: typeof PLAN_FEATURES[0] }) {
  const [open, setOpen] = useState(false)
  return (
    <li
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 0", borderBottom: "1px solid var(--border)", cursor: "pointer",
        position: "relative",
      }}
      onClick={() => setOpen((o) => !o)}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text)" }}>
        <span style={{
          width: 22, height: 22, borderRadius: "50%", background: "var(--primary, #16a34a)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Check size={11} color="#fff" />
        </span>
        {feature.label}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
        {open ? "Hide" : "Details"}
        <span style={{ transform: open ? "rotate(180deg)" : "rotate(0)", display: "inline-block", transition: "transform 0.2s" }}>▾</span>
      </span>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        }}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {feature.items.map((item) => (
              <li key={item} style={{ fontSize: 12, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "var(--primary, #10B981)", fontSize: 14 }}>›</span> {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export default function UpgradePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { companyId } = useCompany()

  const [plan, setPlan] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [activeFeatureCodes, setActiveFeatureCodes] = useState<string[]>([])
  const [selectedTopups, setSelectedTopups] = useState<string[]>([])
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly")
  const [highlightCard, setHighlightCard] = useState(false)
  const [isTrial, setIsTrial] = useState(false)
  const [isLifetime, setIsLifetime] = useState(false)

  // ✅ NEW: actual trial end date from company_settings
  const [trialEndDate, setTrialEndDate] = useState<Date | null>(null)

  // Additional users state
  const [additionalUsers, setAdditionalUsers] = useState(0)

  useEffect(() => {
    if (!companyId) return
    const fetchData = async () => {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("business_type, is_trial, plans(code, name, monthly_price_per_user, half_yearly_price_per_user, yearly_price_per_user, trial_days)")
          .eq("id", companyId)
          .single()
        if (company) {
          setPlan(Array.isArray(company.plans) ? company.plans[0] : company.plans)
          setBusinessType(company.business_type || "")
          setIsTrial(company.is_trial || false)
        }

        // ✅ Fetch the real trial expiry from company_settings
        const { data: settings } = await supabase
          .from("company_settings")
          .select("trial_ends_at")
          .eq("company_id", companyId)
          .maybeSingle()

        if (settings?.trial_ends_at) {
          setTrialEndDate(new Date(settings.trial_ends_at))
        } else {
          setTrialEndDate(null)
        }

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("company_id", companyId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        setSubscription(sub)
        setIsLifetime(sub && sub.end_date >= "9999-01-01")

        const { data: cfRows } = await supabase
          .from("company_features")
          .select("features(code)")
          .eq("company_id", companyId)
          .eq("enabled", true)

        setActiveFeatureCodes((cfRows || []).map((r: any) => r.features?.code).filter(Boolean))
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    fetchData()
  }, [companyId])

  const bizKey = businessType.toLowerCase() as keyof typeof PLAN_PRICING
  const pricing = PLAN_PRICING[bizKey] || PLAN_PRICING.service

  const getBasePrice = (period: BillingPeriod): number => {
    if (plan) {
      const v = period === "monthly" ? plan.monthly_price_per_user :
                period === "half_yearly" ? plan.half_yearly_price_per_user :
                plan.yearly_price_per_user
      if (v && v > 0) return v
    }
    return pricing[period === "half_yearly" ? "half_yearly" : period]
  }

  const getTopupPrice = (period: BillingPeriod): number => topupDiscountedPrice(TOPUP_PRICE_MONTHLY, period)
  const additionalUserPrice = (period: BillingPeriod): number => {
    if (period === "monthly") return ADDITIONAL_USER_PRICE_MONTHLY
    if (period === "half_yearly") return ADDITIONAL_USER_PRICE_MONTHLY * 6
    return ADDITIONAL_USER_PRICE_MONTHLY * 12
  }

  const totalPrice = (period: BillingPeriod): number => {
    const base = getBasePrice(period)
    const topups = selectedTopups.length * getTopupPrice(period)
    const users = additionalUsers * additionalUserPrice(period)
    return base + topups + users
  }

  const animatedTotal = useAnimatedNumber(totalPrice(billingPeriod))

  const monthlyCost = getBasePrice("monthly")
  const currentCost = getBasePrice(billingPeriod)
  const months = PERIOD_META[billingPeriod].months
  const fullPrice = monthlyCost * months
  const saving = fullPrice > currentCost ? fullPrice - currentCost : 0
  const savingPct = fullPrice > 0 ? Math.round((saving / fullPrice) * 100) : 0

  const handleUpgrade = () => {
    const price = totalPrice(billingPeriod)
    const topupParams = selectedTopups.map(t => `topups[]=${t}`).join("&")
    router.push(`/dashboard/upgrade/payment?amount=${price}&period=${billingPeriod}&plan=${plan?.code || ""}${additionalUsers > 0 ? `&additional_users=${additionalUsers}` : ""}${topupParams ? "&" + topupParams : ""}`)
  }

  const toggleTopup = (code: string) => {
    setSelectedTopups(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
    setHighlightCard(true)
    setTimeout(() => setHighlightCard(false), 600)
  }

  // ✅ Correct trial days calculation using real trial_ends_at
  const trialDaysLeft = (() => {
    if (subscription?.end_date) {
      return Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    }
    if (trialEndDate) {
      return Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    }
    // fallback to plan's trial_days (should rarely happen)
    return plan?.trial_days ?? 10
  })()

  const isExpired = isTrial && !subscription && trialDaysLeft <= 0
  const isUrgent = isTrial && !subscription && trialDaysLeft > 0 && trialDaysLeft <= 5
  const userCount = subscription?.max_users || 1

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 12, color: "var(--text-muted)", fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
        <span style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--primary)", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />
        Loading…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const css = `
    @keyframes spin   { to { transform: rotate(360deg); } }
    @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse  { 0%,100% { box-shadow:0 0 0 0 rgba(23,64,200,0.18); } 50% { box-shadow:0 0 0 8px rgba(23,64,200,0); } }

    .oa-page { padding:28px 28px 56px; background:var(--bg); min-height:100vh; font-family:'Inter',sans-serif; }
    .oa-h1  { font-size:26px; font-weight:800; color:var(--text); margin:0 0 5px; letter-spacing:-0.5px; }
    .oa-sub { font-size:14px; color:var(--text-muted); margin:0; display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .oa-dot { color:var(--text-muted); }
    .banner { display:flex; align-items:center; gap:10px; padding:12px 16px; border-radius:12px; font-size:13px; font-weight:600; margin-bottom:20px; animation:fadeUp .35s ease; }
    .banner-warn  { background:var(--card); border:1px solid #F59E0B; color:#92400E; }
    .banner-error { background:var(--card); border:1px solid #EF4444; color:#DC2626; }

    .period-wrap  { margin-bottom:24px; }
    .period-label { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; color:var(--text-muted); margin-bottom:10px; }
    .period-toggle { display:inline-flex; border:1.5px solid var(--border); border-radius:12px; overflow:hidden; background:var(--card); }
    .period-btn   { padding:9px 18px; font-size:13px; font-weight:700; border:none; cursor:pointer; background:transparent; color:var(--text-muted); transition:all .18s; font-family:inherit; white-space:nowrap; display:flex; align-items:center; gap:6px; }
    .period-btn:hover { background:var(--card-hover); color:var(--text); }
    .period-btn.active { background:var(--primary); color:var(--primary-text); border-radius:10px; }
    .save-pill { background:rgba(255,255,255,.22); font-size:10px; font-weight:800; padding:2px 7px; border-radius:20px; }

    .plan-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; align-items:stretch; margin-bottom:44px; }
    @media(max-width:640px){ .plan-grid { grid-template-columns:1fr; } }

    .plan-card { background:var(--card); border-radius:20px; padding:28px; border:1.5px solid var(--border); display:flex; flex-direction:column; animation:fadeUp .4s ease; }
    .plan-card-upgrade { border:2px solid var(--primary); box-shadow:0 8px 40px rgba(23,64,200,.10); }
    .plan-card-upgrade.highlight { animation:pulse .6s ease; }

    .card-lbl        { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.13em; color:var(--text-muted); margin-bottom:5px; }
    .card-lbl-blue   { color:var(--primary); }
    .plan-name-text  { font-size:22px; font-weight:800; color:var(--text); letter-spacing:-.3px; margin:0 0 4px; }
    .plan-super      { font-size:13px; font-weight:500; color:var(--text-muted); vertical-align:super; }

    .badge           { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; }
    .badge-green     { background:var(--bg-soft); color:#10B981; }
    .badge-red       { background:var(--bg-soft); color:#EF4444; }
    .badge-amber     { background:var(--bg-soft); color:#F59E0B; }
    .badge-blue      { background:var(--bg-soft); color:var(--primary); }

    .feat-list       { list-style:none; padding:0; margin:16px 0 auto; }
    .price-wrap      { margin:18px 0 8px; display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
    .price-amount    { font-size:40px; font-weight:800; color:var(--text); letter-spacing:-1.5px; line-height:1; }
    .price-unit      { font-size:13px; color:var(--text-muted); }

    .breakdown       { background:var(--bg); border-radius:10px; padding:10px 14px; margin:10px 0; font-size:12px; color:var(--text); display:flex; flex-direction:column; gap:4px; }
    .breakdown-row   { display:flex; justify-content:space-between; }
    .breakdown-total { font-weight:700; color:var(--text); border-top:1px solid var(--border); padding-top:6px; margin-top:2px; }

    .benchmark       { font-size:12px; color:var(--text); background:var(--bg); padding:10px 14px; border-radius:10px; border-left:3px solid var(--primary); margin:16px 0 20px; line-height:1.55; }

    .btn-upgrade     { width:100%; padding:14px; border-radius:13px; background:linear-gradient(135deg, var(--primary, #1740C8) 0%, var(--primary-dark, #071352) 100%); color:var(--primary-text, #fff); font-size:15px; font-weight:700; border:none; cursor:pointer; font-family:inherit; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:auto; }
    .btn-upgrade:hover  { opacity:.88; transform:translateY(-1px); }
    .btn-upgrade:active { transform:translateY(0); }
    .btn-upgrade:disabled { opacity:.4; cursor:not-allowed; transform:none; }

    .trust-row       { display:flex; gap:16px; flex-wrap:wrap; margin-top:12px; justify-content:center; }
    .trust-item      { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-muted); }

    .sec-h           { font-size:20px; font-weight:800; color:var(--text); letter-spacing:-.3px; margin:0 0 4px; }
    .sec-sub         { font-size:13px; color:var(--text-muted); margin:0 0 20px; }

    .topup-grid      { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }

    .topup-card      { background:var(--card); border-radius:16px; border:1.5px solid var(--border); padding:20px; transition:border-color .2s,box-shadow .2s,transform .2s; display:flex; flex-direction:column; cursor:pointer; }
    .topup-card:hover { border-color:var(--primary); box-shadow:0 4px 20px rgba(23,64,200,.08); transform:translateY(-2px); }
    .topup-card.selected  { border-color:var(--primary); background:var(--bg-soft); }
    .topup-card.committed { border-color:#10B981; background:var(--bg-soft); }

    .topup-icon      { font-size:22px; width:40px; height:40px; border-radius:10px; background:var(--bg); display:flex; align-items:center; justify-content:center; margin-bottom:12px; color:var(--text); }
    .topup-card.selected  .topup-icon { background:var(--card-hover); color:var(--primary); }
    .topup-card.committed .topup-icon { background:var(--card-hover); color:#10B981; }

    .topup-name      { font-size:14px; font-weight:700; color:var(--text); margin-bottom:4px; }
    .topup-desc      { font-size:12px; color:var(--text-muted); line-height:1.45; margin-bottom:12px; flex:1; }
    .topup-price-row { font-size:13px; color:var(--text); margin-bottom:12px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .topup-orig      { text-decoration:line-through; color:var(--text-muted); }

    .btn-select      { width:100%; padding:8px; border-radius:9px; border:none; font-family:inherit; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; transition:all .15s; cursor:pointer; }
    .btn-select-add  { background:var(--card-hover); color:var(--primary); }
    .btn-select-add:hover { background:var(--bg-soft); }
    .btn-select-rem  { background:rgba(239,68,68,0.15); color:#EF4444; }
    .btn-select-rem:hover { background:rgba(239,68,68,0.25); }
    .btn-select-done { background:rgba(16,185,129,0.15); color:#10B981; cursor:default; }

    .topup-bar       { background:var(--card); border:1.5px solid var(--primary); border-radius:14px; padding:14px 18px; margin-bottom:24px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; animation:fadeUp .3s ease; }
    .topup-tag       { display:flex; align-items:center; gap:5px; background:var(--bg-soft); color:var(--primary); font-size:12px; font-weight:700; padding:4px 10px; border-radius:20px; }
    .topup-tag-x     { cursor:pointer; color:var(--text-muted); }
    .topup-tag-x:hover { color:var(--primary); }

    .user-counter    { display:flex; align-items:center; gap:8px; margin:12px 0; }
    .user-counter button { width:32px; height:32px; border-radius:8px; border:1.5px solid var(--border); background:var(--card); color:var(--text); font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .user-counter button:hover { background:var(--card-hover); }
    .user-counter input { width:60px; height:32px; border-radius:8px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); text-align:center; font-size:14px; font-weight:700; }

    hr.divider       { border:none; border-top:1px solid var(--border); margin:14px 0; }

    .period-compare  { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin:12px 0; }
    @media(max-width:640px){ .period-compare { grid-template-columns:1fr; } }
    .period-option   { background:var(--bg); border:1.5px solid var(--border); border-radius:12px; padding:14px; text-align:center; cursor:pointer; transition:border-color .15s; }
    .period-option:hover { border-color:var(--primary); }
    .period-option.selected { border-color:var(--primary); background:var(--bg-soft); }
    .period-option .period-name { font-size:13px; font-weight:700; color:var(--text); }
    .period-option .period-price { font-size:20px; font-weight:800; color:var(--text); margin:6px 0; }
    .period-option .period-save { font-size:11px; color:#10B981; font-weight:600; }
    .period-option .period-monthly { font-size:11px; color:var(--text-muted); }
  `

  return (
    <div className="oa-page">
      <style>{css}</style>

      <div style={{ marginBottom: 22 }}>
        <h1 className="oa-h1">💼 Plan &amp; Billing</h1>
        <p className="oa-sub">
          {fmtBizType(businessType)}
          {businessType && <span className="oa-dot">·</span>}
          {plan?.name || "Basic"}
          {subscription && (
            <>
              <span className="oa-dot">·</span>
              <span style={{ color: "#059669", fontWeight: 700 }}>
                {isLifetime ? "Lifetime" : `Expires ${new Date(subscription.end_date).toLocaleDateString()}`}
              </span>
            </>
          )}
          {!subscription && isTrial && (
            <>
              <span className="oa-dot">·</span>
              <span style={{ color: isUrgent ? "#DC2626" : "#059669", fontWeight: 700 }}>
                {trialDaysLeft > 0
                  ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""}`
                  : "Trial expired"}
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

      {isUrgent && !isExpired && (
        <div className="banner banner-warn">
          <Clock size={16} />
          Your trial expires in <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</strong>. Upgrade now to avoid any interruption.
        </div>
      )}
      {isExpired && (
        <div className="banner banner-error">
          <AlertTriangle size={16} />
          Your trial has expired. Upgrade to restore full access.
        </div>
      )}

      {selectedTopups.length > 0 && (
        <div className="topup-bar">
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)", marginRight: 4 }}>Selected add-ons:</span>
          {selectedTopups.map((code) => {
            const f = TOPUP_FEATURES.find((t) => t.code === code)!
            return (
              <span key={code} className="topup-tag">
                {f.name}
                <span className="topup-tag-x" onClick={() => toggleTopup(code)} title="Remove"><X size={12} /></span>
              </span>
            )
          })}
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            +PKR {(selectedTopups.length * getTopupPrice(billingPeriod)).toLocaleString()} added
          </span>
        </div>
      )}

      {/* Billing period selector – shown for trial users only; paid users pick inside the card */}
      {!subscription && (
        <div className="period-wrap">
          <div className="period-label">Billing period</div>
          <div className="period-toggle">
            {(["monthly", "half_yearly", "yearly"] as BillingPeriod[]).map((p) => {
              const meta = PERIOD_META[p]
              const pricingForPeriod = getBasePrice(p)
              const fullMonthly = monthlyCost * meta.months
              const pctOff = fullMonthly > 0 ? Math.round(((fullMonthly - pricingForPeriod) / fullMonthly) * 100) : 0
              return (
                <button key={p} className={`period-btn ${billingPeriod === p ? "active" : ""}`} onClick={() => setBillingPeriod(p)}>
                  {meta.label}
                  {pctOff > 0 && <span className="save-pill">{billingPeriod === p ? `Save ${pctOff}%` : `-${pctOff}%`}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="plan-grid">
        {/* Left card: Current Plan */}
        <div className="plan-card">
          <div className="card-lbl">Current plan</div>
          <h2 className="plan-name-text">
            {plan?.name || "Basic"}
            {subscription ? (
              <sup className="plan-super" style={{ color: "#059669" }}>
                {isLifetime ? " Lifetime" : ` Active until ${new Date(subscription.end_date).toLocaleDateString()}`}
              </sup>
            ) : isTrial ? (
              <sup className="plan-super"> Trial — {trialDaysLeft > 0 ? `${trialDaysLeft} days left` : "Expired"}</sup>
            ) : (
              <sup className="plan-super"> No active subscription</sup>
            )}
          </h2>

          {isLifetime && (
            <span className="badge badge-green" style={{ alignSelf: "flex-start", marginBottom: 6 }}>
              <Check size={11} /> Lifetime access
            </span>
          )}

          {!subscription && isTrial && (
            <span className={`badge ${trialDaysLeft <= 0 ? "badge-red" : trialDaysLeft <= 5 ? "badge-red" : "badge-green"}`} style={{ alignSelf: "flex-start", marginBottom: 6 }}>
              <Clock size={11} />
              {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining` : "Expired"}
            </span>
          )}

          {activeFeatureCodes.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginTop: 12, marginBottom: 8 }}>
                🔓 Active Add‑ons
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                {activeFeatureCodes.map((code) => {
                  const feature = TOPUP_FEATURES.find((f) => f.code === code)
                  const name = feature ? feature.name : code
                  return (
                    <li key={code} style={{ fontSize: 12, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ color: "#10B981", fontSize: 14 }}>✓</span>
                      {name}
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <hr className="divider" />
          <ul className="feat-list">
            {PLAN_FEATURES.map((f) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
            <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text)" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={11} color="#fff" />
              </span>
              {userCount} user{userCount !== 1 ? "s" : ""}
            </li>
            {businessType === "ngo" && (
              <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text)" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color="#fff" />
                </span>
                NGO toolkit — Projects, activities, locations, budget vs actual
              </li>
            )}
            {businessType === "trading" && (
              <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", fontSize: 13, color: "var(--text)", borderBottom: "none" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color="#fff" />
                </span>
                Inventory &amp; products
              </li>
            )}
          </ul>

          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "12px 0 0" }}>
            {subscription
              ? "You are on a paid plan. All core features are unlocked."
              : isTrial
                ? `Includes all features for the full ${trialDaysLeft > 0 ? trialDaysLeft : "0"}-day trial period.`
                : "No active plan. Subscribe to unlock all features."}
          </p>
        </div>

        {/* Right card: depends on state */}
        {subscription ? (
          isLifetime ? (
            <div className="plan-card">
              <div className="card-lbl card-lbl-blue">Your plan</div>
              <h2 className="plan-name-text">{plan?.name || "Basic"}</h2>
              <div className="price-wrap">
                <span className="price-amount">Lifetime</span>
                <span className="price-unit">access</span>
              </div>
              <span className="badge badge-green"><Star size={10} /> Lifetime</span>

              {activeFeatureCodes.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginTop: 12, marginBottom: 6 }}>
                    Included add‑ons
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                    {activeFeatureCodes.map((code) => {
                      const feature = TOPUP_FEATURES.find((f) => f.code === code)
                      const name = feature ? feature.name : code
                      return (
                        <li key={code} style={{ fontSize: 12, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ color: "#10B981", fontSize: 14 }}>✓</span> {name}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
              <div className="benchmark">
                You have lifetime access to all core features. Enjoy!
              </div>
            </div>
          ) : (
            /* Paid Basic (not lifetime) – show upgrade/add‑user card */
            <div className={`plan-card plan-card-upgrade${highlightCard ? " highlight" : ""}`}>
              <div className="card-lbl card-lbl-blue">Enhance Your Plan</div>
              <h2 className="plan-name-text">{plan?.name || "Basic"}</h2>

              <div style={{ marginTop: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                  👥 Additional Users
                </div>
                <div className="user-counter">
                  <button onClick={() => setAdditionalUsers(Math.max(0, additionalUsers - 1))}>
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={additionalUsers}
                    onChange={(e) => setAdditionalUsers(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                  <button onClick={() => setAdditionalUsers(additionalUsers + 1)}>
                    <Plus size={14} />
                  </button>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>
                    × PKR {additionalUserPrice(billingPeriod).toLocaleString()} / user / {PERIOD_META[billingPeriod].unit}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                  📅 Billing Period
                </div>
                <div className="period-compare">
                  {(["monthly", "half_yearly", "yearly"] as BillingPeriod[]).map((p) => {
                    const meta = PERIOD_META[p]
                    const price = getBasePrice(p)
                    const monthlyEquivalent = Math.round(price / meta.months)
                    const fullMonthly = getBasePrice("monthly") * meta.months
                    const pctSave = fullMonthly > 0 ? Math.round(((fullMonthly - price) / fullMonthly) * 100) : 0
                    const isCurrent = billingPeriod === p
                    return (
                      <div
                        key={p}
                        className={`period-option ${isCurrent ? "selected" : ""}`}
                        onClick={() => setBillingPeriod(p)}
                      >
                        <div className="period-name">{meta.label}</div>
                        <div className="period-price">PKR {price.toLocaleString()}</div>
                        <div className="period-monthly">PKR {monthlyEquivalent}/mo</div>
                        {pctSave > 0 && <div className="period-save">Save {pctSave}%</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Total breakdown */}
              <div className="breakdown">
                <div className="breakdown-row">
                  <span>Base plan ({PERIOD_META[billingPeriod].label})</span>
                  <span>PKR {getBasePrice(billingPeriod).toLocaleString()}</span>
                </div>
                {additionalUsers > 0 && (
                  <div className="breakdown-row">
                    <span>+ {additionalUsers} additional user{additionalUsers > 1 ? "s" : ""}</span>
                    <span>PKR {(additionalUsers * additionalUserPrice(billingPeriod)).toLocaleString()}</span>
                  </div>
                )}
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

              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", fontSize: 13, color: "var(--text)", display: "flex", flexDirection: "column", gap: 5 }}>
                {[
                  "Everything in your current plan",
                  "Unlimited invoices, bills & transactions",
                  "Priority support",
                  "Data export (CSV & PDF)",
                ].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <Check size={10} color="#fff" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="benchmark">
                Switch to a longer billing period to save up to {savingPct}%. Adding more users? Each additional user costs Rs 500/month.
              </div>

              <button className="btn-upgrade" onClick={handleUpgrade}>
                {additionalUsers > 0 || selectedTopups.length > 0 || billingPeriod !== "monthly"
                  ? "Update Plan — PKR " + animatedTotal.toLocaleString()
                  : "Change Plan"}
                <ArrowRight size={16} />
              </button>

              <div className="trust-row">
                <span className="trust-item"><ShieldCheck size={13} /> Secure payment</span>
                <span className="trust-item"><Zap size={13} /> Activated in 2 hrs</span>
                <span className="trust-item"><Clock size={13} /> 7-day refund policy</span>
              </div>
            </div>
          )
        ) : (
          /* Trial – upgrade to paid */
          <div className={`plan-card plan-card-upgrade${highlightCard ? " highlight" : ""}`}>
            <div className="card-lbl card-lbl-blue">Upgrade to paid</div>
            <h2 className="plan-name-text">{plan?.name || "Basic"}</h2>

            <div className="price-wrap">
              <span className="price-amount">PKR {animatedTotal.toLocaleString()}</span>
              <span className="price-unit">/ user / {PERIOD_META[billingPeriod].unit}</span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
              {billingPeriod === "yearly" && <span className="badge badge-amber"><Star size={10} /> Best offer</span>}
              {savingPct > 0 && <span className="badge badge-green"><TrendingUp size={10} /> Save {savingPct}% vs monthly</span>}
            </div>

            {selectedTopups.length > 0 && (
              <div className="breakdown">
                <div className="breakdown-row"><span>Base plan ({PERIOD_META[billingPeriod].label})</span><span>PKR {getBasePrice(billingPeriod).toLocaleString()}</span></div>
                {selectedTopups.map((code) => {
                  const f = TOPUP_FEATURES.find((t) => t.code === code)!
                  return (
                    <div key={code} className="breakdown-row"><span>{f.name}</span><span>+PKR {getTopupPrice(billingPeriod).toLocaleString()}</span></div>
                  )
                })}
                <div className="breakdown-row breakdown-total"><span>Total / user / {PERIOD_META[billingPeriod].unit}</span><span>PKR {totalPrice(billingPeriod).toLocaleString()}</span></div>
              </div>
            )}

            <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", fontSize: 13, color: "var(--text)", display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                "Everything in your trial — no feature removed",
                "Unlimited invoices, bills & transactions",
                "Priority support",
                "Data export (CSV & PDF)",
              ].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <Check size={10} color="#fff" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="benchmark">{BENCHMARK_NOTE}</div>

            <button className="btn-upgrade" onClick={handleUpgrade} disabled={getBasePrice(billingPeriod) === 0}>
              Upgrade Now — PKR {animatedTotal.toLocaleString()} <ArrowRight size={16} />
            </button>

            <div className="trust-row">
              <span className="trust-item"><ShieldCheck size={13} /> Secure payment</span>
              <span className="trust-item"><Zap size={13} /> Activated in 2 hrs</span>
              <span className="trust-item"><Clock size={13} /> 7-day refund policy</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <h2 className="sec-h">🔧 Optional Add‑On Features</h2>
        <p className="sec-sub">
          Select add‑ons below — price updates instantly in the upgrade card above.
          {billingPeriod !== "monthly" && (
            <> Same {savingPct}% discount applied as your {PERIOD_META[billingPeriod].label.toLowerCase()} plan.</>
          )}
        </p>
      </div>

      <div className="topup-grid">
        {TOPUP_FEATURES.map((topup) => {
          const isCommitted = activeFeatureCodes.includes(topup.code)
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
              <div className="topup-icon"><span style={{ fontSize: 22, lineHeight: 1 }}>{topup.icon}</span></div>
              <div className="topup-name">{topup.name}</div>
              <div className="topup-desc">{topup.desc}</div>

              <div className="topup-price-row">
                {showDiscount && <span className="topup-orig">PKR {topupMonthly * PERIOD_META[billingPeriod].months}</span>}
                <span style={{ fontWeight: 700, color: "var(--text)" }}>PKR {topupPeriodic.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>/ user / {PERIOD_META[billingPeriod].unit}</span>
                {showDiscount && <span className="badge badge-green" style={{ fontSize: 10, padding: "2px 7px" }}>-{savingPct}%</span>}
              </div>

              {isCommitted ? (
                <div className="btn-select btn-select-done"><Check size={13} /> Active</div>
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