"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Check, Clock, ArrowRight, Plus, ShieldCheck, Zap } from "lucide-react"
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

// FIX: display-safe price — returns "Coming soon" when DB value is 0 or null
function formatPrice(value: number | null | undefined, fallback = "—"): string {
  if (!value || value === 0) return fallback
  return `PKR ${value.toLocaleString()}`
}

// FIX: label for billing select options
const PERIOD_LABELS: Record<string, string> = {
  monthly:     "month",
  half_yearly: "6 months",
  yearly:      "year",
}

export default function UpgradePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { companyId } = useCompany()

  const [plan, setPlan]               = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [activeTopups, setActiveTopups] = useState<string[]>([])
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading]         = useState(true)
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "half_yearly" | "yearly">("yearly")
  const [toastMsg, setToastMsg]       = useState("")

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

  // FIX: redirect to payment with topup=true so payment page shows correct label
  const handleUpgrade = () => {
    const price = getPrice()
    router.push(
      `/dashboard/upgrade/payment?amount=${price}&period=${billingPeriod}&plan=${plan?.code || ""}`
    )
  }

  // FIX: topup redirects to payment page with topup params instead of just showing a message
  const handleActivateTopup = (featureCode: string, featureName: string) => {
    router.push(
      `/dashboard/upgrade/payment?amount=500&period=monthly&plan=${plan?.code || ""}&topup=${featureCode}&topup_name=${encodeURIComponent(featureName)}`
    )
  }

  const daysLeft = subscription?.end_date
    ? Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const price        = getPrice()
  const periodLabel  = PERIOD_LABELS[billingPeriod]
  const userCount    = subscription?.max_users || 1
  const priceDisplay = formatPrice(price)

  // Savings badge: yearly vs monthly
  const monthlyCost     = plan?.monthly_price_per_user || 0
  const yearlyCost      = plan?.yearly_price_per_user || 0
  const yearlySavingPct =
    monthlyCost > 0 ? Math.round(((monthlyCost * 12 - yearlyCost) / (monthlyCost * 12)) * 100) : 0

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>
        Loading plan details…
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 24,
        background: "#F8FAFC",
        minHeight: "100vh",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <style>{`
        .card {
          background: white; border-radius: 18px; padding: 28px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.04);
          border: 1px solid #E2E8F0;
        }
        .label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.09em; color: #94A3B8;
        }
        .price-big {
          font-size: 34px; font-weight: 800; color: #0F172A; line-height: 1.1;
        }
        .price-sub {
          font-size: 14px; font-weight: 400; color: #64748B; margin-left: 4px;
        }
        .feature-row {
          display: flex; align-items: center; gap: 8px; padding: 7px 0;
          font-size: 13px; color: #334155;
        }
        .btn-primary {
          background: linear-gradient(135deg, #1740C8, #071352);
          color: white; border: none; padding: 14px 24px;
          border-radius: 12px; font-weight: 700; cursor: pointer;
          width: 100%; font-size: 15px; display: flex;
          align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.2s;
        }
        .btn-primary:hover { opacity: 0.88; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .badge-amber  { background:#FEF3C7; color:#92400E; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; }
        .badge-green  { background:#DCFCE7; color:#166534; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; }
        .badge-blue   { background:#EFF6FF; color:#1D4ED8; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; }
        .badge-red    { background:#FEF2F2; color:#B91C1C; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; }
        .select-period {
          width: 100%; padding: 11px 36px 11px 14px; border-radius: 10px;
          border: 1px solid #E2E8F0; font-size: 14px; font-family: inherit;
          background: white; color: #0F172A; cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 14px center;
        }
        .select-period:focus { outline: none; border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
        .topup-card {
          background: white; border-radius: 14px; border: 1.5px solid #E2E8F0;
          padding: 20px; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .topup-card:hover { border-color: #3B82F6; box-shadow: 0 4px 16px rgba(59,130,246,0.08); }
        .topup-card.active { border-color: #10B981; background: #F0FDF4; }
        .btn-topup {
          background: #EFF6FF; color: #1D4ED8; border: none;
          padding: 8px 14px; border-radius: 8px; font-weight: 600;
          cursor: pointer; width: 100%; font-size: 13px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 12px; transition: background 0.2s;
        }
        .btn-topup:hover { background: #DBEAFE; }
        .urgency-banner {
          display: flex; align-items: center; gap: 10px;
          background: #FFF7ED; border: 1px solid #FED7AA;
          border-radius: 10px; padding: 10px 14px;
          font-size: 13px; color: #9A3412; font-weight: 500;
          margin-bottom: 20px;
        }
        .trust-row {
          display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px;
        }
        .trust-item {
          display: flex; align-items: center; gap: 5px;
          font-size: 12px; color: #94A3B8;
        }
      `}</style>

      {/* Page header */}
      <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
        💼 Plan &amp; Billing
      </h1>
      <p style={{ color: "#64748B", marginBottom: 20 }}>
        {businessType ? businessType.charAt(0).toUpperCase() + businessType.slice(1) : ""} business ·{" "}
        {plan?.name || "Basic"}
      </p>

      {/* FIX: urgency banner when trial is running out */}
      {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
        <div className="urgency-banner">
          <Clock size={16} />
          Your trial expires in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>. Upgrade now to avoid interruption.
        </div>
      )}
      {daysLeft !== null && daysLeft <= 0 && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 10, padding: "10px 14px",
            fontSize: 13, color: "#B91C1C", fontWeight: 500,
            marginBottom: 20,
          }}
        >
          ⚠️ Your trial has expired. Upgrade to restore full access.
        </div>
      )}

      {/* Two-column plan cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "start",
          marginBottom: 36,
        }}
      >
        {/* Left – Current plan */}
        <div className="card">
          <div className="label" style={{ marginBottom: 4 }}>Current plan</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
            {plan?.name || "Basic Trial"}
          </h2>

          {/* FIX: trial days shown as badge, not just text */}
          {daysLeft !== null && daysLeft > 0 && (
            <span className={daysLeft <= 7 ? "badge-red" : "badge-green"} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} /> {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
            </span>
          )}

          <div style={{ marginTop: 16 }}>
            <div className="feature-row"><Check size={14} color="#10B981" /> Full CRM</div>
            <div className="feature-row"><Check size={14} color="#10B981" /> Banking</div>
            <div className="feature-row"><Check size={14} color="#10B981" /> Accounting (CoA, Journal)</div>
            <div className="feature-row"><Check size={14} color="#10B981" /> All core reports</div>
            <div className="feature-row">
              <Check size={14} color="#10B981" /> {userCount} user{userCount !== 1 ? "s" : ""}
            </div>
            {businessType === "trading" && (
              <div className="feature-row"><Check size={14} color="#10B981" /> Inventory &amp; Products</div>
            )}
            {businessType === "ngo" && (
              <div className="feature-row"><Check size={14} color="#10B981" /> NGO Dashboard &amp; Project Tracking</div>
            )}
          </div>
        </div>

        {/* Right – Upgrade card */}
        <div
          className="card"
          style={{
            borderColor: "#3B82F6",
            boxShadow: "0 8px 32px rgba(59,130,246,0.12)",
          }}
        >
          <div className="label" style={{ marginBottom: 4 }}>Upgrade to paid</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
            {plan?.name || "Basic"}
          </h2>

          {/* Billing period selector */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <select
              className="select-period"
              value={billingPeriod}
              onChange={(e) => setBillingPeriod(e.target.value as any)}
            >
              <option value="monthly">Monthly</option>
              <option value="half_yearly">6 Months</option>
              <option value="yearly">
                12 Months (Best Offer){yearlySavingPct > 0 ? ` — Save ${yearlySavingPct}%` : ""}
              </option>
            </select>
          </div>

          {/* FIX: show real price or "Contact us" when price is 0/null */}
          <div style={{ marginBottom: 4 }}>
            {price > 0 ? (
              <span className="price-big">
                PKR {price.toLocaleString()}
                <span className="price-sub">/ user / {periodLabel}</span>
              </span>
            ) : (
              <span style={{ fontSize: 20, fontWeight: 700, color: "#64748B" }}>
                Price not set — contact us
              </span>
            )}
          </div>

          {/* Savings badges */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, marginTop: 6 }}>
            {billingPeriod === "yearly" && (
              <span className="badge-amber">Best Offer</span>
            )}
            {billingPeriod === "yearly" && yearlySavingPct > 0 && (
              <span className="badge-green">Save {yearlySavingPct}%</span>
            )}
          </div>

          {/* Competitor benchmark */}
          <div
            style={{
              fontSize: 12,
              color: "#475569",
              background: "#F1F5F9",
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 20,
              borderLeft: "3px solid #3B82F6",
            }}
          >
            {BENCHMARK_NOTE}
          </div>

          <button
            className="btn-primary"
            onClick={handleUpgrade}
            // FIX: disable when price is not set so user doesn't reach payment with PKR 0
            disabled={price === 0}
            title={price === 0 ? "Price not configured — contact support" : undefined}
          >
            Upgrade Now <ArrowRight size={16} />
          </button>
          {price === 0 && (
            <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", marginTop: 6 }}>
              Price for this plan is not yet configured. Please contact support.
            </p>
          )}

          {/* Trust signals */}
          <div className="trust-row">
            <span className="trust-item"><ShieldCheck size={13} /> Secure payment</span>
            <span className="trust-item"><Zap size={13} /> Activated in 2 hrs</span>
          </div>
        </div>
      </div>

      {/* Top-up features */}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
        🔧 Optional Top-Up Features
      </h2>
      <p style={{ color: "#64748B", fontSize: 14, marginBottom: 16 }}>
        Enhance your plan — PKR 500 / user / month each
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {TOPUP_FEATURES.map((topup) => {
          const isActive = activeTopups.includes(topup.code)
          return (
            <div key={topup.code} className={`topup-card ${isActive ? "active" : ""}`}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{topup.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A" }}>{topup.name}</div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 3, marginBottom: 8 }}>
                {topup.desc}
              </div>
              <div style={{ fontSize: 13, color: "#475569" }}>
                PKR {topup.price}
                <span style={{ fontSize: "0.75em", marginLeft: 2 }}>/ user / month</span>
              </div>

              {isActive ? (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#10B981",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  <Check size={14} /> Active
                </div>
              ) : (
                // FIX: redirects to payment page with topup params instead of showing a message
                <button
                  className="btn-topup"
                  onClick={() => handleActivateTopup(topup.code, topup.name)}
                >
                  <Plus size={13} /> Activate — PKR {topup.price}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
