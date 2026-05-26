"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, DollarSign } from "lucide-react"

export default function SellAssetPage() {
  const router = useRouter()
  const params = useParams()
  const assetId = params?.id as string
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [asset, setAsset] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")
  const [saving, setSaving] = useState(false)

  const [accounts, setAccounts] = useState<any[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [gainLossAccountId, setGainLossAccountId] = useState("")
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0])
  const [saleAmount, setSaleAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [companyId, setCompanyId] = useState("")

  // Computed values
  const [accumDep, setAccumDep] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      supabase.from("accounts").select("id,code,name,type").eq("company_id", cid).in("type", ["Asset","Expense","Equity","Liability"]).order("code")
        .then(r => r.data && setAccounts(r.data))
    })
  }, [])

  useEffect(() => {
    if (!companyId || !assetId) return
    setLoading(true)
    // Fetch asset with current location/person
    supabase.from("assets")
      .select("*, locations(name), personnel:responsible_person_id(name)")
      .eq("id", assetId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError("Failed to load asset")
          setLoading(false)
          return
        }
        setAsset(data)

        // Calculate accumulated depreciation from schedule
        const { data: depRows } = await supabase
          .from("asset_depreciation_schedule")
          .select("depreciation_amount")
          .eq("asset_id", assetId)
          .eq("posted", true)

        const totalDep = (depRows || []).reduce((s, r) => s + (r.depreciation_amount || 0), 0)
        setAccumDep(totalDep)
        setLoading(false)
      })
  }, [companyId, assetId])

  const netBookValue = asset ? asset.cost_price - accumDep : 0
  const saleAmountNum = parseFloat(saleAmount) || 0
  const gainLoss = saleAmountNum - netBookValue

  const handleSell = async () => {
    if (!asset || !saleDate || saleAmountNum <= 0) {
      setError("Please fill all required fields")
      return
    }

    setSaving(true)
    setError("")
    setFlash("")

    try {
      // 1. Insert asset_sales record
      const { data: saleRecord, error: saleError } = await supabase
        .from("asset_sales")
        .insert({
          asset_id: assetId,
          company_id: companyId,
          sale_date: saleDate,
          sale_amount: saleAmountNum,
          gain_loss_account_id: gainLossAccountId || null,
          notes,
          created_by: (await supabase.auth.getUser()).data.user?.email || "system",
        })
        .select()
        .single()

      if (saleError) throw new Error("Failed to record sale: " + saleError.message)

      // 2. Create journal entry for sale
      const userEmail = (await supabase.auth.getUser()).data.user?.email || "system"
      const entryNo = `JE-SALE-${asset.asset_no}`

      // Build lines
      const lines: any[] = []

      // Dr Bank/Cash (asset account) with sale amount
      if (bankAccountId) {
        lines.push({
          account_id: parseInt(bankAccountId),
          debit: saleAmountNum,
          credit: 0,
        })
      } else {
        // Fallback to a default asset account (code 1000 if exists)
        const { data: defaultBank } = await supabase.from("accounts")
          .select("id").eq("company_id", companyId).eq("code", "1000").maybeSingle()
        if (defaultBank) {
          lines.push({ account_id: defaultBank.id, debit: saleAmountNum, credit: 0 })
        } else {
          throw new Error("Please select a Bank/Cash account")
        }
      }

      // Dr Accumulated Depreciation with total accum dep
      if (asset.gl_accum_dep_account_id) {
        lines.push({
          account_id: asset.gl_accum_dep_account_id,
          debit: accumDep,
          credit: 0,
        })
      }

      // Cr Asset account (original cost)
      if (asset.gl_asset_account_id) {
        lines.push({
          account_id: asset.gl_asset_account_id,
          debit: 0,
          credit: asset.cost_price,
        })
      } else {
        throw new Error("Asset GL account not set")
      }

      // Gain/Loss line
      if (gainLoss !== 0) {
        if (gainLossAccountId) {
          if (gainLoss > 0) {
            // Credit gain
            lines.push({
              account_id: parseInt(gainLossAccountId),
              debit: 0,
              credit: gainLoss,
            })
          } else {
            // Debit loss
            lines.push({
              account_id: parseInt(gainLossAccountId),
              debit: Math.abs(gainLoss),
              credit: 0,
            })
          }
        } else {
          // Auto-pick a gain/loss account? For safety, require selection.
          throw new Error("Please select a Gain/Loss account")
        }
      }

      // Create journal entry
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: companyId,
          entry_no: entryNo,
          date: saleDate,
          description: `Sale of asset ${asset.asset_no} (${asset.name})`,
        })
        .select()
        .single()

      if (entryErr) throw new Error("Journal entry failed: " + entryErr.message)

      // Insert journal lines
      const lineRows = lines.map(l => ({
        company_id: companyId,
        entry_id: entry.id,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        source_type: "asset_sale",
        source_id: saleRecord.id,
      }))

      const { error: linesErr } = await supabase.from("journal_lines").insert(lineRows)
      if (linesErr) throw new Error("Journal lines failed: " + linesErr.message)

      // Update account balances
      for (const l of lines) {
        const { data: acc } = await supabase.from("accounts").select("balance").eq("id", l.account_id).single()
        if (acc) {
          const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
          await supabase.from("accounts").update({ balance: newBal }).eq("id", l.account_id)
        }
      }

      // 3. Update asset status to Sold
      const { error: updateErr } = await supabase
        .from("assets")
        .update({ status: "Sold", updated_by: userEmail })
        .eq("id", assetId)
        .eq("company_id", companyId)

      if (updateErr) throw new Error("Failed to update asset status: " + updateErr.message)

      setFlash("✅ Asset sold successfully!")
      setTimeout(() => router.push(`/dashboard/assets/${assetId}`), 800)
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding:24, textAlign:"center", color:"var(--text-muted)", background:"var(--bg)", minHeight:"100vh" }}>Loading…</div>
  if (error && !asset) return <div style={{ padding:24, textAlign:"center", color:"#FCA5A5", background:"var(--bg)", minHeight:"100vh" }}>{error}</div>
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
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>💰 Sell Asset</h1>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>{asset.name} ({asset.asset_no})</p>
        </div>
      </div>

      {error && <div style={{ background:"var(--card)", border:"1px solid #EF4444", color:"#FCA5A5", padding:"10px 16px", borderRadius:8, marginBottom:16, fontSize:13 }}>{error}</div>}
      {flash && <div style={{ background:"var(--card)", border:"1px solid #065F46", color:"#6EE7B7", padding:"10px 16px", borderRadius:8, marginBottom:16, fontSize:13 }}>{flash}</div>}

      <div className="header-grid">
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div className="card">
            <div style={{ marginBottom:12 }}>
              <label className="label">Sale Date *</label>
              <input className="input" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label className="label">Sale Amount *</label>
              <input className="input" type="number" min="0" step="100" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} placeholder="0" />
            </div>
            <div style={{ marginBottom:12 }}>
              <label className="label">Bank / Cash Account (for deposit)</label>
              <select className="select" value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}>
                <option value="">— Select —</option>
                {accounts.filter(a => a.type === "Asset").map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label className="label">Gain / Loss Account</label>
              <select className="select" value={gainLossAccountId} onChange={e => setGainLossAccountId(e.target.value)}>
                <option value="">— Select —</option>
                {accounts.filter(a => a.type !== "Asset").map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:4 }}>
              <label className="label">Notes</label>
              <textarea className="input" style={{ height:60, resize:"vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12, position:"sticky", top:16 }}>
          <div className="card">
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:10 }}>Sale Summary</h3>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Original Cost</span>
              <span style={{ fontWeight:600 }}>PKR {asset.cost_price?.toLocaleString()}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Accum. Depreciation</span>
              <span style={{ fontWeight:600 }}>PKR {accumDep.toLocaleString()}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Net Book Value</span>
              <span style={{ fontWeight:600 }}>PKR {netBookValue.toLocaleString()}</span>
            </div>
            <div style={{ borderTop:"1px solid var(--border)", margin:"8px 0" }}></div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
              <span style={{ color:"var(--text-muted)" }}>Sale Amount</span>
              <span style={{ fontWeight:600 }}>PKR {saleAmountNum.toLocaleString()}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700 }}>
              <span>Gain / Loss</span>
              <span style={{ color: gainLoss >= 0 ? "#10B981" : "#EF4444" }}>
                PKR {Math.abs(gainLoss).toLocaleString()} {gainLoss >= 0 ? "Gain" : "Loss"}
              </span>
            </div>
          </div>
          <div className="card">
            <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", padding:10 }} onClick={handleSell} disabled={saving}>
              {saving ? "Processing..." : <><DollarSign size={16} /> Confirm Sale</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}