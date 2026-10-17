"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, AlertCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"
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
  const { role } = useRole()
  const { companyId } = useCompany()
  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark" || themeMode === "oneaccounts"
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
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")
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
    setType(t); setPartyId(0); setAmount(""); setError(""); setFlash(""); setSaved(false)
  }

  const amt = round2(Number(amount) || 0)

  // What the party is really owed back once unpaid documents are considered
  // (a negative balance means the money is owed back to the customer / by the supplier).
  const owedBack = netBalance === null ? null : round2(Math.max(0, -netBalance))
  const exceedsOwed = owedBack !== null && amt > owedBack + 0.004
  const overAdvance = amt > advance + 0.004
  const canSave = !saving && !saved && partyId > 0 && bankId > 0 && amt > 0 && !overAdvance && !!date

  const submit = async () => {
    if (!companyId || !canSave) return
    setSaving(true); setError(""); setFlash("")
    const { data, error: rpcError } = await supabase.rpc("create_advance_refund", {
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
    if (rpcError) { setError(rpcError.message); return }
    const res: any = data || {}
    setSaved(true)
    setFlash(`Refund ${res.refund_no} posted for ${fmtMoney(amt)}. Advance left: ${fmtMoney(res.advance_after ?? 0)}.`)
    setReloadTick(t => t + 1)
  }

  if (!role) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canUse) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>
  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data...</div>

  const warnColor = "#F59E0B"

  return (
    <div className="page-wrap" style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { width: 100%; margin: 0; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px; }
        .inv-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; }
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; transition: all 0.15s; white-space: nowrap; text-decoration: none; }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .seg { display: inline-flex; border: 1.5px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--card); margin-bottom: 12px; }
        .seg button { height: 38px; padding: 0 16px; font-size: 13px; font-weight: 600; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-family: inherit; }
        .seg button.on { background: var(--primary); color: #fff; }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }
        .sum-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
        .sum-row:last-of-type { border-bottom: none; }
        .sum-val { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
        input[type="date"].inv-input { color-scheme: ${isDark ? "dark" : "light"}; }
        .mobile-save-bar { display: none; }
        @media (max-width: 640px) {
          .page-wrap { padding: 12px !important; }
          .inv-input, .inv-select { font-size: 16px; }
          .inv-row { grid-template-columns: 1fr; }
          .desktop-save { display: none; }
          .mobile-save-bar { display: flex; position: sticky; bottom: 0; background: var(--card); border-top: 1px solid var(--border); padding: 10px 12px; margin: 16px -12px -12px -12px; z-index: 50; gap: 8px; }
        }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" onClick={() => router.push("/dashboard/advance-refunds")}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">↩️ New Advance Refund</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
              {isCust ? "Return an unused customer advance (Dr Receivable, Cr Bank / Cash)" : "Record an unused supplier advance returned to us (Dr Bank / Cash, Cr Payable)"}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
          </div>
        )}
        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid var(--success)", color: "var(--text)", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} style={{ color: "var(--success)" }} /> {flash}
          </div>
        )}
        {saved && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>What would you like to do next?</span>
            <button className="inv-btn" onClick={() => { setSaved(false); setFlash(""); setAmount(""); setReference(""); setNotes("") }}>+ Add Another Refund</button>
            <button className="inv-btn" onClick={() => router.push("/dashboard/advance-refunds")}>Go to List</button>
          </div>
        )}

        <div className="header-grid">
          <div>
            <div className="seg" role="group" aria-label="Refund type">
              <button className={isCust ? "on" : ""} onClick={() => switchType("customer")} disabled={saving}>Customer advance</button>
              <button className={!isCust ? "on" : ""} onClick={() => switchType("supplier")} disabled={saving}>Supplier advance</button>
            </div>

            <div className="inv-card">
              <label className="inv-label">{partyLabel}</label>
              <select className="inv-select" value={partyId || ""} onChange={e => { setPartyId(Number(e.target.value) || 0); setError(""); setFlash(""); setSaved(false); setAmount("") }} disabled={loadingParties || saving}>
                <option value="">{loadingParties ? "Loading..." : `Select ${partyLabel.toLowerCase()}`}</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {partyId > 0 && !loadingInfo && advance <= 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>This {partyLabel.toLowerCase()} has no unapplied advance to refund.</div>
              )}
              {partyId > 0 && !loadingInfo && advance > 0 && owedBack !== null && owedBack + 0.004 < advance && (
                <div style={{ fontSize: 12, color: warnColor, marginTop: 8 }}>
                  Part of this advance is still needed to settle unpaid {isCust ? "invoices" : "bills"}. Apply the advance first, then refund only what is left.
                </div>
              )}
            </div>

            <div className="inv-card">
              <div className="inv-row" style={{ marginTop: 0 }}>
                <div>
                  <label className="inv-label">Amount (PKR)</label>
                  <input className="inv-input" inputMode="decimal" value={amount} onChange={e => setAmount(cleanAmount(e.target.value))} placeholder="0.00" disabled={saving || saved || partyId === 0} style={{ textAlign: "right", fontWeight: 700 }} />
                  {overAdvance && amt > 0 && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>More than the available advance ({fmtMoney(advance)}).</div>}
                  {!overAdvance && exceedsOwed && amt > 0 && <div style={{ fontSize: 12, color: warnColor, marginTop: 4 }}>More than the {isCust ? "customer is owed back" : "supplier owes us"} ({fmtMoney(owedBack ?? 0)}). Apply the advance to open {isCust ? "invoices" : "bills"} first.</div>}
                  {advance > 0 && !saved && (
                    <button type="button" className="inv-btn" style={{ marginTop: 6 }} onClick={() => setAmount(String(Math.min(advance, owedBack ?? advance)))}>
                      Use {fmtMoney(Math.min(advance, owedBack ?? advance))}
                    </button>
                  )}
                </div>
                <div>
                  <label className="inv-label">{isCust ? "Paid from" : "Received into"}</label>
                  <select className="inv-select" value={bankId || ""} onChange={e => setBankId(Number(e.target.value) || 0)} disabled={saving || saved}>
                    <option value="">Select bank or cash account</option>
                    {banks.map(b => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
                  </select>
                </div>
              </div>
              <div className="inv-row">
                <div>
                  <label className="inv-label">Date</label>
                  <input type="date" className="inv-input" value={date} onChange={e => setDate(e.target.value)} disabled={saving || saved} />
                </div>
                <div>
                  <label className="inv-label">Reference (cheque / transfer no)</label>
                  <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} disabled={saving || saved} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="inv-label">Notes</label>
                <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} disabled={saving || saved} />
              </div>
            </div>
          </div>

          <div className="inv-card" style={{ position: "sticky", top: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Summary</div>
            <div className="sum-row"><span style={{ color: "var(--text-muted)" }}>Advance available</span><span className="sum-val" style={{ color: advance > 0 ? "var(--success)" : "var(--text-muted)" }}>{partyId ? (loadingInfo ? "..." : fmtMoney(advance)) : "--"}</span></div>
            <div className="sum-row"><span style={{ color: "var(--text-muted)" }}>{isCust ? "Owed back (net)" : "Owes us (net)"}</span><span className="sum-val">{partyId ? (loadingInfo || owedBack === null ? "..." : fmtMoney(owedBack)) : "--"}</span></div>
            <div className="sum-row"><span style={{ color: "var(--text-muted)" }}>Refund amount</span><span className="sum-val"><CurrencyTag />{fmtMoney(amt)}</span></div>
            <div className="sum-row"><span style={{ color: "var(--text-muted)" }}>Advance left after</span><span className="sum-val">{partyId ? fmtMoney(Math.max(0, round2(advance - amt))) : "--"}</span></div>
            <div className="desktop-save" style={{ marginTop: 12 }}>
              <button className="oa-btn oa-btn-primary" style={{ width: "100%", minHeight: 42 }} onClick={submit} disabled={!canSave}>
                {saving ? "Posting..." : "Post Refund"}
              </button>
            </div>
          </div>
        </div>

        <div className="mobile-save-bar">
          <button className="oa-btn oa-btn-primary" style={{ flex: 1, minHeight: 44 }} onClick={submit} disabled={!canSave}>
            {saving ? "Posting..." : "Post Refund"}
          </button>
        </div>
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
