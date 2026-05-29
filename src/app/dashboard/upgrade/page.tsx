"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Check, X, ArrowRight, Star, Clock, Plus, Zap } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"

// ── Top‑up features available for purchase ──────────────────────────
const TOPUP_FEATURES = [
  { code: "asset_management", name: "Fixed Asset Management", price: 500 },
  { code: "purchase_orders", name: "Purchase Orders", price: 500 },
  { code: "whatsapp", name: "WhatsApp Integration", price: 500 },
  { code: "invoice_automation", name: "Invoice Automation", price: 500 },
  { code: "profit_allocation", name: "Profit Allocation", price: 500 },
  { code: "investors", name: "Investors Module", price: 500 },
]

// ── Small superscript helper ─────────────────────────────────────────
function Sup({ children }: { children: React.ReactNode }) {
  return <sup style={{ fontSize: "0.65em", fontWeight: 400, color: "#64748B", marginLeft: 2 }}>{children}</sup>
}

export default function UpgradePage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { companyId, companyName: ctxCompanyName } = useCompany()

  const [plan, setPlan] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [activeTopups, setActiveTopups] = useState<string[]>([])
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!companyId) return
    const fetchData = async () => {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("business_type, plans(code, name, monthly_price_per_user, half_yearly_price_per_user, yearly_price_per_user, trial_days, description)")
          .eq("id", companyId)
          .single()

        if (company) {
          const planData = Array.isArray(company.plans) ? company.plans[0] : company.plans
          setPlan(planData)
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
          if (topups) setActiveTopups(topups.map(t => t.feature_code))
        }
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    fetchData()
  }, [companyId])

  const handleActivateTopup = async (featureCode: string) => {
    setMessage("")
    setMessage(`To activate ${featureCode}, please transfer PKR 500 per user to our bank account and contact support.`)
  }

  const handleUpgrade = (period: "monthly" | "half_yearly" | "yearly") => {
    const prices: Record<string, number> = {
      monthly: plan?.monthly_price_per_user || 3000,
      half_yearly: plan?.half_yearly_price_per_user || 16000,
      yearly: plan?.yearly_price_per_user || 30000,
    }
    setMessage(`To upgrade to the ${period} plan (PKR ${prices[period]}/user), please transfer the amount to our bank account and email us the transaction ID.`)
  }

  const daysLeft = subscription?.end_date
    ? Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const pricing = plan
    ? {
        monthly: plan.monthly_price_per_user,
        halfYearly: plan.half_yearly_price_per_user,
        yearly: plan.yearly_price_per_user,
      }
    : { monthly: 3000, halfYearly: 16000, yearly: 30000 }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .plan-card {
          background: white;
          border-radius: 14px;
          border: 2px solid #E2E8F0;
          padding: 24px;
          transition: all 0.3s;
        }
        .plan-card.current {
          border-color: #3B82F6;
          box-shadow: 0 4px 20px rgba(59,130,246,0.15);
        }
        .plan-name { font-size: 18px; font-weight: 700; color: #1E293B; }
        .plan-price { font-size: 28px; font-weight: 800; color: #1E3A8A; }
        .plan-badge {
          background: #F0FDF4; color: #15803D; padding: 4px 12px;
          border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block;
        }
        .feature-row {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 0; font-size: 13px; color: #475569;
        }
        .btn {
          padding: 10px 20px; border-radius: 10px; font-weight: 600;
          cursor: pointer; font-family: inherit; border: none;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .btn-outline { background: white; border: 2px solid #1740C8; color: #1740C8; }
        .trial-banner {
          background: linear-gradient(135deg, #D1FAE5, #F0FDF4);
          border: 1px solid #A7F3D0; border-radius: 12px;
          padding: 16px 20px; margin-bottom: 24px;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px;
        }
        .upgrade-option {
          background: white; border: 2px solid #E2E8F0; border-radius: 14px;
          padding: 16px; text-align: center; cursor: pointer; transition: all 0.25s;
          flex: 1; min-width: 140px;
        }
        .upgrade-option:hover {
          border-color: #3B82F6;
          box-shadow: 0 4px 16px rgba(59,130,246,0.12);
        }
        .upgrade-option.best {
          border-color: #F59E0B;
          background: linear-gradient(135deg, #FFFBEB, #FEF3C7);
          position: relative;
        }
        .upgrade-option.best::before {
          content: "Best Offer";
          position: absolute; top: -10px; right: 10px;
          background: #F59E0B; color: white; font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 10px;
        }
        .price-sup {
          font-size: 0.65em; font-weight: 400; color: #64748B; margin-left: 2px;
        }
      `}</style>

      <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>💼 Your Plan</h1>
      <p style={{ fontSize: 14, color: "#64748B", marginBottom: 24 }}>
        {businessType.charAt(0).toUpperCase() + businessType.slice(1)} business · {plan?.name || "Basic"}
      </p>

      {message && (
        <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      {subscription?.status === "trial" && daysLeft !== null && daysLeft > 0 && (
        <div className="trial-banner">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={18} color="#10B981" />
            <span style={{ fontWeight: 600, color: "#065F46" }}>
              Your free trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="plan-card current" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="plan-name">{plan?.name || "Basic Plan"}</span>
          <span className="plan-badge">✓ Current Plan</span>
        </div>
        <div className="plan-price">
          PKR {pricing.monthly.toLocaleString()}<span className="price-sup">/ user / month</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#475569" }}>
            <strong>6‑Month:</strong> PKR {pricing.halfYearly.toLocaleString()}<span className="price-sup">/user</span>
          </div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            <strong>Yearly:</strong> PKR {pricing.yearly.toLocaleString()}<span className="price-sup">/user</span>
          </div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            <strong>Users:</strong> {subscription?.max_users || 1}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <p style={{ fontWeight: 600, fontSize: 13, color: "#1E293B", marginBottom: 4 }}>Included Features:</p>
          <div className="feature-row"><Check size={14} color="#10B981" /> CRM (Customers, Suppliers, Invoices, Bills, Receipts, Payments)</div>
          <div className="feature-row"><Check size={14} color="#10B981" /> Banking (Bank Accounts, Transfers)</div>
          <div className="feature-row"><Check size={14} color="#10B981" /> Accounting (Chart of Accounts, Journal Entries)</div>
          <div className="feature-row"><Check size={14} color="#10B981" /> Reports (Trial Balance, P&L, Balance Sheet, Ledgers)</div>
          <div className="feature-row"><Check size={14} color="#10B981" /> Settings (Logo, Name, Contact)</div>
          <div className="feature-row"><Check size={14} color="#10B981" /> Admin Panel (User Management)</div>
          {businessType === "trading" && <div className="feature-row"><Check size={14} color="#10B981" /> Inventory, Stock Register, Product Selection</div>}
          {businessType === "ngo" && <div className="feature-row"><Check size={14} color="#10B981" /> Project/Activity/Location Tags, NGO Dashboard, Budget vs Actual</div>}
        </div>

        {/* Upgrade Options – only shown when not active */}
        {subscription?.status !== "active" && (
          <>
            <p style={{ fontWeight: 600, fontSize: 14, color: "#1E293B", marginTop: 20, marginBottom: 8 }}>
              Upgrade Now
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div className="upgrade-option" onClick={() => handleUpgrade("monthly")}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Monthly</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1E3A8A" }}>
                  PKR {pricing.monthly.toLocaleString()}
                </div>
                <span className="price-sup">/ user / month</span>
              </div>
              <div className="upgrade-option" onClick={() => handleUpgrade("half_yearly")}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>6 Months</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1E3A8A" }}>
                  PKR {pricing.halfYearly.toLocaleString()}
                </div>
                <span className="price-sup">/ user / 6 months</span>
              </div>
              <div className="upgrade-option best" onClick={() => handleUpgrade("yearly")}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>12 Months</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1E3A8A" }}>
                  PKR {pricing.yearly.toLocaleString()}
                </div>
                <span className="price-sup">/ user / year</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Top‑up Features */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", marginTop: 24, marginBottom: 12 }}>
        🔧 Optional Top‑Up Features
        <span className="price-sup"> PKR 500 / user / month each</span>
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {TOPUP_FEATURES.map(topup => {
          const isActive = activeTopups.includes(topup.code)
          return (
            <div key={topup.code} className="plan-card">
              <div className="plan-name" style={{ fontSize: 15 }}>{topup.name}</div>
              <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                PKR {topup.price}<span className="price-sup">/ user / month</span>
              </div>
              {isActive ? (
                <div style={{ marginTop: 8, color: "#10B981", fontWeight: 600, fontSize: 13 }}>✓ Active</div>
              ) : (
                <button className="btn btn-primary" style={{ marginTop: 12, width: "100%" }} onClick={() => handleActivateTopup(topup.code)}>
                  Activate <Plus size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}