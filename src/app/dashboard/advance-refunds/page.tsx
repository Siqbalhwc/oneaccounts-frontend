"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Undo2, CheckCircle, AlertCircle, X } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import { fmtMoney } from "@/lib/money"
import CurrencyTag from "@/components/CurrencyTag"

interface RefundRow {
  id: number
  refund_no: string
  party_type: "customer" | "supplier"
  party_id: number
  date: string
  amount: number
  bank_account_id: number
  reference: string | null
  notes: string | null
  status: "posted" | "reversed"
  reversed_at: string | null
  reverse_reason: string | null
}

type TypeFilter = "all" | "customer" | "supplier"

export default function AdvanceRefundsPage() {
  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    []
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const { companyId } = useCompany()
  const canUse = role === "admin" || role === "accountant"

  const [rows, setRows] = useState<RefundRow[]>([])
  const [custNames, setCustNames] = useState<Record<number, string>>({})
  const [suppNames, setSuppNames] = useState<Record<number, string>>({})
  const [bankNames, setBankNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [search, setSearch] = useState("")
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [email, setEmail] = useState("system")
  const [reloadTick, setReloadTick] = useState(0)

  const [target, setTarget] = useState<RefundRow | null>(null)
  const [reason, setReason] = useState("")
  const [revDate, setRevDate] = useState(new Date().toISOString().slice(0, 10))
  const [reversing, setReversing] = useState(false)
  const [modalError, setModalError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user?.email) setEmail(user.email) })
  }, [supabase])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from("advance_refunds")
        .select("id, refund_no, party_type, party_id, date, amount, bank_account_id, reference, notes, status, reversed_at, reverse_reason")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .order("id", { ascending: false })
      if (cancelled) return
      const list = ((data as any[]) || []).map(r => ({ ...r, amount: Number(r.amount) || 0 })) as RefundRow[]
      setRows(list)

      const custIds = Array.from(new Set(list.filter(r => r.party_type === "customer").map(r => r.party_id)))
      const suppIds = Array.from(new Set(list.filter(r => r.party_type === "supplier").map(r => r.party_id)))
      const bankIds = Array.from(new Set(list.map(r => r.bank_account_id)))

      const cMap: Record<number, string> = {}
      const sMap: Record<number, string> = {}
      const bMap: Record<number, string> = {}
      if (custIds.length) {
        const r = await supabase.from("customers").select("id, name").eq("company_id", companyId).in("id", custIds)
        ;(r.data || []).forEach((c: any) => { cMap[c.id] = c.name })
      }
      if (suppIds.length) {
        const r = await supabase.from("suppliers").select("id, name").eq("company_id", companyId).in("id", suppIds)
        ;(r.data || []).forEach((s: any) => { sMap[s.id] = s.name })
      }
      if (bankIds.length) {
        const r = await supabase.from("bank_accounts").select("id, bank_name").eq("company_id", companyId).in("id", bankIds)
        ;(r.data || []).forEach((b: any) => { bMap[b.id] = b.bank_name })
      }
      if (cancelled) return
      setCustNames(cMap); setSuppNames(sMap); setBankNames(bMap)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyId, supabase, reloadTick])

  const partyName = (r: RefundRow) =>
    (r.party_type === "customer" ? custNames[r.party_id] : suppNames[r.party_id]) || "-"

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (typeFilter !== "all" && r.party_type !== typeFilter) return false
      if (!q) return true
      return (
        r.refund_no.toLowerCase().includes(q) ||
        partyName(r).toLowerCase().includes(q) ||
        (r.reference || "").toLowerCase().includes(q)
      )
    })
  }, [rows, typeFilter, search, custNames, suppNames])

  const postedTotal = useMemo(
    () => filtered.filter(r => r.status === "posted").reduce((s, r) => s + r.amount, 0),
    [filtered]
  )

  const openReverse = (r: RefundRow) => {
    setTarget(r)
    setReason("")
    setRevDate(new Date().toISOString().slice(0, 10))
    setModalError("")
  }

  const confirmReverse = async () => {
    if (!target || !companyId) return
    if (!reason.trim()) { setModalError("Please enter a reason for the reversal."); return }
    if (!revDate) { setModalError("Please choose the reversal date."); return }
    setReversing(true)
    setModalError("")
    const { error } = await supabase.rpc("reverse_advance_refund", {
      p_company_id: companyId,
      p_refund_id: target.id,
      p_reason: reason.trim(),
      p_date: revDate,
      p_user_email: email,
    })
    setReversing(false)
    if (error) { setModalError(error.message); return }
    setBanner({ type: "success", text: `Refund ${target.refund_no} has been reversed. The advance is available again.` })
    setTarget(null)
    setReloadTick(t => t + 1)
  }

  if (roleLoading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  }
  if (!canUse) {
    return <div style={{ padding: 24, color: "var(--text-muted)" }}>Only an admin or accountant can open Advance Refunds.</div>
  }

  return (
    <div className="ar-wrap" style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <style>{`
        .ar-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: var(--shadow-sm); }
        .ar-seg { display: inline-flex; border: 1.5px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--card); }
        .ar-seg button { padding: 9px 16px; font-size: 13px; font-weight: 700; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-family: inherit; }
        .ar-seg button.on { background: var(--primary); color: #fff; }
        .ar-input { height: 42px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 14px; background: var(--card); color: var(--text); font-family: inherit; outline: none; width: 100%; }
        .ar-input:focus { border-color: var(--primary); }
        .ar-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ar-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-muted); padding: 8px 10px; border-bottom: 1px solid var(--border); }
        .ar-table td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .ar-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
        .ar-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid var(--border); }
        .ar-badge.posted { color: var(--success); border-color: var(--success); }
        .ar-badge.reversed { color: var(--danger); border-color: var(--danger); }
        .ar-cards { display: none; flex-direction: column; gap: 10px; }
        .ar-item { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
        .ar-item-top { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; }
        .ar-item-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 6px; font-size: 13px; }
        .ar-note { font-size: 12px; color: var(--text-muted); }
        .ar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
        .ar-modal { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; width: 100%; max-width: 440px; box-shadow: var(--shadow-sm); }
        @media (max-width: 768px) { .ar-wrap { padding-bottom: 96px !important; } }
        @media (max-width: 640px) {
          .ar-wrap { padding: 12px !important; }
          .ar-table-wrap { display: none; }
          .ar-cards { display: flex; }
          .ar-input { font-size: 16px; height: 44px; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Advance Refunds</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Advance returned to customers, and advance returned to us by suppliers</p>
        </div>
        <button className="oa-btn oa-btn-primary" onClick={() => router.push("/dashboard/advance-refunds/new")} style={{ minHeight: 42 }}>
          <Plus size={16} /> New Refund
        </button>
      </div>

      {banner && (
        <div style={{ background: "var(--card)", border: `1px solid ${banner.type === "success" ? "var(--success)" : "var(--danger)"}`, padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
          {banner.type === "success" ? <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={16} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />}
          <span style={{ flex: 1 }}>{banner.text}</span>
          <button onClick={() => setBanner(null)} aria-label="Close" style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--text-muted)" }}><X size={14} /></button>
        </div>
      )}

      <div className="ar-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div className="ar-seg" role="group" aria-label="Refund type">
            <button className={typeFilter === "all" ? "on" : ""} onClick={() => setTypeFilter("all")}>All</button>
            <button className={typeFilter === "customer" ? "on" : ""} onClick={() => setTypeFilter("customer")}>Customers</button>
            <button className={typeFilter === "supplier" ? "on" : ""} onClick={() => setTypeFilter("supplier")}>Suppliers</button>
          </div>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 14, color: "var(--text-muted)" }} />
            <input className="ar-input" style={{ paddingLeft: 32 }} placeholder="Search number, name or reference" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="ar-note" style={{ marginTop: 10 }}>
          {filtered.length} refund(s) - active total <CurrencyTag />{fmtMoney(postedTotal)}
        </div>
      </div>

      <div className="ar-card">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No advance refunds yet.</div>
        ) : (
          <>
            <div className="ar-table-wrap" style={{ overflowX: "auto" }}>
              <table className="ar-table">
                <thead>
                  <tr>
                    <th>Refund no</th><th>Date</th><th>Party</th><th>Paid via</th><th>Reference</th>
                    <th style={{ textAlign: "right" }}>Amount <CurrencyTag /></th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={r.status === "reversed" ? { opacity: 0.65 } : undefined}>
                      <td style={{ fontWeight: 700 }}>{r.refund_no}</td>
                      <td>{r.date}</td>
                      <td>
                        {partyName(r)}
                        <div className="ar-note">{r.party_type === "customer" ? "Customer (we returned)" : "Supplier (returned to us)"}</div>
                      </td>
                      <td>{bankNames[r.bank_account_id] || "-"}</td>
                      <td>{r.reference || "-"}</td>
                      <td className="num">{fmtMoney(r.amount)}</td>
                      <td>
                        <span className={`ar-badge ${r.status}`}>{r.status === "posted" ? "Posted" : "Reversed"}</span>
                        {r.status === "reversed" && r.reverse_reason && <div className="ar-note">{r.reverse_reason}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {r.status === "posted" && (
                          <button className="oa-btn" onClick={() => openReverse(r)}><Undo2 size={14} /> Reverse</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ar-cards">
              {filtered.map(r => (
                <div key={r.id} className="ar-item" style={r.status === "reversed" ? { opacity: 0.7 } : undefined}>
                  <div className="ar-item-top">
                    <span>{r.refund_no}</span>
                    <span className={`ar-badge ${r.status}`}>{r.status === "posted" ? "Posted" : "Reversed"}</span>
                  </div>
                  <div className="ar-item-row"><span>{partyName(r)}</span><span style={{ fontWeight: 800 }}><CurrencyTag />{fmtMoney(r.amount)}</span></div>
                  <div className="ar-item-row ar-note"><span>{r.date} - {bankNames[r.bank_account_id] || "-"}</span><span>{r.party_type === "customer" ? "Customer" : "Supplier"}</span></div>
                  {r.reference && <div className="ar-note" style={{ marginTop: 4 }}>Ref: {r.reference}</div>}
                  {r.status === "reversed" && r.reverse_reason && <div className="ar-note" style={{ marginTop: 4 }}>Reversed: {r.reverse_reason}</div>}
                  {r.status === "posted" && (
                    <button className="oa-btn" style={{ marginTop: 10, width: "100%", minHeight: 40 }} onClick={() => openReverse(r)}><Undo2 size={14} /> Reverse</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {target && (
        <div className="ar-overlay" onClick={() => { if (!reversing) setTarget(null) }}>
          <div className="ar-modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>Reverse refund {target.refund_no}?</h2>
            <p className="ar-note" style={{ margin: "0 0 12px" }}>
              {partyName(target)} - <CurrencyTag />{fmtMoney(target.amount)}. A new opposite entry is posted and the original entry is kept. The advance becomes available again.
            </p>
            <div className="ar-note" style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Reversal date</div>
            <input type="date" className="ar-input" value={revDate} onChange={e => setRevDate(e.target.value)} style={{ marginBottom: 10 }} />
            <div className="ar-note" style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Reason (required)</div>
            <input className="ar-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this refund being reversed?" />
            {modalError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{modalError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="oa-btn" onClick={() => setTarget(null)} disabled={reversing}>Cancel</button>
              <button className="oa-btn oa-btn-primary" onClick={confirmReverse} disabled={reversing}>{reversing ? "Reversing..." : "Reverse refund"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
