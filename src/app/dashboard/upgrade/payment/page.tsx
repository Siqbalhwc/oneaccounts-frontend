"use client"

import { Suspense, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCompany } from "@/contexts/CompanyContext"
import {
  FEATURE_CODES, PERIODS, PERIOD_META, addonPrice, extraUserPrice, featureName,
  SUPPORT, fmtNum, type BillingPeriod,
} from "@/lib/featureCatalog"
import { UPGRADE_CSS } from "@/lib/upgradeStyles"

const BANKS = [
  { bank: "Meezan Bank", title: "Shahid Iqbal", rows: [["Account", "02850106669725"], ["IBAN", "PK40MEZN0002850106669725"]] },
  { bank: "Standard Chartered Bank", title: "Shahid Iqbal", rows: [["Account", "01-1659402-01"]] },
]

function makeReference(companyName: string): string {
  const words = (companyName || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean)
  let code = words.length > 1 ? words.map(w => w[0]).join("") : (words[0] || "OA")
  code = code.slice(0, 5)
  if (code.length < 2) code = (code + "OA").slice(0, 2)
  const d = new Date()
  const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0")
  const rand = String(Math.floor(1000 + Math.random() * 9000))
  return `${code}-${yymm}-${rand}`
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="oup-link" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })
    }}>{done ? "Copied" : "Copy"}</button>
  )
}

function PaymentInner() {
  const sp = useSearchParams()
  const { companyName } = useCompany()

  const amount = Number(sp.get("amount") || 0)
  const rawPeriod = sp.get("period") as BillingPeriod
  const period: BillingPeriod = PERIODS.includes(rawPeriod) ? rawPeriod : "yearly"
  const planCode = sp.get("plan") || ""
  const base = Number(sp.get("base") || 0)
  const users = Math.max(0, Math.min(100, parseInt(sp.get("users") || "0", 10) || 0))
  const topups = (sp.get("topups") || "").split(",").filter(c => FEATURE_CODES.includes(c))

  const reference = useMemo(() => makeReference(companyName), [companyName])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [doneRef, setDoneRef] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const perAddon = addonPrice(period)

  const submit = async () => {
    if (!file) { setError("Please choose your transfer receipt first."); return }
    setBusy(true); setError("")
    try {
      const fd = new FormData()
      fd.append("receipt", file)
      fd.append("amount", String(amount))
      fd.append("period", period)
      fd.append("plan_code", planCode)
      fd.append("topups", topups.join(","))
      fd.append("users", String(users))
      fd.append("reference", reference)
      const res = await fetch("/api/upgrade/confirm", { method: "POST", body: fd })
      const data = await res.json()
      if (res.ok && data.success) setDoneRef(data.reference || reference)
      else setError(data.error || "Could not submit your payment. Please try again.")
    } catch {
      setError("Network error. Please try again.")
    }
    setBusy(false)
  }

  const header = (
    <div className="oup-head">
      <img src="/logo.png" alt="OneAccounts" />
      <div><h1>Payment</h1><p className="oup-sub">{companyName}</p></div>
    </div>
  )

  if (doneRef) {
    const msg = `Hello, I have paid for OneAccounts. Company: ${companyName}. Reference: ${doneRef}. Amount: Rs ${fmtNum(amount)}.`
    return (
      <div className="oup">
        <style>{UPGRADE_CSS}</style>
        {header}
        <div className="oup-card" style={{ maxWidth: 640, margin: "20px auto" }}>
          <h2 style={{ fontSize: 20 }}>Payment received, pending verification</h2>
          <p className="oup-sub">Reference <b>{doneRef}</b> · Rs {fmtNum(amount)}</p>
          <p>We will check your transfer and update your account. To speed this up, message us with your reference and a screenshot of the transfer.</p>
          <div className="oup-ct">
            <a className="g" target="_blank" rel="noreferrer" href={`https://wa.me/${SUPPORT.whatsappNumber}?text=${encodeURIComponent(msg)}`}>WhatsApp {SUPPORT.whatsappDisplay}</a>
            <a href={`mailto:${SUPPORT.email}?subject=${encodeURIComponent("Payment " + doneRef)}&body=${encodeURIComponent(msg)}`}>{SUPPORT.email}</a>
          </div>
          <p className="oup-note">Until your payment is verified, your account stays as it is. You can leave this page.</p>
          <Link className="oup-back" href="/dashboard/upgrade" style={{ marginTop: 12 }}>Back to Plan &amp; Billing</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="oup">
      <style>{UPGRADE_CSS}</style>
      {header}
      <Link className="oup-back" href="/dashboard/upgrade">&larr; Back to plan</Link>
      <div className="oup-step"><span>1 Choose plan</span><span>&rsaquo;</span><b>2 Pay and upload receipt</b><span>&rsaquo;</span><span>3 We verify and update</span></div>

      <div className="oup-grid">
        <div>
          <div className="oup-card">
            <h2>Bank transfer</h2>
            <p className="oup-note" style={{ marginTop: 0 }}>Transfer the total to either account and write this reference in the transfer note.</p>
            <div className="oup-ref"><span>Payment reference: <b>{reference}</b></span><CopyBtn text={reference} /></div>
            {BANKS.map(b => (
              <div key={b.bank}>
                <div className="oup-bk"><span><b>{b.bank}</b><br />Account title: {b.title}</span></div>
                {b.rows.map(([k, v]) => (
                  <div className="oup-bk" key={k}><span>{k}</span><span>{v} <CopyBtn text={v} /></span></div>
                ))}
              </div>
            ))}
          </div>

          <div className="oup-card">
            <h2>Upload your receipt</h2>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
              onChange={e => { setFile(e.target.files?.[0] || null); setError("") }} />
            <button type="button" className="oup-up" onClick={() => fileRef.current?.click()}>
              {file ? file.name : "Choose a screenshot, photo or PDF of the transfer"}
            </button>
            {error && <p className="oup-note" style={{ color: "var(--danger)" }}>{error}</p>}
            <button type="button" className="oup-cta" onClick={submit} disabled={busy || amount <= 0}>
              {busy ? "Submitting..." : "Submit payment"}
            </button>
          </div>
        </div>

        <div>
          <div className="oup-card oup-sum">
            <div className="oup-lbl">Your order</div>
            <div className="oup-line"><span>Plan, {PERIOD_META[period].label}</span><span>{fmtNum(base)}</span></div>
            {users > 0 && <div className="oup-line"><span>{users} extra user{users > 1 ? "s" : ""}</span><span>{fmtNum(users * extraUserPrice(period))}</span></div>}
            {topups.map(c => (
              <div key={c} className="oup-line"><span>{featureName(c)}{users > 0 ? ` x ${1 + users} users` : ""}</span><span>{fmtNum(perAddon * (1 + users))}</span></div>
            ))}
            <div className="oup-tot"><span>Total (PKR)</span><span>{fmtNum(amount)}</span></div>
            <p className="oup-note">Access runs for {PERIOD_META[period].label.toLowerCase()} once we verify your payment.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={null}>
      <PaymentInner />
    </Suspense>
  )
}