"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"

// Predefined categories with code ranges
const PREDEFINED_CATEGORIES = [
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

const CUSTOM_OPTION = "➕ Custom…"

function getDefaultRangeForType(type: string): { start: number; end: number } | null {
  switch (type) {
    case "Asset": return { start: 1000, end: 1999 }
    case "Liability": return { start: 2000, end: 2999 }
    case "Equity": return { start: 3000, end: 3999 }
    case "Revenue": return { start: 4000, end: 4999 }
    case "Expense": return { start: 5000, end: 5999 }
    default: return null
  }
}

export default function NewAccountPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [accountType, setAccountType] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [customCategoryName, setCustomCategoryName] = useState("")
  const [customCodeStart, setCustomCodeStart] = useState("")
  const [customCodeEnd, setCustomCodeEnd] = useState("")
  const [accountName, setAccountName] = useState("")
  const [suggestedCode, setSuggestedCode] = useState<number | null>(null)
  const [customCode, setCustomCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const availablePredefined = PREDEFINED_CATEGORIES.filter((c) => c.type === accountType)
  const isCustom = selectedCategory === CUSTOM_OPTION
  const finalCategory = isCustom ? customCategoryName.trim() : selectedCategory

  const effectiveCodeStart = (() => {
    if (!selectedCategory) return null
    if (isCustom) {
      if (customCodeStart) return parseInt(customCodeStart, 10)
      const def = getDefaultRangeForType(accountType)
      return def ? def.start : null
    }
    const cat = PREDEFINED_CATEGORIES.find((c) => c.label === selectedCategory)
    return cat ? cat.codeStart : null
  })()

  const effectiveCodeEnd = (() => {
    if (!selectedCategory) return null
    if (isCustom) {
      if (customCodeEnd) return parseInt(customCodeEnd, 10)
      const def = getDefaultRangeForType(accountType)
      return def ? def.end : null
    }
    const cat = PREDEFINED_CATEGORIES.find((c) => c.label === selectedCategory)
    return cat ? cat.codeEnd : null
  })()

  // Get company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Suggest next free code
  useEffect(() => {
    if (!companyId || !selectedCategory) {
      setSuggestedCode(null)
      setCustomCode("")
      return
    }
    const start = effectiveCodeStart
    const end = effectiveCodeEnd
    if (!start || !end) {
      setSuggestedCode(null)
      setCustomCode("")
      return
    }

    supabase
      .from("accounts")
      .select("code")
      .eq("company_id", companyId)
      .gte("code", start.toString())
      .lte("code", end.toString())
      .order("code", { ascending: true })
      .then(({ data }) => {
        const usedNumbers = (data || [])
          .map((a) => parseInt(a.code, 10))
          .filter((n) => !isNaN(n) && n >= start && n <= end)
          .sort((a, b) => a - b)

        let next = start
        for (const n of usedNumbers) {
          if (n === next) next++
          else if (n > next) break
        }
        if (next > end) next = end
        setSuggestedCode(next)
        setCustomCode(next.toString())
      })
  }, [companyId, selectedCategory, effectiveCodeStart, effectiveCodeEnd, accountType])

  const codeToSubmit = customCode || (suggestedCode?.toString() ?? "")

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!accountType || !selectedCategory) { setError("Please select type and category"); return }
    if (isCustom && !customCategoryName.trim()) { setError("Please enter a custom category name"); return }
    if (!accountName.trim()) { setError("Account name is required"); return }
    const code = parseInt(codeToSubmit, 10)
    if (isNaN(code) || code < 0) { setError("Invalid account code"); return }

    setLoading(true)
    setError("")

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
          category: finalCategory,
          balance: 0,
          company_id: companyId,
        })
        .select("id, code, category")
        .single()

      insertResult = { data, error: insertErr }
      if (!insertErr) break

      if (insertErr.message?.includes("duplicate key") && attempts < 2) {
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
    setSelectedCategory("")
    setCustomCategoryName("")
    setCustomCodeStart("")
    setCustomCodeEnd("")
    setLoading(false)
    setTimeout(() => router.push("/dashboard/accounts"), 1500)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .form-card {
          background: #111827; border: 1px solid #1E293B; border-radius: 12px;
          padding: 24px; margin-bottom: 16px; max-width: 560px;
          margin-left: auto; margin-right: auto;   /* center the card */
        }
        .label { font-size: 11px; font-weight: 600; color: #94A3B8; text-transform: uppercase; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 40px; border: 1.5px solid #334155; border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: #1E293B; color: #F1F5F9;
        }
        /* Focus border – now a soft gray, matching the theme */
        .input:focus, .select:focus { border-color: #64748B; outline: none; }

        .btn {
          padding: 10px 20px; border-radius: 8px; border: none; font-weight: 600;
          font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-primary {
          background: #1E3A8A;   /* navy, same as logo */
          color: white;
          box-shadow: 0 4px 12px rgba(30,58,138,0.4);  /* subtle glow */
          transition: all 0.2s;
        }
        .btn-primary:hover {
          background: #1E40AF;   /* slightly lighter navy on hover */
          box-shadow: 0 6px 16px rgba(30,64,175,0.5);
        }
        .btn-outline {
          background: transparent; border: 1.5px solid #334155; color: #CBD5E1;
        }
        .inline-group { display: flex; gap: 8px; }
        .inline-group > * { flex: 1; }
      `}</style>

      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Back button and title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/accounts")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>➕ New Account</h1>
            <p style={{ color: "#94A3B8", fontSize: 13 }}>Add a new GL account</p>
          </div>
        </div>

        {error && <div style={{ background: "#1E293B", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "#064E3B", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="form-card">
          <div style={{ marginBottom: 16 }}>
            <label className="label">Account Type *</label>
            <select className="select" value={accountType} onChange={(e) => { setAccountType(e.target.value); setSelectedCategory(""); setCustomCategoryName(""); setCustomCodeStart(""); setCustomCodeEnd(""); }}>
              <option value="">— Select Type —</option>
              {["Asset", "Liability", "Equity", "Revenue", "Expense"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {accountType && (
            <div style={{ marginBottom: 16 }}>
              <label className="label">Category *</label>
              <select className="select" value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setCustomCategoryName(""); setCustomCodeStart(""); setCustomCodeEnd(""); }}>
                <option value="">— Select Category —</option>
                {availablePredefined.map((c) => <option key={c.label} value={c.label}>{c.label} ({c.codeStart}-{c.codeEnd})</option>)}
                <option value={CUSTOM_OPTION}>{CUSTOM_OPTION}</option>
              </select>
            </div>
          )}

          {isCustom && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label className="label">Custom Category Name *</label>
                <input className="input" value={customCategoryName} onChange={(e) => setCustomCategoryName(e.target.value)} placeholder="e.g. Land & Building" />
              </div>
              <div className="inline-group" style={{ marginBottom: 16 }}>
                <div>
                  <label className="label">Code Start (optional)</label>
                  <input className="input" type="number" value={customCodeStart} onChange={(e) => setCustomCodeStart(e.target.value)} placeholder="1000" />
                </div>
                <div>
                  <label className="label">Code End (optional)</label>
                  <input className="input" type="number" value={customCodeEnd} onChange={(e) => setCustomCodeEnd(e.target.value)} placeholder="1999" />
                </div>
              </div>
            </>
          )}

          {effectiveCodeStart !== null && effectiveCodeEnd !== null && suggestedCode !== null && (
            <div style={{ marginBottom: 16 }}>
              <label className="label">Account Code</label>
              <input className="input" type="number" value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder={`Suggested: ${suggestedCode}`} />
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>Suggested next free code in the selected range</div>
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
    </div>
  )
}