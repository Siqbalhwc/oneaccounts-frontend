"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

const COMPONENT_TYPES = ["earning", "deduction"]

export default function NewSalaryComponentPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState("earning")
  const [isTaxable, setIsTaxable] = useState(false)
  const [glAccountId, setGlAccountId] = useState<number | null>(null)
  const [formula, setFormula] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Account picker state
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountSearch, setAccountSearch] = useState("")
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("accounts")
          .select("id, code, name")
          .eq("company_id", cid)
          .order("code")
          .then(({ data }) => setAccounts(data || []))
      }
    })
  }, [])

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowAccountPicker(false)
      }
    }
    if (showAccountPicker) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showAccountPicker])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!name.trim()) { setError("Component name is required"); return }
    if (!glAccountId) { setError("GL Account is required"); return }

    setLoading(true)
    setError("")

    const payload = {
      company_id: companyId,
      name: name.trim(),
      type,
      is_taxable: isTaxable,
      gl_account_id: glAccountId,
      formula: formula.trim() || null,
      is_active: true,
    }

    const { error: insertErr } = await supabase
      .from("salary_components")
      .insert(payload)

    if (insertErr) {
      setError(insertErr.message)
      setLoading(false)
      return
    }

    setFlash(`✅ Salary Component "${name.trim()}" created!`)
    setName("")
    setType("earning")
    setIsTaxable(false)
    setGlAccountId(null)
    setFormula("")
    setLoading(false)
    setTimeout(() => router.push("/dashboard/payroll/salary-components"), 1500)
  }

  if (planLoading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .input:focus, .select:focus { border-color: var(--primary); }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-submit { width: 100%; justify-content: center; background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .picker-wrapper {
          position: relative;
        }
        .picker-input {
          cursor: pointer;
        }
        .picker-dropdown {
          position: absolute; top: 100%; left: 0; right: 0; background: var(--card); border: 1px solid var(--border);
          border-radius: 0 0 8px 8px; max-height: 220px; overflow-y: auto; z-index: 20;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .picker-item {
          padding: 8px 12px; cursor: pointer; font-size: 13px;
        }
        .picker-item:hover { background: var(--card-hover); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/salary-components")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>➕ New Salary Component</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Create an earning or deduction component</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <label className="label">Component Name *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Basic Pay, House Rent" />
          </div>

          <div className="inline-group" style={{ marginBottom: 16 }}>
            <div>
              <label className="label">Type *</label>
              <select className="select" value={type} onChange={e => setType(e.target.value)}>
                {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={isTaxable} onChange={e => setIsTaxable(e.target.checked)} />
                Taxable
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 16 }} className="picker-wrapper" ref={pickerRef}>
            <label className="label">GL Account *</label>
            <input
              className="input picker-input"
              readOnly
              value={glAccountId ? accounts.find(a => a.id === glAccountId)?.name || `ID ${glAccountId}` : ""}
              placeholder="Search and select an account…"
              onClick={() => setShowAccountPicker(prev => !prev)}
            />
            {showAccountPicker && (
              <div className="picker-dropdown">
                <div style={{ padding: 8 }}>
                  <input
                    className="input"
                    style={{ height: 32 }}
                    placeholder="Search accounts..."
                    value={accountSearch}
                    onChange={e => setAccountSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {accounts
                  .filter(a => !accountSearch || a.name?.toLowerCase().includes(accountSearch.toLowerCase()) || a.code?.includes(accountSearch))
                  .slice(0, 20)
                  .map(a => (
                    <div
                      key={a.id}
                      className="picker-item"
                      onMouseDown={() => {
                        setGlAccountId(a.id)
                        setShowAccountPicker(false)
                        setAccountSearch("")
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{a.code} – {a.name}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Formula (optional)</label>
            <input className="input" value={formula} onChange={e => setFormula(e.target.value)} placeholder="e.g. basic * 0.3" />
          </div>

          <button className="btn btn-submit" type="submit" disabled={loading}>
            {loading ? "Saving..." : <><Plus size={16} /> Create Component</>}
          </button>
        </div>
      </form>
    </div>
  )
}