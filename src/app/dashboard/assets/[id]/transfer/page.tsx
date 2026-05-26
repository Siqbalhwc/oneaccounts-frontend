"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Truck } from "lucide-react"

export default function TransferAssetPage() {
  const router = useRouter()
  const params = useParams()
  const assetId = params?.id as string
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [asset, setAsset] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")
  const [saving, setSaving] = useState(false)

  const [locations, setLocations] = useState<any[]>([])
  const [personnel, setPersonnel] = useState<any[]>([])
  const [newLocationId, setNewLocationId] = useState("")
  const [newPersonId, setNewPersonId] = useState("")
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      supabase.from("locations").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
      supabase.from("personnel").select("id,name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setPersonnel(r.data))
    })
  }, [])

  useEffect(() => {
    if (!companyId || !assetId) return
    setLoading(true)
    supabase.from("assets")
      .select("*, locations(name), personnel:responsible_person_id(name)")
      .eq("id", assetId)
      .eq("company_id", companyId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError("Failed to load asset")
        else if (!data) setError("Asset not found")
        else {
          setAsset(data)
          setNewLocationId(data.current_location_id || "")
          setNewPersonId(data.responsible_person_id || "")
        }
        setLoading(false)
      })
  }, [companyId, assetId])

  const handleTransfer = async () => {
    if (!asset) return
    setSaving(true)
    setError("")
    setFlash("")

    const oldLocationId = asset.current_location_id
    const oldPersonId = asset.responsible_person_id

    // Update asset
    const { error: updateError } = await supabase
      .from("assets")
      .update({
        current_location_id: newLocationId || null,
        responsible_person_id: newPersonId || null,
        updated_by: (await supabase.auth.getUser()).data.user?.email || "system",
      })
      .eq("id", assetId)
      .eq("company_id", companyId)

    if (updateError) {
      setError("Failed to update asset: " + updateError.message)
      setSaving(false)
      return
    }

    // Log transfer
    const { error: transferError } = await supabase
      .from("asset_transfers")
      .insert({
        asset_id: assetId,
        company_id: companyId,
        transfer_date: transferDate,
        from_location_id: oldLocationId,
        to_location_id: newLocationId || null,
        from_person_id: oldPersonId,
        to_person_id: newPersonId || null,
        created_by: (await supabase.auth.getUser()).data.user?.email || "system",
      })

    if (transferError) {
      setError("Transfer logged, but history record failed: " + transferError.message)
    } else {
      setFlash("✅ Asset transferred successfully!")
    }

    setSaving(false)
    setTimeout(() => router.push(`/dashboard/assets/${assetId}`), 800)
  }

  if (loading) return <div style={{ padding:24, textAlign:"center", color:"var(--text-muted)", background:"var(--bg)", minHeight:"100vh" }}>Loading…</div>
  if (error) return <div style={{ padding:24, textAlign:"center", color:"#FCA5A5", background:"var(--bg)", minHeight:"100vh" }}>{error}</div>
  if (!asset) return <div style={{ padding:24, textAlign:"center", color:"var(--text-muted)", background:"var(--bg)", minHeight:"100vh" }}>Asset not found</div>

  return (
    <div style={{ padding:24, background:"var(--bg)", minHeight:"100vh", fontFamily:"'Inter', sans-serif", color:"var(--text)" }}>
      <style>{`
        .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px 20px; margin-bottom:12px; box-shadow:var(--shadow-sm); }
        .label { font-size:10px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; display:block; }
        .input, .select { width:100%; height:38px; border:1.5px solid var(--border); border-radius:8px; padding:0 12px; font-size:13px; background:var(--bg); color:var(--text); outline:none; box-sizing:border-box; font-family:inherit; }
        .input:focus, .select:focus { border-color:var(--primary); }
        .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:1.5px solid var(--border); background:transparent; color:var(--text-muted); font-family:inherit; transition:all 0.15s; white-space:nowrap; }
        .btn:hover { background:var(--card-hover); }
        .btn-primary { background:var(--primary); color:var(--primary-text); border-color:var(--primary); }
        .btn-primary:hover { background:var(--primary-hover); }
        .header-grid { display:grid; grid-template-columns: minmax(0,1fr) 300px; gap:16px; align-items:start; }
        @media (max-width:900px) { .header-grid { grid-template-columns:1fr; } }
      `}</style>

      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn" onClick={() => router.push(`/dashboard/assets/${assetId}`)}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>🚛 Transfer Asset</h1>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>{asset.name} ({asset.asset_no})</p>
        </div>
      </div>

      {flash && <div style={{ background:"var(--card)", border:"1px solid #065F46", color:"#6EE7B7", padding:"10px 16px", borderRadius:8, marginBottom:16, fontSize:13 }}>{flash}</div>}

      <div className="header-grid">
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div className="card">
            <div style={{ marginBottom:12 }}>
              <label className="label">Transfer Date</label>
              <input className="input" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label className="label">New Location</label>
              <select className="select" value={newLocationId} onChange={e => setNewLocationId(e.target.value)}>
                <option value="">— Keep current —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:4 }}>
              <label className="label">New Responsible Person</label>
              <select className="select" value={newPersonId} onChange={e => setNewPersonId(e.target.value)}>
                <option value="">— Keep current —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12, position:"sticky", top:16 }}>
          <div className="card">
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:10 }}>Current Assignment</h3>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Location</span>
              <span style={{ fontWeight:600 }}>{asset.locations?.name || "—"}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
              <span style={{ color:"var(--text-muted)" }}>Responsible</span>
              <span style={{ fontWeight:600 }}>{asset.personnel?.name || "—"}</span>
            </div>
          </div>
          <div className="card">
            <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", padding:10 }} onClick={handleTransfer} disabled={saving}>
              {saving ? "Transferring..." : <><Truck size={16} /> Transfer Asset</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}