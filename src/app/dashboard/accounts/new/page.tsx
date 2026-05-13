"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"

// ── Full category list with their GL code ranges ──
const CATEGORIES = [
  { label: "Cash & Bank", codeStart: 1000, codeEnd: 1099, type: "Asset" },
  { label: "Accounts Receivable", codeStart: 1100, codeEnd: 1199, type: "Asset" },
  { label: "Inventory", codeStart: 1200, codeEnd: 1299, type: "Asset" },
  { label: "Other Current Assets", codeStart: 1300, codeEnd: 1399, type: "Asset" },
  { label: "Fixed Assets", codeStart: 1400, codeEnd: 1499, type: "Asset" },
  { label: "Vehicles", codeStart: 1500, codeEnd: 1599, type: "Asset" },
  { label: "Accounts Payable", codeStart: 2000, codeEnd: 2099, type: "Liability" },
  { label: "Other Current Liabilities", codeStart: 2100, codeEnd: 2199, type: "Liability" },
  { label: "Equity", codeStart: 3000, codeEnd: 3099, type: "Equity" },
  { label: "Revenue", codeStart: 4000, codeEnd: 4099, type: "Revenue" },
  { label: "Direct Expenses", codeStart: 5000, codeEnd: 5099, type: "Expense" },
  { label: "Operating Expenses", codeStart: 5100, codeEnd: 5199, type: "Expense" },
]

export default function NewAccountPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [accountType, setAccountType] = useState("")
  const [categoryLabel, setCategoryLabel] = useState("")
  const [accountName, setAccountName] = useState("")
  const [suggestedCode, setSuggestedCode] = useState<number | null>(null)
  const [customCode, setCustomCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Available categories filtered by the selected type
  const availableCategories = CATEGORIES.filter((c) => c.type === accountType)

  // Get company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // When category changes, suggest the next available code
  useEffect(() => {
    if (!companyId || !categoryLabel || !accountType) {
      setSuggestedCode(null)
      setCustomCode("")
      return
    }
    const cat = CATEGORIES.find((c) => c.label === categoryLabel)
    if (!cat) return

    // Find existing codes in this range, then suggest the smallest free number
    supabase
      .from("accounts")
      .select("code")
      .eq("company_id", companyId)
      .gte("code", cat.codeStart.toString())
      .lte("code", cat.codeEnd.toString())
      .order("code", { ascending: true })
      .then(({ data }) => {
        const usedNumbers = (data || [])
          .map((a) => parseInt(a.code, 10))
          .filter((n) => !isNaN(n) && n >= cat.codeStart && n <= cat.codeEnd)
          .sort((a, b) => a - b)

        let next = cat.codeStart
        // Find first gap, or max+1
        for (const n of usedNumbers) {
          if (n === next) {
            next++
          } else if (n > next) {
            break
          }
        }
        // Make sure we don't exceed the range
        if (next > cat.codeEnd) next = cat.codeEnd
        setSuggestedCode(next)
        setCustomCode(next.toString())
      })
  }, [companyId, categoryLabel, accountType])

  // If the user edits the code manually, we use that
  const codeToSubmit = customCode || (suggestedCode?.toString() ?? "")

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!accountType || !categoryLabel) { setError("Please select type and category"); return }
    if (!accountName.trim()) { setError("Account name is required"); return }
    const code = parseInt(codeToSubmit, 10)
    if (isNaN(code) || code < 0) { setError("Invalid account code"); return }

    setLoading(true)
    setError("")

    // Try inserting with retry on duplicate
    let attempts = 0
    let currentCode = code
    let insertResult: any = null
    while (attempts < 3) {
      const { data, error: insertErr } = await supabase
        .from("accounts")
        .insert({
          code: currentCode.toString(),
          name: accountName.trim(),
          type: accountType,
          balance: 0,
          company_id: companyId,
        })
        .select("id, code")
        .single()

      insertResult = { data, error: insertErr }
      if (!insertErr) break

      if (insertErr.message?.includes("duplicate key") && attempts < 2) {
        // Try next code
        currentCode++
        attempts++
        continue
      }

      setError(insertErr?.message || "Insert failed")
      setLoading(false)
      return
    }

    if (!insertResult?.data) {
      setError("Could not create account after multiple attempts.")
      setLoading(false)
      return
    }

    setFlash(`✅ Account ${insertResult.data.code} – ${accountName} created!`)
    setAccountName("")
    setAccountType("")
    setCategoryLabel("")
    setLoading(false)
    setTimeout(() => router.push("/dashboard/accounts"), 1500)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .form-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 24px; margin-bottom: 16px; max-width: 500px; }
        .label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; display: block; }
        .input, .select { width: 100%; height: 40px; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; font-family: inherit; background: #FAFBFF; }
        .input:focus, .select:focus { border-color: #1D4ED8; outline: none; }
        .btn { padding: 10px 20px; border-radius: 8px; border: none; font-weight: 600; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/accounts")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1E293B", margin: 0 }}>➕ New Account</h1>
          <p style={{ color: "#94A3B8", fontSize: 13 }}>Add a new GL account</p>
        </div>
      </div>

      {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div className="form-card">
        <div style={{ marginBottom: 16 }}>
          <label className="label">Account Type *</label>
          <select className="select" value={accountType} onChange={(e) => { setAccountType(e.target.value); setCategoryLabel(""); setSuggestedCode(null); setCustomCode(""); }}>
            <option value="">— Select Type —</option>
            {["Asset", "Liability", "Equity", "Revenue", "Expense"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {accountType && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">Category *</label>
            <select className="select" value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)}>
              <option value="">— Select Category —</option>
              {availableCategories.map(c => <option key={c.label} value={c.label}>{c.label} ({c.codeStart}-{c.codeEnd})</option>)}
            </select>
          </div>
        )}

        {suggestedCode !== null && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">Account Code</label>
            <input className="input" type="number" value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder={`Suggested: ${suggestedCode}`} />
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>Suggested next available code in this category</div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label className="label">Account Name *</label>
          <input className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Main Bank Account" />
        </div>

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleSubmit} disabled={loading}>
          {loading ? "Creating..." : <> <Plus size={16} /> Create Account </>}
        </button>
      </div>
    </div>
  )
}