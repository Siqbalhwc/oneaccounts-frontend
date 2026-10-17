"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, AlertCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import { fmtMoney, round2 } from "@/lib/money"
import CurrencyTag from "@/components/CurrencyTag"

type PartyType = "customer" | "supplier"
interface Party { id: number; name: string }
interface Bank { id: number; name: string; glCode?: string }

function cleanAmount(s: string): string {
  let v = s.replace(/[^0-9.]/g, "")
  const i = v.indexOf(".")
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 2)
  return v
}

function NewRefundInner() {
  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    []
  )
  const router = useRouter()
  const sp = useSearchParams()
  const { role, loading: roleLoading } = useRole()
  const { companyId } = useCompany()
  const canUse = role === "admin" || role === "accountant"

  const initialType: PartyType = sp.get("type") === "supplier" ? "supplier" : "customer"
  const initialParty = sp.get("party") ? Number(sp.get("party")) : 0

  const [type, setType] = useState<PartyType>(initialType)
  const [parties, setParties] = useState<Party[]>([])
  const [partyId, setPartyId] = useState<number>(initialParty)
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankId, setBankId] = useState<number>(0)
  const [advance, setAdvance] = useState(0)
  const [netBalance, setNetBalance] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [loadingParties, setLoadingParties] = useState(false)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [email, setEmail] = useState("system")
  const [reloadTick, setReloadTick] = useState(0)

  const isCust = type === "customer"
  const partyLabel = isCust ? "Customer" : "Supplier"

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user?.email) setEmail(user.email) })
  }, [supabase])

  // Every bank and cash account of the company (same list as Receipts and Payments)
  useEffect(() => {
    if (!companyId) return
    supabase.from("bank_accounts").select("id, bank_name, accounts(code)")
      .eq("company_id", companyId).order("bank_name")
      .then(r => {
        if (r.data) setBanks(r.data.map((b: any) => ({ id: b.id, name: b.bank_name, glCode: b.accounts?.code })))
      })
  }, [companyId, supabase])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setLoadingParties(true)
    supabase
      .from(isCust ? "customers" : "suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        if (cancelled) return
        setParties((data as Party[]) || [])
        setLoadingParties(false)
      })
    return () => { cancelled = true }
  }, [companyId, isCust, supabase])

  // Advance and net balance for the chosen party
  useEffect(() => {
    if (!companyId || !partyId) { setAdvance(0); setNetBalance(null); return }
    let cancelled = false
    setLoadingInfo(true)
    ;(async () => {
      const advRes = await supabase.rpc(isCust ? "get_customer_advance" : "get_supplier_advance",
        isCust ? { p_company_id: companyId, p_customer_id: partyId } : { p_company_id: companyId, p_supplier_id: partyId })
      const balRes = await supabase.from(isCust ? "customers" : "suppliers")
        .select("balance").eq("company_id", companyId).eq("id", partyId).maybeSingle()
      if (cancelled) return
      setAdvance(round2(Number(advRes.data) || 0))
      setNetBalance(balRes.data ? Number((balRes.data as any).balance) || 0 : null)
      setLoadingInfo(false)
    })()
    return () => { cancelled = true }
  }, [companyId, partyId, isCust, supabase, reloadTick])

  const switchType = (t: PartyType) => {
    if (t === type) return
    setType(t); setPartyId(0); setAmount(""); setBanner(null); setSaved(false)
  }

  const amt = round2(Number(amount) || 0)

  // What the party is really owed back after all unpaid documents are considered:
  //   customer: balance is negative when we owe them  -> owedBack = -balance
  //   supplier: balance is negative when they owe us  -> owedBack = -balance
  const owedBack = netBalance === null ? null : round2(Math.max(0, -netBalance))
  const exceedsOwed = owedBack !== null && amt > owedBack + 0.004
  const overAdvance = amt > advance + 0.004
  const canSave = !saving && !saved && partyId > 0 && bankId > 0 && amt > 0 && !overAdvance && !!date

  const submit = async () => {
    if (!companyId || !canSave) return
    setSaving(true); setBanner(null)
    const { data, error } = await supabase.rpc("create_advance_refund", {
      p_company_id: companyId,
      p_party_type: type,
      p_party_id: partyId,
      p_date: date,
      p_amount: amt,
      p_bank_account_id: bankId,
      p_reference: reference.trim() || null,
      p_notes: notes.trim() || null,
      p_user_email: email,
    })
    setSaving(false)
    if (error) { setBanner({ type: "error", text: error.message }); return }
    const res: any = data || {}
    setSaved(true)
    setBanner({ type: "success", text: `Refund ${res.refund_no} posted for ${fmtMoney(amt)}. Advance left: ${fmtMoney(res.advance_after ?? 0)}.` })
    setReloadTick(t => t + 1)
  }

  if (roleLoading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  }
  if (!canUse) {
    return <div style={{ padding: 24, color: "var(--text-muted)" }}>Only an admin or accountant can record an advance refund.</div>
  }

  return (
    <div className="nr-wrap" style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <style>{`
        .nr-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: var(--shadow-sm); }
        .nr-seg { display: inline-flex; border: 1.5px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--card); margin-bottom: 14px; }
        .nr-seg button { padding: 9px 16px; font-size: 13px; font-weight: 700; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-family: inherit; }
        .nr-seg button.on { background: var(--primary); color: #fff; }
        .nr-select, .nr-input { width: 100%; height: 42px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 14px; background: var(--card); color: var(--text); font-family: inherit; outline: none; }
        .nr-select:focus, .nr-input:focus { border-color: var(--primary); }
        .nr-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .nr-big { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .nr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .nr-note { font-size: 12px; color: var(--text-muted); }
        .nr-bar { position: sticky; bottom: 0; background: var(--card); border-top: 1px solid var(--border); padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; z-index: 50; margin: 0 -24px -24px; }
        @media (max-width: 768px) {
          .nr-bar { bottom: calc(52px + max(8px, env(safe-area-inset-bottom, 0px))); }
          .nr-wrap { padding-bottom: 96px !important; }
        }
        @media (max-width: 640px) {
          .nr-wrap { padding: 12px !important; }
          .nr-bar { margin: 0 -12px; }
          .nr-grid { grid-template-columns: 1fr; }
          .nr-select, .nr-input { font-size: 16px; height: 44px; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button className="oa-btn" onClick={() => router.push("/dashboard/advance-refunds")} aria-label="Back"><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>New Advance Refund</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {isCust ? "Return an unused customer advance (Dr Receivable, Cr Bank / Cash)" : "Record an unused supplier advance returned to us (Dr Bank / Cash, Cr Payable)"}
          </p>
        </div>
      </div>

      {banner && (
        <div style={{ background: "var(--card)", border: `1px solid ${banner.type === "success" ? "var(--success)" : "var(--danger)"}`, padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
          {banner.type === "success" ? <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={16} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="nr-seg" role="group" aria-label="Refund type">
        <button className={isCust ? "on" : ""} onClick={() => switchType("customer")} disabled={saving}>Customer advance</button>
        <button className={!isCust ? "on" : ""} onClick={() => switchType("supplier")} disabled={saving}>Supplier advance</button>
      </div>

      <div className="nr-card">
        <div className="nr-label">{partyLabel}</div>
        <select className="nr-select" value={partyId || ""} onChange={e => { setPartyId(Number(e.target.value) || 0); setBanner(null); setSaved(false); setAmount("") }} disabled={loadingParties || saving}>
          <option value="">{loadingParties ? "Loading..." : `Select ${partyLabel.toLowerCase()}`}</option>
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {partyId > 0 && (
          <div className="nr-grid" style={{ marginTop: 14 }}>
            <div>
              <div className="nr-label">Advance available</div>
              <div className="nr-big" style={{ color: advance > 0 ? "var(--success)" : "var(--text-muted)" }}>
                <CurrencyTag />{loadingInfo ? "..." : fmtMoney(advance)}
              </div>
            </div>
            <div>
              <div className="nr-label">{isCust ? "Customer owed back (net)" : "Supplier owes us (net)"}</div>
              <div className="nr-big" style={{ color: "var(--text)" }}>
                <CurrencyTag />{loadingInfo || owedBack === null ? "..." : fmtMoney(owedBack)}
              </div>
            </div>
          </div>
        )}
        {partyId > 0 && !loadingInfo && advance <= 0 && (
          <div className="nr-note" style={{ marginTop: 10 }}>This {partyLabel.toLowerCase()} has no unapplied advance to refund.</div>
        )}
        {partyId > 0 && !loadingInfo && advance > 0 && owedBack !== null && owedBack + 0.004 < advance && (
          <div className="nr-note" style={{ marginTop: 10, color: "var(--danger)" }}>
            Part of this advance is still needed to settle unpaid {isCust ? "invoices" : "bills"}. Apply the advance first, then refund only what is left.
          </div>
        )}
      </div>

      <div className="nr-card">
        <div className="nr-grid">
          <div>
            <div className="nr-label">Amount <CurrencyTag /></div>
            <input className="nr-input" inputMode="decimal" value={amount} onChange={e => setAmount(cleanAmount(e.target.value))} placeholder="0.00" disabled={saving || saved || partyId === 0} style={{ textAlign: "right", fontWeight: 700 }} />
            {overAdvance && amt > 0 && <div className="nr-note" style={{ color: "var(--danger)", marginTop: 4 }}>More than the available advance ({fmtMoney(advance)}).</div>}
            {!overAdvance && exceedsOwed && amt > 0 && <div className="nr-note" style={{ color: "var(--danger)", marginTop: 4 }}>More than the {isCust ? "customer is owed back" : "supplier owes us"} ({fmtMoney(owedBack ?? 0)}). Apply the advance to open {isCust ? "invoices" : "bills"} first.</div>}
            {advance > 0 && !saved && (
              <button type="button" className="oa-btn" style={{ marginTop: 6 }} onClick={() => setAmount(String(Math.min(advance, owedBack ?? advance)))}>
                Use {fmtMoney(Math.min(advance, owedBack ?? advance))}
              </button>
            )}
          </div>
          <div>
            <div className="nr-label">{isCust ? "Paid from" : "Received into"}</div>
            <select className="nr-select" value={bankId || ""} onChange={e => setBankId(Number(e.target.value) || 0)} disabled={saving || saved}>
              <option value="">Select bank or cash account</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
            </select>
          </div>
          <div>
            <div className="nr-label">Date</div>
            <input type="date" className="nr-input" value={date} onChange={e => setDate(e.target.value)} disabled={saving || saved} />
          </div>
          <div>
            <div className="nr-label">Reference (cheque / transfer no)</div>
            <input className="nr-input" value={reference} onChange={e => setReference(e.target.value)} disabled={saving || saved} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="nr-label">Notes</div>
          <input className="nr-input" value={notes} onChange={e => setNotes(e.target.value)} disabled={saving || saved} />
        </div>
      </div>

      <div className="nr-bar">
        <div>
          <div className="nr-note">Refund amount</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}><CurrencyTag />{fmtMoney(amt)}</div>
        </div>
        {saved ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="oa-btn" onClick={() => { setSaved(false); setBanner(null); setAmount(""); setReference(""); setNotes("") }}>Another refund</button>
            <button className="oa-btn oa-btn-primary" onClick={() => router.push("/dashboard/advance-refunds")}>View refunds</button>
          </div>
        ) : (
          <button className="oa-btn oa-btn-primary" onClick={submit} disabled={!canSave} style={{ minHeight: 42 }}>
            {saving ? "Posting..." : "Post Refund"}
          </button>
        )}
      </div>
    </div>
  )
}

export default function NewAdvanceRefundPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>}>
      <NewRefundInner />
    </Suspense>
  )
}
