"use client"

import { useState, useEffect, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, Settings } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

type SortField = "receipt_no" | "date" | "customer" | "amount" | "method" | "created_by"
type SortDir = "asc" | "desc"

// ─── Column definitions ────────────────────────────────────────────────────────
// Using fixed px for predictable columns + 1fr only on customer (the natural "wide" column).
// Actions is always 100px fixed so it never gets squeezed or overlapped.
const ALL_COLUMNS = [
  { key: "receipt_no", label: "Receipt #",           flex: "130px",  default: true },
  { key: "date",       label: "Date",                flex: "110px",  default: true },
  { key: "customer",   label: "Customer",            flex: "1fr",    default: true },
  { key: "amount",     label: "Amount",              flex: "130px",  default: true },
  { key: "method",     label: "Method",              flex: "120px",  default: true },
  { key: "created_by", label: "Created / Edited By", flex: "190px",  default: true },
  { key: "actions",    label: "Actions",             flex: "100px",  default: true },
]

// ─── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow({ gridTemplate }: { gridTemplate: string }) {
  const blocks = [60, 70, 80, 50, 60, 80, 80]
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: gridTemplate,
      columnGap: 4,   // reduced from 12
      padding: "10px 12px",  // reduced from 14px 24px
      borderBottom: "1px solid var(--border)",
      alignItems: "center",
    }}>
      {blocks.map((w, i) => (
        <div key={i} style={{
          width: `${w}%`, height: 12, borderRadius: 4,
          background: "var(--bg-soft)",
          animation: "shimmer 1.5s ease-in-out infinite",
        }} />
      ))}
    </div>
  )
}

