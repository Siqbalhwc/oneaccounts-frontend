"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Check, Plus, Users, MessageCircle, Package, Warehouse, ClipboardList, Receipt,
  Building2, Repeat, TrendingUp, PieChart, Mail, FileSpreadsheet, BellRing, Box,
  type LucideIcon,
} from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"
import { fmtLongDate, type AccessStatus } from "@/lib/access"
import {
  FEATURES, PERIODS, PERIOD_META, PLAN_PRICING, addonPrice, extraUserPrice,
  bestForLabel, featureName, SUPPORT, fmtNum, type BillingPeriod,
} from "@/lib/featureCatalog"
import { UPGRADE_CSS } from "@/lib/upgradeStyles"

const ICONS: Record<string, LucideIcon> = {
  payroll: Users, whatsapp_invoice: MessageCircle, inventory: Package,
  material_management: Warehouse, purchase_orders: ClipboardList, tax_management: Receipt,
  asset_management: Building2, invoice_automation: Repeat, investors: TrendingUp,
  profit_allocation: PieChart, email_reports: Mail, csv_import_export: FileSpreadsheet,
  payment_reminders: BellRing,
}

const CORE_CHIPS = [
  "Customers and suppliers", "Invoices and bills", "Receipts and payments",
  "Banking", "Chart of accounts and journal", "Core reports and ledgers",
]

