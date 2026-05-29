"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Check, Clock, ArrowRight, Star, ChevronDown } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"

const BENCHMARK_NOTE =
  "Competitor plans start at PKR 10,000+ / user / month (Odoo, QuickBooks, Zoho). You save up to 70% with OneAccounts."

export default function UpgradePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { companyId } = useCompany()

  const [plan, setPlan] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "half_yearly" | "yearly">("yearly")

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
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    fetchData()
  }, [companyId])

  const handleUpgrade = () => {
    const price = getPrice()
    router.push(`/dashboard/upgrade/payment?amount=${price}&period=${billingPeriod}&plan=${plan?.code || ''}`)
  }

  const getPrice = (): number => {
    if (!plan) return 0
    switch (billingPeriod) {
      case "monthly": return plan.monthly_price_per_user || 0
      case "half_yearly": return plan.half_yearly_price_per_user || 0
      case "yearly": return plan.yearly_price_per_user || 0
    }
  }

  const daysLeft = subscription?.end_date
    ? Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const price = getPrice()
  const periodLabel = billingPeriod === "monthly" ? "month" : billingPeriod === "half_yearly" ? "6 months" : "year"
  const userCount = subscription?.max_users || 1

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>

  return (
    <div style={{ padding: 24, background: "#F8FAFC", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .card {
          background: white; border-radius: 18px; padding: 28px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
          border: 1px solid #E2E8F0;
        }
        .label {
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; color: #64748B;
        }
        .price {
          font-size: 36px; font-weight: 800; color: #0F172A;
          line-height: 1.2;
        }
        .price sup {
          font-size: 16px; font-weight: 400; color: #64748B; margin-left: 4px;
        }
        .feature-row {
          display: flex; align-items: center; gap: 8px; padding: 8px 0;
          font-size: 13px; color: #334155;
        }
        .btn-primary {
          background: linear-gradient(135deg, #1740C8, #071352);
          color: white; border: none; padding: 14px 24px;
          border-radius: 12px; font-weight: 600; cursor: pointer;
          width: 100%; font-size: 15px; display: flex;
          align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.2s;
        }
        .btn-primary:hover { opacity: 0.9; }
        .pill {
          display: inline-block; background: #FEF3C7; color: #92400E;
          font-size: 11px; font-weight: 700; padding: 3px 10px;
          border-radius: 20px; margin-left: 8px;
        }
        .select-period {
          width: 100%; padding: 12px; border-radius: 10px;
          border: 1px solid #E2E8F0; font-size: 14px; font-family: inherit;
          background: white; color: #0F172A; cursor: pointer;
          appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 14px center;
        }
      `}</style>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>💼 Plan & Billing</h1>
      <p style={{ color: "#64748B", marginBottom: 24 }}>
        {businessType ? businessType.charAt(0).toUpperCase() + businessType.slice(1) : ""} business · {plan?.name || "Basic"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Left column – Current Trial */}
        <div className="card">
          <div className="label">CURRENT PLAN</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{plan?.name || "Basic Trial"}</h2>
          {daysLeft && daysLeft > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#065F46", fontWeight: 600 }}>
              <Clock size={16} /> {daysLeft} day{daysLeft !== 1 ? "s" : ""} left in trial
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <div className="feature-row"><Check size={14} color="#10B981" /> Full CRM</div>
            <div className="feature-row"><Check size={14} color="#10B981" /> Banking</div>
            <div className="feature-row"><Check size={14} color="#10B981" /> Accounting (CoA, Journal)</div>
            <div className="feature-row"><Check size={14} color="#10B981" /> All core reports</div>
            <div className="feature-row"><Check size={14} color="#10B981" /> {userCount} user{userCount !== 1 ? "s" : ""}</div>
            {businessType === "trading" && <div className="feature-row"><Check size={14} color="#10B981" /> Inventory & Products</div>}
            {businessType === "ngo" && <div className="feature-row"><Check size={14} color="#10B981" /> NGO Dashboard & Project Tracking</div>}
          </div>
          <div style={{ marginTop: 20, fontSize: 12, color: "#94A3B8" }}>
            Trial includes all features of your plan for 10 days.
          </div>
        </div>

        {/* Right column – Upgrade */}
        <div className="card" style={{ borderColor: "#3B82F6", boxShadow: "0 10px 40px rgba(59,130,246,0.15)" }}>
          <div className="label">UPGRADE TO PAID</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{plan?.name || "Basic"}</h2>
          <div style={{ marginTop: 12 }}>
            <select
              className="select-period"
              value={billingPeriod}
              onChange={(e) => setBillingPeriod(e.target.value as any)}
            >
              <option value="monthly">Monthly</option>
              <option value="half_yearly">6 Months</option>
              <option value="yearly">12 Months (Best Offer)</option>
            </select>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="price">
              PKR {price.toLocaleString()}
              <sup>/ user / {periodLabel}</sup>
            </div>
            {billingPeriod === "yearly" && <span className="pill">Best Offer</span>}
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: "#475569", background: "#F1F5F9", padding: "10px 14px", borderRadius: 8 }}>
            {BENCHMARK_NOTE}
          </div>
          <button className="btn-primary" style={{ marginTop: 24 }} onClick={handleUpgrade}>
            Upgrade Now <ArrowRight size={16} />
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
            You'll be redirected to our secure payment page with bank details.
          </div>
        </div>
      </div>
    </div>
  )
}