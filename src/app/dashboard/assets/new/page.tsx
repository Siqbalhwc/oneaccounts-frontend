"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, ChevronDown, ChevronRight, Loader2, CheckCircle } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"

const ASSET_CATEGORIES = [
  "Furniture", "Equipment", "Vehicle", "Computer",
  "Building", "Land", "Software", "Other",
]

const SOURCE_TYPES = [
  { value: "manual",   label: "Manual Entry" },
  { value: "purchase", label: "Purchase Invoice" },
  { value: "donation", label: "Donation" },
  { value: "opening",  label: "Opening Balance" },
  { value: "transfer", label: "Transfer from other company" },
]

export default function NewAssetPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { companyId } = useCompany()
  const [userEmail, setUserEmail] = useState("system")

  // ── Fetch user email once ────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email)
    })
  }, [])

  // ── Master data ────────────────────────────────────
  const [accounts,    setAccounts]    = useState<any[]>([])
  const [locations,   setLocations]   = useState<any[]>([])
  const [personnel,   setPersonnel]   = useState<any[]>([])
  const [loadingMasters, setLoadingMasters] = useState(true)

  // ── Form fields ────────────────────────────────────
  const [name,            setName]            = useState("")
  const [category,        setCategory]        = useState("")
  const [otherCategory,   setOtherCategory]   = useState("")
  const [purchaseDate,    setPurchaseDate]    = useState(new Date().toISOString().split("T")[0])
  const [costPrice,       setCostPrice]       = useState("")
  const [lifeMonths,      setLifeMonths]       = useState("60")
  const [salvageValue,    setSalvageValue]    = useState("0")
  const [locationId,      setLocationId]      = useState("")
  const [personId,        setPersonId]        = useState("")
  const [assetAcctId,     setAssetAcctId]     = useState("")
  const [accumDepAcctId,  setAccumDepAcctId]  = useState("")
  const [depExpAcctId,    setDepExpAcctId]    = useState("")
  const [creditAcctId,    setCreditAcctId]    = useState("")
  const [notes,           setNotes]           = useState("")
  const [sourceType,      setSourceType]      = useState("manual")

  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState("")
  const [savedAsset,      setSavedAsset]      = useState<any>(null)

  const [showAdvanced,    setShowAdvanced]    = useState(false)

  // ── Load master data concurrently ──────────────────
  useEffect(() => {
    if (!companyId) return
    setLoadingMasters(true)
    Promise.all([
      supabase.from("accounts").select("id,code,name,type,category")
        .eq("company_id", companyId)
        .in("type", ["Asset","Expense","Liability"])
        .order("code"),
      supabase.from("locations").select("id,name")
        .eq("company_id", companyId).order("name"),
      supabase.from("personnel").select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null).order("name"),
    ]).then(([accRes, locRes, perRes]) => {
      if (accRes.data) setAccounts(accRes.data)
      if (locRes.data) setLocations(locRes.data)
      if (perRes.data) setPersonnel(perRes.data)
      setLoadingMasters(false)
    })
  }, [companyId])

  // ── Derived values ─────────────────────────────────
  const cost          = parseFloat(costPrice) || 0
  const salvage       = parseFloat(salvageValue) || 0
  const life          = parseInt(lifeMonths) || 1
  const depreciable   = cost - salvage
  const monthlyDep    = life > 0 ? Math.max(0, Number((depreciable / life).toFixed(2))) : 0
  const finalCategory = category === "Other" ? otherCategory.trim() : category

  // ── Memoized filtered account lists ────────────────
  const assetAccounts = useMemo(() => accounts.filter(a => a.type === "Asset"), [accounts])
  const expenseAccounts = useMemo(() => accounts.filter(a => a.type === "Expense"), [accounts])
  const creditAccounts = useMemo(() =>
    accounts.filter(a =>
      (a.type === "Asset"  && a.category === "Cash & Bank") ||
      (a.type === "Liability" && a.category === "Accounts Payable")
    ), [accounts])

  // ── Validation ─────────────────────────────────────
  const validate = (): string | null => {
    if (!name.trim())          return "Asset name is required."
    if (cost <= 0)             return "Cost must be greater than 0."
    if (life <= 0)             return "Useful life must be greater than 0."
    if (salvage > cost)        return "Salvage value cannot exceed cost."
    if (purchaseDate > new Date().toISOString().split("T")[0])
                               return "Purchase date cannot be in the future."

    const anyGL = assetAcctId || accumDepAcctId || depExpAcctId
    if (anyGL) {
      if (!assetAcctId || !accumDepAcctId || !depExpAcctId)
        return "All three depreciation GL accounts must be selected together, or leave all empty."
    }
    return null
  }

  // ── Submit handler ─────────────────────────────────
  const handleSubmit = async () => {
    if (saving) return

    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setSaving(true)
    setError("")

    const { data, error: rpcError } = await supabase.rpc('create_asset_transaction', {
      p_company_id:              companyId,
      p_name:                    name.trim(),
      p_category:                finalCategory || null,
      p_purchase_date:           purchaseDate,
      p_cost_price:              cost,
      p_life_months:             life,
      p_salvage_value:           salvage,
      p_location_id:             locationId ? parseInt(locationId) : null,
      p_responsible_person_id:   personId ? parseInt(personId) : null,
      p_gl_asset_account_id:     assetAcctId ? parseInt(assetAcctId) : null,
      p_gl_accum_dep_account_id: accumDepAcctId ? parseInt(accumDepAcctId) : null,
      p_gl_dep_expense_account_id: depExpAcctId ? parseInt(depExpAcctId) : null,
      p_credit_account_id:       creditAcctId ? parseInt(creditAcctId) : null,
      p_notes:                   notes,
      p_source_type:             sourceType,
      p_user_email:              userEmail,
    })

    if (rpcError) {
      setError(rpcError.message || "Unable to create asset – please try again.")
      setSaving(false)
      return
    }

    if (!data?.success) {
      setError(data?.message || "Unable to create asset – please try again.")
      setSaving(false)
      return
    }

    setSavedAsset({ asset_no: data.asset_no, asset_id: data.asset_id })
    setSaving(false)
  }

  // ── Date formatter ─────────────────────────────────
  const fmtDate = (iso: string) => {
    if (!iso) return "—"
    const d = new Date(iso)
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PK", { year:"numeric", month:"short", day:"numeric" })
  }

  // ── Loading state for masters ──────────────────────
  if (loadingMasters) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh", color:"var(--text-muted)", fontSize:14 }}>Loading master data…</div>
  }

  // ── Success card ────────────────────────────────────
  if (savedAsset) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:20, padding:24, background:"var(--bg)", color:"var(--text)", fontFamily:"'Inter', sans-serif" }}>
        <CheckCircle size={48} color="#10B981" />
        <h2 style={{ fontWeight:800 }}>Asset {savedAsset.asset_no} created</h2>
        <div style={{ display:"flex", gap:12 }}>
          <button
            className="btn btn-primary"
            onClick={() => router.push(`/dashboard/assets/${savedAsset.asset_id}`)}
            style={{ padding:"10px 24px", borderRadius:8, fontWeight:600, border:"none", background:"var(--primary)", color:"var(--primary-text)", cursor:"pointer" }}
          >
            View Asset
          </button>
          <button
            className="btn"
            onClick={() => {
              setSavedAsset(null)
              setName(""); setCategory(""); setOtherCategory("")
              setCostPrice(""); setLifeMonths("60"); setSalvageValue("0")
              setLocationId(""); setPersonId("")
              setAssetAcctId(""); setAccumDepAcctId(""); setDepExpAcctId("")
              setCreditAcctId(""); setNotes(""); setSourceType("manual")
              setShowAdvanced(false)
              setError("")
              setPurchaseDate(new Date().toISOString().split("T")[0])
            }}
            style={{ padding:"10px 24px", borderRadius:8, fontWeight:600, border:"1.5px solid var(--border)", background:"transparent", color:"var(--text-muted)", cursor:"pointer" }}
          >
            Create Another
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────
  return (
    <div style={{ padding:24, background:"var(--bg)", minHeight:"100vh", fontFamily:"'Inter', sans-serif", color:"var(--text)" }}>
      <style>{`
        .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px 20px; margin-bottom:12px; box-shadow:var(--shadow-sm); }
        .label { font-size:10px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; display:block; }
        .label-required { color:#EF4444; }
        .input, .select, textarea { width:100%; height:38px; border:1.5px solid var(--border); border-radius:8px; padding:0 12px; font-size:13px; background:var(--bg); color:var(--text); outline:none; box-sizing:border-box; font-family:inherit; }
        .input:focus, .select:focus, textarea:focus { border-color:var(--primary); }
        .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
        .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:1.5px solid var(--border); background:transparent; color:var(--text-muted); font-family:inherit; transition:all 0.15s; white-space:nowrap; }
        .btn:hover { background:var(--card-hover); }
        .btn-primary { background:var(--primary); color:var(--primary-text); border-color:var(--primary); }
        .btn-primary:hover { background:var(--primary-hover); }
        .header-grid { display:grid; grid-template-columns: minmax(0,1fr) 300px; gap:16px; align-items:start; }
        .advanced-toggle { display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px; margin-bottom:12px; color:var(--primary); }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @media (max-width:900px) { .header-grid { grid-template-columns:1fr; } }
        @media (max-width:600px) { .row { grid-template-columns:1fr; } }
      `}</style>

      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/assets")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>➕ New Asset</h1>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>Add a fixed asset to your register</p>
        </div>
      </div>

      {error && <div style={{ background:"var(--card)", border:"1px solid #EF4444", color:"#FCA5A5", padding:"10px 16px", borderRadius:8, marginBottom:16, fontSize:13 }}>{error}</div>}

      <div className="header-grid">
        {/* Left column – form */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div className="card">
            <div style={{ marginBottom:12 }}>
              <label className="label">Asset Name <span className="label-required">*</span></label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office Desk" />
            </div>
            <div className="row">
              <div>
                <label className="label">Category</label>
                <select className="select" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">— Select —</option>
                  {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {category === "Other" && (
                  <input className="input" style={{ marginTop:6 }} value={otherCategory} onChange={e => setOtherCategory(e.target.value)} placeholder="Specify category" />
                )}
              </div>
              <div><label className="label">Purchase Date <span className="label-required">*</span></label><input className="input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
            </div>
            <div className="row">
              <div><label className="label">Cost Price <span className="label-required">*</span></label><input className="input" type="number" min="0" step="100" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="0" /></div>
              <div><label className="label">Life (Months) <span className="label-required">*</span></label><input className="input" type="number" min="1" value={lifeMonths} onChange={e => setLifeMonths(e.target.value)} /></div>
            </div>
            <div className="row">
              <div><label className="label">Salvage Value</label><input className="input" type="number" min="0" step="100" value={salvageValue} onChange={e => setSalvageValue(e.target.value)} placeholder="0" /></div>
              <div><label className="label">Location</label><select className="select" value={locationId} onChange={e => setLocationId(e.target.value)}><option value="">— Select —</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            </div>
            <div className="row">
              <div><label className="label">Responsible Person</label><select className="select" value={personId} onChange={e => setPersonId(e.target.value)}><option value="">— Select —</option>{personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div>
                <label className="label">Source Type</label>
                <select className="select" value={sourceType} onChange={e => setSourceType(e.target.value)}>
                  {SOURCE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>Advanced Accounting Settings</span>
            </div>

            {showAdvanced && (
              <>
                <div className="row">
                  <div><label className="label">GL Asset Account</label><select className="select" value={assetAcctId} onChange={e => setAssetAcctId(e.target.value)}><option value="">— Select —</option>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}</select></div>
                  <div><label className="label">Accum. Dep. Account</label><select className="select" value={accumDepAcctId} onChange={e => setAccumDepAcctId(e.target.value)}><option value="">— Select —</option>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}</select></div>
                </div>
                <div className="row">
                  <div><label className="label">Dep. Expense Account</label><select className="select" value={depExpAcctId} onChange={e => setDepExpAcctId(e.target.value)}><option value="">— Select —</option>{expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}</select></div>
                  <div>
                    <label className="label">Payment / Credit Account</label>
                    <select className="select" value={creditAcctId} onChange={e => setCreditAcctId(e.target.value)}>
                      <option value="">— None —</option>
                      {creditAccounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop:12 }}>
              <label className="label">Notes</label>
              <textarea className="input" style={{ height:60, resize:"vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Right column – summary & save */}
        <div style={{ display:"flex", flexDirection:"column", gap:12, position:"sticky", top:16 }}>
          <div className="card">
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:10 }}>Summary</h3>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Asset Name</span><span style={{ fontWeight:600 }}>{name || "—"}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Category</span><span style={{ fontWeight:600 }}>{finalCategory || "—"}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Purchase Date</span><span style={{ fontWeight:600 }}>{fmtDate(purchaseDate)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Location</span><span style={{ fontWeight:600 }}>{locations.find(l => l.id == locationId)?.name || "—"}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Responsible</span><span style={{ fontWeight:600 }}>{personnel.find(p => p.id == personId)?.name || "—"}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Source</span><span style={{ fontWeight:600 }}>{SOURCE_TYPES.find(s => s.value === sourceType)?.label || sourceType}</span>
            </div>
            <hr style={{ margin: "10px 0", border: "none", borderTop: "1px solid var(--border)" }} />
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Cost</span><span style={{ fontWeight:600 }}>PKR {cost.toLocaleString()}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Salvage</span><span style={{ fontWeight:600 }}>PKR {salvage.toLocaleString()}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4, fontWeight:600 }}>
              <span style={{ color:"var(--text-muted)" }}>Depreciable Value</span><span style={{ fontWeight:600 }}>PKR {depreciable.toLocaleString()}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Life</span><span style={{ fontWeight:600 }}>{life} months</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
              <span style={{ color:"var(--text-muted)" }}>Monthly Dep.</span>
              <span style={{ fontWeight:600 }}>PKR {monthlyDep.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="card">
            <button
              className="btn btn-primary"
              style={{ width:"100%", justifyContent:"center", padding:10, display:"flex", alignItems:"center", gap:8 }}
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <><Loader2 size={16} className="spinner" /> Saving...</>
              ) : (
                <><Save size={16} /> Save Asset</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}