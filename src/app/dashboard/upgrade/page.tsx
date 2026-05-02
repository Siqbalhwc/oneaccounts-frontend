"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Check, X, ArrowRight, Star, Clock } from "lucide-react"

const PLANS = [
  {
    code: "basic",
    name: "Basic",
    price: "Free",
    features: {
      "Dashboard": true,
      "Customers": true,
      "Suppliers": true,
      "Products & Inventory": true,
      "Bank Accounts": true,
      "Bank Transfers": true,
      "Receipts & Payments": true,
      "Reports (Trial Balance, P&L, BS)": true,
      "Sales Invoices": false,
      "Purchase Bills": false,
      "Journal Entries": false,
      "CSV Import/Export": false,
      "WhatsApp Invoice Sending": false,
      "PDF Invoice Download": false,
      "Inventory Adjustments": false,
      "Investors": false,
    },
  },
  {
    code: "pro",
    name: "Professional",
    price: "Rs 5,999/month",
    popular: true,
    features: {
      "Dashboard": true,
      "Customers": true,
      "Suppliers": true,
      "Products & Inventory": true,
      "Bank Accounts": true,
      "Bank Transfers": true,
      "Receipts & Payments": true,
      "Reports (Trial Balance, P&L, BS)": true,
      "Sales Invoices": true,
      "Purchase Bills": true,
      "Journal Entries": true,
      "CSV Import/Export": true,
      "WhatsApp Invoice Sending": true,
      "PDF Invoice Download": true,
      "Inventory Adjustments": true,
      "Investors": true,
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    price: "Custom",
    features: {
      "Dashboard": true,
      "Customers": true,
      "Suppliers": true,
      "Products & Inventory": true,
      "Bank Accounts": true,
      "Bank Transfers": true,
      "Receipts & Payments": true,
      "Reports (Trial Balance, P&L, BS)": true,
      "Sales Invoices": true,
      "Purchase Bills": true,
      "Journal Entries": true,
      "CSV Import/Export": true,
      "WhatsApp Invoice Sending": true,
      "PDF Invoice Download": true,
      "Inventory Adjustments": true,
      "Investors": true,
    },
  },
]

export default function UpgradePage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [currentPlan, setCurrentPlan] = useState<string>("basic")
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from("company_settings")
      .select("plan_id, trial_ends_at, plans(id, code)")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) {
          // Normalize the joined relation – it may be an array or a single object
          const plan = Array.isArray(data.plans) ? data.plans[0] : data.plans
          setCurrentPlan(plan?.code || "basic")
          setTrialEndsAt(data.trial_ends_at || null)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>

  const daysLeft = trialEndsAt
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div style={{
      padding: 24,
      background: "#EFF4FB",
      minHeight: "100vh",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <style>{`
        .upgrade-title { font-size: 24px; font-weight: 800; color: #1E293B; margin-bottom: 4px; }
        .upgrade-subtitle { font-size: 14px; color: #64748B; margin-bottom: 24px; }
        .plan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .plan-card {
          background: white;
          border-radius: 14px;
          border: 2px solid #E2E8F0;
          padding: 24px;
          transition: all 0.3s;
          position: relative;
        }
        .plan-card.popular { border-color: #3B82F6; box-shadow: 0 4px 20px rgba(59,130,246,0.15); }
        .plan-card:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.1); }
        .plan-badge {
          position: absolute;
          top: -12px;
          right: 20px;
          background: #3B82F6;
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
        }
        .plan-name { font-size: 18px; font-weight: 700; color: #1E293B; margin-bottom: 4px; }
        .plan-price { font-size: 28px; font-weight: 800; color: #1E3A8A; margin-bottom: 16px; }
        .plan-current { background: #F0FDF4; color: #15803D; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 12px; }
        .feature-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; color: #475569; }
        .btn-upgrade {
          display: block;
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #1740C8, #071352);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          text-align: center;
          margin-top: 16px;
        }
        .btn-upgrade:disabled { opacity: 0.5; cursor: not-allowed; }
        .trial-banner {
          background: linear-gradient(135deg, #D1FAE5, #F0FDF4);
          border: 1px solid #A7F3D0;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        @media (max-width: 600px) {
          .plan-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <h1 className="upgrade-title">⚡ Plans & Pricing</h1>
      <p className="upgrade-subtitle">Choose the plan that fits your business</p>

      {trialEndsAt && daysLeft !== null && daysLeft > 0 && (
        <div className="trial-banner">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={18} color="#10B981" />
            <span style={{ fontWeight: 600, color: "#065F46" }}>
              Your free trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </span>
          </div>
          <button className="btn-upgrade" style={{ width: "auto", padding: "8px 20px" }}
            onClick={() => window.location.href = "mailto:siqbalhwc@gmail.com?subject=Upgrade to Pro"}>
            Upgrade Now <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="plan-grid">
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.code
          return (
            <div key={plan.code} className={`plan-card ${plan.popular ? "popular" : ""}`}>
              {plan.popular && <div className="plan-badge"><Star size={10} /> Popular</div>}
              <div className="plan-name">{plan.name}</div>
              <div className="plan-price">{plan.price}</div>
              {isCurrent && <div className="plan-current">✓ Current Plan</div>}
              <div style={{ marginTop: 8 }}>
                {Object.entries(plan.features).map(([feature, enabled]) => (
                  <div key={feature} className="feature-row">
                    {enabled ? <Check size={14} color="#10B981" /> : <X size={14} color="#EF4444" />}
                    <span style={{ color: enabled ? "#475569" : "#CBD5E1" }}>{feature}</span>
                  </div>
                ))}
              </div>
              {!isCurrent && (
                <button className="btn-upgrade"
                  onClick={() => window.location.href = `mailto:siqbalhwc@gmail.com?subject=Upgrade to ${plan.name}`}>
                  Upgrade to {plan.name} <ArrowRight size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}