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

  // Sorting state
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
      .eq("company_id", companyId)          // ✅ company isolation
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) setAdjustments(data)
        setLoading(false)
      })
  }, [role, canView, companyId])

  // Sort handlers
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

  // Client‑side sorting
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
      <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          .adj-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
          .adj-header-row {
            display: grid;
            grid-template-columns: 120px 1fr 90px 120px 1fr 80px;
            column-gap: 8px;
            padding: 14px 24px;
            font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
            border-bottom: 1px solid var(--border);
            background: var(--card-hover);
          }
          .adj-data-row {
            display: grid;
            grid-template-columns: 120px 1fr 90px 120px 1fr 80px;
            column-gap: 8px;
            padding: 12px 24px;
            border-bottom: 1px solid var(--border);
            font-size: 13px; align-items: center;
            transition: background 0.15s;
          }
          .adj-data-row:hover { background: var(--card-hover); }
          .adj-data-row:last-child { border-bottom: none; }
          .sort-btn {
            background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
            display: inline-flex; align-items: center; gap: 4px; padding: 0;
            font-weight: 700; text-transform: uppercase; font-size: 10px;
            text-align: left;
          }
          .sort-btn:hover { color: var(--primary); }
          .btn {
            padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border);
            font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
            font-family: inherit;
          }
          .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
          .btn-outline:hover { background: var(--card-hover); }
          .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
          .btn-icon {
            background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
            padding: 6px; border-radius: 8px; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
          }
          .btn-icon:hover { background: var(--card-hover); }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
          @media (max-width: 768px) {
            .adj-header-row, .adj-data-row { grid-template-columns: 80px 1fr 60px 80px 1fr 60px; column-gap: 4px; }
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
            <button className="btn btn-primary" onClick={() => router.push("/dashboard/inventory/adjustments/new")}>
              <Plus size={16} /> New Adjustment
            </button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Total Adjustments</div>
            <div className="summary-value">{adjustments.length}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Net Quantity Change</div>
            <div className="summary-value" style={{ color: adjustments.reduce((s, a) => s + a.qty, 0) >= 0 ? "#10B981" : "#EF4444" }}>
              {adjustments.reduce((s, a) => s + a.qty, 0) > 0 ? "+" : ""}{adjustments.reduce((s, a) => s + a.qty, 0)}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading adjustments…</div>
        ) : adjustments.length === 0 ? (
          <div className="adj-card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No adjustments yet. {canEdit && 'Click "New Adjustment" to create one.'}
          </div>
        ) : (
          <div className="adj-card">
            <div className="adj-header-row">
              <button className="sort-btn" onClick={() => handleSort("product_code")}>Product Code {getSortIcon("product_code")}</button>
              <button className="sort-btn" onClick={() => handleSort("product_name")}>Product Name {getSortIcon("product_name")}</button>
              <button className="sort-btn" onClick={() => handleSort("qty")}>Quantity {getSortIcon("qty")}</button>
              <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
              <button className="sort-btn" onClick={() => handleSort("reason")}>Reason {getSortIcon("reason")}</button>
              <span></span>
            </div>
            {sortedAdjustments.map((adj) => (
              <div key={adj.id} className="adj-data-row">
                <span style={{ fontWeight: 600, color: "var(--primary)" }}>{adj.product?.code || "—"}</span>
                <span>{adj.product?.name || "—"}</span>
                <span style={{ color: adj.qty >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                  {adj.qty > 0 ? "+" : ""}{adj.qty}
                </span>
                <span>{new Date(adj.date).toLocaleDateString()}</span>
                <span style={{ color: "var(--text-muted)" }}>{adj.reason || "—"}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {canEdit && (
                    <>
                      <button
                        className="btn-icon"
                        onClick={() => router.push(`/dashboard/inventory/adjustments/new?id=${adj.id}`)}
                        title="Edit"
                      >
                        <Pencil size={14} />
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
                              .eq("company_id", companyId)   // ✅ isolation on delete
                            setAdjustments(prev => prev.filter(a => a.id !== adj.id))
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}