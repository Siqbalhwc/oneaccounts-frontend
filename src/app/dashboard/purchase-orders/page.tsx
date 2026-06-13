"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

type SortField = "po_no" | "date" | "supplier" | "total" | "status"
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

export default function PurchaseOrdersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  // Hide entire page if feature is disabled
  if (!hasFeature("purchase_orders")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Purchase Orders feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const [supplierMap, setSupplierMap] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!role || !canView) return
    supabase
      .from("suppliers")
      .select("id, name")
      .then(({ data }) => {
        if (data) {
          const map: Record<number, string> = {}
          data.forEach((s: any) => { map[s.id] = s.name })
          setSupplierMap(map)
        }
      })
  }, [role, canView])

  useEffect(() => {
    if (!role || !canView) return
    setLoading(true)
    supabase
      .from("purchase_orders")
      .select("*, items:purchase_order_items(total)")
      .order(sortField === "supplier" ? "supplier_id" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        if (data) {
          const enriched = data.map((po: any) => ({
            ...po,
            total: (po.items || []).reduce((sum: number, i: any) => sum + (i.total || 0), 0),
          }))
          setOrders(enriched)
        }
        setLoading(false)
      })
  }, [role, canView, sortField, sortDir])

  const filtered = search.trim()
    ? orders.filter(po => {
        const suppName = supplierMap[po.supplier_id] || ""
        return (
          po.po_no.toLowerCase().includes(search.toLowerCase()) ||
          suppName.toLowerCase().includes(search.toLowerCase())
        )
      })
    : orders

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "supplier") {
      valA = (supplierMap[a.supplier_id] || "").toLowerCase()
      valB = (supplierMap[b.supplier_id] || "").toLowerCase()
    } else if (sortField === "total") {
      valA = a.total || 0
      valB = b.total || 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalOrders = sortedFiltered.length
  const totalAmount = sortedFiltered.reduce((s, o) => s + (o.total || 0), 0)

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

  // Shared th/td styles (identical to invoice page)
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

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .po-table { width: 100%; border-collapse: collapse; }
        .po-table tbody tr:last-child td { border-bottom: none; }
        .po-table tbody tr:hover td { background: var(--card-hover); }
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
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .po-table { min-width: 700px; }

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📋 Purchase Orders</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{canEdit ? "Create and manage purchase orders" : "View orders"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/purchase-orders/new")}>
            <Plus size={16} /> New Order
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Orders</div><div className="summary-value">{totalOrders}</div></div>
        <div className="summary-item"><div className="summary-label">Total Amount</div><div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalAmount.toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by PO # or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="po-table">
            <colgroup>
              <col style={{ width: 130 }} /> {/* PO # */}
              <col style={{ width: 100 }} /> {/* Date */}
              <col />                         {/* Supplier – takes remaining space */}
              <col style={{ width: 120 }} /> {/* Total */}
              <col style={{ width: 85  }} /> {/* Status */}
              <col style={{ width: 80  }} /> {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <SortTh field="po_no">PO #</SortTh>
                <SortTh field="date">Date</SortTh>
                <SortTh field="supplier" style={{ textAlign: "left" }}>Supplier</SortTh>
                <SortTh field="total" style={{ textAlign: "right" }}>Total</SortTh>
                <SortTh field="status" style={{ textAlign: "center" }}>Status</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((po) => {
                  const suppName = supplierMap[po.supplier_id] || "—"
                  return (
                    <tr key={po.id}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>{po.po_no}</span>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{po.date}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {suppName}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                        PKR {(po.total || 0).toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, whiteSpace: "nowrap", color: po.status === "Approved" ? "#10B981" : po.status === "Draft" ? "#F59E0B" : "#EF4444" }}>
                        {po.status}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/purchase-orders/${po.id}`)} title="View order">
                            <Eye size={13} />
                          </button>
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