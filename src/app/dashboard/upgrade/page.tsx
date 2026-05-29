"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Check, Clock, ArrowRight, Plus, ShieldCheck, Zap, AlertTriangle, Star, TrendingUp } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"

const BENCHMARK_NOTE =
  "Competitor plans start at PKR 10,000+ / user / month (Odoo, QuickBooks, Zoho). You save up to 70% with OneAccounts."

const TOPUP_FEATURES = [
  { code: "asset_management",   name: "Fixed Asset Management", price: 500, icon: "🏗️", desc: "Track depreciation & disposals" },
  { code: "purchase_orders",    name: "Purchase Orders",        price: 500, icon: "📦", desc: "Full PO & GRN workflow" },
  { code: "whatsapp",           name: "WhatsApp Integration",   price: 500, icon: "💬", desc: "Send invoices & reminders via WA" },
  { code: "invoice_automation", name: "Invoice Automation",     price: 500, icon: "⚡", desc: "Recurring & scheduled invoices" },
  { code: "profit_allocation",  name: "Profit Allocation",      price: 500, icon: "💰", desc: "Partner & investor profit splits" },
  { code: "investors",          name: "Investors Module",       price: 500, icon: "📈", desc: "Capital, returns & statements" },
]

const PERIOD_LABELS: Record<string, string> = {
  monthly:     "month",
  half_yearly: "6 months",
  yearly:      "year",
}

