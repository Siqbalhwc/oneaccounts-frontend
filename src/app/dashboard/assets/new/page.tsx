"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save } from "lucide-react"

export default function NewAssetPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [companyId, setCompanyId] = useState("")
  const [accounts, setAccounts] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [personnel, setPersonnel] = useState<any[]>([])

  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0])
  const [costPrice, setCostPrice] = useState("")
  const [lifeMonths, setLifeMonths] = useState("60")
  const [salvageValue, setSalvageValue] = useState("0")
  const [locationId, setLocationId] = useState("")
  const [personId, setPersonId] = useState("")
  const [assetAcctId, setAssetAcctId] = useState("")
  const [accumDepAcctId, setAccumDepAcctId] = useState("")
  const [depExpAcctId, setDepExpAcctId] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      supabase.from("accounts").select("id, code, name, type")
        .eq("company_id", cid).in("type", ["Asset", "Expense"]).order("code")
        .then(r => r.data && setAccounts(r.data))

      supabase.from("locations").select("id, name")
        .eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))

      supabase.from("personnel").select("id, name")
        .eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setPersonnel(r.data))
    })
  }, [])

  const handleSubmit = async () => {
    if (!name || !purchaseDate || !costPrice || !lifeMonths) {
      setError("Please fill all required fields.")
      return
    }

    setSaving(true)
    setError("")
    setFlash("")

    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category,
        purchase_date: purchaseDate,
        cost_price: parseFloat(costPrice),
        life_months: parseInt(lifeMonths),
        salvage_value: parseFloat(salvageValue) || 0,
        location_id: locationId || null,
        responsible_person_id: personId || null,
        gl_asset_account_id: assetAcctId || null,
        gl_accum_dep_account_id: accumDepAcctId || null,
        gl_dep_expense_account_id: depExpAcctId || null,
        notes,
        source_type: "manual",
      }),
    })

    const result = await res.json()
    if (!result.success) {
      setError(result.error || "Failed to save asset")
    } else {
      setFlash(`✅ Asset ${result.asset.asset_no} created!`)
      setTimeout(() => router.push(`/dashboard/assets/${result.asset.id}`), 800)
    }
    setSaving(false)
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); max-width: 700px; }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; font-family: inherit; }
        .input:focus, .select:focus { border-color: var(--primary); }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        .btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { background: var(--primary-hover); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/assets")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>➕ New Asset</h1>
      </div>

      {error && <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{flash}</div>}

      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <label className="label">Asset Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office Desk" />
        </div>

        <div className="row">
          <div>
            <label className="label">Category</label>
            <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Furniture" />
          </div>
          <div>
            <label className="label">Purchase Date *</label>
            <input className="input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">Cost Price *</label>
            <input className="input" type="number" min="0" step="100" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">Life (Months) *</label>
            <input className="input" type="number" min="1" value={lifeMonths} onChange={e => setLifeMonths(e.target.value)} />
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">Salvage Value</label>
            <input className="input" type="number" min="0" step="100" value={salvageValue} onChange={e => setSalvageValue(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">Location</label>
            <select className="select" value={locationId} onChange={e => setLocationId(e.target.value)}>
              <option value="">— Select —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">Responsible Person</label>
          <select className="select" value={personId} onChange={e => setPersonId(e.target.value)}>
            <option value="">— Select —</option>
            {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">GL Asset Account</label>
          <select className="select" value={assetAcctId} onChange={e => setAssetAcctId(e.target.value)}>
            <option value="">— Select —</option>
            {accounts.filter(a => a.type === "Asset").map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
        </div>

        <div className="row">
          <div>
            <label className="label">Accum. Dep. Account</label>
            <select className="select" value={accumDepAcctId} onChange={e => setAccumDepAcctId(e.target.value)}>
              <option value="">— Select —</option>
              {accounts.filter(a => a.type === "Asset").map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Dep. Expense Account</label>
            <select className="select" value={depExpAcctId} onChange={e => setDepExpAcctId(e.target.value)}>
              <option value="">— Select —</option>
              {accounts.filter(a => a.type === "Expense").map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label">Notes</label>
          <textarea className="input" style={{ height: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: 10 }} onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : <><Save size={16} /> Save Asset</>}
        </button>
      </div>
    </div>
  )
}