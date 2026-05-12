"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Save, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface ExpenseRule {
  name: string
  rate: number
  account_id: number | null
}

interface Partner {
  account_id: number | null
  percentage: number
}

const DEFAULT_EXPENSE_RULES: ExpenseRule[] = [
  { name: "Salaries",       rate: 4,   account_id: null },
  { name: "Advertising",    rate: 0.5, account_id: null },
  { name: "Fuel",           rate: 0.5, account_id: null },
]

const DEFAULT_PARTNERS: Partner[] = [
  { account_id: null, percentage: 5 },
  { account_id: null, percentage: 5 },
  { account_id: null, percentage: 5 },
  { account_id: null, percentage: 5 },
  { account_id: null, percentage: 80 },
]

export default function InvoiceAutomationPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  // Feature toggles
  const [expenseEnabled, setExpenseEnabled] = useState(false)
  const [profitEnabled, setProfitEnabled] = useState(false)

  // Dynamic rules
  const [expenseRules, setExpenseRules] = useState<ExpenseRule[]>(DEFAULT_EXPENSE_RULES)
  const [partners, setPartners] = useState<Partner[]>(DEFAULT_PARTNERS)

  // Available accounts
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([])
  const [equityLiabilityAccounts, setEquityLiabilityAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  // Feature UUIDs (for toggling in company_features)
  const [featureIdMap, setFeatureIdMap] = useState<Record<string, string>>({})

  // Preview
  const [previewAmount, setPreviewAmount] = useState(100000)

  // ── Initialise ──
  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    init()
  }, [role, canView])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const cid = (user.app_metadata as any)?.company_id
    if (!cid) { setLoading(false); return }
    setCompanyId(cid)

    // Feature UUIDs
    const { data: featureRows } = await supabase.from("features")
      .select("id, code")
      .in("code", ["invoice_automation", "profit_allocation"])
    const idMap: Record<string, string> = {}
    if (featureRows) featureRows.forEach((f: any) => { idMap[f.code] = f.id })
    setFeatureIdMap(idMap)

    // Accounts
    const [{ data: expAccs }, { data: eqAccs }] = await Promise.all([
      supabase.from("accounts").select("id, code, name").in("type", ["Expense","Asset"]).eq("company_id", cid).order("code"),
      supabase.from("accounts").select("id, code, name").in("type", ["Equity","Liability"]).eq("company_id", cid).order("code"),
    ])
    if (expAccs) setExpenseAccounts(expAccs)
    if (eqAccs) setEquityLiabilityAccounts(eqAccs)

    // Load saved config
    const { data: settings } = await supabase.from("company_settings")
      .select("invoice_automation_config")
      .eq("company_id", cid)
      .maybeSingle()

    if (settings?.invoice_automation_config) {
      const config = settings.invoice_automation_config as any
      if (config.expenseEnabled !== undefined) setExpenseEnabled(config.expenseEnabled)
      if (config.profitEnabled !== undefined) setProfitEnabled(config.profitEnabled)
      if (config.expenseRules) setExpenseRules(config.expenseRules)
      if (config.partners) setPartners(config.partners)
    }

    setLoading(false)
  }

  // ── Toggle feature on/off ──────────────────────────────────────────────
  const toggleFeature = async (code: string, enabled: boolean) => {
    const featureId = featureIdMap[code]
    if (!featureId || !companyId || !canEdit) return
    if (code === "invoice_automation") setExpenseEnabled(enabled)
    if (code === "profit_allocation") setProfitEnabled(enabled)

    const { error } = await supabase.from("company_features").upsert({
      company_id: companyId,
      feature_id: featureId,
      enabled,
    }, { onConflict: "company_id, feature_id" })

    if (error) {
      setMessage("Error: " + error.message)
      if (code === "invoice_automation") setExpenseEnabled(!enabled)
      if (code === "profit_allocation") setProfitEnabled(!enabled)
    } else {
      setMessage("Feature toggled!")
      setTimeout(() => setMessage(""), 3000)
    }
  }

  // ── Expense rule helpers (dynamic) ────────────────────────────────────
  const updateExpenseRule = (idx: number, field: string, value: any) => {
    const updated = [...expenseRules]
    updated[idx] = { ...updated[idx], [field]: value }
    setExpenseRules(updated)
  }

  const addExpenseRule = () => setExpenseRules([...expenseRules, { name: "", rate: 0, account_id: null }])
  const removeExpenseRule = (idx: number) => setExpenseRules(expenseRules.filter((_, i) => i !== idx))

  // ── Partner helpers ────────────────────────────────────────────────────
  const updatePartner = (idx: number, field: string, value: any) => {
    const updated = [...partners]
    updated[idx] = { ...updated[idx], [field]: value }
    setPartners(updated)
  }

  const addPartner = () => setPartners([...partners, { account_id: null, percentage: 0 }])
  const removePartner = (idx: number) => setPartners(partners.filter((_, i) => i !== idx))

  const totalPartnerPercentage = partners.reduce((sum, p) => sum + (p.percentage || 0), 0)

  // ── Save settings ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId || !canEdit) return
    if (profitEnabled && totalPartnerPercentage !== 100) {
      setMessage("Profit allocation percentages must total 100%")
      return
    }
    setSaving(true)
    const config = { expenseEnabled, profitEnabled, expenseRules, partners }
    const { error } = await supabase.from("company_settings").upsert({
      company_id: companyId,
      invoice_automation_config: config,
    }, { onConflict: "company_id" })

    if (error) {
      setMessage("Error: " + error.message)
    } else {
      setMessage("Settings saved!")
    }
    setSaving(false)
    setTimeout(() => setMessage(""), 3000)
  }

  // ── Preview ─────────────────────────────────────────────────────────────
  const expenseTotal = expenseEnabled
    ? expenseRules.reduce((sum, r) => sum + (previewAmount * r.rate) / 100, 0)
    : 0
  const profitDistribution = profitEnabled
    ? partners.map(p => ({ ...p, amount: (previewAmount * p.percentage) / 100 }))
    : []

  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 40 }}><h2>Access Denied</h2></div>

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
        <style>{`
          .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; }
          .input, .select { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #1D4ED8; color: white; }
          .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
          .toggle-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; }
          .toggle-btn:hover { background: #F1F5F9; }
        `}</style>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>⚙️ Invoice Automation</h1>
        <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>Configure automated expenses and profit allocation</p>

        {message && (
          <div style={{ background: "#F0FDF4", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading...</div>
        ) : (
          <>
            {/* ── Expense Automation ── */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Expense Automation</h2>
                  <p style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>Auto‑calculate custom expenses on invoices</p>
                </div>
                <button className="toggle-btn" onClick={() => toggleFeature("invoice_automation", !expenseEnabled)}>
                  {expenseEnabled ? <ToggleRight size={24} color="#10B981" /> : <ToggleLeft size={24} color="#CBD5E1" />}
                </button>
              </div>

              {expenseEnabled && (
                <div style={{ marginTop: 16 }}>
                  {expenseRules.map((rule, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr 40px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                      <input className="input" value={rule.name} placeholder="Expense name" onChange={e => updateExpenseRule(idx, "name", e.target.value)} />
                      <div>
                        <label className="label">Rate (%)</label>
                        <input className="input" type="number" step="0.1" value={rule.rate} onChange={e => updateExpenseRule(idx, "rate", Number(e.target.value))} />
                      </div>
                      <select className="select" value={rule.account_id ?? ""} onChange={e => updateExpenseRule(idx, "account_id", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">— Select Account —</option>
                        {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                      <button className="btn btn-outline" style={{ padding: 6 }} onClick={() => removeExpenseRule(idx)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button className="btn btn-outline" onClick={addExpenseRule}><Plus size={14} /> Add Expense Rule</button>
                </div>
              )}
            </div>

            {/* ── Profit Allocation ── */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Profit Allocation</h2>
                  <p style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>Distribute net profit to partner accounts</p>
                </div>
                <button className="toggle-btn" onClick={() => toggleFeature("profit_allocation", !profitEnabled)}>
                  {profitEnabled ? <ToggleRight size={24} color="#10B981" /> : <ToggleLeft size={24} color="#CBD5E1" />}
                </button>
              </div>

              {profitEnabled && (
                <div style={{ marginTop: 16 }}>
                  {partners.map((p, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 40px', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      <select className="select" value={p.account_id ?? ""} onChange={e => updatePartner(idx, "account_id", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">— Select Account —</option>
                        {equityLiabilityAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                      <div>
                        <label className="label">% Share</label>
                        <input className="input" type="number" min="0" max="100" value={p.percentage} onChange={e => updatePartner(idx, "percentage", Number(e.target.value))} />
                      </div>
                      <button className="btn btn-outline" style={{ padding: 6 }} onClick={() => removePartner(idx)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <button className="btn btn-outline" onClick={addPartner}><Plus size={14} /> Add Partner</button>
                    <span style={{ fontWeight: 600, color: totalPartnerPercentage === 100 ? '#10B981' : '#EF4444' }}>Total: {totalPartnerPercentage}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Preview ── */}
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>📊 Preview</h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600 }}>Sample Invoice Amount:</span>
                <input className="input" style={{ width: 150 }} type="number" value={previewAmount} onChange={e => setPreviewAmount(Number(e.target.value))} />
              </div>
              <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8 }}>
                {expenseEnabled && (
                  <>
                    <p style={{ fontWeight: 600, marginBottom: 8 }}>Expense Charges:</p>
                    {expenseRules.map((r, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{r.name || '(unnamed)'} ({r.rate}%)</span>
                        <span>PKR {((previewAmount * r.rate) / 100).toLocaleString()}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 6, paddingTop: 6, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total Expenses</span>
                      <span>PKR {expenseTotal.toLocaleString()}</span>
                    </div>
                  </>
                )}
                {profitEnabled && (
                  <>
                    <p style={{ fontWeight: 600, marginTop: 12, marginBottom: 8 }}>Profit Allocation:</p>
                    {profitDistribution.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>Partner {idx+1} ({p.percentage}%)</span>
                        <span>PKR {p.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </>
        )}
      </div>
    </RoleGuard>
  )
}