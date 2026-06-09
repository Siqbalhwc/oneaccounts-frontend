"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, Settings } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

type SortField = "receipt_no" | "date" | "customer" | "amount" | "method" | "created_by"
type SortDir = "asc" | "desc"

const ALL_COLUMNS = [
  { key: "receipt_no", label: "Receipt #", default: true, width: "minmax(100px, 1fr)" },
  { key: "date", label: "Date", default: true, width: "minmax(90px, 1fr)" },
  { key: "customer", label: "Customer", default: true, width: "minmax(140px, 1.5fr)" },
  { key: "amount", label: "Amount", default: true, width: "minmax(100px, 1fr)" },
  { key: "method", label: "Method", default: true, width: "minmax(90px, 1fr)" },
  { key: "created_by", label: "Created / Edited By", default: true, width: "minmax(130px, 1.2fr)" },
  { key: "actions", label: "Actions", default: true, width: "minmax(140px, auto)" },
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

  const sendWhatsApp = (rec: any) => {
    const cust = customerMap[rec.party_id]
    if (!cust?.phone) {
      alert("No phone number for this customer.")
      return
    }
    const message = `Dear ${cust.name}, your receipt ${rec.receipt_no} for PKR ${rec.amount?.toLocaleString()} has been recorded.`
    const link = getWhatsAppLink(cust.phone, message)
    if (link) window.open(link, "_blank")
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this receipt? This will reverse all its accounting entries.")) return
    await fetch(`/api/receipts?id=${id}`, { method: "DELETE" })
    setReceipts(prev => prev.filter(r => r.id !== id))
  }

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Build grid template columns based on visible columns (fixed widths)
  const gridTemplateColumns = () => {
    return ALL_COLUMNS.filter(col => visibleColumns[col.key])
      .map(col => col.width)
      .join(" ")
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow-x: auto; }
        .rec-table { width: 100%; }
        .header-row, .data-row {
          display: grid;
          grid-template-columns: ${gridTemplateColumns()};
          column-gap: 12px;
          padding: 12px 20px;
          align-items: center;
        }
        .header-row {
          background: var(--card);
          border-bottom: 1px solid var(--border);
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          padding: 14px 20px;
        }
        .data-row {
          border-bottom: 1px solid var(--border);
          font-size: 13px;
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
          display: inline-flex; align-items: center; justify-content: center;
          margin: 0 2px;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .input {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none; box-sizing: border-box;
        }
        .input:focus { border-color: var(--primary); }
        .sort-btn {
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .sort-btn:hover { color: var(--primary); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .creator-editor-cell {
          display: flex;
          flex-direction: column;
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.3;
        }
        .actions-cell {
          display: flex;
          gap: 6px;
          flex-wrap: nowrap;
          justify-content: flex-end;
          align-items: center;
        }
        .header-actions {
          text-align: right;
          justify-self: end;
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
        @media (max-width: 768px) {
          .header-row, .data-row { padding: 10px 12px; column-gap: 8px; }
          .btn-icon { padding: 4px; }
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
            <button className="btn" onClick={() => router.push("/dashboard/receipts/new")}>
              <Plus size={16} /> New Receipt
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button className="btn" onClick={() => setShowColumnMenu(!showColumnMenu)}>
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
            className="input"
            placeholder="Search by receipt # or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading receipts…</div>
      ) : sortedFiltered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No receipts found.
        </div>
      ) : (
        <div className="card">
          <div className="header-row">
            {visibleColumns.receipt_no && <button className="sort-btn" onClick={() => handleSort("receipt_no")}>Receipt # {getSortIcon("receipt_no")}</button>}
            {visibleColumns.date && <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>}
            {visibleColumns.customer && <button className="sort-btn" onClick={() => handleSort("customer")}>Customer {getSortIcon("customer")}</button>}
            {visibleColumns.amount && <button className="sort-btn" onClick={() => handleSort("amount")} style={{ justifyContent: "flex-end" }}>Amount {getSortIcon("amount")}</button>}
            {visibleColumns.method && <button className="sort-btn" onClick={() => handleSort("method")} style={{ justifyContent: "center" }}>Method {getSortIcon("method")}</button>}
            {visibleColumns.created_by && <button className="sort-btn" onClick={() => handleSort("created_by")} style={{ justifyContent: "center" }}>Created / Edited By {getSortIcon("created_by")}</button>}
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
                {visibleColumns.amount && <span style={{ fontWeight: 600, color: "#10B981", textAlign: "right", display: "block" }}>PKR {rec.amount?.toLocaleString()}</span>}
                {visibleColumns.method && <span style={{ textAlign: "center", display: "block" }}>{rec.payment_method || "—"}</span>}
                {visibleColumns.created_by && (
                  <div className="creator-editor-cell">
                    <span>Created: {rec.created_by || "—"}</span>
                    <span>Edited: {rec.updated_by || "—"}</span>
                  </div>
                )}
                {visibleColumns.actions && (
                  <div className="actions-cell">
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
                    {hasFeature("whatsapp_invoice") && (
                      <button className="btn-icon" onClick={() => sendWhatsApp(rec)} title="Send via WhatsApp" style={{ color: "#25D366" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
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