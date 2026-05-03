"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Check, X, ArrowRight, Star, Clock } from "lucide-react"

const PLAN_PRICES: Record<string, number> = {
  pro: 4999,
  enterprise: 0, // Custom pricing — will trigger Contact Us
}

const PLANS = [
  {
    code: "basic",
    name: "Basic",
    price: "Rs 1,999 / month",
    features: {
      "Dashboard": true,
      "Customers – Invoices, Print, Ledger": true,
      "Vendors – Bills, Print, Ledger": true,
      "Bank – Transfers, Multiple Accounts": true,
      "Journal – Adjustment Entries": true,
      "Reports – General Ledger, Trial Balance": true,
      "Reports – Profit & Loss": true,
      "Inventory": false,
      "Investors": false,
      "Balance Sheet": false,
      "Purchase Orders": false,
      "Email Reports": false,
      "WhatsApp Invoice Sending": false,
      "Payment Reminders": false,
      "CSV Import / Export": false,
      "Invoice Automation": false,
      "Profit Allocation": false,
    },
  },
  {
    code: "pro",
    name: "Professional",
    price: "Rs 4,999 / month",
    popular: true,
    features: {
      "Dashboard": true,
      "Customers – Invoices, Print, Ledger": true,
      "Vendors – Bills, Print, Ledger": true,
      "Bank – Transfers, Multiple Accounts": true,
      "Journal – Adjustment Entries": true,
      "Reports – General Ledger, Trial Balance": true,
      "Reports – Profit & Loss": true,
      "Inventory": true,
      "Investors": true,
      "Balance Sheet": true,
      "Purchase Orders": true,
      "Email Reports": true,
      "WhatsApp Invoice Sending": false,
      "Payment Reminders": false,
      "CSV Import / Export": false,
      "Invoice Automation": false,
      "Profit Allocation": false,
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    price: "Custom",
    features: {
      "Dashboard": true,
      "Customers – Invoices, Print, Ledger": true,
      "Vendors – Bills, Print, Ledger": true,
      "Bank – Transfers, Multiple Accounts": true,
      "Journal – Adjustment Entries": true,
      "Reports – General Ledger, Trial Balance": true,
      "Reports – Profit & Loss": true,
      "Inventory": true,
      "Investors": true,
      "Balance Sheet": true,
      "Purchase Orders": true,
      "Email Reports": true,
      "WhatsApp Invoice Sending": true,
      "Payment Reminders": true,
      "CSV Import / Export": true,
      "Invoice Automation": true,
      "Profit Allocation": true,
    },
  },
]

export default function UpgradePage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [currentPlan, setCurrentPlan] = useState<string>("basic")
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null) // plan code being processed
  const [message, setMessage] = useState("")

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Not logged in")

        const { data: role } = await supabase
          .from("user_roles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle()

        if (!role?.company_id) throw new Error("No company found")

        const { data: company } = await supabase
          .from("companies")
          .select("plan_id, trial_ends_at, plans(code)")
          .eq("id", role.company_id)
          .single()

        if (company) {
          const plan = Array.isArray(company.plans) ? company.plans[0] : company.plans
          setCurrentPlan(plan?.code || "basic")
          setTrialEndsAt(company.trial_ends_at || null)
        }
      } catch {
        // silently fallback to "basic"
      }
      setLoading(false)
    }
    fetchSettings()
  }, [supabase])

  const handleUpgrade = async (targetPlan: string) => {
    const price = PLAN_PRICES[targetPlan]
    if (!price) {
      // Enterprise – still uses email for now (Custom pricing)
      window.location.href = `mailto:siqbalhwc@gmail.com?subject=Upgrade to ${targetPlan}`
      return
    }

    setUpgrading(targetPlan)
    setMessage("")

    try {
      const res = await fetch("/api/payments/jazzcash/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: price,
          paymentType: "plan_upgrade",
          metadata: { plan_from: currentPlan, plan_to: targetPlan },
        }),
      })
      const data = await res.json()

      if (data.success) {
        // Build a form and auto-submit to JazzCash
        const form = document.createElement("form")
        form.method = "POST"
        form.action = data.redirectUrl

        Object.entries(data.params).forEach(([key, value]) => {
          const input = document.createElement("input")
          input.type = "hidden"
          input.name = key
          input.value = value as string
          form.appendChild(input)
        })

        document.body.appendChild(form)
        form.submit()
      } else {
        setMessage(data.error || "Failed to initiate payment")
      }
    } catch (e: any) {
      setMessage("Network error. Please try again.")
    }
    setUpgrading(null)
  }

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

      {message && (
        <div style={{
          background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px",
          borderRadius: 8, marginBottom: 16, fontSize: 13,
        }}>
          {message}
        </div>
      )}

      {trialEndsAt && daysLeft !== null && daysLeft > 0 && (
        <div className="trial-banner">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={18} color="#10B981" />
            <span style={{ fontWeight: 600, color: "#065F46" }}>
              Your free trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </span>
          </div>
          <button className="btn-upgrade" style={{ width: "auto", padding: "8px 20px" }}
            onClick={() => handleUpgrade("pro")}>
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
                <button
                  className="btn-upgrade"
                  onClick={() => handleUpgrade(plan.code)}
                  disabled={upgrading === plan.code}
                >
                  {upgrading === plan.code ? "Redirecting..." : `Upgrade to ${plan.name}`} <ArrowRight size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}