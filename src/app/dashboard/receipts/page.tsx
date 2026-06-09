"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, Settings } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

type SortField = "receipt_no" | "date" | "customer" | "amount" | "method" | "created_by"
type SortDir = "asc" | "desc"

// Skeleton row component (same as customers page)
function SkeletonRow() {
  return (
    <div className="data-row skeleton-row">
      <div className="skeleton-block" style={{ width: "60%", height: 12 }} />
      <div className="skeleton-block" style={{ width: "70%", height: 12 }} />
      <div className="skeleton-block" style={{ width: "80%", height: 12 }} />
      <div className="skeleton-block" style={{ width: "50%", height: 12 }} />
      <div className="skeleton-block" style={{ width: "60%", height: 12 }} />
      <div className="skeleton-block" style={{ width: "80%", height: 12 }} />
      <div className="skeleton-block" style={{ width: 24, height: 24, borderRadius: 4 }} />
      <div className="skeleton-block" style={{ width: 24, height: 24, borderRadius: 4 }} />
      <div className="skeleton-block" style={{ width: 24, height: 24, borderRadius: 4 }} />
    </div>
  )
}

const ALL_COLUMNS = [
  { key: "receipt_no", label: "Receipt #", default: true },
  { key: "date", label: "Date", default: true },
  { key: "customer", label: "Customer", default: true },
  { key: "amount", label: "Amount", default: true },
  { key: "method", label: "Method", default: true },
  { key: "created_by", label: "Created / Edited By", default: true },
  { key: "actions", label: "Actions", default: true },
]

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
  const [customerMap, setCustomerMap] = useState<Record<number, { name: string; phone: string }>>({})
  
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("receipts_visible_columns")
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) { /* ignore */ }
    }
    const defaults: Record<string, boolean> = {}
    ALL_COLUMNS.forEach(col => { defaults[col.key] = col.default })
    return defaults
  })
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  useEffect(() => {
    localStorage.setItem("receipts_visible_columns", JSON.stringify(visibleColumns))
  }, [visibleColumns])

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
      .select("id, name, phone")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => {
        if (data) {
          const map: Record<number, { name: string; phone: string }> = {}
          data.forEach((c: any) => {
            map[c.id] = { name: c.name || "", phone: c.phone || "" }
          })
          setCustomerMap(map)
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
      .from("receipts")
      .select("*")
      .eq("company_id", companyId)
      .order(sortField === "customer" ? "party_id" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setReceipts(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir])

  const filtered = search.trim()
    ? receipts.filter((rec) => {
        const cust = customerMap[rec.party_id]
        const custName = cust?.name || ""
        return (
          rec.receipt_no?.toLowerCase().includes(search.toLowerCase()) ||
          custName.toLowerCase().includes(search.toLowerCase())
        )
      })
    : receipts

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "customer") {
      valA = (customerMap[a.party_id]?.name || "").toLowerCase()
      valB = (customerMap[b.party_id]?.name || "").toLowerCase()
    } else if (sortField === "created_by") {
      valA = (a.created_by || "").toLowerCase()
      valB = (b.created_by || "").toLowerCase()
    } else {
      valA = a[sortField] ?? ""
      valB = b[sortField] ?? ""
      if (sortField === "amount") {
        valA = Number(valA) || 0
        valB = Number(valB) || 0
      } else {
        valA = String(valA).toLowerCase()
        valB = String(valB).toLowerCase()
      }
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalReceipts = sortedFiltered.length
  const totalAmount = sortedFiltered.reduce((s, r) => s + (r.amount || 0), 0)

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

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this receipt? This will reverse all its accounting entries.")) return
    await fetch(`/api/receipts?id=${id}`, { method: "DELETE" })
    setReceipts(prev => prev.filter(r => r.id !== id))
  }

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Build grid template columns based on visible columns (same pattern as customers page)
  const getGridTemplate = () => {
    const cols = []
    if (visibleColumns.receipt_no) cols.push("minmax(100px, 1fr)")
    if (visibleColumns.date) cols.push("minmax(90px, 1fr)")
    if (visibleColumns.customer) cols.push("minmax(140px, 1.5fr)")
    if (visibleColumns.amount) cols.push("minmax(100px, 1fr)")
    if (visibleColumns.method) cols.push("minmax(90px, 1fr)")
    if (visibleColumns.created_by) cols.push("minmax(150px, 1.2fr)")
    if (visibleColumns.actions) cols.push("minmax(120px, auto)")
    return cols.join(" ")
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow-x: auto; }
        .rec-table { width: 100%; }
        .header-row {
          display: grid;
          grid-template-columns: ${getGridTemplate()};
          column-gap: 12px;
          padding: 14px 24px;
          background: var(--card-hover);
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .data-row {
          display: grid;
          grid-template-columns: ${getGridTemplate()};
          column-gap: 12px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          align-items: center;
          transition: background 0.15s;
        }
        .data-row:hover { background: var(--card-hover); }
        .data-row:last-child { border-bottom: none; }
        .skeleton-row .skeleton-block {
          background: var(--bg-soft);
          border-radius: 4px;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { opacity: 0.4; }
          50% { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .sort-btn:hover { color: var(--primary); }
        .search-input {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px; width: 260px;
          box-sizing: border-box; outline: none; font-family: inherit;
          background: var(--card); color: var(--text);
        }
        .search-input:focus { border-color: var(--primary); }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          transition: all 0.2s;
        }
        .btn-outline {
          background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
        }
        .btn-outline:hover { background: var(--card-hover); }
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
        .creator-editor-cell {
          display: flex;
          flex-direction: column;
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.3;
          word-wrap: break-word;
        }
        .actions-cell {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .header-actions {
          text-align: right;
        }
        .column-menu {
          position: absolute;
          right: 0;
          top: 100%;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px;
          z-index: 100;
          min-width: 160px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .column-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          cursor: pointer;
          font-size: 13px;
          white-space: nowrap;
        }
        .column-menu-item:hover { background: var(--card-hover); }
        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        @media (max-width: 900px) {
          .header-row, .data-row {
            column-gap: 10px;
            padding: 10px 16px;
          }
        }
        @media (max-width: 640px) {
          .header-row, .data-row {
            column-gap: 6px;
            padding: 10px 12px;
            font-size: 11px;
          }
          .search-input { width: 100%; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💰 Receipts</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{canEdit ? "Record customer payments" : "View receipts"}</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {canEdit && (
            <button className="btn btn-outline" onClick={() => router.push("/dashboard/receipts/new")}>
              <Plus size={16} /> New Receipt
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button className="btn btn-outline" onClick={() => setShowColumnMenu(!showColumnMenu)}>
              <Settings size={16} /> Columns
            </button>
            {showColumnMenu && (
              <div className="column-menu">
                {ALL_COLUMNS.map(col => (
                  <label key={col.key} className="column-menu-item">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key] ?? col.default}
                      onChange={() => toggleColumn(col.key)}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Receipts</div>
          <div className="summary-value">{totalReceipts}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Amount</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalAmount.toLocaleString()}</div>
        </div>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="search-input"
            placeholder="Search by receipt # or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card rec-table">
          <div className="header-row">
            {visibleColumns.receipt_no && <span>Receipt #</span>}
            {visibleColumns.date && <span>Date</span>}
            {visibleColumns.customer && <span>Customer</span>}
            {visibleColumns.amount && <span style={{ textAlign: "right" }}>Amount</span>}
            {visibleColumns.method && <span style={{ textAlign: "center" }}>Method</span>}
            {visibleColumns.created_by && <span>Created / Edited By</span>}
            {visibleColumns.actions && <span style={{ textAlign: "right" }}>Actions</span>}
          </div>
          {[1,2,3,4,5].map(i => <SkeletonRow key={i} />)}
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No receipts found.
        </div>
      ) : (
        <div className="card rec-table">
          <div className="header-row">
            {visibleColumns.receipt_no && <button className="sort-btn" onClick={() => handleSort("receipt_no")}>Receipt # {getSortIcon("receipt_no")}</button>}
            {visibleColumns.date && <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>}
            {visibleColumns.customer && <button className="sort-btn" onClick={() => handleSort("customer")}>Customer {getSortIcon("customer")}</button>}
            {visibleColumns.amount && <button className="sort-btn" onClick={() => handleSort("amount")} style={{ justifyContent: "flex-end", width: "100%" }}>Amount {getSortIcon("amount")}</button>}
            {visibleColumns.method && <button className="sort-btn" onClick={() => handleSort("method")} style={{ justifyContent: "center", width: "100%" }}>Method {getSortIcon("method")}</button>}
            {visibleColumns.created_by && <button className="sort-btn" onClick={() => handleSort("created_by")}>Created / Edited By {getSortIcon("created_by")}</button>}
            {visibleColumns.actions && <div className="header-actions">Actions</div>}
          </div>
          {sortedFiltered.map((rec) => {
            const cust = customerMap[rec.party_id]
            const custName = rec.party_id ? (cust?.name || "—") : "🎁 Donation"
            return (
              <div key={rec.id} className="data-row">
                {visibleColumns.receipt_no && <span style={{ fontWeight: 600, color: "var(--primary)" }}>{rec.receipt_no}</span>}
                {visibleColumns.date && <span>{rec.date}</span>}
                {visibleColumns.customer && <span>{custName}</span>}
                {visibleColumns.amount && <span style={{ textAlign: "right", fontWeight: 600, color: "#10B981" }}>PKR {rec.amount?.toLocaleString()}</span>}
                {visibleColumns.method && <span style={{ textAlign: "center" }}>{rec.payment_method || "—"}</span>}
                {visibleColumns.created_by && (
                  <div className="creator-editor-cell">
                    <span>Created: {rec.created_by || "—"}</span>
                    <span>Edited: {rec.updated_by || "—"}</span>
                  </div>
                )}
                {visibleColumns.actions && (
                  <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                    <button className="btn-icon" onClick={() => router.push(`/dashboard/receipts/${rec.id}`)} title="View receipt">
                      <Eye size={14} />
                    </button>
                    {canEdit && (
                      <button className="btn-icon" onClick={() => router.push(`/dashboard/receipts/new?id=${rec.id}`)} title="Edit receipt">
                        <Edit size={14} />
                      </button>
                    )}
                    {canEdit && (
                      <button className="btn-icon" onClick={() => handleDelete(rec.id)} style={{ color: "#EF4444" }} title="Delete receipt">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}