// Numbers count up from 0 whenever the target changes
function useCountUp(target: number) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce) { setV(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600)
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

export default function UpgradePage() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])
  const router = useRouter()
  const { companyId, companyName } = useCompany()

  const [plan, setPlan] = useState<any>(null)
  const [businessType, setBusinessType] = useState("")
  const [isTrial, setIsTrial] = useState(false)
  const [access, setAccess] = useState<AccessStatus | null>(null)
  const [activeCodes, setActiveCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<BillingPeriod>("yearly")
  const [selected, setSelected] = useState<string[]>([])
  const [users, setUsers] = useState(0)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("business_type, is_trial, plans(code, name, monthly_price_per_user, half_yearly_price_per_user, yearly_price_per_user)")
          .eq("id", companyId)
          .single()
        if (company && !cancelled) {
          setPlan(Array.isArray(company.plans) ? company.plans[0] : company.plans)
          setBusinessType((company.business_type || "").toLowerCase())
          setIsTrial(!!company.is_trial)
        }
        const { data: acc } = await supabase.rpc("company_access_status")
        if (acc && !cancelled) setAccess(acc as AccessStatus)

        const { data: rows } = await supabase
          .from("company_features")
          .select("features(code)")
          .eq("company_id", companyId)
          .eq("enabled", true)
        if (!cancelled) setActiveCodes((rows || []).map((r: any) => r.features?.code).filter(Boolean))
      } catch (e) {
        console.error(e)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyId, supabase])

  const pricing = PLAN_PRICING[businessType] || PLAN_PRICING.service
  const basePrice = (p: BillingPeriod): number => {
    if (plan) {
      const v = p === "monthly" ? plan.monthly_price_per_user
        : p === "half_yearly" ? plan.half_yearly_price_per_user : plan.yearly_price_per_user
      if (v && v > 0) return v
    }
    return pricing[p]
  }

  const months = PERIOD_META[period].months
  const perAddon = addonPrice(period)
  const total = basePrice(period) + selected.length * perAddon * (1 + users) + users * extraUserPrice(period)
  const saving = basePrice("monthly") * months - basePrice(period)
  const animTotal = useCountUp(total)

  const toggle = (code: string) =>
    setSelected(s => (s.includes(code) ? s.filter(c => c !== code) : [...s, code]))

  const goPay = () => {
    const q = new URLSearchParams({
      amount: String(total), period, plan: plan?.code || "", base: String(basePrice(period)),
      users: String(users), topups: selected.join(","),
    })
    router.push(`/dashboard/upgrade/payment?${q.toString()}`)
  }

  const planName = plan?.name || "Basic"
  const state = access?.state
  const lifetime = !!access?.access_until && access.access_until.startsWith("9999")
  const blocked = !!access?.blocked

  const statusText = (() => {
    if (!access) return ""
    if (state === "suspended") return "- suspended"
    if (state === "trial_expired") return "- trial ended"
    if (state === "subscription_expired") return "- subscription ended"
    if (state === "grace") return "- subscription ended, grace period"
    if (lifetime) return "- lifetime access"
    if (access.access_until) {
      return isTrial
        ? `- trial, last working day ${fmtLongDate(access.access_until)}`
        : `- active until ${fmtLongDate(access.access_until)}`
    }
    return ""
  })()

  const banner = (() => {
    if (!access) return null
    const wa = (
      <a className="oup-btn" target="_blank" rel="noreferrer" href={`https://wa.me/${SUPPORT.whatsappNumber}`}>WhatsApp us</a>
    )
    if (state === "suspended") return (
      <div className="oup-ban bad"><div className="g"><b>Your account is suspended.</b>{access.suspended_reason ? <> Reason: {access.suspended_reason}.</> : null} Pay by bank transfer below, or contact us to restore access.</div>{wa}</div>
    )
    if (state === "trial_expired") return (
      <div className="oup-ban bad"><div className="g"><b>Your trial ended on {fmtLongDate(access.access_until)}.</b> Choose a plan below, pay by bank transfer, and we will update your account.</div>{wa}</div>
    )
    if (state === "subscription_expired") return (
      <div className="oup-ban bad"><div className="g"><b>Your subscription ended on {fmtLongDate(access.access_until)}</b> and the grace period is over. Renew below to restore access.</div>{wa}</div>
    )
    if (state === "grace") return (
      <div className="oup-ban warn"><div className="g"><b>Your subscription ended on {fmtLongDate(access.access_until)}.</b> You can keep working until {fmtLongDate(access.grace_until)} ({access.grace_days_left} day{access.grace_days_left === 1 ? "" : "s"} left). Renew now to avoid interruption.</div></div>
    )
    if (isTrial && access.days_left != null && access.days_left <= 5 && access.days_left >= 0) return (
      <div className="oup-ban warn"><div className="g"><b>Your trial ends in {access.days_left + 1} day{access.days_left === 0 ? "" : "s"}</b> (last working day {fmtLongDate(access.access_until)}). Upgrade now to avoid interruption.</div></div>
    )
    return null
  })()

  const endsNote = (() => {
    if (!blocked && !isTrial && access?.access_until && !lifetime && state === "active") {
      return `Your ${PERIOD_META[period].label.toLowerCase()} is added after your current last working day (${fmtLongDate(access.access_until)}). We confirm the exact date once your payment is verified.`
    }
    return `Access will run for ${PERIOD_META[period].label.toLowerCase()}, from the day we verify your payment. We confirm the exact last working day once verified.`
  })()

  if (loading) {
    return <div className="oup"><style>{UPGRADE_CSS}</style><p className="oup-sub">Loading...</p></div>
  }

  const unit = PERIOD_META[period].unit

  return (
    <div className="oup">
      <style>{UPGRADE_CSS}</style>

      <div className="oup-head">
        <img src="/logo.png" alt="OneAccounts" />
        <div>
          <h1>Plan &amp; Billing</h1>
          <p className="oup-sub">{companyName}{businessType ? ` · ${businessType.charAt(0).toUpperCase() + businessType.slice(1)}` : ""}</p>
        </div>
      </div>

      {banner}

      <div className="oup-grid">
        <div>
          <div className="oup-card">
            <div className="oup-lbl">What you have today</div>
            <div style={{ marginBottom: 8 }}>
              <b>{planName}</b> <span style={{ color: "var(--text-muted)" }}>{statusText}</span>
            </div>
            <div className="oup-chips">
              {CORE_CHIPS.map(c => <span key={c} className="oup-chip core">{c}</span>)}
              {activeCodes.map(c => <span key={c} className="oup-chip">Active: {featureName(c)}</span>)}
            </div>
            <p className="oup-note">
              {isTrial && !blocked
                ? "Your trial includes every module. After the trial you keep only the modules you pay for."
                : "Modules marked Active stay on your account. Everything else can be added below."}
            </p>
          </div>

          <div className="oup-card">
            <div className="oup-lbl">1. Choose billing period</div>
            <div className="oup-per">
              {PERIODS.map(p => {
                const full = basePrice("monthly") * PERIOD_META[p].months
                const pct = full > 0 ? Math.round(((full - basePrice(p)) / full) * 100) : 0
                return (
                  <button key={p} type="button" className={`oup-p ${period === p ? "on" : ""}`} onClick={() => setPeriod(p)}>
                    {p === "yearly" && <span className="oup-pill">Best value</span>}
                    <small>{PERIOD_META[p].label}</small>
                    <div className="v">Rs {fmtNum(basePrice(p))}</div>
                    <small>Rs {fmtNum(basePrice(p) / PERIOD_META[p].months)} / month</small>
                    {pct > 0 ? <small className="oup-ok">Save {pct}%</small> : <small>&nbsp;</small>}
                  </button>
                )
              })}
            </div>
            <div className="oup-us" style={{ marginTop: 14 }}>
              Extra users:
              <button type="button" aria-label="Fewer users" onClick={() => setUsers(u => Math.max(0, u - 1))}>-</button>
              <b>{users}</b>
              <button type="button" aria-label="More users" onClick={() => setUsers(u => u + 1)}>+</button>
              <span className="oup-note" style={{ margin: 0 }}>Rs {fmtNum(extraUserPrice(period))} per extra user per {unit}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="oup-card oup-sum">
            <div className="oup-lbl">Order summary</div>
            <div className="oup-line"><span>{planName}, {PERIOD_META[period].label}</span><span>{fmtNum(basePrice(period))}</span></div>
            {users > 0 && <div className="oup-line"><span>{users} extra user{users > 1 ? "s" : ""}</span><span>{fmtNum(users * extraUserPrice(period))}</span></div>}
            {selected.map(c => (
              <div key={c} className="oup-line"><span>{featureName(c)}{users > 0 ? ` x ${1 + users} users` : ""}</span><span>{fmtNum(perAddon * (1 + users))}</span></div>
            ))}
            <div className="oup-tot"><span>Total (PKR)</span><span>{fmtNum(animTotal)}</span></div>
            {saving > 0 && <div className="oup-save">You save Rs {fmtNum(saving)} compared with paying monthly.</div>}
            <p className="oup-note">{endsNote}</p>
            <button type="button" className="oup-cta" onClick={goPay} disabled={basePrice(period) === 0}>Continue to payment</button>

            <div className="oup-cmp" style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div className="oup-lbl">Why OneAccounts</div>
              <div className="r"><span className="nm">OneAccounts</span><div className="tr"><div className="fl" style={{ width: "30%", background: "var(--primary)" }}>Rs 3,000</div></div></div>
              {["Odoo", "QuickBooks", "Zoho Books"].map(n => (
                <div className="r" key={n}><span className="nm">{n}</span><div className="tr"><div className="fl" style={{ width: "100%", background: "#8a94a0" }}>from Rs 10,000+</div></div></div>
              ))}
              <p className="oup-note">Monthly price per user. Save up to 70%, and up to 17% more on a yearly plan.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="oup-card">
        <div className="oup-lbl">2. Add modules to your plan</div>
        <p className="oup-note" style={{ margin: "-4px 0 12px" }}>Prices are per user, per {unit}.</p>
        <div className="oup-add">
          {FEATURES.map(f => {
            const have = activeCodes.includes(f.code)
            const on = selected.includes(f.code)
            const Icon = ICONS[f.code] || Box
            const tag = bestForLabel(f)
            return (
              <div key={f.code} className={`oup-a ${have ? "have" : on ? "on" : ""}`}>
                {tag && !have && <span className="oup-tag">{tag}</span>}
                <div className="oup-ai">
                  <span className="oup-ic"><Icon size={18} /></span>
                  <div><div className="n">{f.name}</div><div className="d">{f.short}</div></div>
                </div>
                <div className="oup-af">
                  <span className="oup-ap">Rs {fmtNum(perAddon)}</span>
                  {have ? (
                    <span className="oup-ab have"><Check size={14} /> Active</span>
                  ) : (
                    <button type="button" className={`oup-ab ${on ? "on" : ""}`} onClick={() => toggle(f.code)}>
                      {on ? <><Check size={14} /> Added</> : <><Plus size={14} /> Add</>}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="oup-bar">
        <div className="c">{selected.length ? `${selected.length} add-on${selected.length > 1 ? "s" : ""} selected` : "No add-ons selected yet"}</div>
        <div>Total <b>{fmtNum(animTotal)}</b></div>
        <button type="button" className="oup-cta" onClick={goPay} disabled={basePrice(period) === 0}>Continue to payment</button>
      </div>
    </div>
  )
}