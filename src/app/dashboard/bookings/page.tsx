"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, DollarSign, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

type SortField = "customer" | "product" | "total_price" | "balance_amount" | "status"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[70, 80, 60, 70, 60, 60].map((w, i) => (
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

export default function BookingsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("customer")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    if (!companyId) return

    setLoading(true)
    supabase
      .from("property_bookings")
      .select("id, total_price, balance_amount, status, booking_date, customers(id, name, phone), products(name, code), projects(name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setBookings(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId])

  const filtered = bookings.filter((b) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return b.customers?.name?.toLowerCase().includes(q) ||
           b.products?.name?.toLowerCase().includes(q) ||
           b.products?.code?.toLowerCase().includes(q) ||
           b.projects?.name?.toLowerCase().includes(q)
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "customer") { valA = (a.customers?.name || "").toLowerCase(); valB = (b.customers?.name || "").toLowerCase() }
    else if (sortField === "product") { valA = (a.products?.name || "").toLowerCase(); valB = (b.products?.name || "").toLowerCase() }
    else if (sortField === "status") { valA = a.status || ""; valB = b.status || "" }
    else { valA = Number(a[sortField]) || 0; valB = Number(b[sortField]) || 0 }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalBookings = sortedFiltered.length
  const activeBookings = sortedFiltered.filter(b => b.status === "active").length
  const totalOutstanding = sortedFiltered.filter(b => b.status === "active").reduce((s, b) => s + (b.balance_amount || 0), 0)

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      active: { label: "Active", color: "#3B82F6" },
      completed: { label: "Completed", color: "#10B981" },
      cancelled: { label: "Cancelled", color: "#EF4444" },
      defaulted: { label: "Defaulted", color: "#F59E0B" },
    }
    const s = map[status] || { label: status, color: "var(--text-muted)" }
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 10, background: `${s.color}22`, color: s.color, whiteSpace: "nowrap" }}>
        {s.label}
      </span>
    )
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
        .bkg-table { width: 100%; border-collapse: collapse; }
        .bkg-table tbody tr:last-child td { border-bottom: none; }
        .bkg-table tbody tr:hover td { background: var(--card-hover); }
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
        .btn-outline {
          background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
        }
        .btn-outline:hover {
          background: var(--card-hover);
          transform: translateY(-1px);
          box-shadow: none;
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
        .bkg-table { min-width: 750px; }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .header-row .title-area { flex: 1; }
        .header-row .actions { display: flex; gap: 8px; flex-wrap: wrap; }

        .search-section {
          margin-bottom: 16px;
          max-width: 320px;
          position: relative;
        }

        @media (max-width: 640px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: 1fr 1fr; }
          .header-row { flex-direction: column; align-items: stretch; }
          .header-row .title-area { margin-bottom: 8px; }
          .header-row .actions { width: 100%; justify-content: space-between; }
          .search-section { max-width: 100%; }
        }
      `}</style>

      <div className="header-row">
        <div className="title-area">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🏗️ Property Bookings</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Units and plots sold on installment plans</p>
        </div>
        <div className="actions">
          {canEdit && (
            <button className="btn btn-outline" onClick={() => router.push("/dashboard/bookings/record-payment")}>
              <DollarSign size={16} /> Record Payment
            </button>
          )}
          {canEdit && (
            <button className="btn" onClick={() => router.push("/dashboard/bookings/new")}>
              <Plus size={16} /> New Booking
            </button>
          )}
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Bookings</div><div className="summary-value">{totalBookings}</div></div>
        <div className="summary-item"><div className="summary-label">Active</div><div className="summary-value" style={{ color: "#3B82F6" }}>{activeBookings}</div></div>
        <div className="summary-item"><div className="summary-label">Outstanding Balance</div><div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalOutstanding.toLocaleString()}</div></div>
      </div>

      <div className="search-section">
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="input" placeholder="Search by customer, unit, or site..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="bkg-table">
            <colgroup>
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh field="customer" style={{ textAlign: "left" }}>Customer</SortTh>
                <th style={{ ...thStyle, textAlign: "left" }}>Unit / Plot</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Site</th>
                <SortTh field="total_price" style={{ textAlign: "right" }}>Total Price</SortTh>
                <SortTh field="balance_amount" style={{ textAlign: "right" }}>Balance</SortTh>
                <SortTh field="status" style={{ textAlign: "center" }}>Status</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No bookings found. {canEdit && "Create a booking to get started."}
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((b) => (
                  <tr key={b.id}>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.customers?.name || "-"}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{b.products?.name || "-"}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "var(--text-muted)" }}>{b.projects?.name || "-"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>PKR {(b.total_price || 0).toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: b.balance_amount > 0 ? "#F59E0B" : "#10B981" }}>
                      PKR {(b.balance_amount || 0).toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{statusBadge(b.status)}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        <button
                          className="btn-icon"
                          onClick={() => router.push(`/dashboard/bookings/record-payment?customer=${b.customers?.id}&booking=${b.id}`)}
                          title="Record Payment"
                          style={{ opacity: b.status === "active" ? 1 : 0.4, pointerEvents: b.status === "active" ? "auto" : "none" }}
                        >
                          <DollarSign size={13} />
                        </button>
                      </div>
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