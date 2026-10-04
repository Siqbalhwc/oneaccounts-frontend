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
  FEATURES, PERIODS, PERIOD_META, PLAN_PRICING, ADDON_PRICE_MONTHLY, addonPrice,
  bestForLabel, featureName, SUPPORT, fmtNum, COMPETITORS, competitorPkr, type BillingPeriod,
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
  const [showIncluded, setShowIncluded] = useState(false)

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
  const seats = 1 + users
  const extraUser = basePrice(period) // an extra user costs the same as a plan user
  const total = (basePrice(period) + selected.length * perAddon) * seats
  const monthlyRate = (basePrice("monthly") + selected.length * ADDON_PRICE_MONTHLY) * seats
  const saving = Math.round(monthlyRate * months - total)
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

      <div className="oup-now">
        <span><b>{planName}</b> <span className="m">{statusText}</span></span>
        <span className="m">
          Core accounting{activeCodes.length ? ` + ${activeCodes.map(featureName).join(", ")}` : ""}
        </span>
        <button type="button" className="oup-link" onClick={() => setShowIncluded(v => !v)}>
          {showIncluded ? "Hide" : "View included"}
        </button>
        {showIncluded && (
          <div className="oup-chips" style={{ flexBasis: "100%" }}>
            {CORE_CHIPS.map(c => <span key={c} className="oup-chip core">{c}</span>)}
            {activeCodes.map(c => <span key={c} className="oup-chip">Active: {featureName(c)}</span>)}
          </div>
        )}
      </div>

      <div className="oup-grid">
        <div>
          <div className="oup-card">
            <h2 className="oup-h">Choose your billing period</h2>
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
              <span className="oup-note" style={{ margin: 0 }}>Rs {fmtNum(extraUser)} each per {unit}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="oup-card oup-sum">
            <div className="oup-lbl">Order summary</div>
            <div className="oup-line"><span>{planName}, {PERIOD_META[period].label}</span><span>{fmtNum(basePrice(period))}</span></div>
            {users > 0 && <div className="oup-line"><span>{users} extra user{users > 1 ? "s" : ""}</span><span>{fmtNum(users * extraUser)}</span></div>}
            {selected.map(c => (
              <div key={c} className="oup-line"><span>{featureName(c)}{users > 0 ? ` x ${seats} users` : ""}</span><span>{fmtNum(perAddon * seats)}</span></div>
            ))}
            <div className="oup-tot"><span>Total (PKR)</span><span>{fmtNum(animTotal)}</span></div>
            {saving > 0 && <div className="oup-save">You save Rs {fmtNum(saving)} compared with paying monthly.</div>}
            <button type="button" className="oup-cta" onClick={goPay} disabled={basePrice(period) === 0}>Continue to payment</button>
            <p className="oup-note">{endsNote}</p>
          </div>
        </div>
      </div>

      <div className="oup-card">
        <h2 className="oup-h">Add modules</h2>
        <p className="oup-note" style={{ margin: "-8px 0 12px" }}>Rs {fmtNum(ADDON_PRICE_MONTHLY)} per user per month each, with the same period discount.</p>
        <div className="oup-add">
          {FEATURES.map(f => {
            const have = activeCodes.includes(f.code)
            const on = selected.includes(f.code)
            const Icon = ICONS[f.code] || Box
            const tag = bestForLabel(f)
            return (
              <div key={f.code} className={`oup-a ${have ? "have" : on ? "on" : ""}`}>
                <div className="oup-ai">
                  <span className="oup-ic"><Icon size={18} /></span>
                  <div><div className="n">{f.name}</div><div className="d">{f.short}</div>{tag && !have && <span className="oup-tag">{tag}</span>}</div>
                </div>
                <div className="oup-af">
                  <span className="oup-ap">Rs {fmtNum(ADDON_PRICE_MONTHLY)}<span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)" }}> /mo</span></span>
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

      <div className="oup-card oup-cmp sm">
        {(() => {
          const mine = basePrice("monthly")
          const rows = COMPETITORS.items.map(c => ({ ...c, pkr: competitorPkr(c.usd) }))
          const max = Math.max(mine, ...rows.map(r => r.pkr))
          const maxRow = rows.reduce((m, r) => (r.pkr > m.pkr ? r : m), rows[0])
          const cut = Math.round((1 - mine / maxRow.pkr) * 100)
          return (
            <>
              <div className="oup-lbl">Why OneAccounts{cut > 0 ? ` - up to ${cut}% less than ${maxRow.name}` : ""}</div>
              <div className="r"><span className="nm">OneAccounts</span><div className="tr"><div className="fl" style={{ width: `${Math.max(18, (mine / max) * 100)}%`, background: "var(--primary)" }}>Rs {fmtNum(mine)}</div></div></div>
              {rows.map(r => (
                <div className="r" key={r.name} title={r.note}><span className="nm">{r.name}</span><div className="tr"><div className="fl" style={{ width: `${(r.pkr / max) * 100}%`, background: "#8a94a0" }}>about Rs {fmtNum(r.pkr)}</div></div></div>
              ))}
              <p className="oup-note">Entry plan, per month, billed yearly. Odoo at its Pakistan price, others at US list price. Checked {COMPETITORS.asOf}, at Rs {COMPETITORS.usdToPkr} per US dollar.</p>
            </>
          )
        })()}
      </div>

      <div className="oup-bar">
        <div className="c">{selected.length ? `${selected.length} add-on${selected.length > 1 ? "s" : ""} selected` : "No add-ons selected yet"}</div>
        <div>Total <b>{fmtNum(animTotal)}</b></div>
        <button type="button" className="oup-cta" onClick={goPay} disabled={basePrice(period) === 0}>Continue to payment</button>
      </div>
    </div>
  )
}