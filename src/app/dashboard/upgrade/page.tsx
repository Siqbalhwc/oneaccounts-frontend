"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Check, Clock, ArrowRight, Plus, Minus, ShieldCheck, Zap, Star, TrendingUp } from "lucide-react"
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

function formatBusinessType(raw: string): string {
  if (!raw) return ""
  return raw
    .split(" ")
    .map((w) => {
      const upper = w.toUpperCase()
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

  const [plan, setPlan] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [activeTopups, setActiveTopups] = useState<string[]>([])  // from DB
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "half_yearly" | "yearly">("yearly")

  // ----- Local selection of top‑ups (not yet purchased) -----
  const [selectedTopups, setSelectedTopups] = useState<Set<string>>(new Set())

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

  // ----- Price calculations -----
  const getBasePrice = useCallback((): number => {
    if (!plan) return 0
    switch (billingPeriod) {
      case "monthly": return plan.monthly_price_per_user || 0
      case "half_yearly": return plan.half_yearly_price_per_user || 0
      case "yearly": return plan.yearly_price_per_user || 0
    }
  }, [plan, billingPeriod])

  // Discount factor = (base price for period) / (monthly price * number of months)
  const getDiscountFactor = useCallback((): number => {
    if (!plan || !plan.monthly_price_per_user) return 1
    const months = billingPeriod === "monthly" ? 1 : billingPeriod === "half_yearly" ? 6 : 12
    const periodPrice = getBasePrice()
    const fullPrice = plan.monthly_price_per_user * months
    return fullPrice > 0 ? periodPrice / fullPrice : 1
  }, [plan, billingPeriod, getBasePrice])

  const getAddonPriceForPeriod = useCallback((monthlyAddonPrice: number): number => {
    const months = billingPeriod === "monthly" ? 1 : billingPeriod === "half_yearly" ? 6 : 12
    const fullAddonPrice = monthlyAddonPrice * months
    return Math.round(fullAddonPrice * getDiscountFactor())
  }, [billingPeriod, getDiscountFactor])

  const totalAddonPrice = () => {
    let total = 0
    selectedTopups.forEach(code => {
      const feature = TOPUP_FEATURES.find(f => f.code === code)
      if (feature) total += getAddonPriceForPeriod(feature.price)
    })
    return total
  }

  const totalPrice = getBasePrice() + totalAddonPrice()

  const handleUpgrade = () => {
    router.push(
      `/dashboard/upgrade/payment?amount=${totalPrice}&period=${billingPeriod}&plan=${plan?.code || ""}&topups=${Array.from(selectedTopups).join(",")}`
    )
  }

  const toggleTopup = (code: string) => {
    setSelectedTopups(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const daysLeft = subscription?.end_date
    ? Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const userCount = subscription?.max_users || 1

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
    <div style={{ padding: "28px 28px 48px", background: "#F8FAFC", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        .ph-title { font-size: 26px; font-weight: 800; color: #0F172A; margin: 0 0 4px; letter-spacing: -0.5px; }
        .ph-sub { font-size: 14px; color: #64748B; margin: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .ph-dot { color: #CBD5E1; }

        .plan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: stretch; margin-bottom: 40px; }
        @media (max-width: 680px) { .plan-grid { grid-template-columns: 1fr; } }

        .plan-card {
          background: white; border-radius: 20px; padding: 28px;
          border: 1px solid #E2E8F0;
          display: flex; flex-direction: column;
        }
        .plan-card-upgrade {
          border: 2px solid #1740C8;
          box-shadow: 0 8px 40px rgba(23,64,200,0.10);
        }

        .card-label {
          font-size: 10px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.12em; color: #94A3B8; margin-bottom: 6px;
        }
        .card-label-upgrade { color: #1740C8; }

        .plan-name {
          font-size: 22px; font-weight: 800; color: #0F172A;
          margin: 0 0 14px; letter-spacing: -0.3px;
        }

        .badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700; padding: 4px 10px;
          border-radius: 20px;
        }
        .badge-green  { background: #DCFCE7; color: #166534; }
        .badge-red    { background: #FEF2F2; color: #B91C1C; }
        .badge-amber  { background: #FEF3C7; color: #92400E; }
        .badge-blue   { background: #EFF6FF; color: #1D4ED8; }

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

        .period-toggle {
          display: inline-flex; border: 1px solid #E2E8F0;
          border-radius: 10px; overflow: hidden;
        }
        .period-btn {
          padding: 8px 16px; font-size: 13px; font-weight: 600;
          border: none; cursor: pointer; background: white;
          color: #64748B; transition: all 0.15s; font-family: inherit;
          white-space: nowrap;
        }
        .period-btn:hover { background: #F1F5F9; color: #0F172A; }
        .period-btn.active { background: #1740C8; color: white; }
        .period-btn .save-tag {
          display: inline-block; background: rgba(255,255,255,0.22);
          font-size: 10px; padding: 1px 6px; border-radius: 20px;
          margin-left: 5px; font-weight: 700;
        }

        .price-wrap { margin: 20px 0 6px; }
        .price-amount { font-size: 38px; font-weight: 800; color: #0F172A; letter-spacing: -1px; line-height: 1; }
        .price-unit { font-size: 14px; font-weight: 400; color: #94A3B8; margin-left: 6px; }

        .benchmark {
          font-size: 12px; color: #475569; background: #F1F5F9;
          padding: 10px 14px; border-radius: 10px;
          border-left: 3px solid #1740C8; margin: 16px 0 20px;
          line-height: 1.5;
        }

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

        .trust-row {
          display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px;
          justify-content: center;
        }
        .trust-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #94A3B8; }

        .divider { border: none; border-top: 1px solid #F1F5F9; margin: 16px 0; }

        .section-heading { font-size: 20px; font-weight: 800; color: #0F172A; letter-spacing: -0.3px; margin: 0 0 4px; }
        .section-sub { font-size: 13px; color: #64748B; margin: 0 0 20px; }

        .topup-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .topup-card {
          background: white; border-radius: 16px;
          border: 1.5px solid #E2E8F0; padding: 20px;
          transition: border-color 0.2s, box-shadow 0.2s;
          display: flex; flex-direction: column; cursor: pointer;
        }
        .topup-card:hover { border-color: #1740C8; box-shadow: 0 4px 20px rgba(23,64,200,0.08); }
        .topup-card.selected { border-color: #1740C8; background: #EFF6FF; }
        .topup-card.active { border-color: #10B981; background: #F0FDF4; }

        .topup-icon { font-size: 24px; margin-bottom: 10px; }
        .topup-name { font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 3px; }
        .topup-desc { font-size: 12px; color: #64748B; margin-bottom: 10px; line-height: 1.4; }
        .topup-price { font-size: 13px; color: #475569; margin-bottom: 12px; margin-top: auto; }
        .btn-topup {
          width: 100%; padding: 9px; border-radius: 9px;
          background: #EFF6FF; color: #1D4ED8;
          border: none; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          gap: 6px; transition: background 0.15s;
        }
        .btn-topup:hover { background: #DBEAFE; }
        .topup-active-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #059669; margin-top: auto; padding-top: 12px; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="ph-title">💼 Plan &amp; Billing</h1>
        <p className="ph-sub">
          {formatBusinessType(businessType)}
          {businessType && <span className="ph-dot">·</span>}
          {plan?.name || "Basic"}
        </p>
      </div>

      {/* Plan cards */}
      <div className="plan-grid">
        {/* LEFT — Trial card */}
        <div className="plan-card">
          <div className="card-label">
            Trial <sup style={{ fontWeight: 400, fontSize: "0.8em", color: "#94A3B8", letterSpacing: 0 }}>10 days</sup>
          </div>
          <h2 className="plan-name">{plan?.name || "Basic"}</h2>

          {daysLeft !== null && daysLeft > 0 && (
            <span className="badge badge-green" style={{ marginBottom: 14, alignSelf: "flex-start" }}>
              <Clock size={11} /> {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
            </span>
          )}
          {daysLeft !== null && daysLeft <= 0 && (
            <span className="badge badge-red" style={{ marginBottom: 14, alignSelf: "flex-start" }}>
              Trial expired
            </span>
          )}

          <ul className="feature-list">
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              CRM — Customers, Invoices, Receipts, Suppliers, Bills, Payments
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Banking — Bank accounts, transfers
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Accounting — Chart of Accounts, Journal Entries
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Reports — Trial Balance, P&L, Balance Sheet, all Ledgers
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              Settings — Company branding, address, contact
            </li>
            <li className="feature-item">
              <span className="feature-check"><Check size={11} color="#16A34A" /></span>
              {userCount} user{userCount !== 1 ? "s" : ""}
            </li>
            {businessType === "trading" && (
              <li className="feature-item">
                <span className="feature-check"><Check size={11} color="#16A34A" /></span>
                Inventory — Stock register, product selection, adjustments
              </li>
            )}
            {businessType === "ngo" && (
              <li className="feature-item">
                <span className="feature-check"><Check size={11} color="#16A34A" /></span>
                NGO toolkit — Project/Activity/Location tags, Dashboard, Budget vs Actual
              </li>
            )}
          </ul>
        </div>

        {/* RIGHT — Upgrade card */}
        <div className="plan-card plan-card-upgrade">
          <div className="card-label card-label-upgrade">Upgrade to paid</div>
          <h2 className="plan-name">{plan?.name || "Basic"}</h2>

          {/* Billing period toggle inside the card */}
          <div style={{ margin: "16px 0 12px" }}>
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
                {(() => {
                  if (!plan) return null
                  const monthly = plan.monthly_price_per_user || 0
                  const yearly = plan.yearly_price_per_user || 0
                  const saving = monthly * 12 - yearly
                  const pct = monthly > 0 ? Math.round((saving / (monthly * 12)) * 100) : 0
                  return <span className="save-tag">Save {pct}%</span>
                })()}
              </button>
            </div>
          </div>

          {/* Price */}
          <div className="price-wrap">
            <span className="price-amount">PKR {totalPrice.toLocaleString()}</span>
            <span className="price-unit">/ user / {billingPeriod === "monthly" ? "month" : billingPeriod === "half_yearly" ? "6 months" : "year"}</span>
          </div>

          {/* Selected add-ons summary */}
          {selectedTopups.size > 0 && (
            <div style={{ fontSize: 13, color: "#475569", marginTop: 8 }}>
              Includes add‑ons: {Array.from(selectedTopups).map(c => TOPUP_FEATURES.find(f => f.code === c)?.name).join(", ")}
            </div>
          )}

          {/* Benchmark */}
          <div className="benchmark">{BENCHMARK_NOTE}</div>

          <button className="btn-upgrade" onClick={handleUpgrade} disabled={totalPrice === 0}>
            Upgrade Now <ArrowRight size={16} />
          </button>

          <div className="trust-row">
            <span className="trust-item"><ShieldCheck size={13} /> Secure payment</span>
            <span className="trust-item"><Zap size={13} /> Activated in 2 hrs</span>
          </div>
        </div>
      </div>

      {/* Top‑up features (selectable) */}
      <div style={{ marginBottom: 20 }}>
        <h2 className="section-heading">🔧 Optional Add‑On Features</h2>
        <p className="section-sub">
          Click to add or remove — PKR 500 / user / month each (discount applies with billing period)
        </p>
      </div>

      <div className="topup-grid">
        {TOPUP_FEATURES.map((topup) => {
          const isAlreadyActive = activeTopups.includes(topup.code)   // already purchased
          const isSelected = selectedTopups.has(topup.code)           // currently toggled for new purchase

          return (
            <div
              key={topup.code}
              className={`topup-card ${isAlreadyActive ? "active" : ""} ${isSelected ? "selected" : ""}`}
              onClick={() => !isAlreadyActive && toggleTopup(topup.code)}
              style={{ cursor: isAlreadyActive ? "default" : "pointer" }}
            >
              <div className="topup-icon">{topup.icon}</div>
              <div className="topup-name">{topup.name}</div>
              <div className="topup-desc">{topup.desc}</div>
              <div className="topup-price">
                PKR {topup.price}
                <span style={{ fontSize: "0.8em", color: "#94A3B8", marginLeft: 2 }}>/ user / month</span>
              </div>
              {isAlreadyActive ? (
                <div className="topup-active-label"><Check size={14} /> Active</div>
              ) : isSelected ? (
                <div className="btn-topup" onClick={(e) => { e.stopPropagation(); toggleTopup(topup.code) }}>
                  <Minus size={13} /> Remove
                </div>
              ) : (
                <div className="btn-topup" onClick={(e) => { e.stopPropagation(); toggleTopup(topup.code) }}>
                  <Plus size={13} /> Add
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}