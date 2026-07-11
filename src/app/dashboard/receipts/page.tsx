"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Search, ArrowUpDown, ArrowUp, ArrowDown, Undo2 } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

type SortField = "receipt_no" | "date" | "customer" | "amount" | "method"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 70, 40, 50, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`, height: 12,
            background: "var(--bg-soft)", borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function ReceiptsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [companyId, setCompanyId] = useState("")
  const [customerMap, setCustomerMap] = useState<Record<number, { name: string; phone: string; country_code?: string }>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase
      .from("customers")
      .select("id, name, phone, country_code")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => {
        if (data) {
          const map: Record<number, { name: string; phone: string; country_code?: string }> = {}
          data.forEach((c: any) => { map[c.id] = { name: c.name || "", phone: c.phone || "", country_code: c.country_code } })
          setCustomerMap(map)
        }
      })
  }, [companyId])

  useEffect(() => {
    if (!role) return
    if (!canView || !companyId) { setLoading(false); return }
    setLoading(true)
    supabase
      .from("receipts")
      .select("*")
      .eq("company_id", companyId)
      .order(sortField === "customer" ? "party_id" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setReceipts(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir])

  const filtered = receipts.filter((rec) => {
    if (!search.trim()) return true
    const custName = (customerMap[rec.party_id]?.name || "").toLowerCase()
    return rec.receipt_no?.toLowerCase().includes(search.toLowerCase()) || custName.includes(search.toLowerCase())
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "customer") {
      valA = (customerMap[a.party_id]?.name || "").toLowerCase()
      valB = (customerMap[b.party_id]?.name || "").toLowerCase()
    } else if (sortField === "amount") {
      valA = Number(a.amount) || 0; valB = Number(b.amount) || 0
    } else {
      valA = String(a[sortField] ?? "").toLowerCase()
      valB = String(b[sortField] ?? "").toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalReceipts = sortedFiltered.length
  const totalAmount = sortedFiltered.filter(r => r.status !== 'reversed').reduce((s, r) => s + (r.amount || 0), 0)

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const handleReverse = async (receiptId: number) => {
    if (!window.confirm("Reverse this receipt? This will undo all its effects.")) return
    const { error } = await supabase.rpc('reverse_receipt_transaction', { p_receipt_id: receiptId, p_company_id: companyId })
    if (error) alert(error.message)
    else setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, status: 'reversed' } : r))
  }

  const sendWhatsApp = (rec: any) => {
    const cust = customerMap[rec.party_id]
    if (!cust?.phone) { alert("No phone number for this customer."); return }
    const code = (cust.country_code || "+92").replace(/\D/g, "")
    const phone = cust.phone.replace(/\D/g, "")
    const msg = `Dear ${cust.name}, your receipt ${rec.receipt_no} of PKR ${rec.amount?.toLocaleString()} has been recorded.`
    const link = getWhatsAppLink(phone, msg)
    if (link) window.open(link, "_blank")
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

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer { 0% { opacity: 0.4; } 50% { opacity: 0.8; } 100% { opacity: 0.4; } }
        .rec-table { width: 100%; border-collapse: collapse; }
        .rec-table tbody tr:last-child td { border-bottom: none; }
        .rec-table tbody tr:hover td { background: var(--card-hover); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1.5px solid var(--border); color: var(--text-muted); transition: all 0.2s; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-icon { background: transparent; border: 1.5px solid var(--border); color: var(--text-muted); padding: 5px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; line-height: 1; }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; background: var(--card); color: var(--text); outline: none; box-sizing: border-box; }
        .search-input:focus { border-color: var(--primary); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); }
        .table-scroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .rec-table { min-width: 700px; }
        .badge { padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; display: inline-block; }
        .badge-reversed { background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); }
        .badge-edited { background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); }
        @media (max-width: 480px) { .page-wrap { padding: 12px !important; } .summary-grid { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💰 Receipts</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Record customer payments" : "View receipts"}</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/receipts/new")}>
            <Plus size={16} /> New Receipt
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Receipts</div><div className="summary-value">{totalReceipts}</div></div>
        <div className="summary-item"><div className="summary-label">Total Amount (excl. reversed)</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {totalAmount.toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by receipt # or customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="rec-table">
            <colgroup>
              <col style={{ width: 130 }} /><col style={{ width: 100 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 110 }} /><col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh field="receipt_no">Receipt #</SortTh>
                <SortTh field="date">Date</SortTh>
                <SortTh field="customer" style={{ textAlign: "left" }}>Customer</SortTh>
                <SortTh field="amount" style={{ textAlign: "right" }}>Amount</SortTh>
                <SortTh field="method" style={{ textAlign: "center" }}>Method</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3,4,5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No receipts found.</td></tr>
              ) : (
                sortedFiltered.map((rec) => {
                  const cust = customerMap[rec.party_id]
                  const custName = rec.party_id ? (cust?.name || "—") : "🎁 Donation"
                  const isReversed = rec.status === 'reversed'
                  const isEdited = rec.status === 'edited'
                  return (
                    <tr key={rec.id} style={{ opacity: isReversed ? 0.6 : 1 }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>{rec.receipt_no}</span>
                        {isReversed && <span className="badge badge-reversed" style={{ marginLeft: 6 }}>Reversed</span>}
                        {isEdited && <span className="badge badge-edited" style={{ marginLeft: 6 }}>Edited</span>}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{rec.date}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{custName}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: isReversed ? "var(--text-muted)" : "#10B981", whiteSpace: "nowrap" }}>PKR {rec.amount?.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{rec.payment_method || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/receipts/${rec.id}`)} title="View"><Eye size={13} /></button>
                          {canEdit && !isReversed && (
                            <>
                              <button className="btn-icon" onClick={() => router.push(`/dashboard/receipts/new?id=${rec.id}`)} title="Edit"><Edit size={13} /></button>
                              <button className="btn-icon" onClick={() => handleReverse(rec.id)} style={{ color: "#F59E0B" }} title="Reverse"><Undo2 size={13} /></button>
                            </>
                          )}
                          {hasFeature("whatsapp_invoice") && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(rec)} title="Send via WhatsApp" style={{ color: "#25D366" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          )}
                          {isReversed && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Reversed</span>}
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
    </div>
  )
}