// Capitalise every word: "ngo business" → "NGO Business"
function formatBusinessType(raw: string): string {
  if (!raw) return ""
  return raw
    .split(" ")
    .map((w) => {
      const upper = w.toUpperCase()
      // known acronyms stay fully uppercase
      if (["ngo", "llc", "pvt", "ltd"].includes(w.toLowerCase())) return upper
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(" ")
}

export default function UpgradePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { companyId } = useCompany()

  const [plan, setPlan]                   = useState<any>(null)
  const [subscription, setSubscription]   = useState<any>(null)
  const [activeTopups, setActiveTopups]   = useState<string[]>([])
  const [businessType, setBusinessType]   = useState("")
  const [loading, setLoading]             = useState(true)
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "half_yearly" | "yearly">("yearly")

  useEffect(() => {
    if (!companyId) return
    const fetchData = async () => {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select(
            "business_type, plans(code, name, monthly_price_per_user, half_yearly_price_per_user, yearly_price_per_user, trial_days)"
          )
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

  const getPrice = (): number => {
    if (!plan) return 0
    switch (billingPeriod) {
      case "monthly":     return plan.monthly_price_per_user || 0
      case "half_yearly": return plan.half_yearly_price_per_user || 0
      case "yearly":      return plan.yearly_price_per_user || 0
    }
  }

  const handleUpgrade = () => {
    const price = getPrice()
    router.push(
      `/dashboard/upgrade/payment?amount=${price}&period=${billingPeriod}&plan=${plan?.code || ""}`
    )
  }

  const handleActivateTopup = (featureCode: string, featureName: string) => {
    router.push(
      `/dashboard/upgrade/payment?amount=500&period=monthly&plan=${plan?.code || ""}&topup=${featureCode}&topup_name=${encodeURIComponent(featureName)}`
    )
  }

  const daysLeft = subscription?.end_date
    ? Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const price           = getPrice()
  const periodLabel     = PERIOD_LABELS[billingPeriod]
  const userCount       = subscription?.max_users || 1
  const monthlyCost     = plan?.monthly_price_per_user || 0
  const yearlyCost      = plan?.yearly_price_per_user || 0
  const yearlySavingPct = monthlyCost > 0
    ? Math.round(((monthlyCost * 12 - yearlyCost) / (monthlyCost * 12)) * 100)
    : 0

  const isTrialExpired  = daysLeft !== null && daysLeft <= 0
  const isTrialUrgent   = daysLeft !== null && daysLeft > 0 && daysLeft <= 7
  const isTrialHealthy  = daysLeft !== null && daysLeft > 7

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "60vh", gap: 12, color: "#64748B", fontSize: 14,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{
          width: 20, height: 20, border: "2px solid #E2E8F0",
          borderTopColor: "#1740C8", borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }} />
        Loading plan details…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      padding: "28px 28px 48px",
      background: "#F8FAFC",
      minHeight: "100vh",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <style>{`
        /* ── Reset & base ── */
        * { box-sizing: border-box; }

        /* ── Page header ── */
        .ph-title {
          font-size: 26px; font-weight: 800; color: #0F172A;
          margin: 0 0 4px; letter-spacing: -0.5px;
        }
        .ph-sub {
          font-size: 14px; color: #64748B; margin: 0;
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        }
        .ph-dot { color: #CBD5E1; }

        /* ── Alert banners ── */
        .banner {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-radius: 12px;
          font-size: 13px; font-weight: 500; margin-bottom: 24px;
        }
        .banner-warn  { background: #FFF7ED; border: 1px solid #FED7AA; color: #9A3412; }
        .banner-error { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; }

        /* ── Billing period toggle ── */
        .period-toggle {
          display: inline-flex; border: 1px solid #E2E8F0;
          border-radius: 10px; overflow: hidden; margin-bottom: 20px;
        }
        .period-btn {
          padding: 8px 16px; font-size: 13px; font-weight: 600;
          border: none; cursor: pointer; background: white;
          color: #64748B; transition: all 0.15s; font-family: inherit;
          white-space: nowrap;
        }
        .period-btn:hover { background: #F1F5F9; color: #0F172A; }
        .period-btn.active {
          background: #1740C8; color: white;
        }
        .period-btn .save-tag {
          display: inline-block; background: rgba(255,255,255,0.22);
          font-size: 10px; padding: 1px 6px; border-radius: 20px;
          margin-left: 5px; font-weight: 700;
        }

        /* ── Plan cards grid ── */
        .plan-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 24px; align-items: stretch; margin-bottom: 40px;
        }
        @media (max-width: 680px) { .plan-grid { grid-template-columns: 1fr; } }

        /* ── Card base ── */
        .plan-card {
          background: white; border-radius: 20px; padding: 28px;
          border: 1px solid #E2E8F0;
          display: flex; flex-direction: column;
        }
        .plan-card-upgrade {
          border: 2px solid #1740C8;
          box-shadow: 0 8px 40px rgba(23,64,200,0.10);
        }

        /* ── Card label ── */
        .card-label {
          font-size: 10px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.12em; color: #94A3B8; margin-bottom: 6px;
        }
        .card-label-upgrade { color: #1740C8; }

        /* ── Plan name ── */
        .plan-name {
          font-size: 22px; font-weight: 800; color: #0F172A;
          margin: 0 0 14px; letter-spacing: -0.3px;
        }

        /* ── Badges ── */
        .badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700; padding: 4px 10px;
          border-radius: 20px;
        }
        .badge-green  { background: #DCFCE7; color: #166534; }
        .badge-red    { background: #FEF2F2; color: #B91C1C; }
        .badge-amber  { background: #FEF3C7; color: #92400E; }
        .badge-blue   { background: #EFF6FF; color: #1D4ED8; }
        .badge-purple { background: #F3E8FF; color: #7E22CE; }

        /* ── Feature list ── */
        .feature-list { list-style: none; padding: 0; margin: 0 0 auto; }
        .feature-item {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 0; font-size: 13px; color: #334155;
          border-bottom: 1px solid #F8FAFC;
        }
        .feature-item:last-child { border-bottom: none; }
        .feature-check {
          width: 18px; height: 18px; border-radius: 50%;
          background: #DCFCE7; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0;
        }

        /* ── Price display ── */
        .price-wrap { margin: 20px 0 6px; }
        .price-amount {
          font-size: 38px; font-weight: 800; color: #0F172A;
          letter-spacing: -1px; line-height: 1;
        }
        .price-unit {
          font-size: 14px; font-weight: 400; color: #94A3B8; margin-left: 6px;
        }
        .price-zero {
          font-size: 18px; font-weight: 600; color: #94A3B8;
        }

        /* ── Benchmark note ── */
        .benchmark {
          font-size: 12px; color: #475569; background: #F1F5F9;
          padding: 10px 14px; border-radius: 10px;
          border-left: 3px solid #1740C8; margin: 16px 0 20px;
          line-height: 1.5;
        }

        /* ── CTA button ── */
        .btn-upgrade {
          width: 100%; padding: 14px; border-radius: 12px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; font-size: 15px; font-weight: 700;
          border: none; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center;
          gap: 8px; transition: opacity 0.2s; margin-top: auto;
        }
        .btn-upgrade:hover { opacity: 0.88; }
        .btn-upgrade:disabled { opacity: 0.45; cursor: not-allowed; }

        /* ── Trust row ── */
        .trust-row {
          display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px;
          justify-content: center;
        }
        .trust-item {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; color: #94A3B8;
        }

        /* ── Divider ── */
        .divider { border: none; border-top: 1px solid #F1F5F9; margin: 16px 0; }

        /* ── Section heading ── */
        .section-heading {
          font-size: 20px; font-weight: 800; color: #0F172A;
          letter-spacing: -0.3px; margin: 0 0 4px;
        }
        .section-sub {
          font-size: 13px; color: #64748B; margin: 0 0 20px;
        }

        /* ── Top-up grid ── */
        .topup-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }

        /* ── Top-up card ── */
        .topup-card {
          background: white; border-radius: 16px;
          border: 1.5px solid #E2E8F0; padding: 20px;
          transition: border-color 0.2s, box-shadow 0.2s;
          display: flex; flex-direction: column;
        }
        .topup-card:hover {
          border-color: #1740C8;
          box-shadow: 0 4px 20px rgba(23,64,200,0.08);
        }
        .topup-card.topup-active {
          border-color: #10B981; background: #F0FDF4;
        }
        .topup-icon { font-size: 24px; margin-bottom: 10px; }
        .topup-name {
          font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 3px;
        }
        .topup-desc {
          font-size: 12px; color: #64748B; margin-bottom: 10px; line-height: 1.4;
        }
        .topup-price {
          font-size: 13px; color: #475569; margin-bottom: 12px; margin-top: auto;
        }
        .btn-topup {
          width: 100%; padding: 9px; border-radius: 9px;
          background: #EFF6FF; color: #1D4ED8;
          border: none; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          gap: 6px; transition: background 0.15s;
        }
        .btn-topup:hover { background: #DBEAFE; }
        .topup-active-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 700; color: #059669;
          margin-top: auto; padding-top: 12px;
        }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="ph-title">💼 Plan &amp; Billing</h1>
        <p className="ph-sub">
          {formatBusinessType(businessType)}
          {businessType && <span className="ph-dot">·</span>}
          {plan?.name || "Basic"}
          {daysLeft !== null && daysLeft > 0 && (
            <>
              <span className="ph-dot">·</span>
              <span style={{ color: daysLeft <= 7 ? "#DC2626" : "#059669", fontWeight: 600 }}>
                Trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
              </span>
            </>
          )}
          {isTrialExpired && (
            <>
              <span className="ph-dot">·</span>
              <span style={{ color: "#DC2626", fontWeight: 600 }}>Trial expired</span>
            </>
          )}
        </p>
      </div>

      {/* ── Urgency banners ── */}
      {isTrialUrgent && (
        <div className="banner banner-warn">
          <Clock size={16} />
          Your trial expires in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>.
          Upgrade now to avoid any interruption to your data.
        </div>
      )}
      {isTrialExpired && (
        <div className="banner banner-error">
          <AlertTriangle size={16} />
          Your trial has expired. Upgrade immediately to restore full access.
        </div>
      )}

      {/* ── Billing period toggle (above both cards) ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
          Billing period
        </div>
        <div className="period-toggle">
          <button
            className={`period-btn ${billingPeriod === "monthly" ? "active" : ""}`}
            onClick={() => setBillingPeriod("monthly")}
          >
            Monthly
          </button>
          <button
            className={`period-btn ${billingPeriod === "half_yearly" ? "active" : ""}`}
            onClick={() => setBillingPeriod("half_yearly")}
          >
            6 Months
          </button>
          <button
            className={`period-btn ${billingPeriod === "yearly" ? "active" : ""}`}
            onClick={() => setBillingPeriod("yearly")}
          >
            12 Months
            {yearlySavingPct > 0 && (
              <span className="save-tag">Save {yearlySavingPct}%</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div className="plan-grid">

        {/* LEFT — Current plan */}
        <div className="plan-card">
          <div className="card-label">Current plan</div>
          <h2 className="plan-name">{plan?.name || "Basic"}</h2>

          {/* Trial status badge */}
          {isTrialHealthy && (
            <span className="badge badge-green" style={{ marginBottom: 14, alignSelf: "flex-start" }}>
              <Clock size={11} /> {daysLeft} days remaining
            </span>
          )}
          {isTrialUrgent && (
            <span className="badge badge-red" style={{ marginBottom: 14, alignSelf: "flex-start" }}>
              <Clock size={11} /> {daysLeft} day{daysLeft !== 1 ? "s" : ""} left — expiring soon
            </span>
          )}
          {isTrialExpired && (
            <span className="badge badge-red" style={{ marginBottom: 14, alignSelf: "flex-start" }}>
              Trial expired
            </span>
          )}

          <ul className="feature-list">
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Full CRM
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Banking
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Accounting (CoA, Journal)
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              All core reports
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              {userCount} user{userCount !== 1 ? "s" : ""}
            </li>
            {businessType === "trading" && (
              <li className="feature-item">
                <span className="feature-check"><Check size={11} color="#16A34A" /></span>
                Inventory &amp; Products
              </li>
            )}
            {businessType === "ngo" && (
              <li className="feature-item">
                <span className="feature-check"><Check size={11} color="#16A34A" /></span>
                NGO Dashboard &amp; Project Tracking
              </li>
            )}
          </ul>

          <hr className="divider" />
          <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>
            Trial includes all features for {plan?.trial_days || 10} days.
          </p>
        </div>

        {/* RIGHT — Upgrade card */}
        <div className="plan-card plan-card-upgrade">
          <div className="card-label card-label-upgrade">Upgrade to paid</div>
          <h2 className="plan-name">{plan?.name || "Basic"}</h2>

          {/* Price block */}
          <div className="price-wrap">
            {price > 0 ? (
              <>
                <span className="price-amount">PKR {price.toLocaleString()}</span>
                <span className="price-unit">/ user / {periodLabel}</span>
              </>
            ) : (
              <span className="price-zero">Contact us for pricing</span>
            )}
          </div>

          {/* Badges row */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            {billingPeriod === "yearly" && (
              <span className="badge badge-amber">
                <Star size={10} /> Best offer
              </span>
            )}
            {billingPeriod === "yearly" && yearlySavingPct > 0 && (
              <span className="badge badge-green">
                <TrendingUp size={10} /> Save {yearlySavingPct}%
              </span>
            )}
            {billingPeriod === "half_yearly" && (
              <span className="badge badge-blue">6-month plan</span>
            )}
            {billingPeriod === "monthly" && (
              <span className="badge badge-purple">Monthly flexibility</span>
            )}
          </div>

          {/* What's included */}
          <ul className="feature-list" style={{ marginTop: 16 }}>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Everything in your current trial
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Unlimited invoices &amp; transactions
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Priority support
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Data export (CSV / PDF)
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Custom branding on reports
            </li>
          </ul>

          {/* Benchmark */}
          <div className="benchmark">{BENCHMARK_NOTE}</div>

          <button
            className="btn-upgrade"
            onClick={handleUpgrade}
            disabled={price === 0}
            title={price === 0 ? "Price not configured — please contact support" : undefined}
          >
            Upgrade Now <ArrowRight size={16} />
          </button>

          {price === 0 && (
            <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", marginTop: 8 }}>
              Pricing for this plan is not yet configured. Please contact support.
            </p>
          )}

          <div className="trust-row">
            <span className="trust-item"><ShieldCheck size={13} /> Secure payment</span>
            <span className="trust-item"><Zap size={13} /> Activated in 2 hrs</span>
          </div>
        </div>
      </div>

      {/* ── Top-up features ── */}
      <div style={{ marginBottom: 20 }}>
        <h2 className="section-heading">🔧 Optional Add-On Features</h2>
        <p className="section-sub">
          Extend your plan with powerful modules — PKR 500 / user / month each
        </p>
      </div>

      <div className="topup-grid">
        {TOPUP_FEATURES.map((topup) => {
          const isActive = activeTopups.includes(topup.code)
          return (
            <div key={topup.code} className={`topup-card ${isActive ? "topup-active" : ""}`}>
              <div className="topup-icon">{topup.icon}</div>
              <div className="topup-name">{topup.name}</div>
              <div className="topup-desc">{topup.desc}</div>
              <div className="topup-price">
                PKR {topup.price}
                <span style={{ fontSize: "0.8em", color: "#94A3B8", marginLeft: 2 }}>/ user / month</span>
              </div>
              {isActive ? (
                <div className="topup-active-label">
                  <Check size={14} /> Active
                </div>
              ) : (
                <button
                  className="btn-topup"
                  onClick={() => handleActivateTopup(topup.code, topup.name)}
                >
                  <Plus size={13} /> Activate
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
