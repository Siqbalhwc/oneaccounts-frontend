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

interface DocRow {
  key: string
  kind: "invoice" | "opening"
  id: number
  label: string
  date: string
  total: number
  due: number
  // supplier bills with withholding tax
  hasWht: boolean
  whtAmount: number
  whtRate: number
}

// Same maths as the database (create_vendor_payment): tax withheld on a part-payment of a bill
function whtOn(gross: number, r: DocRow): number {
  if (!r.hasWht || gross <= 0) return 0
  const standard = round2(r.total * (r.whtRate || 0) / 100) === round2(r.whtAmount)
  return standard ? round2(gross * r.whtRate / 100) : round2(r.whtAmount * (gross / r.total))
}

// Cash taken from the advance for a given gross amount (tax withheld is not paid from the advance)
function cashFor(gross: number, r: DocRow): number {
  return round2(gross - whtOn(gross, r))
}

// Largest gross amount (up to the due balance) whose cash cost fits within the cash available
function grossFitting(r: DocRow, cashAvail: number): number {
  if (cashAvail <= 0) return 0
  if (cashFor(r.due, r) <= cashAvail + 0.0001) return r.due
  const eff = r.hasWht ? (round2(r.total * (r.whtRate || 0) / 100) === round2(r.whtAmount) ? r.whtRate / 100 : r.whtAmount / r.total) : 0
  let g = Math.min(r.due, round2(cashAvail / (1 - eff)))
  let guard = 0
  while (g > 0 && cashFor(g, r) > cashAvail + 0.0001 && guard++ < 1000) g = round2(g - 0.01)
  return Math.max(0, g)
}

function cleanAmount(s: string): string {
  let v = s.replace(/[^0-9.]/g, "")
  const i = v.indexOf(".")
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 2)
  return v
}

