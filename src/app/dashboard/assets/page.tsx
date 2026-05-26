"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Download, Upload, Edit, Eye } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import PremiumGuard from "@/components/PremiumGuard"

function AssetsContent() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const { hasFeature } = usePlan()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
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

  useEffect(() => {
    if (companyId) fetchAssets()
  }, [companyId])

  const filteredAssets = assets.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.asset_no.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (roleLoading || !role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .asset-table { width: 100%; border-collapse: collapse; }
        .asset-table th, .asset-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
        .asset-table th { color: var(--text-muted); font-size: 10px; text-transform: uppercase; }
        .asset-table tr:hover td { background: var(--card-hover); }
        .btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s; white-space: nowrap;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          padding: 6px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .input {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none; box-sizing: border-box;
        }
        .input:focus { border-color: var(--primary); }
        .filter-select { padding: 6px 12px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 13px; background: var(--card); color: var(--text); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📦 Asset Register</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Manage fixed assets, depreciation, transfers & sales</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <>
              <button className="btn" onClick={() => router.push("/dashboard/assets/new")}><Plus size={16} /> New Asset</button>
              <button className="btn" onClick={() => router.push("/dashboard/assets/import")}><Upload size={16} /> Import</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Sold">Sold</option>
          <option value="Disposed">Disposed</option>
        </select>
        <button className="btn" onClick={() => window.open("/api/assets/template", "_blank")}><Download size={14} /> Template</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading assets…</div>
      ) : filteredAssets.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No assets found.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="asset-table">
            <thead>
              <tr>
                <th>Asset No</th>
                <th>Name</th>
                <th>Category</th>
                <th>Location</th>
                <th>Purchase Date</th>
                <th>Cost</th>
                <th>Monthly Dep.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => (
                <tr key={asset.id}>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{asset.asset_no}</td>
                  <td>{asset.name}</td>
                  <td>{asset.category || "—"}</td>
                  <td>{asset.locations?.name || "—"}</td>
                  <td>{asset.purchase_date}</td>
                  <td>PKR {asset.cost_price?.toLocaleString()}</td>
                  <td>PKR {asset.depreciation_per_month?.toLocaleString()}</td>
                  <td style={{
                    color: asset.status === "Active" ? "#10B981" : asset.status === "Sold" ? "#F59E0B" : "#EF4444",
                    fontWeight: 600
                  }}>{asset.status}</td>
                  <td>
                    <button className="btn-icon" onClick={() => router.push(`/dashboard/assets/${asset.id}`)} title="View"><Eye size={14} /></button>
                  </td>
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
    <PremiumGuard
      featureCode="asset_management"
      featureName="Fixed Asset Management"
      featureDesc="Track assets, depreciation, transfers, and sales"
    >
      <AssetsContent />
    </PremiumGuard>
  )
}