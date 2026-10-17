"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Undo2, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle, AlertCircle, X, Wallet } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import ActionSlots from "@/components/ActionSlots"
import { fmtMoney } from "@/lib/money"
import CurrencyTag from "@/components/CurrencyTag"

type SortField = "refund_no" | "date" | "party" | "amount" | "status"
type SortDir = "asc" | "desc"
type TypeFilter = "all" | "customer" | "supplier"

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

interface AdvanceRow {
  type: "customer" | "supplier"
  id: number
  name: string
  advance: number
}

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 70, 40, 50, 60, 40].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{ width: `${w}%`, height: 12, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite" }} />
        </td>
      ))}
    </tr>
  )
}

export default function AdvanceRefundsPage() {
  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    []
  )
  const router = useRouter()
  const { role } = useRole()
  const { companyId } = useCompany()
  const canUse = role === "admin" || role === "accountant"

  const [rows, setRows] = useState<RefundRow[]>([])
  const [advances, setAdvances] = useState<AdvanceRow[]>([])
  const [custNames, setCustNames] = useState<Record<number, string>>({})
  const [suppNames, setSuppNames] = useState<Record<number, string>>({})
  const [bankNames, setBankNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
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
    if (banner?.type === "success") {
      const t = setTimeout(() => setBanner(null), 8000)
      return () => clearTimeout(t)
    }
  }, [banner])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const [refRes, arRes, apRes] = await Promise.all([
        supabase
          .from("advance_refunds")
          .select("id, refund_no, party_type, party_id, date, amount, bank_account_id, reference, notes, status, reversed_at, reverse_reason")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("date", { ascending: false })
          .order("id", { ascending: false }),
        supabase.rpc("get_ar_aging", { p_company_id: companyId, p_as_of_date: today }),
        supabase.rpc("get_ap_aging", { p_company_id: companyId, p_as_of_date: today }),
      ])
      if (cancelled) return

      const list = ((refRes.data as any[]) || []).map(r => ({ ...r, amount: Number(r.amount) || 0 })) as RefundRow[]
      setRows(list)

      // Parties that currently hold an unapplied advance (same figure the aging reports use)
      const adv: AdvanceRow[] = []
      for (const r of ((arRes.data as any[]) || [])) {
        if (r.invoice_no === "Unapplied Advance" && Number(r.paid) > 0) {
          adv.push({ type: "customer", id: Number(r.customer_id), name: r.customer_name, advance: Number(r.paid) })
        }
      }
      for (const r of ((apRes.data as any[]) || [])) {
        if (r.invoice_no === "Unapplied Advance" && Number(r.paid) > 0) {
          adv.push({ type: "supplier", id: Number(r.supplier_id), name: r.supplier_name, advance: Number(r.paid) })
        }
      }
      adv.sort((a, b) => b.advance - a.advance)
      setAdvances(adv)

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
    (r.party_type === "customer" ? custNames[r.party_id] : suppNames[r.party_id]) || "--"

  const filtered = rows.filter(r => {
    if (typeFilter !== "all" && r.party_type !== typeFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return r.refund_no.toLowerCase().includes(q) || partyName(r).toLowerCase().includes(q) || (r.reference || "").toLowerCase().includes(q)
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "party") { valA = partyName(a).toLowerCase(); valB = partyName(b).toLowerCase() }
    else if (sortField === "amount") { valA = a.amount; valB = b.amount }
    else { valA = String((a as any)[sortField] ?? "").toLowerCase(); valB = String((b as any)[sortField] ?? "").toLowerCase() }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => (prev === "asc" ? "desc" : "asc"))
    else { setSortField(field); setSortDir("asc") }
  }
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const postedFiltered = sortedFiltered.filter(r => r.status === "posted")
  const totalRefunded = postedFiltered.reduce((s, r) => s + r.amount, 0)
  const custAdv = advances.filter(a => a.type === "customer")
  const suppAdv = advances.filter(a => a.type === "supplier")
  const custAdvTotal = custAdv.reduce((s, a) => s + a.advance, 0)
  const suppAdvTotal = suppAdv.reduce((s, a) => s + a.advance, 0)
  const visibleAdv = advances.filter(a => typeFilter === "all" || a.type === typeFilter)

  const openReverse = (r: RefundRow) => {
    setTarget(r); setReason(""); setRevDate(new Date().toISOString().slice(0, 10)); setModalError("")
  }

  const confirmReverse = async () => {
    if (!target || !companyId || reversing) return
    if (!reason.trim()) { setModalError("Please enter a reason for the reversal."); return }
    if (!revDate) { setModalError("Please choose the reversal date."); return }
    setReversing(true); setModalError("")
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

  const thStyle: React.CSSProperties = { padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", whiteSpace: "nowrap", userSelect: "none" }
  const tdStyle: React.CSSProperties = { padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, verticalAlign: "middle" }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button onClick={() => handleSort(field)} style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4, padding: 0, whiteSpace: "nowrap" }}>
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

  const rowOverflowActions = (r: RefundRow) => [
    { key: "reverse", label: "Reverse", color: "#F59E0B", hidden: r.status !== "posted", icon: <Undo2 size={14} />, onClick: () => openReverse(r) },
  ]

  const refundHref = (a: AdvanceRow) => `/dashboard/advance-refunds/new?type=${a.type}&party=${a.id}`

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canUse) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer { 0% { opacity: 0.4; } 50% { opacity: 0.8; } 100% { opacity: 0.4; } }
        .rec-table { width: 100%; border-collapse: collapse; min-width: 760px; }
        .rec-table tbody tr:last-child td { border-bottom: none; }
        .rec-table tbody tr:hover td { background: var(--card-hover); }
        .btn-icon { background: transparent; border: 1.5px solid var(--border); color: var(--text-muted); padding: 5px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; line-height: 1; }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; background: var(--card); color: var(--text); outline: none; box-sizing: border-box; }
        .search-input:focus { border-color: var(--primary); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .summary-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); margin-bottom: 20px; }
        .card-head { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .table-scroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .badge { padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; display: inline-block; }
        .badge-reversed { background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); }
        .badge-posted { background: rgba(16,185,129,0.12); color: #10B981; border: 1px solid rgba(16,185,129,0.3); }
        .badge-type { background: rgba(59,130,246,0.12); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); }
        .seg { display: inline-flex; border: 1.5px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--card); }
        .seg button { height: 38px; padding: 0 14px; font-size: 13px; font-weight: 600; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-family: inherit; }
        .seg button.on { background: var(--primary); color: #fff; }
        .notice { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; font-size: 13px; display: flex; gap: 10px; align-items: center; }
        @media (max-width: 480px) { .page-wrap { padding: 12px !important; } .summary-grid { grid-template-columns: repeat(2, 1fr) !important; } }

        .rec-cards { display: none; flex-direction: column; gap: 10px; }
        .rec-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .rec-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .rec-card-no { font-size: 13px; font-weight: 700; color: var(--primary); }
        .rec-card-date { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .rec-card-amt { font-size: 15px; font-weight: 800; white-space: nowrap; text-align: right; }
        .rec-card-name { font-size: 14px; color: var(--text); margin-top: 6px; }
        .rec-card-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 12px; color: var(--text-muted); }
        .rec-card-actions { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        .rec-card-empty { text-align: center; color: var(--text-muted); padding: 32px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
        @media (max-width: 640px) {
          .desktop-table { display: none; }
          .rec-cards { display: flex; }
        }
      `}</style>

      <div className="oa-list-header">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>↩️ Advance Refunds</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Advance returned to customers, and advance returned to us by suppliers</p>
        </div>
        <div className="oa-list-actions">
          <button className="oa-btn" onClick={() => router.push("/dashboard/receipts/apply-advance?type=customer")}>Apply Advance</button>
          <button className="oa-btn oa-btn-primary" onClick={() => router.push("/dashboard/advance-refunds/new")}>
            <Plus size={16} /> New Refund
          </button>
        </div>
      </div>

      {banner && (
        <div style={{ background: "var(--card)", border: `1px solid ${banner.type === "success" ? "var(--success)" : "var(--danger)"}`, color: "var(--text)", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          {banner.type === "success" ? <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0 }} /> : <AlertCircle size={16} style={{ color: "var(--danger)", flexShrink: 0 }} />}
          <span style={{ flex: 1 }}>{banner.text}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "inline-flex", padding: 0 }}><X size={14} /></button>
        </div>
      )}

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Customer advances held</div>
          <div className="summary-value" style={{ fontVariantNumeric: "tabular-nums", color: custAdvTotal > 0 ? "#F59E0B" : "var(--text)" }}><CurrencyTag size={12} />{loading ? "..." : fmtMoney(custAdvTotal)}</div>
          <div className="summary-sub">{loading ? "" : `${custAdv.length} customer(s)`}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Supplier advances held</div>
          <div className="summary-value" style={{ fontVariantNumeric: "tabular-nums", color: suppAdvTotal > 0 ? "#F59E0B" : "var(--text)" }}><CurrencyTag size={12} />{loading ? "..." : fmtMoney(suppAdvTotal)}</div>
          <div className="summary-sub">{loading ? "" : `${suppAdv.length} supplier(s)`}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Refunds posted</div>
          <div className="summary-value">{postedFiltered.length}</div>
          <div className="summary-sub">excl. reversed</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total refunded</div>
          <div className="summary-value" style={{ fontVariantNumeric: "tabular-nums" }}><CurrencyTag size={12} />{fmtMoney(totalRefunded)}</div>
          <div className="summary-sub">excl. reversed</div>
        </div>
      </div>

      {/* Clear message about whether any advance is currently held */}
      {!loading && advances.length === 0 && (
        <div className="notice">
          <CheckCircle size={18} style={{ color: "var(--success)", flexShrink: 0 }} />
          <span>No customer or supplier is holding an unapplied advance right now, so there is nothing to refund.</span>
        </div>
      )}

      {!loading && visibleAdv.length > 0 && (
        <div className="card">
          <div className="card-head"><Wallet size={15} /> Advances in hand - available to apply or refund</div>
          <div className="table-scroll">
            <table className="rec-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Type</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Advance (PKR)</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleAdv.map(a => (
                  <tr key={`${a.type}-${a.id}`}>
                    <td style={tdStyle}>{a.name}</td>
                    <td style={tdStyle}><span className="badge badge-type">{a.type === "customer" ? "Customer" : "Supplier"}</span></td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtMoney(a.advance)}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button className="oa-btn" onClick={() => router.push(refundHref(a))}>Refund</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div className="seg" role="group" aria-label="Refund type">
          <button className={typeFilter === "all" ? "on" : ""} onClick={() => setTypeFilter("all")}>All</button>
          <button className={typeFilter === "customer" ? "on" : ""} onClick={() => setTypeFilter("customer")}>Customers</button>
          <button className={typeFilter === "supplier" ? "on" : ""} onClick={() => setTypeFilter("supplier")}>Suppliers</button>
        </div>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder="Search by refund #, name or reference..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card desktop-table">
        <div className="table-scroll">
          <table className="rec-table">
            <colgroup>
              <col style={{ width: 150 }} /><col style={{ width: 100 }} /><col /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 100 }} /><col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh field="refund_no">Refund #</SortTh>
                <SortTh field="date">Date</SortTh>
                <SortTh field="party" style={{ textAlign: "left" }}>Name</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Via</th>
                <SortTh field="amount" style={{ textAlign: "right" }}>Amount (PKR)</SortTh>
                <SortTh field="status" style={{ textAlign: "center" }}>Status</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No advance refunds found.</td></tr>
              ) : (
                sortedFiltered.map(r => {
                  const isReversed = r.status === "reversed"
                  return (
                    <tr key={r.id} style={{ opacity: isReversed ? 0.6 : 1 }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>{r.refund_no}</span>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{r.date}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {partyName(r)} <span className="badge badge-type" style={{ marginLeft: 6 }}>{r.party_type === "customer" ? "Customer" : "Supplier"}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{bankNames[r.bank_account_id] || "--"}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: isReversed ? "var(--text-muted)" : "#F59E0B", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.amount)}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span className={`badge ${isReversed ? "badge-reversed" : "badge-posted"}`} title={isReversed ? (r.reverse_reason || "") : ""}>{isReversed ? "Reversed" : "Posted"}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <ActionSlots overflow={rowOverflowActions(r)} />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rec-cards">
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <div className="rec-card" key={i}>
              <div style={{ width: "55%", height: 14, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite", marginBottom: 8 }} />
              <div style={{ width: "35%", height: 12, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite" }} />
            </div>
          ))
        ) : sortedFiltered.length === 0 ? (
          <div className="rec-card-empty">No advance refunds found.</div>
        ) : (
          sortedFiltered.map(r => {
            const isReversed = r.status === "reversed"
            return (
              <div key={r.id} className="rec-card" style={{ opacity: isReversed ? 0.6 : 1 }}>
                <div className="rec-card-top">
                  <div>
                    <div className="rec-card-no">
                      {r.refund_no}
                      <span className={`badge ${isReversed ? "badge-reversed" : "badge-posted"}`} style={{ marginLeft: 6 }}>{isReversed ? "Reversed" : "Posted"}</span>
                    </div>
                    <div className="rec-card-date">{r.date}</div>
                  </div>
                  <div className="rec-card-amt" style={{ color: isReversed ? "var(--text-muted)" : "#F59E0B" }}><CurrencyTag />{fmtMoney(r.amount)}</div>
                </div>
                <div className="rec-card-name">{partyName(r)}</div>
                <div className="rec-card-meta">
                  <span>{bankNames[r.bank_account_id] || "--"}</span>
                  <span>{r.party_type === "customer" ? "Customer" : "Supplier"}</span>
                </div>
                {isReversed && r.reverse_reason && <div className="rec-card-meta"><span>Reversed: {r.reverse_reason}</span></div>}
                {!isReversed && (
                  <div className="rec-card-actions">
                    <ActionSlots overflow={rowOverflowActions(r)} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {target && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { if (!reversing) setTarget(null) }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, maxWidth: 440, width: "90%", boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Reverse Refund?</h3>
            <p style={{ fontSize: 13, color: "var(--text)", margin: "0 0 10px 0", lineHeight: 1.5 }}>
              You are about to reverse refund <strong>{target.refund_no}</strong> for <strong>{partyName(target)}</strong> of <strong>PKR {fmtMoney(target.amount)}</strong>.
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px 0", lineHeight: 1.5 }}>
              A reversing journal entry will be posted and the advance becomes available again. The original entry is kept for audit.
            </p>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Reversal date</label>
            <input type="date" className="search-input" style={{ paddingLeft: 12, marginBottom: 10, height: 40 }} value={revDate} onChange={e => setRevDate(e.target.value)} />
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Reason (required)</label>
            <input className="search-input" style={{ paddingLeft: 12, height: 40 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this refund being reversed?" />
            {modalError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{modalError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="oa-btn" onClick={() => setTarget(null)} disabled={reversing}>Cancel</button>
              <button className="oa-btn oa-btn-primary" onClick={confirmReverse} disabled={reversing}>{reversing ? "Reversing..." : "Reverse Refund"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
