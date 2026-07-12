"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Plus, Search, Download, Upload, Eye, ArrowUpDown, ArrowUp, ArrowDown,
  RefreshCw, X, CheckCircle, BookOpen, Loader2
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import PremiumGuard from "@/components/PremiumGuard"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

type SortField = "asset_no" | "name" | "category" | "location" | "purchase_date" | "cost_price" | "accumulated_depreciation" | "net_book_value" | "remaining_life_months" | "status"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 70, 50, 50, 60, 40, 40, 50, 40, 30].map((w, i) => (
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

const STATUS_COLORS: Record<string, string> = {
  Active: "#22c55e",
  Sold: "#f59e0b",
  Disposed: "#ef4444",
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#94a3b8"
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: "100px",
        fontSize: 11,
        fontWeight: 600,
        background: `${color}22`,
        color: color,
        border: `1px solid ${color}44`,
        display: "inline-block",
      }}
    >
      {status}
    </span>
  )
}

function AssetsContent() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const { companyId: contextCompanyId } = useCompany()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sortField, setSortField] = useState<SortField>("asset_no")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [companyId, setCompanyId] = useState("")
  const [userEmail, setUserEmail] = useState("")

  // Depreciation modal state
  const [showDepModal, setShowDepModal] = useState(false)
  const [depStartMonth, setDepStartMonth] = useState("")               // "YYYY-MM"
  const [depPostingDate, setDepPostingDate] = useState(new Date().toISOString().split("T")[0])
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([])
  const [depRunning, setDepRunning] = useState(false)
  const [depResult, setDepResult] = useState<any>(null)

  // ── Get company ID and user email ────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = contextCompanyId || (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        setUserEmail(user?.email || "system")
      }
    })
  }, [contextCompanyId])

  const fetchAssets = async () => {
    if (!companyId) return
    setLoading(true)
    setFetchError("")
    const { data, error } = await supabase.rpc('get_asset_list', { p_company_id: companyId })
    if (error) {
      setFetchError("Failed to load assets: " + error.message)
      setAssets([])
    } else {
      setAssets(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { if (companyId) fetchAssets() }, [companyId])

  // ── Filter & Sort ──
  const filtered = assets.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      const name = (a.name ?? "").toLowerCase()
      const code = (a.asset_no ?? "").toLowerCase()
      const cat = (a.category ?? "").toLowerCase()
      const loc = (a.location_name ?? "").toLowerCase()
      if (!name.includes(s) && !code.includes(s) && !cat.includes(s) && !loc.includes(s)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "location") {
      valA = (a.location_name || "").toLowerCase()
      valB = (b.location_name || "").toLowerCase()
    } else if (["cost_price","accumulated_depreciation","net_book_value","remaining_life_months"].includes(sortField)) {
      valA = Number(a[sortField] ?? 0)
      valB = Number(b[sortField] ?? 0)
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalAssets = filtered.length
  const totalCost = filtered.reduce((s, a) => s + Number(a.cost_price ?? 0), 0)
  const totalAccum = filtered.reduce((s, a) => s + Number(a.accumulated_depreciation ?? 0), 0)
  const totalNBV = filtered.reduce((s, a) => s + Number(a.net_book_value ?? 0), 0)
  const activeCount = filtered.filter(a => a.status === "Active").length
  const fullyDepCount = filtered.filter(a => a.status === "Active" && a.remaining_life_months === 0).length

  // ── Depreciation modal helpers ───────────────────────
  const openDepreciationModal = () => {
    // Use already loaded assets – filter for active with remaining life > 0
    const eligible = assets.filter(
      a => a.status === "Active" && a.remaining_life_months > 0 && Number(a.depreciation_per_month ?? 0) > 0
    )
    if (eligible.length === 0) {
      alert("No active assets with remaining life and monthly depreciation available.")
      return
    }

    // Default start month to the earliest purchase date among eligible
    const dates = eligible.map(a => new Date(a.purchase_date)).filter(d => !isNaN(d.getTime()))
    const earliest = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date()
    setDepStartMonth(earliest.toISOString().slice(0, 7))
    setDepPostingDate(new Date().toISOString().split("T")[0])

    // Select all eligible by default
    setSelectedAssetIds(eligible.map(a => a.id))
    setDepResult(null)
    setShowDepModal(true)
  }

  const toggleAssetSelection = (id: number) => {
    setSelectedAssetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    const eligible = assets.filter(a => a.status === "Active" && a.remaining_life_months > 0)
    if (selectedAssetIds.length === eligible.length) {
      setSelectedAssetIds([])
    } else {
      setSelectedAssetIds(eligible.map(a => a.id))
    }
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
    // p_start_month expects the first day of the month (YYYY-MM-DD)
    const startMonthDate = depStartMonth + "-01"
    const { data, error } = await supabase.rpc('post_asset_depreciation', {
      p_company_id: companyId,
      p_asset_ids: selectedAssetIds,
      p_start_month: startMonthDate,
      p_posting_date: depPostingDate,
      p_user_email: userEmail,
    })
    setDepResult(data || { error: error?.message })
    setDepRunning(false)
    if (data?.success) {
      fetchAssets()  // refresh the list
    }
  }

  // ── Format helpers ───────────────────────────────────
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "—"
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PK", { year:"numeric", month:"short", day:"numeric" })
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
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }

  const SortTh = ({ field, children, align }: { field: SortField; children: React.ReactNode; align?: "left"|"center"|"right" }) => (
    <th style={{ ...thStyle, textAlign: align || "left" }}>
      <button
        onClick={() => {
          if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
          else { setSortField(field); setSortDir("asc") }
        }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          fontWeight: 700, textTransform: "uppercase", fontSize: 12,
        }}
      >
        {children}
        {sortField === field ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} style={{ opacity: 0.5 }} />}
      </button>
    </th>
  )

  if (roleLoading || !role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer { 0% { opacity:0.4; } 50% { opacity:0.8; } 100% { opacity:0.4; } }
        .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; background:transparent; border:1.5px solid var(--border); color:var(--text-muted); transition:all 0.2s; }
        .btn:hover { background:var(--card-hover); }
        .btn-primary { background:var(--primary); color:var(--primary-text); border-color:var(--primary); }
        .btn-icon { background:transparent; border:1.5px solid var(--border); color:var(--text-muted); padding:5px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; line-height:1; }
        .btn-icon:hover { background:var(--card-hover); }
        .input { height:38px; border:1.5px solid var(--border); border-radius:8px; padding:0 12px 0 36px; font-size:13px; background:var(--card); color:var(--text); outline:none; box-sizing:border-box; width:100%; }
        .input:focus { border-color:var(--primary); }
        .filter-select { height:38px; border:1.5px solid var(--border); border-radius:8px; padding:0 12px; font-size:13px; background:var(--card); color:var(--text); outline:none; font-family:inherit; }
        .filter-select:focus { border-color:var(--primary); }
        .summary-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-bottom:20px; }
        .summary-item { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; }
        .summary-label { font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; }
        .summary-value { font-size:20px; font-weight:800; color:var(--text); }
        .card { background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; box-shadow:var(--shadow-sm); }
        .table-scroll { overflow-x:auto; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
        .table-scroll::-webkit-scrollbar { height:4px; }
        .table-scroll::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
        .asset-table { min-width:1000px; width:100%; border-collapse:collapse; }
        .asset-table tbody tr:last-child td { border-bottom:none; }
        .asset-table tbody tr:hover td { background:var(--card-hover); }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; }
        .modal-card { background:var(--card); border:1px solid var(--border); border-radius:16px; width:100%; max-width:650px; max-height:80vh; overflow-y:auto; padding:24px; color:var(--text); }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @media (max-width:480px) { .summary-grid { grid-template-columns:repeat(2,1fr); } }
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>📦 Asset Register</h1>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>Manage fixed assets, depreciation, transfers & sales</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <button className="btn" onClick={fetchAssets} title="Refresh list"><RefreshCw size={14} /> Refresh</button>
          <button className="btn" onClick={() => {
            const doc = new jsPDF({ orientation:"landscape" });
            doc.setFontSize(14); doc.text("Asset Register", 14, 20);
            const head = [["Asset No","Name","Category","Location","Purchase Date","Cost","Accum. Dep.","NBV","Rem. Life","Status"]];
            const data = sorted.map(a => [a.asset_no, a.name, a.category||"—", a.location_name||"—", formatDate(a.purchase_date), Number(a.cost_price ?? 0).toLocaleString(), Number(a.accumulated_depreciation ?? 0).toLocaleString(), Number(a.net_book_value ?? 0).toLocaleString(), a.remaining_life_months, a.status]);
            autoTable(doc, { head, body: data, startY:30, styles:{ fontSize:8 } });
            doc.save("asset_register.pdf");
          }}><Download size={14} /> PDF</button>
          {canEdit && (
            <>
              <button className="btn" onClick={openDepreciationModal}><RefreshCw size={14} /> Run Depreciation</button>
              <button className="btn" onClick={() => router.push("/dashboard/assets/import")}><Upload size={14} /> Import</button>
              <button className="btn btn-primary" onClick={() => router.push("/dashboard/assets/new")}><Plus size={16} /> New Asset</button>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Assets</div><div className="summary-value">{totalAssets}</div></div>
        <div className="summary-item"><div className="summary-label">Total Cost</div><div className="summary-value" style={{ color:"#F59E0B" }}>PKR {totalCost.toLocaleString()}</div></div>
        <div className="summary-item"><div className="summary-label">Accum. Dep.</div><div className="summary-value" style={{ color:"#A78BFA" }}>PKR {totalAccum.toLocaleString()}</div></div>
        <div className="summary-item"><div className="summary-label">Net Book Value</div><div className="summary-value" style={{ color:"#10B981" }}>PKR {totalNBV.toLocaleString()}</div></div>
        <div className="summary-item"><div className="summary-label">Active</div><div className="summary-value" style={{ color:"#22c55e" }}>{activeCount}</div></div>
        <div className="summary-item"><div className="summary-label">Fully Depreciated</div><div className="summary-value" style={{ color:"#94a3b8" }}>{fullyDepCount}</div></div>
      </div>

      {/* Search & Filter */}
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ position:"relative", flex:1, maxWidth:320 }}>
          <Search size={16} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
          <input className="input" placeholder="Search by name, code, category, location..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Sold">Sold</option>
          <option value="Disposed">Disposed</option>
        </select>
        {statusFilter && <button className="btn" onClick={() => setStatusFilter("")}>Clear</button>}
      </div>

      {fetchError && (
        <div style={{ background:"var(--card)", border:"1px solid #EF4444", color:"#FCA5A5", padding:"10px 16px", borderRadius:8, marginBottom:16, fontSize:13 }}>
          {fetchError}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="table-scroll">
          <table className="asset-table">
            <thead>
              <tr>
                <SortTh field="asset_no">Asset No</SortTh>
                <SortTh field="name">Name</SortTh>
                <SortTh field="category">Category</SortTh>
                <SortTh field="location">Location</SortTh>
                <SortTh field="purchase_date">Purchase Date</SortTh>
                <SortTh field="cost_price" align="right">Cost</SortTh>
                <SortTh field="accumulated_depreciation" align="right">Accum. Dep.</SortTh>
                <SortTh field="net_book_value" align="right">NBV</SortTh>
                <SortTh field="remaining_life_months" align="right">Rem. Life</SortTh>
                <SortTh field="status">Status</SortTh>
                <th style={{ ...thStyle, textAlign:"center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
              ) : sorted.length === 0 ? (
                <tr><td colSpan={11} style={{ ...tdStyle, textAlign:"center", padding:40, color:"var(--text-muted)" }}>
                  {search || statusFilter ? "No assets match your filters." : "No assets found. Add an asset to get started."}
                </td></tr>
              ) : (
                sorted.map(asset => {
                  const cost = Number(asset.cost_price ?? 0)
                  const accum = Number(asset.accumulated_depreciation ?? 0)
                  const nbv = Number(asset.net_book_value ?? 0)
                  return (
                    <tr key={asset.id} onClick={() => router.push(`/dashboard/assets/${asset.id}`)} style={{ cursor:"pointer" }}>
                      <td style={tdStyle}>{asset.asset_no}</td>
                      <td style={tdStyle}>{asset.name}</td>
                      <td style={tdStyle}>{asset.category || "—"}</td>
                      <td style={tdStyle}>{asset.location_name || "—"}</td>
                      <td style={tdStyle}>{formatDate(asset.purchase_date)}</td>
                      <td style={{...tdStyle, textAlign:"right"}}>PKR {cost.toLocaleString()}</td>
                      <td style={{...tdStyle, textAlign:"right"}}>PKR {accum.toLocaleString()}</td>
                      <td style={{...tdStyle, textAlign:"right", fontWeight:600, color: nbv > 0 ? "#10B981" : "#EF4444"}}>PKR {nbv.toLocaleString()}</td>
                      <td style={{...tdStyle, textAlign:"right"}}>{asset.remaining_life_months} m</td>
                      <td style={tdStyle}><StatusBadge status={asset.status} /></td>
                      <td style={{...tdStyle, textAlign:"center"}} onClick={e => e.stopPropagation()}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/asset-ledger?asset_id=${asset.id}`)}><BookOpen size={13} /></button>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/assets/${asset.id}`)}><Eye size={13} /></button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Depreciation Modal */}
      {showDepModal && (
        <div className="modal-overlay" onClick={() => setShowDepModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h2>🗓️ Run Depreciation</h2>
              <button onClick={() => setShowDepModal(false)}><X size={16} /></button>
            </div>

            {depResult ? (
              <div>
                <div style={{
                  background: depResult.success ? "#065F46" : "#7F1D1D",
                  color: "white",
                  padding: "12px",
                  borderRadius: 8,
                  fontSize: 13
                }}>
                  {depResult.success ? (
                    <>✅ {depResult.processed} depreciation entries posted.</>
                  ) : (
                    <>❌ {depResult.error || "Failed"}</>
                  )}
                </div>
                {depResult.errors && depResult.errors.length > 0 && (
                  <ul style={{ marginTop: 8, color: "#FCA5A5", fontSize: 12 }}>
                    {depResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                  </ul>
                )}
                <button className="btn" style={{ marginTop: 12 }} onClick={() => { setShowDepModal(false); fetchAssets(); }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label className="label" style={{ marginBottom: 4, display: "block", fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Start Month
                  </label>
                  <input
                    type="month"
                    className="input"
                    style={{ paddingLeft: 12 }}
                    value={depStartMonth}
                    onChange={e => setDepStartMonth(e.target.value)}
                  />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Depreciation will be posted from this month up to the posting date.
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="label" style={{ marginBottom: 4, display: "block", fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Posting Date
                  </label>
                  <input
                    type="date"
                    className="input"
                    style={{ paddingLeft: 12 }}
                    value={depPostingDate}
                    onChange={e => setDepPostingDate(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>Select Assets ({selectedAssetIds.length} of {assets.filter(a => a.status === "Active" && a.remaining_life_months > 0).length})</strong>
                    <button className="btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={toggleSelectAll}>
                      {selectedAssetIds.length === assets.filter(a => a.status === "Active" && a.remaining_life_months > 0).length ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}></th>
                        <th>Asset</th>
                        <th style={{ textAlign: "right" }}>Monthly Dep.</th>
                        <th style={{ textAlign: "right" }}>Rem. Life</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets
                        .filter(a => a.status === "Active" && a.remaining_life_months > 0)
                        .map(asset => (
                          <tr key={asset.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedAssetIds.includes(asset.id)}
                                onChange={() => toggleAssetSelection(asset.id)}
                                style={{ accentColor: "var(--primary)" }}
                              />
                            </td>
                            <td>{asset.asset_no} – {asset.name}</td>
                            <td style={{ textAlign: "right" }}>PKR {Number(asset.depreciation_per_month ?? 0).toLocaleString()}</td>
                            <td style={{ textAlign: "right" }}>{asset.remaining_life_months} months</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                  <button className="btn" onClick={() => setShowDepModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={executeDepreciation} disabled={depRunning || selectedAssetIds.length === 0}>
                    {depRunning ? <><Loader2 size={16} className="spinner" /> Processing...</> : "Confirm & Post"}
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