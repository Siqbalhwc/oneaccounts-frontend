"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Download, Upload, Eye, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import PremiumGuard from "@/components/PremiumGuard"

type SortField = "asset_no" | "name" | "category" | "location" | "purchase_date" | "cost_price" | "depreciation_per_month" | "status"
type SortDir = "asc" | "desc"

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

  // Filter
  const filtered = assets.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.asset_no.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Sort
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

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  if (roleLoading || !role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .btn { display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:transparent;color:var(--text-muted);font-family:inherit;transition:all 0.15s;white-space:nowrap; }
        .btn:hover { background:var(--card-hover); }
        .btn-icon { background:transparent;border:1.5px solid var(--border);color:var(--text-muted);padding:6px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center; }
        .btn-icon:hover { background:var(--card-hover); }
        .input { height:38px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px 0 36px;font-size:13px;background:var(--card);color:var(--text);outline:none;box-sizing:border-box;width:100%; }
        .input:focus { border-color:var(--primary); }
        .filter-select { padding:6px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--card);color:var(--text); }
        .sort-btn { background:none;border:none;cursor:pointer;font:inherit;color:var(--text-muted);display:inline-flex;align-items:center;gap:4px;padding:0;font-weight:700;text-transform:uppercase;font-size:10px;white-space:nowrap; }
        .sort-btn:hover { color:var(--primary); }
        .table-scroll { overflow-x:auto; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th { padding:10px 12px; text-align:left; border-bottom:1px solid var(--border); }
        th.sortable { cursor:pointer; }
        td { padding:10px 12px; border-bottom:1px solid var(--border); color:var(--text); }
        tr:hover td { background:var(--card-hover); }
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>📦 Asset Register</h1>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>Manage fixed assets, depreciation, transfers & sales</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {canEdit && (
            <>
              <button className="btn" onClick={() => router.push("/dashboard/assets/new")}><Plus size={16} /> New Asset</button>
              <button className="btn" onClick={() => router.push("/dashboard/assets/import")}><Upload size={16} /> Import</button>
            </>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ display:"flex", gap:12, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ position:"relative", flex:1, maxWidth:320 }}>
          <Search size={16} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
          <input className="input" placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Sold">Sold</option>
          <option value="Disposed">Disposed</option>
        </select>
        <button className="btn" onClick={() => window.open("/api/assets/template", "_blank")}><Download size={14} /> Template</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>Loading assets…</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>No assets found.</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("asset_no")}>Asset No {getSortIcon("asset_no")}</button></th>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button></th>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("category")}>Category {getSortIcon("category")}</button></th>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("location")}>Location {getSortIcon("location")}</button></th>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("purchase_date")}>Purchase Date {getSortIcon("purchase_date")}</button></th>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("cost_price")}>Cost {getSortIcon("cost_price")}</button></th>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("depreciation_per_month")}>Monthly Dep. {getSortIcon("depreciation_per_month")}</button></th>
                <th className="sortable"><button className="sort-btn" onClick={() => handleSort("status")}>Status {getSortIcon("status")}</button></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(asset => (
                <tr key={asset.id}>
                  <td style={{ fontWeight:600, color:"var(--primary)" }}>{asset.asset_no}</td>
                  <td>{asset.name}</td>
                  <td>{asset.category || "—"}</td>
                  <td>{asset.locations?.name || "—"}</td>
                  <td>{asset.purchase_date}</td>
                  <td>PKR {asset.cost_price?.toLocaleString()}</td>
                  <td>PKR {asset.depreciation_per_month?.toLocaleString()}</td>
                  <td style={{ color: asset.status === "Active" ? "#10B981" : asset.status === "Sold" ? "#F59E0B" : "#EF4444", fontWeight:600 }}>{asset.status}</td>
                  <td><button className="btn-icon" onClick={() => router.push(`/dashboard/assets/${asset.id}`)} title="View"><Eye size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
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