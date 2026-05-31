"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Truck, DollarSign } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"

export default function AssetDetailPage() {
  const router = useRouter()
  const params = useParams()
  const assetId = params?.id as string
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [asset, setAsset] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !assetId) return
    setLoading(true)
    setError("")
    supabase.from("assets")
      .select("*, locations(name), personnel:responsible_person_id(name)")
      .eq("id", assetId)
      .eq("company_id", companyId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError("Failed to load asset: " + fetchError.message)
        } else if (!data) {
          setError("Asset not found.")
        } else {
          setAsset(data)
        }
        setLoading(false)
      })
  }, [companyId, assetId])

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading asset…</div>
  if (error) return <div style={{ padding: 24, textAlign: "center", color: "#FCA5A5", background: "var(--bg)", minHeight: "100vh" }}>{error}</div>
  if (!asset) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Asset not found</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 150px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        .btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s;
        }
        .btn:hover { background: var(--card-hover); }
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/assets")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>{asset.name}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{asset.asset_no}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {asset.status === "Active" && (
            <>
              <button className="btn" onClick={() => router.push(`/dashboard/assets/${assetId}/transfer`)}><Truck size={14} /> Transfer</button>
              <button className="btn" onClick={() => router.push(`/dashboard/assets/${assetId}/sell`)}><DollarSign size={14} /> Sell</button>
            </>
          )}
          <button className="btn" onClick={() => router.push(`/dashboard/assets/${assetId}/edit`)}>✏️ Edit</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 900 }}>
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Details</h3>
          <div className="row"><span className="label">Category</span><span className="value">{asset.category || "—"}</span></div>
          <div className="row"><span className="label">Cost</span><span className="value">PKR {asset.cost_price?.toLocaleString()}</span></div>
          <div className="row"><span className="label">Purchase Date</span><span className="value">{asset.purchase_date}</span></div>
          <div className="row"><span className="label">Life (Months)</span><span className="value">{asset.life_months}</span></div>
          <div className="row"><span className="label">Monthly Dep.</span><span className="value">PKR {asset.depreciation_per_month?.toLocaleString()}</span></div>
          <div className="row"><span className="label">Location</span><span className="value">{asset.locations?.name || "—"}</span></div>
          <div className="row"><span className="label">Responsible</span><span className="value">{asset.personnel?.name || "—"}</span></div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Status & Value</h3>
          <div className="row"><span className="label">Status</span><span className="value" style={{ color: asset.status === "Active" ? "#10B981" : asset.status === "Sold" ? "#F59E0B" : "#EF4444", fontWeight: 600 }}>{asset.status}</span></div>
          <div className="row"><span className="label">Net Book Value</span><span className="value">PKR {(asset.cost_price - (asset.prior_accumulated_depreciation || 0)).toLocaleString()}</span></div>
          {asset.notes && <div className="row"><span className="label">Notes</span><span className="value">{asset.notes}</span></div>}
          <div className="row"><span className="label">Created by</span><span className="value">{asset.created_by || "—"}</span></div>
          <div className="row"><span className="label">Updated by</span><span className="value">{asset.updated_by || "—"}</span></div>
        </div>
      </div>

      {/* Change History */}
      <div style={{ maxWidth: 900, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <div className="record-history">
            <RecordHistory tableName="assets" recordId={String(asset.id)} />
          </div>
        </div>
      </div>
    </div>
  )
}