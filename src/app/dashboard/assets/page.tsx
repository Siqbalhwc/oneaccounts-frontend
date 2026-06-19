"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Plus, Search, Download, Upload, Eye, ArrowUpDown, ArrowUp, ArrowDown,
  RefreshCw, X, CheckCircle, BookOpen
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import PremiumGuard from "@/components/PremiumGuard"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

type SortField = "asset_no" | "name" | "category" | "location" | "purchase_date" | "cost_price" | "depreciation_per_month" | "status"
type SortDir = "asc" | "desc"

// ── Skeleton Loading Row ──
function SkeletonRow() {
  return (
    <tr>
      {[60, 70, 50, 50, 60, 40, 40, 50, 30].map((w, i) => (
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

function AssetsContent() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sortField, setSortField] = useState<SortField>("asset_no")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [companyId, setCompanyId] = useState("")

  // Depreciation modal state
  const [showDepModal, setShowDepModal] = useState(false)
  const [activeAssetsForDep, setActiveAssetsForDep] = useState<any[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([])
  const [depStartMonth, setDepStartMonth] = useState("")
  const [depRunning, setDepRunning] = useState(false)
  const [depResult, setDepResult] = useState<any>(null)

  // ── Shared header & cell styles (matching Stock Register) ──
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

  // ── Sortable Header Component ──
  const SortTh = ({ field, children, style, align }: { 
    field: SortField; 
    children: React.ReactNode; 
    style?: React.CSSProperties;
    align?: "left" | "center" | "right";
  }) => {
    const isNumeric = field === "cost_price" || field === "depreciation_per_month"
    const textAlign = align || (isNumeric ? "right" : "left")
    
    return (
      <th style={{ ...thStyle, textAlign, ...style }}>
        <button
          onClick={() => {
            if (sortField === field) {
              setSortDir(prev => prev === "asc" ? "desc" : "asc")
            } else {
              setSortField(field)
              setSortDir("asc")
            }
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "inherit",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--text-muted)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 0,
            whiteSpace: "nowrap",
            justifyContent: textAlign === "right" ? "flex-end" : textAlign === "center" ? "center" : "flex-start",
            width: "100%",
          }}
        >
          {children}
          {sortField !== field ? (
            <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
          ) : sortDir === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )}
        </button>
      </th>
    )
  }

  // ── Data Fetching ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchAssets = async () => {
    if (!companyId) return
    setLoading(true)
    const { data } = await supabase
      .from("assets")
      .select("*, locations(name)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("asset_no")
    setAssets(data || [])
    setLoading(false)
  }

  useEffect(() => { if (companyId) fetchAssets() }, [companyId])

  // ── Filter & Sort ──
  const filtered = assets.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.asset_no.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "location") {
      valA = (a.locations?.name || "").toLowerCase()
      valB = (b.locations?.name || "").toLowerCase()
    } else if (sortField === "cost_price" || sortField === "depreciation_per_month") {
      valA = Number(a[sortField]) || 0
      valB = Number(b[sortField]) || 0
    } else if (sortField === "status") {
      valA = (a.status || "").toLowerCase()
      valB = (b.status || "").toLowerCase()
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalAssets = filtered.length
  const totalCost = filtered.reduce((s, a) => s + (a.cost_price || 0), 0)
  const activeCount = filtered.filter(a => a.status === "Active").length

  // ── Depreciation Modal (unchanged) ──
  const openDepreciationModal = async () => {
    const { data } = await supabase
      .from("assets")
      .select("id, asset_no, name, purchase_date, depreciation_per_month, remaining_life_months")
      .eq("company_id", companyId)
      .eq("status", "Active")
      .gt("remaining_life_months", 0)
      .order("asset_no")

    if (!data || data.length === 0) {
      alert("No active assets with remaining life available to depreciate.")
      return
    }

    setActiveAssetsForDep(data)
    setSelectedAssetIds(data.map(a => a.id))

    const dates = data.map(a => new Date(a.purchase_date)).filter(d => !isNaN(d.getTime()))
    if (dates.length > 0) {
      const earliest = new Date(Math.min(...dates.map(d => d.getTime())))
      setDepStartMonth(earliest.toISOString().slice(0, 7))
    } else {
      setDepStartMonth(new Date().toISOString().slice(0, 7))
    }
    setDepResult(null)
    setShowDepModal(true)
  }

  const toggleAssetSelection = (id: number) => {
    setSelectedAssetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const getMonthsToProcess = (asset: any) => {
    const start = new Date(depStartMonth + "-01")
    if (isNaN(start.getTime())) return 0
    const now = new Date()
    const current = new Date(now.getFullYear(), now.getMonth(), 1)
    if (start > current) return 0
    let months = 0
    let cursor = new Date(start)
    while (cursor <= current) {
      months++
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return Math.min(months, asset.remaining_life_months)
  }

  const executeDepreciation = async () => {
    if (selectedAssetIds.length === 0) {
      alert("Please select at least one asset.")
      return
    }
    if (!depStartMonth) {
      alert("Please choose a start month.")
      return
    }
    setDepRunning(true)
    setDepResult(null)

    const res = await fetch("/api/assets/depreciation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_ids: selectedAssetIds,
        start_month: depStartMonth,
      }),
    })
    const json = await res.json()
    setDepResult(json)
    setDepRunning(false)
    if (json.success) {
      fetchAssets()
    }
  }

  // ── PDF Export ──
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(14)
    doc.text("Asset Register", 14, 20)
    const head = [["Asset No", "Name", "Category", "Location", "Purchase Date", "Cost", "Monthly Dep.", "Status"]]
    const data = sorted.map(a => [
      a.asset_no,
      a.name,
      a.category || "—",
      a.locations?.name || "—",
      a.purchase_date,
      a.cost_price?.toLocaleString(),
      a.depreciation_per_month?.toLocaleString(),
      a.status,
    ])
    autoTable(doc, { head, body: data, startY: 30, styles: { fontSize: 8 } })
    doc.save("asset_register.pdf")
  }

  if (roleLoading || !role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
          border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s; font-family: inherit;
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
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px; background: var(--card);
          color: var(--text); outline: none; box-sizing: border-box; width: 100%;
        }
        .input:focus { border-color: var(--primary); }
        .filter-select {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; background: var(--card);
          color: var(--text); outline: none; font-family: inherit;
        }
        .filter-select:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          color: var(--text-muted); margin-bottom: 4px;
        }
        .summary-value {
          font-size: 22px; font-weight: 800; color: var(--text);
        }
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
        .asset-table { min-width: 900px; width: 100%; border-collapse: collapse; }
        .asset-table tbody tr:last-child td { border-bottom: none; }
        .asset-table tbody tr:hover td { background: var(--card-hover); }
        .filter-bar {
          display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
          margin-bottom: 16px;
        }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200;
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .modal-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 16px;
          width: 100%; max-width: 600px; max-height: 80vh; overflow-y: auto; padding: 24px;
          color: var(--text);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .modal-title { font-size: 18px; font-weight: 700; }
        .asset-row {
          display: flex; align-items: center; gap: 12px; padding: 8px 0;
          border-bottom: 1px solid var(--border);
        }
        .asset-row label { display: flex; align-items: center; gap: 8px; flex: 1; }
        .month-badge { font-size: 11px; color: var(--text-muted); margin-left: auto; }
        .checkbox { width: 16px; height: 16px; accent-color: var(--primary); }
        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📦 Asset Register</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Manage fixed assets, depreciation, transfers & sales</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-outline" onClick={exportPDF}><Download size={14} /> PDF</button>
          <button className="btn btn-outline" onClick={() => window.open("/api/assets/template", "_blank")}><Download size={14} /> Template</button>
          {canEdit && (
            <>
              <button className="btn btn-outline" onClick={openDepreciationModal}><RefreshCw size={14} /> Run Depreciation</button>
              <button className="btn btn-outline" onClick={() => router.push("/dashboard/assets/import")}><Upload size={14} /> Import</button>
              <button className="btn" onClick={() => router.push("/dashboard/assets/new")}><Plus size={16} /> New Asset</button>
            </>
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Assets</div><div className="summary-value">{totalAssets}</div></div>
        <div className="summary-item"><div className="summary-label">Total Cost</div><div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalCost.toLocaleString()}</div></div>
        <div className="summary-item"><div className="summary-label">Active Assets</div><div className="summary-value" style={{ color: "#10B981" }}>{activeCount}</div></div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Sold">Sold</option>
          <option value="Disposed">Disposed</option>
        </select>
        {statusFilter && (
          <button className="btn btn-outline" onClick={() => setStatusFilter("")} style={{ padding: "6px 12px" }}>
            Clear Filter
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="card">
        <div className="table-scroll">
          <table className="asset-table">
            <colgroup>
              <col style={{ width: 80 }} />  {/* Asset No */}
              <col style={{ width: 140 }} /> {/* Name */}
              <col style={{ width: 90 }} />  {/* Category */}
              <col style={{ width: 90 }} />  {/* Location */}
              <col style={{ width: 100 }} /> {/* Purchase Date */}
              <col style={{ width: 90 }} />  {/* Cost */}
              <col style={{ width: 80 }} />  {/* Monthly Dep */}
              <col style={{ width: 70 }} />  {/* Status */}
              <col style={{ width: 80 }} />  {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <SortTh field="asset_no" align="left">Asset No</SortTh>
                <SortTh field="name" align="left">Name</SortTh>
                <SortTh field="category" align="left">Category</SortTh>
                <SortTh field="location" align="left">Location</SortTh>
                <SortTh field="purchase_date" align="left">Purchase Date</SortTh>
                <SortTh field="cost_price" align="right">PKR Cost</SortTh>
                <SortTh field="depreciation_per_month" align="right">PKR Monthly Dep.</SortTh>
                <SortTh field="status" align="left">Status</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No assets found. {canEdit && "Add an asset to get started."}
                  </td>
                </tr>
              ) : (
                sorted.map(asset => (
                  <tr key={asset.id}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "var(--primary)" }} title={asset.asset_no}>{asset.asset_no}</td>
                    <td style={{ ...tdStyle }} title={asset.name}>{asset.name}</td>
                    <td style={{ ...tdStyle }} title={asset.category || "—"}>{asset.category || "—"}</td>
                    <td style={{ ...tdStyle }} title={asset.locations?.name || "—"}>{asset.locations?.name || "—"}</td>
                    <td style={{ ...tdStyle }} title={asset.purchase_date}>{asset.purchase_date}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} title={asset.cost_price?.toLocaleString()}>
                      PKR {asset.cost_price?.toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }} title={asset.depreciation_per_month?.toLocaleString()}>
                      PKR {asset.depreciation_per_month?.toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: asset.status === "Active" ? "#10B981" : asset.status === "Sold" ? "#F59E0B" : "#EF4444" }}>
                      {asset.status}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/asset-ledger?asset_id=${asset.id}`)} title="Ledger">
                          <BookOpen size={13} />
                        </button>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/assets/${asset.id}`)} title="View">
                          <Eye size={13} />
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

      {/* ── Depreciation Modal ── */}
      {showDepModal && (
        <div className="modal-overlay" onClick={() => setShowDepModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🗓️ Run Depreciation</div>
              <button className="btn-icon" onClick={() => setShowDepModal(false)}><X size={16} /></button>
            </div>

            {depResult ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ background: depResult.success ? "#065F46" : "#7F1D1D", color: "#fff", padding: "12px", borderRadius: 8, fontSize: 13 }}>
                  {depResult.success
                    ? `✅ Depreciation posted for ${depResult.processed} entries.`
                    : `❌ Error: ${depResult.error || "Unknown"}`}
                </div>
                {depResult.errors && depResult.errors.length > 0 && (
                  <ul style={{ marginTop: 8, paddingLeft: 20, color: "#FCA5A5", fontSize: 12 }}>
                    {depResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                  </ul>
                )}
                <button className="btn" style={{ marginTop: 12 }} onClick={() => { setShowDepModal(false); fetchAssets(); }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label className="label" style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>Start Month</label>
                  <input type="month" className="input" style={{ height: 38, paddingLeft: 12 }} value={depStartMonth} onChange={e => setDepStartMonth(e.target.value)} />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Depreciation will be posted for every missing month from this date to the current month.
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="label" style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>Select Assets</label>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {activeAssetsForDep.map(asset => {
                      const months = getMonthsToProcess(asset)
                      return (
                        <div key={asset.id} className="asset-row">
                          <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={selectedAssetIds.includes(asset.id)}
                              onChange={() => toggleAssetSelection(asset.id)}
                            />
                            <span style={{ fontSize: 13 }}>{asset.asset_no} – {asset.name}</span>
                          </label>
                          <span className="month-badge">{months > 0 ? `${months} month(s)` : "Up to date"}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-outline" onClick={() => setShowDepModal(false)}>Cancel</button>
                  <button
                    className="btn"
                    onClick={executeDepreciation}
                    disabled={depRunning || selectedAssetIds.length === 0}
                  >
                    {depRunning ? "Processing..." : <><CheckCircle size={16} /> Confirm & Post</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AssetsPage() {
  return (
    <PremiumGuard featureCode="asset_management" featureName="Fixed Asset Management" featureDesc="Track assets, depreciation, transfers, and sales">
      <AssetsContent />
    </PremiumGuard>
  )
}