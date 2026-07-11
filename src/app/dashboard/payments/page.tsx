"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Search, ArrowUpDown, ArrowUp, ArrowDown, Undo2 } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

type SortField = "payment_no" | "payment_date" | "supplier" | "amount" | "payment_method"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 70, 40, 50, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function PaymentsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("payment_date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [companyId, setCompanyId] = useState("")

  const [supplierMap, setSupplierMap] = useState<Record<number, { name: string; phone: string }>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("company_id", companyId)
      .then(({ data }) => {
        if (data) {
          const map: Record<number, { name: string; phone: string }> = {}
          data.forEach((s: any) => {
            map[s.id] = { name: s.name || "", phone: s.phone || "" }
          })
          setSupplierMap(map)
        }
      })
  }, [companyId])

  useEffect(() => {
    if (!role) return
    if (!canView || !companyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from("payments")
      .select("*")
      .eq("company_id", companyId)
      .order(sortField === "supplier" ? "party_id" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setPayments(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir])

  const filtered = search.trim()
    ? payments.filter((pay) => {
        const supp = supplierMap[pay.party_id]
        const suppName = supp?.name || ""
        return (
          pay.payment_no?.toLowerCase().includes(search.toLowerCase()) ||
          suppName.toLowerCase().includes(search.toLowerCase()) ||
          (pay.reference || "").toLowerCase().includes(search.toLowerCase())
        )
      })
    : payments

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "supplier") {
      valA = (supplierMap[a.party_id]?.name || "").toLowerCase()
      valB = (supplierMap[b.party_id]?.name || "").toLowerCase()
    } else if (sortField === "amount") {
      valA = Number(a.amount) || 0
      valB = Number(b.amount) || 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalPayments = sortedFiltered.length
  const totalAmount = sortedFiltered
    .filter(p => p.status !== 'reversed')
    .reduce((s, p) => s + (p.amount || 0), 0)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const handleReverse = async (paymentId: number) => {
    if (!window.confirm("Reverse this payment? This will undo all its effects.")) return
    const { error } = await supabase.rpc('reverse_vendor_payment', {
      p_payment_id: paymentId,
      p_company_id: companyId,
    })
    if (error) {
      alert(error.message)
    } else {
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'reversed' } : p))
    }
  }

  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .pay-table { width: 100%; border-collapse: collapse; }
        .pay-table tbody tr:last-child td { border-bottom: none; }
        .pay-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          transition: all 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary {
          background: var(--primary); color: var(--primary-text); border-color: var(--primary);
        }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .table-scroll {
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .pay-table { min-width: 700px; }
        .badge {
          padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600;
          display: inline-block;
        }
        .badge-reversed { background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); }
        .badge-edited { background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); }

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💳 Payments</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{canEdit ? "Record supplier payments" : "View payments"}</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/payments/new")}>
            <Plus size={16} /> New Payment
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Payments</div><div className="summary-value">{totalPayments}</div></div>
        <div className="summary-item"><div className="summary-label">Total Amount (excl. reversed)</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {totalAmount.toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by payment # or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="pay-table">
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: 100 }} />
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh field="payment_no">Payment #</SortTh>
                <SortTh field="payment_date">Date</SortTh>
                <SortTh field="supplier" style={{ textAlign: "left" }}>Supplier</SortTh>
                <SortTh field="amount" style={{ textAlign: "right" }}>Amount</SortTh>
                <SortTh field="payment_method" style={{ textAlign: "center" }}>Method</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No payments found.
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((pay) => {
                  const supp = supplierMap[pay.party_id]
                  const suppName = supp?.name || "-"
                  const isReversed = pay.status === 'reversed'
                  const isEdited = pay.status === 'edited'
                  return (
                    <tr key={pay.id} style={{ opacity: isReversed ? 0.6 : 1 }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>{pay.payment_no}</span>
                        {isReversed && <span className="badge badge-reversed" style={{ marginLeft: 6 }}>Reversed</span>}
                        {isEdited && <span className="badge badge-edited" style={{ marginLeft: 6 }}>Edited</span>}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{pay.payment_date}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {suppName}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: isReversed ? "var(--text-muted)" : "#10B981", whiteSpace: "nowrap" }}>
                        PKR {pay.amount?.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{pay.payment_method || "-"}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/payments/${pay.id}`)} title="View"><Eye size={13} /></button>
                          {canEdit && !isReversed && (
                            <>
                              <button className="btn-icon" onClick={() => router.push(`/dashboard/payments/new?id=${pay.id}`)} title="Edit"><Edit size={13} /></button>
                              <button className="btn-icon" onClick={() => handleReverse(pay.id)} style={{ color: "#F59E0B" }} title="Reverse"><Undo2 size={13} /></button>
                            </>
                          )}
                          {isReversed && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Reversed</span>
                          )}
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