"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Adjustment {
  id: number
  product_id: number
  qty: number
  date: string
  reason: string
  product?: { code: string; name: string }
}

type SortField = "product_code" | "product_name" | "qty" | "date" | "reason"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 70, 50, 60, 80, 80].map((w, i) => (
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

export default function InventoryAdjustmentsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")

  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!role || !companyId) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("stock_moves")
      .select("*, product:products(code, name)")
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) setAdjustments(data)
        setLoading(false)
      })
  }, [role, canView, companyId])

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

  const sortedAdjustments = [...adjustments].sort((a, b) => {
    let valA: any, valB: any
    switch (sortField) {
      case "product_code":
        valA = (a.product?.code || "").toLowerCase()
        valB = (b.product?.code || "").toLowerCase()
        break
      case "product_name":
        valA = (a.product?.name || "").toLowerCase()
        valB = (b.product?.name || "").toLowerCase()
        break
      case "qty":
        valA = a.qty || 0
        valB = b.qty || 0
        break
      case "date":
        valA = a.date || ""
        valB = b.date || ""
        break
      case "reason":
        valA = (a.reason || "").toLowerCase()
        valB = (b.reason || "").toLowerCase()
        break
      default:
        return 0
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalAdjustments = adjustments.length
  const netQuantityChange = adjustments.reduce((s, a) => s + a.qty, 0)

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
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
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
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          @keyframes shimmer {
            0%   { opacity: 0.4; }
            50%  { opacity: 0.8; }
            100% { opacity: 0.4; }
          }
          .adj-table { width: 100%; border-collapse: collapse; }
          .adj-table tbody tr:last-child td { border-bottom: none; }
          .adj-table tbody tr:hover td { background: var(--card-hover); }
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
          .adj-table { min-width: 700px; }

          @media (max-width: 480px) {
            .page-wrap { padding: 12px !important; }
            .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>⚖️ Inventory Adjustments</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              {canEdit ? "Adjust stock quantities – surplus (+) or shortage (−)" : "View adjustments"}
            </p>
          </div>
          {canEdit && (
            <button className="btn" onClick={() => router.push("/dashboard/inventory/adjustments/new")}>
              <Plus size={16} /> New Adjustment
            </button>
          )}
        </div>

        <div className="summary-grid">
          <div className="summary-item"><div className="summary-label">Total Adjustments</div><div className="summary-value">{totalAdjustments}</div></div>
          <div className="summary-item"><div className="summary-label">Net Quantity Change</div><div className="summary-value" style={{ color: netQuantityChange >= 0 ? "#10B981" : "#EF4444" }}>{netQuantityChange > 0 ? "+" : ""}{netQuantityChange}</div></div>
        </div>

        <div className="card">
          <div className="table-scroll">
            <table className="adj-table">
              <colgroup>
                <col style={{ width: 120 }} /> {/* Product Code */}
                <col />                         {/* Product Name */}
                <col style={{ width: 80 }} />   {/* Quantity */}
                <col style={{ width: 100 }} />  {/* Date */}
                <col />                         {/* Reason */}
                <col style={{ width: 80 }} />   {/* Actions */}
              </colgroup>
              <thead>
                <tr>
                  <SortTh field="product_code" style={{ textAlign: "left" }}>Product Code</SortTh>
                  <SortTh field="product_name" style={{ textAlign: "left" }}>Product Name</SortTh>
                  <SortTh field="qty" style={{ textAlign: "center" }}>Quantity</SortTh>
                  <SortTh field="date" style={{ textAlign: "center" }}>Date</SortTh>
                  <SortTh field="reason" style={{ textAlign: "left" }}>Reason</SortTh>
                  <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
                ) : adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                      No adjustments yet. {canEdit && 'Click "New Adjustment" to create one.'}
                    </td>
                  </tr>
                ) : (
                  sortedAdjustments.map((adj) => (
                    <tr key={adj.id}>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}><span style={{ fontWeight: 600, color: "var(--primary)" }}>{adj.product?.code || "—"}</span></td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{adj.product?.name || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap", color: adj.qty >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>{adj.qty > 0 ? "+" : ""}{adj.qty}</td>
                      <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{new Date(adj.date).toLocaleDateString()}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{adj.reason || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          {canEdit && (
                            <>
                              <button
                                className="btn-icon"
                                onClick={() => router.push(`/dashboard/inventory/adjustments/new?id=${adj.id}`)}
                                title="Edit"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                className="btn-icon"
                                style={{ color: "#EF4444" }}
                                onClick={async () => {
                                  if (confirm("Delete this adjustment?")) {
                                    await supabase
                                      .from("stock_moves")
                                      .delete()
                                      .eq("id", adj.id)
                                      .eq("company_id", companyId)
                                    setAdjustments(prev => prev.filter(a => a.id !== adj.id))
                                  }
                                }}
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
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
    </RoleGuard>
  )
}