function ApplyAdvanceInner() {
  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    []
  )
  const router = useRouter()
  const sp = useSearchParams()
  const { role } = useRole()
  const { companyId } = useCompany()
  const canUse = role === "admin" || role === "accountant"

  const initialType: PartyType = sp.get("type") === "supplier" ? "supplier" : "customer"
  const initialParty = sp.get("party") ? Number(sp.get("party")) : 0

  const [type, setType] = useState<PartyType>(initialType)
  const [parties, setParties] = useState<Party[]>([])
  const [partyId, setPartyId] = useState<number>(initialParty)
  const [advance, setAdvance] = useState(0)
  const [rows, setRows] = useState<DocRow[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [loadingParties, setLoadingParties] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [email, setEmail] = useState("system")
  const [reloadTick, setReloadTick] = useState(0)

  const isCust = type === "customer"
  const partyLabel = isCust ? "Customer" : "Supplier"
  const docLabel = isCust ? "invoices" : "bills"

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user?.email) setEmail(user.email) })
  }, [supabase])

  // Parties list
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

  // Advance and open documents for the chosen party
  useEffect(() => {
    if (!companyId || !partyId) { setRows([]); setAdvance(0); setAmounts({}); return }
    let cancelled = false
    setLoadingDocs(true)
    ;(async () => {
      try {
        const advRes = await supabase.rpc(isCust ? "get_customer_advance" : "get_supplier_advance",
          isCust ? { p_company_id: companyId, p_customer_id: partyId } : { p_company_id: companyId, p_supplier_id: partyId })
        const adv = Number(advRes.data) || 0

        const list: DocRow[] = []
        const openTot = await supabase.rpc(isCust ? "get_customer_opening_total" : "get_supplier_opening_total",
          isCust ? { p_company_id: companyId, p_customer_id: partyId } : { p_company_id: companyId, p_supplier_id: partyId })
        const openPaid = await supabase.rpc(isCust ? "get_customer_opening_paid" : "get_supplier_opening_paid",
          isCust ? { p_company_id: companyId, p_customer_id: partyId } : { p_company_id: companyId, p_supplier_id: partyId })
        const oTotal = Number(openTot.data) || 0
        const oDue = round2(oTotal - (Number(openPaid.data) || 0))
        if (oDue > 0) {
          list.push({ key: "open", kind: "opening", id: partyId, label: "Opening balance", date: "", total: oTotal, due: oDue, hasWht: false, whtAmount: 0, whtRate: 0 })
        }

        const { data: invs } = await supabase
          .from("invoices")
          .select("id, invoice_no, date, total, paid, status")
          .eq("company_id", companyId)
          .eq("type", isCust ? "sale" : "purchase")
          .eq("party_id", partyId)
          .in("status", ["Unpaid", "Partial"])
          .is("deleted_at", null)
          .order("date", { ascending: true })
          .order("id", { ascending: true })

        const whtMap: Record<number, { amt: number; rate: number }> = {}
        if (!isCust && invs && invs.length > 0) {
          const ids = invs.map((i: any) => i.id)
          const { data: bw } = await supabase
            .from("bill_withholding")
            .select("bill_id, wht_amount, wht_rate, wht_tax_code_id")
            .eq("company_id", companyId)
            .in("bill_id", ids)
          const codeIds = Array.from(new Set((bw || []).filter((b: any) => Number(b.wht_amount) > 0 && b.wht_tax_code_id).map((b: any) => b.wht_tax_code_id)))
          const okCodes = new Set<any>()
          if (codeIds.length > 0) {
            const { data: tc } = await supabase.from("tax_codes").select("id, tax_account_id").eq("company_id", companyId).in("id", codeIds)
            ;(tc || []).forEach((t: any) => { if (t.tax_account_id) okCodes.add(t.id) })
          }
          ;(bw || []).forEach((b: any) => {
            if (Number(b.wht_amount) > 0 && b.wht_tax_code_id && okCodes.has(b.wht_tax_code_id) && !whtMap[b.bill_id]) {
              whtMap[b.bill_id] = { amt: Number(b.wht_amount), rate: Number(b.wht_rate) || 0 }
            }
          })
        }

        ;(invs || []).forEach((i: any) => {
          const due = round2(Number(i.total) - (Number(i.paid) || 0))
          if (due <= 0) return
          const w = whtMap[i.id]
          list.push({
            key: "inv" + i.id, kind: "invoice", id: i.id, label: i.invoice_no, date: i.date,
            total: Number(i.total), due, hasWht: !!w, whtAmount: w ? w.amt : 0, whtRate: w ? w.rate : 0,
          })
        })

        if (cancelled) return
        setAdvance(adv)
        setRows(list)
        const pre = sp.get("doc") ? "inv" + sp.get("doc") : ""
        const init: Record<string, string> = {}
        if (pre) {
          const r = list.find(x => x.key === pre)
          if (r && adv > 0) {
            const g = grossFitting(r, adv)
            if (g > 0) init[pre] = g.toFixed(2)
          }
        }
        setAmounts(init)
      } catch (e: any) {
        if (!cancelled) setBanner({ type: "error", text: e?.message || "Could not load data." })
      } finally {
        if (!cancelled) setLoadingDocs(false)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, partyId, isCust, reloadTick, supabase])

  const grossOf = (r: DocRow) => round2(parseFloat(amounts[r.key] || "0") || 0)
  const totalGross = round2(rows.reduce((s, r) => s + grossOf(r), 0))
  const totalWht = round2(rows.reduce((s, r) => s + whtOn(grossOf(r), r), 0))
  const cashUsed = round2(totalGross - totalWht)
  const remaining = round2(advance - cashUsed)
  const anyOver = rows.some(r => grossOf(r) > r.due + 0.001)
  const canSubmit = totalGross > 0 && remaining >= -0.001 && !anyOver && !saving

  const setAmt = (key: string, v: string) => setAmounts(a => ({ ...a, [key]: cleanAmount(v) }))

  const oldestFirst = () => {
    let cash = advance
    const next: Record<string, string> = {}
    for (const r of rows) {
      if (cash <= 0) break
      const g = grossFitting(r, cash)
      if (g > 0) {
        next[r.key] = g.toFixed(2)
        cash = round2(cash - cashFor(g, r))
      }
    }
    setAmounts(next)
  }

  const switchType = (t: PartyType) => {
    if (t === type) return
    setType(t); setPartyId(0); setRows([]); setAmounts({}); setAdvance(0); setBanner(null)
  }

  const submit = async () => {
    if (!canSubmit || !companyId) return
    setSaving(true); setBanner(null)
    const allocations = rows
      .filter(r => r.kind === "invoice" && grossOf(r) > 0)
      .map(r => ({ invoice_id: r.id, amount: grossOf(r) }))
    const openRow = rows.find(r => r.kind === "opening")
    const openAmt = openRow ? grossOf(openRow) : 0
    const { data, error } = isCust
      ? await supabase.rpc("apply_customer_advance", { p_company_id: companyId, p_customer_id: partyId, p_allocations: allocations, p_opening_amount: openAmt })
      : await supabase.rpc("apply_supplier_advance", { p_company_id: companyId, p_supplier_id: partyId, p_allocations: allocations, p_opening_amount: openAmt, p_user_email: email })
    setSaving(false)
    if (error) {
      setBanner({ type: "error", text: error.message })
      return
    }
    const res: any = data || {}
    setBanner({ type: "success", text: "Advance applied: " + fmtMoney(res.applied_total ?? totalGross) + (res.wht_booked > 0 ? " (tax withheld " + fmtMoney(res.wht_booked) + ")" : "") + ". Remaining advance " + fmtMoney(res.advance_after ?? remaining) + "." })
    setReloadTick(t => t + 1)
  }

  if (!role || !companyId) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canUse) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="aa-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", color: "var(--text)" }}>
      <style>{`
        .aa-wrap * { box-sizing: border-box; }
        .aa-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .aa-seg { display: inline-flex; border: 1.5px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
        .aa-seg button { min-height: 40px; padding: 0 18px; border: 0; background: var(--card); color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .aa-seg button.on { background: var(--primary); color: var(--primary-text); }
        .aa-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: var(--shadow-sm); }
        .aa-select, .aa-input { width: 100%; height: 42px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 14px; background: var(--card); color: var(--text); font-family: inherit; outline: none; }
        .aa-select:focus, .aa-input:focus { border-color: var(--primary); }
        .aa-input { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; max-width: 150px; }
        .aa-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .aa-big { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .aa-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .aa-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-muted); padding: 8px 10px; border-bottom: 1px solid var(--border); }
        .aa-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
        .aa-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .aa-cards { display: none; flex-direction: column; gap: 10px; }
        .aa-doc { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
        .aa-doc-top { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; }
        .aa-doc-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 8px; font-size: 13px; }
        .aa-bar { position: sticky; bottom: 0; background: var(--card); border-top: 1px solid var(--border); padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; z-index: 50; margin: 0 -24px -24px; }
        .aa-note { font-size: 12px; color: var(--text-muted); }
        .aa-two { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; }
        @media (max-width: 768px) {
          .aa-bar { bottom: calc(52px + max(8px, env(safe-area-inset-bottom, 0px))); }
          .aa-wrap { padding-bottom: 96px !important; }
        }
        @media (max-width: 640px) {
          .aa-wrap { padding: 12px !important; }
          .aa-bar { margin: 0 -12px; }
          .aa-table-wrap { display: none; }
          .aa-cards { display: flex; }
          .aa-select, .aa-input { font-size: 16px; height: 44px; }
          .aa-input { max-width: 140px; }
          .aa-two { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="aa-head">
        <button className="oa-btn" onClick={() => router.back()} aria-label="Back"><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Apply Advance</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Use an unapplied {isCust ? "receipt" : "payment"} against open {docLabel}</p>
        </div>
      </div>

      {banner && (
        <div style={{ background: "var(--card)", border: `1px solid ${banner.type === "success" ? "var(--success)" : "var(--danger)"}`, padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
          {banner.type === "success" ? <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={16} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="aa-seg" role="group" aria-label="Advance type">
        <button className={isCust ? "on" : ""} onClick={() => switchType("customer")}>Customer advance</button>
        <button className={!isCust ? "on" : ""} onClick={() => switchType("supplier")}>Supplier advance</button>
      </div>

      <div className="aa-card">
        <div className="aa-two">
          <div>
            <div className="aa-label">{partyLabel}</div>
            <select className="aa-select" value={partyId || ""} onChange={e => { setPartyId(Number(e.target.value) || 0); setBanner(null) }} disabled={loadingParties}>
              <option value="">{loadingParties ? "Loading..." : `Select ${partyLabel.toLowerCase()}`}</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="aa-label">Advance available</div>
            <div className="aa-big" style={{ color: advance > 0 ? "var(--success)" : "var(--text-muted)" }}><CurrencyTag />{fmtMoney(advance)}</div>
          </div>
        </div>
        {partyId > 0 && !loadingDocs && advance <= 0 && (
          <div className="aa-note" style={{ marginTop: 10 }}>This {partyLabel.toLowerCase()} has no unapplied advance.</div>
        )}
      </div>

      {partyId > 0 && (
        <div className="aa-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700 }}>Apply to open {docLabel} <span className="aa-note">(PKR)</span></div>
            <button className="oa-btn" onClick={oldestFirst} disabled={advance <= 0 || rows.length === 0}>Apply oldest first</button>
          </div>

          {loadingDocs ? (
            <div className="aa-note" style={{ padding: 16, textAlign: "center" }}>Loading...</div>
          ) : rows.length === 0 ? (
            <div className="aa-note" style={{ padding: 16, textAlign: "center" }}>No open {docLabel} for this {partyLabel.toLowerCase()}.</div>
          ) : (
            <>
              <div className="aa-table-wrap" style={{ overflowX: "auto" }}>
                <table className="aa-table">
                  <thead><tr><th>Document</th><th>Date</th><th className="num">Total</th><th className="num">Balance due</th><th className="num">Apply</th></tr></thead>
                  <tbody>
                    {rows.map(r => {
                      const g = grossOf(r)
                      const w = whtOn(g, r)
                      return (
                        <tr key={r.key}>
                          <td>{r.label}{r.hasWht && <div className="aa-note">Tax withheld applies</div>}</td>
                          <td>{r.date || "-"}</td>
                          <td className="num">{fmtMoney(r.total)}</td>
                          <td className="num">{fmtMoney(r.due)}</td>
                          <td className="num">
                            <input className="aa-input" inputMode="decimal" aria-label={"Apply to " + r.label} value={amounts[r.key] || ""} placeholder="0.00" onChange={e => setAmt(r.key, e.target.value)} />
                            {w > 0 && <div className="aa-note">tax {fmtMoney(w)} / advance used {fmtMoney(cashFor(g, r))}</div>}
                            {g > r.due + 0.001 && <div className="aa-note" style={{ color: "var(--danger)" }}>More than balance due</div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="aa-cards">
                {rows.map(r => {
                  const g = grossOf(r)
                  const w = whtOn(g, r)
                  return (
                    <div className="aa-doc" key={r.key}>
                      <div className="aa-doc-top"><span>{r.label}</span><span className="aa-note">{r.date || ""}</span></div>
                      <div className="aa-doc-row"><span className="aa-note">Total</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.total)}</span></div>
                      <div className="aa-doc-row"><span className="aa-note">Balance due</span><span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtMoney(r.due)}</span></div>
                      <div className="aa-doc-row">
                        <label className="aa-note" htmlFor={"aa-" + r.key}>Apply</label>
                        <input id={"aa-" + r.key} className="aa-input" inputMode="decimal" value={amounts[r.key] || ""} placeholder="0.00" onChange={e => setAmt(r.key, e.target.value)} />
                      </div>
                      {r.hasWht && <div className="aa-note" style={{ marginTop: 6 }}>Tax withheld applies{w > 0 ? `: tax ${fmtMoney(w)}, advance used ${fmtMoney(cashFor(g, r))}` : ""}</div>}
                      {g > r.due + 0.001 && <div className="aa-note" style={{ color: "var(--danger)", marginTop: 6 }}>More than balance due</div>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
          <div className="aa-note" style={{ marginTop: 12 }}>
            {isCust
              ? "No new journal entry is created. The receipt money is already in Accounts Receivable; only the invoice paid amount and status are updated."
              : "Bills without tax withheld: no journal entry. Bills with tax withheld: the payment is re-posted as a normal payment edit so the tax is booked."}
          </div>
        </div>
      )}

      <div className="aa-bar">
        <div>
          <div className="aa-note">Applied / advance left</div>
          <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: remaining < -0.001 ? "var(--danger)" : "var(--text)" }}>
            <CurrencyTag />{fmtMoney(totalGross)} / {fmtMoney(remaining)}
          </div>
        </div>
        <button className="oa-btn oa-btn-primary" onClick={submit} disabled={!canSubmit} style={{ minHeight: 42 }}>
          {saving ? "Applying..." : "Apply Advance"}
        </button>
      </div>
    </div>
  )
}

export default function ApplyAdvancePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>}>
      <ApplyAdvanceInner />
    </Suspense>
  )
}
