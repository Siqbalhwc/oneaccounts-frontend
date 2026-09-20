"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, Search, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeft } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

type SortField = "invoice_no" | "date" | "supplier" | "total" | "reference"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 999, 40, 50, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: w === 999 ? "70%" : w,
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

export default function PurchaseReturnsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [returns, setReturns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [companyId, setCompanyId] = useState("")
  const [supplierMap, setSupplierMap] = useState<Record<number, { name: string }>>({})

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
      .select("id, name")
      .eq("company_id", companyId)
      .then(({ data }) => {
        if (data) {
          const map: Record<number, { name: string }> = {}
          data.forEach((s: any) => { map[s.id] = { name: s.name || "" } })
          setSupplierMap(map)
        }
      })
  }, [companyId])

  useEffect(() => {
    if (!role) return
    if (!canView || !companyId) { setLoading(false); return }
    setLoading(true)
    supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("type", "purchase_return")
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setReturns(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId])

  const filtered = returns.filter((ret) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const supName = supplierMap[ret.party_id]?.name || ""
    return (
      ret.invoice_no?.toLowerCase().includes(q) ||
      supName.toLowerCase().includes(q) ||
      (ret.reference || "").toLowerCase().includes(q)
    )
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "supplier") {
      valA = (supplierMap[a.party_id]?.name || "").toLowerCase()
      valB = (supplierMap[b.party_id]?.name || "").toLowerCase()
    } else if (sortField === "total") {
      valA = Number(a.total) || 0
      valB = Number(b.total) || 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
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
  const sortBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit",
    display: "inline-flex", alignItems: "center", gap: 4,
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .pr-table { width: 100%; border-collapse: collapse; }
        .pr-table tbody tr:last-child td { border-bottom: none; }
        .pr-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .input:focus { border-color: var(--primary); }
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
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .pr-table { min-width: 700px; }
        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-icon" onClick={() => router.push("/dashboard/bills")} title="Back to Purchase Bills" style={{ padding: 8 }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>↩️ Purchase Returns</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              To return a bill, open it from Purchase Bills and use Return
            </p>
          </div>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Returns</div><div className="summary-value">{filtered.length}</div></div>
        <div className="summary-item"><div className="summary-label">Total Amount</div><div className="summary-value" style={{ color: "#F59E0B" }}>PKR {filtered.reduce((s, i) => s + (i.total || 0), 0).toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="input" placeholder="Search return #, bill # or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="pr-table">
            <colgroup>
              <col style={{ width: 150 }} />
              <col style={{ width: 100 }} />
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}><button onClick={() => handleSort("invoice_no")} style={sortBtn}>Return # {getSortIcon("invoice_no")}</button></th>
                <th style={thStyle}><button onClick={() => handleSort("date")} style={sortBtn}>Date {getSortIcon("date")}</button></th>
                <th style={thStyle}><button onClick={() => handleSort("supplier")} style={sortBtn}>Supplier {getSortIcon("supplier")}</button></th>
                <th style={thStyle}><button onClick={() => handleSort("reference")} style={sortBtn}>Original Bill {getSortIcon("reference")}</button></th>
                <th style={{ ...thStyle, textAlign: "right" }}>
                  <button onClick={() => handleSort("total")} style={{ ...sortBtn, justifyContent: "flex-end", width: "100%" }}>Total {getSortIcon("total")}</button>
                </th>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No purchase returns found.
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((ret) => (
                  <tr key={ret.id}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: "var(--primary)" }}>{ret.invoice_no}</span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{ret.date}</td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {supplierMap[ret.party_id]?.name || "—"}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {ret.original_invoice_id ? (
                        <a href={`/dashboard/bills/${ret.original_invoice_id}`} style={{ color: "var(--primary)" }}>{ret.reference || `Bill #${ret.original_invoice_id}`}</a>
                      ) : (ret.reference || "—")}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>PKR {ret.total?.toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button className="btn-icon" onClick={() => router.push(`/dashboard/purchase-returns/${ret.id}`)} title="View">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
