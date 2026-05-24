"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

type SortField = "po_no" | "date" | "supplier" | "total" | "status"
type SortDir = "asc" | "desc"

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

  // Supplier map for names
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

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .header-row {
          display: grid;
          grid-template-columns: 140px 100px 1fr 120px 120px 100px 60px;
          column-gap: 8px;
          padding: 14px 24px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }
        .data-row {
          display: grid;
          grid-template-columns: 140px 100px 1fr 120px 120px 100px 60px;
          column-gap: 8px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 13px; align-items: center;
          transition: background 0.15s;
        }
        .data-row:hover { background: var(--card-hover); }
        .data-row:last-child { border-bottom: none; }
        .btn {
          padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted);
        }
        .btn:hover { background: var(--card-hover); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          padding: 6px; border-radius: 8px; cursor: pointer;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .input {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none; box-sizing: border-box;
        }
        .input:focus { border-color: var(--primary); }
        .sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .sort-btn:hover { color: var(--primary); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        @media (max-width: 640px) {
          .header-row, .data-row { grid-template-columns: 100px 70px 1fr 80px 80px 70px 50px; padding: 10px 12px; }
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
        <div className="summary-item">
          <div className="summary-label">Total Orders</div>
          <div className="summary-value">{sortedFiltered.length}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Amount</div>
          <div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalAmount.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          placeholder="Search by PO # or supplier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading orders…</div>
      ) : sortedFiltered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No purchase orders found.
        </div>
      ) : (
        <div className="card">
          <div className="header-row">
            <button className="sort-btn" onClick={() => handleSort("po_no")}>PO # {getSortIcon("po_no")}</button>
            <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
            <button className="sort-btn" onClick={() => handleSort("supplier")}>Supplier {getSortIcon("supplier")}</button>
            <button className="sort-btn" onClick={() => handleSort("total")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Total {getSortIcon("total")}</button>
            <button className="sort-btn" onClick={() => handleSort("status")}>Status {getSortIcon("status")}</button>
            <span></span>
          </div>
          {sortedFiltered.map((po) => {
            const suppName = supplierMap[po.supplier_id] || "—"
            return (
              <div key={po.id} className="data-row">
                <span style={{ fontWeight: 600, color: "var(--primary)" }}>{po.po_no}</span>
                <span>{po.date}</span>
                <span>{suppName}</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>PKR {(po.total || 0).toLocaleString()}</span>
                <span style={{
                  fontWeight: 600,
                  color: po.status === "Approved" ? "#10B981" : po.status === "Draft" ? "#F59E0B" : "#EF4444"
                }}>{po.status}</span>
                <button className="btn-icon" onClick={() => router.push(`/dashboard/purchase-orders/${po.id}`)} title="View order">
                  <Eye size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}