// ─── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
  return dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />
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

  const [receipts, setReceipts]     = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState("")
  const [sortField, setSortField]   = useState<SortField>("date")
  const [sortDir, setSortDir]       = useState<SortDir>("desc")
  const [companyId, setCompanyId]   = useState("")
  const [customerMap, setCustomerMap] = useState<Record<number, { name: string; phone: string }>>({})
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("receipts_visible_columns")
      if (saved) {
        try { return JSON.parse(saved) } catch { /* ignore */ }
      }
    }
    return Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.default]))
  })

  // Persist column visibility
  useEffect(() => {
    localStorage.setItem("receipts_visible_columns", JSON.stringify(visibleColumns))
  }, [visibleColumns])

  // ── Compute grid template from visible columns ──
  const gridTemplate = ALL_COLUMNS
    .filter(c => visibleColumns[c.key] !== false)
    .map(c => c.flex)
    .join(" ")

  // ── Fetch company id ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── Fetch customers ──
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
          data.forEach((c: any) => { map[c.id] = { name: c.name || "", phone: c.phone || "" } })
          setCustomerMap(map)
        }
      })
  }, [companyId])

  // ── Fetch receipts ──
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

  // ── Filter & sort client-side ──
  const sortedFiltered = [...receipts]
    .filter(rec => {
      if (!search.trim()) return true
      const custName = (customerMap[rec.party_id]?.name || "").toLowerCase()
      return (
        rec.receipt_no?.toLowerCase().includes(search.toLowerCase()) ||
        custName.includes(search.toLowerCase())
      )
    })
    .sort((a, b) => {
      let valA: any, valB: any
      if (sortField === "customer") {
        valA = (customerMap[a.party_id]?.name || "").toLowerCase()
        valB = (customerMap[b.party_id]?.name || "").toLowerCase()
      } else if (sortField === "amount") {
        valA = Number(a.amount) || 0
        valB = Number(b.amount) || 0
      } else {
        valA = String(a[sortField] ?? "").toLowerCase()
        valB = String(b[sortField] ?? "").toLowerCase()
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })

  const totalAmount = sortedFiltered.reduce((s, r) => s + (r.amount || 0), 0)

  const handleSort = (field: SortField) => {
    setSortField(field)
    setSortDir(prev => sortField === field ? (prev === "asc" ? "desc" : "asc") : "asc")
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this receipt? This will reverse all its accounting entries.")) return
    await fetch(`/api/receipts?id=${id}`, { method: "DELETE" })
    setReceipts(prev => prev.filter(r => r.id !== id))
  }

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Shared row style (always computed from current gridTemplate) ──
  const rowStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    display: "grid",
    gridTemplateColumns: gridTemplate,
    columnGap: 4,   // <--- reduced from 12 to 8
    alignItems: "center",
    ...extra,
  })

  if (!role) return (
    <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  )
  if (!canView) return (
    <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>
  )

  return (
    <div style={{
      padding: "24px 24px 48px",
      background: "var(--bg)",
      minHeight: "100vh",
      fontFamily: "'Inter', sans-serif",
      color: "var(--text)",
    }}>
      <style>{`
        @keyframes shimmer {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 0.8; }
        }
        .rec-row:hover { background: var(--card-hover); }
        .sort-btn {
          background: none; border: none; cursor: pointer;
          font: 700 10px/1 'Inter', sans-serif;
          text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-muted); display: inline-flex;
          align-items: center; gap: 4px; padding: 0;
          white-space: nowrap;
        }
        .sort-btn:hover { color: var(--primary); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 7px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; transition: background 0.15s;
          flex-shrink: 0;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px; width: 280px; max-width: 100%;
          box-sizing: border-box; outline: none; font-family: inherit;
          background: var(--card); color: var(--text);
        }
        .search-input:focus { border-color: var(--primary); }
        .column-menu {
          position: absolute; right: 0; top: calc(100% + 4px);
          background: var(--card); border: 1px solid var(--border);
          border-radius: 10px; padding: 6px; z-index: 200;
          min-width: 180px; box-shadow: 0 6px 20px rgba(0,0,0,0.18);
        }
        .col-menu-item {
          display: flex; align-items: center; gap: 4px;
          padding: 7px 10px; border-radius: 6px; cursor: pointer;
          font-size: 13px; white-space: nowrap; color: var(--text);
        }
        .col-menu-item:hover { background: var(--card-hover); }
        @media (max-width: 640px) {
          .search-input { width: 100%; }
          .page-header { flex-direction: column; align-items: flex-start !important; }
          .header-actions-group { width: 100%; justify-content: flex-end; }
        }
      `}</style>

      {/* ── Page Header ── */}
      <div className="page-header" style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 20,
        flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            💰 Receipts
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {canEdit ? "Record customer payments" : "View receipts"}
          </p>
        </div>

        <div className="header-actions-group" style={{ display: "flex", gap: 10 }}>
          {canEdit && (
            <button
              onClick={() => router.push("/dashboard/receipts/new")}
              style={{
                height: 38, padding: "0 14px", borderRadius: 8,
                fontWeight: 600, fontSize: 13, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", color: "var(--text-muted)",
                border: "1.5px solid var(--border)",
              }}
            >
              <Plus size={15} /> New Receipt
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowColumnMenu(v => !v)}
              style={{
                height: 38, padding: "0 14px", borderRadius: 8,
                fontWeight: 600, fontSize: 13, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", color: "var(--text-muted)",
                border: "1.5px solid var(--border)",
              }}
            >
              <Settings size={15} /> Columns
            </button>
            {showColumnMenu && (
              <>
                {/* Backdrop */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 199 }}
                  onClick={() => setShowColumnMenu(false)}
                />
                <div className="column-menu">
                  {ALL_COLUMNS.map(col => (
                    <label key={col.key} className="col-menu-item">
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.key] ?? col.default}
                        onChange={() => toggleColumn(col.key)}
                        style={{ accentColor: "var(--primary)" }}
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        {[
          { label: "Total Receipts", value: String(sortedFiltered.length), color: "var(--text)" },
          { label: "Total Amount",   value: `PKR ${totalAmount.toLocaleString()}`, color: "#10B981" },
        ].map(card => (
          <div key={card.label} style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "16px 20px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Search Bar ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
          <Search size={15} style={{
            position: "absolute", left: 11, top: "50%",
            transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none",
          }} />
          <input
            className="search-input"
            placeholder="Search by receipt # or customer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={rowStyle({
            padding: "10px 12px",   // reduced
            background: "var(--card-hover)",
            borderBottom: "1px solid var(--border)",
          })}>
            {ALL_COLUMNS.filter(c => visibleColumns[c.key] !== false).map(col => (
              <span key={col.key} style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.04em", color: "var(--text-muted)",
              }}>
                {col.label}
              </span>
            ))}
          </div>
          {[1,2,3,4,5].map(i => <SkeletonRow key={i} gridTemplate={gridTemplate} />)}
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "48px 24px",
          textAlign: "center", color: "var(--text-muted)", fontSize: 14,
        }}>
          No receipts found.
        </div>
      ) : (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, overflowX: "auto",
        }}>
          {/* min-width forces horizontal scroll before columns ever compress */}
          <div style={{ minWidth: 860 }}>
          {/* ── Header Row ── */}
          <div style={rowStyle({
            padding: "10px 12px",
            background: "var(--card-hover)",
            borderBottom: "1px solid var(--border)",
          })}>
            {visibleColumns.receipt_no && (
              <button className="sort-btn" onClick={() => handleSort("receipt_no")}>
                Receipt # <SortIcon field="receipt_no" active={sortField === "receipt_no"} dir={sortDir} />
              </button>
            )}
            {visibleColumns.date && (
              <button className="sort-btn" onClick={() => handleSort("date")}>
                Date <SortIcon field="date" active={sortField === "date"} dir={sortDir} />
              </button>
            )}
            {visibleColumns.customer && (
              <button className="sort-btn" onClick={() => handleSort("customer")}>
                Customer <SortIcon field="customer" active={sortField === "customer"} dir={sortDir} />
              </button>
            )}
            {visibleColumns.amount && (
              <button className="sort-btn" onClick={() => handleSort("amount")} style={{ justifyContent: "flex-end", width: "100%" }}>
                Amount <SortIcon field="amount" active={sortField === "amount"} dir={sortDir} />
              </button>
            )}
            {visibleColumns.method && (
              <button className="sort-btn" onClick={() => handleSort("method")} style={{ justifyContent: "center", width: "100%" }}>
                Method <SortIcon field="method" active={sortField === "method"} dir={sortDir} />
              </button>
            )}
            {visibleColumns.created_by && (
              <button className="sort-btn" onClick={() => handleSort("created_by")}>
                Created / Edited By <SortIcon field="created_by" active={sortField === "created_by"} dir={sortDir} />
              </button>
            )}
            {visibleColumns.actions && (
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.04em", color: "var(--text-muted)",
                textAlign: "right", display: "block",
              }}>
                Actions
              </span>
            )}
          </div>

          {/* ── Data Rows ── */}
          {sortedFiltered.map((rec, idx) => {
            const cust    = customerMap[rec.party_id]
            const custName = rec.party_id ? (cust?.name || "—") : "🎁 Donation"
            const isLast   = idx === sortedFiltered.length - 1

            return (
              <div
                key={rec.id}
                className="rec-row"
                style={rowStyle({
                  padding: "10px 12px",
                  borderBottom: isLast ? "none" : "1px solid var(--border)",
                  fontSize: 13,
                  transition: "background 0.15s",
                  cursor: "default",
                })}
              >
                {visibleColumns.receipt_no && (
                  <span style={{ fontWeight: 600, color: "var(--primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rec.receipt_no}
                  </span>
                )}
                {visibleColumns.date && (
                  <span style={{ color: "var(--text)", whiteSpace: "nowrap" }}>
                    {rec.date}
                  </span>
                )}
                {visibleColumns.customer && (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {custName}
                  </span>
                )}
                {visibleColumns.amount && (
                  <span style={{ textAlign: "right", fontWeight: 600, color: "#10B981", whiteSpace: "nowrap" }}>
                    PKR {rec.amount?.toLocaleString()}
                  </span>
                )}
                {visibleColumns.method && (
                  <span style={{ textAlign: "center", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {rec.payment_method || "—"}
                  </span>
                )}
                {visibleColumns.created_by && (
                  <div style={{ display: "flex", flexDirection: "column", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Created: {rec.created_by || "—"}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Edited: {rec.updated_by || "—"}
                    </span>
                  </div>
                )}
                {visibleColumns.actions && (
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    <button
                      className="btn-icon"
                      onClick={() => router.push(`/dashboard/receipts/${rec.id}`)}
                      title="View receipt"
                    >
                      <Eye size={14} />
                    </button>
                    {canEdit && (
                      <button
                        className="btn-icon"
                        onClick={() => router.push(`/dashboard/receipts/new?id=${rec.id}`)}
                        title="Edit receipt"
                      >
                        <Edit size={14} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        className="btn-icon"
                        onClick={() => handleDelete(rec.id)}
                        style={{ color: "#EF4444", borderColor: "#EF444440" }}
                        title="Delete receipt"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          </div>{/* end min-width inner wrapper */}
        </div>
      )}
    </div>
  )
}