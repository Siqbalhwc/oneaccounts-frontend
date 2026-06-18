"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, Save, CheckCircle, Edit3, X } from "lucide-react"
import PremiumGuard from "@/components/PremiumGuard"
import { usePlan } from "@/contexts/PlanContext"

function TaxSettingsContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const [taxCodes, setTaxCodes] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])

  // Company tax settings
  const [settings, setSettings] = useState<any>({})
  const [defaultSalesTaxId, setDefaultSalesTaxId] = useState<string>("")
  const [defaultWhtTaxId, setDefaultWhtTaxId] = useState<string>("")
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false)
  const [taxRegNo, setTaxRegNo] = useState("")
  const [taxOffice, setTaxOffice] = useState("")

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingCode, setEditingCode] = useState<any>(null)
  const [formData, setFormData] = useState({
    tax_category_code: "sales_tax",
    code: "",
    name: "",
    rate: 0,
    applies_to: "both",
    is_default: false,
    tax_account_id: "",
    effective_from: new Date().toISOString().split("T")[0],
    effective_to: "",
    wht_base: "net",
    is_recoverable: true,
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        fetchTaxCodes(cid)
        fetchAccounts(cid)
        fetchSettings(cid)
      }
    })
  }, [])

  const fetchTaxCodes = async (cid: string) => {
    const res = await fetch(`/api/settings/tax-codes?companyId=${cid}`)
    const data = await res.json()
    if (data.taxCodes) setTaxCodes(data.taxCodes)
  }

  const fetchAccounts = async (cid: string) => {
    const { data } = await supabase.from("accounts")
      .select("id, code, name")
      .eq("company_id", cid)
      .order("code")
    if (data) setAccounts(data)
  }

  const fetchSettings = async (cid: string) => {
    const res = await fetch(`/api/settings/tax-settings?companyId=${cid}`)
    const data = await res.json()
    if (data.settings) {
      setSettings(data.settings)
      setDefaultSalesTaxId(data.settings.default_sales_tax_code_id || "")
      setDefaultWhtTaxId(data.settings.default_wht_tax_code_id || "")
      setPricesIncludeTax(data.settings.prices_include_tax || false)
      setTaxRegNo(data.settings.tax_registration_no || "")
      setTaxOffice(data.settings.tax_office || "")
    }
    setLoading(false)
  }

  const openModal = (code?: any) => {
    if (code) {
      setEditingCode(code)
      setFormData({
        tax_category_code: code.tax_category_code || "sales_tax",
        code: code.code,
        name: code.name,
        rate: code.rate,
        applies_to: code.applies_to || "both",
        is_default: code.is_default || false,
        tax_account_id: code.tax_account_id || "",
        effective_from: code.effective_from || new Date().toISOString().split("T")[0],
        effective_to: code.effective_to || "",
        wht_base: code.wht_base || "net",
        is_recoverable: code.is_recoverable !== undefined ? code.is_recoverable : true,
      })
    } else {
      setEditingCode(null)
      setFormData({
        tax_category_code: "sales_tax",
        code: "",
        name: "",
        rate: 0,
        applies_to: "both",
        is_default: false,
        tax_account_id: "",
        effective_from: new Date().toISOString().split("T")[0],
        effective_to: "",
        wht_base: "net",
        is_recoverable: true,
      })
    }
    setShowModal(true)
  }

  const handleSaveCode = async () => {
    if (!formData.code || !formData.name || !formData.tax_account_id) {
      setMessage("Error: Code, Name, and GL Account are required.")
      setTimeout(() => setMessage(""), 3000)
      return
    }
    setSaving(true)
    const url = "/api/settings/tax-codes"
    const method = editingCode ? "PUT" : "POST"
    const body = {
      id: editingCode?.id,
      companyId,
      ...formData,
      effective_to: formData.effective_to || null,
    }
    const res = await fetch(method === "PUT" ? `${url}?id=${editingCode.id}&companyId=${companyId}` : url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const result = await res.json()
    if (result.success) {
      setMessage("✅ Tax code saved!")
      setShowModal(false)
      fetchTaxCodes(companyId)
    } else {
      setMessage("Error: " + (result.error || "Unknown"))
    }
    setSaving(false)
    setTimeout(() => setMessage(""), 3000)
  }

  const handleDeleteCode = async (id: string) => {
    if (!confirm("Lock this tax code? It cannot be deleted, only locked.")) return
    await fetch(`/api/settings/tax-codes?id=${id}&companyId=${companyId}`, { method: "DELETE" })
    fetchTaxCodes(companyId)
    setMessage("✅ Tax code locked.")
    setTimeout(() => setMessage(""), 3000)
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    const res = await fetch("/api/settings/tax-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        default_sales_tax_code_id: defaultSalesTaxId || null,
        default_wht_tax_code_id: defaultWhtTaxId || null,
        prices_include_tax: pricesIncludeTax,
        tax_registration_no: taxRegNo,
        tax_office: taxOffice,
      }),
    })
    const result = await res.json()
    if (result.success) setMessage("✅ Settings saved!")
    else setMessage("Error: " + (result.error || "Unknown"))
    setSaving(false)
    setTimeout(() => setMessage(""), 3000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .input, .select { height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); width: 100%; box-sizing: border-box; font-family: inherit; }
        .input:focus, .select:focus { border-color: var(--primary); }
        .btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px; font-family: inherit; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-danger { color: #EF4444; border-color: #FECACA; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
        @media (max-width: 640px) { .modal { padding: 16px; } }
      `}</style>

      <button className="btn" onClick={() => router.push("/dashboard/settings")}><ArrowLeft size={16} /> Back to Settings</button>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "16px 0 4px" }}>⚙️ Tax Settings</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>Manage tax codes, defaults, and registration</p>

      {message && (
        <div style={{ background: message.startsWith("✅") ? "#065F46" : "#7F1D1D", color: "white", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* Company Tax Settings */}
      <div className="card">
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Company Tax Settings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label className="inv-label">Default Sales Tax Code</label>
            <select className="select" value={defaultSalesTaxId} onChange={e => setDefaultSalesTaxId(e.target.value)}>
              <option value="">— None —</option>
              {taxCodes.filter(tc => tc.tax_category_code === 'sales_tax').map(tc => (
                <option key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="inv-label">Default WHT Code</label>
            <select className="select" value={defaultWhtTaxId} onChange={e => setDefaultWhtTaxId(e.target.value)}>
              <option value="">— None —</option>
              {taxCodes.filter(tc => tc.tax_category_code === 'wht').map(tc => (
                <option key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="inv-label">Tax Registration No</label>
            <input className="input" value={taxRegNo} onChange={e => setTaxRegNo(e.target.value)} placeholder="e.g., NTN" />
          </div>
          <div>
            <label className="inv-label">Tax Office</label>
            <input className="input" value={taxOffice} onChange={e => setTaxOffice(e.target.value)} placeholder="e.g., LTO Karachi" />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={pricesIncludeTax} onChange={e => setPricesIncludeTax(e.target.checked)} />
          <span style={{ fontSize: 13, color: "var(--text)" }}>Prices include tax (inclusive)</span>
        </label>
        <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
          <Save size={14} /> Save Settings
        </button>
      </div>

      {/* Tax Codes Table */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Tax Codes</h3>
          <button className="btn btn-primary" onClick={() => openModal()}><Plus size={14} /> Add Code</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Rate</th>
                <th>Default</th>
                <th>GL Account</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {taxCodes.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>No tax codes defined.</td></tr>
              ) : (
                taxCodes.map((tc: any) => (
                  <tr key={tc.id}>
                    <td style={{ fontWeight: 600 }}>{tc.code}</td>
                    <td>{tc.name}</td>
                    <td>{tc.tax_category_code}</td>
                    <td>{tc.rate}%</td>
                    <td>{tc.is_default ? "✅" : ""}</td>
                    <td>{tc.gl_account_code}</td>
                    <td>{tc.is_locked ? "🔒 Locked" : "Active"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn" onClick={() => openModal(tc)} style={{ padding: "4px 8px", fontSize: 11 }}><Edit3 size={12} /></button>
                        {!tc.is_locked && (
                          <button className="btn btn-danger" onClick={() => handleDeleteCode(tc.id)} style={{ padding: "4px 8px", fontSize: 11 }}><Trash2 size={12} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editingCode ? "Edit Tax Code" : "New Tax Code"}</h3>
              <button className="btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label className="inv-label">Category</label>
                <select className="select" value={formData.tax_category_code} onChange={e => setFormData({...formData, tax_category_code: e.target.value})}>
                  <option value="sales_tax">Sales Tax</option>
                  <option value="vat">VAT</option>
                  <option value="gst">GST</option>
                  <option value="wht">WHT</option>
                  <option value="advance_tax">Advance Tax</option>
                </select>
              </div>
              <div>
                <label className="inv-label">Code</label>
                <input className="input" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="e.g., GST-18%" />
              </div>
              <div>
                <label className="inv-label">Name</label>
                <input className="input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g., GST 18%" />
              </div>
              <div>
                <label className="inv-label">Rate (%)</label>
                <input className="input" type="number" value={formData.rate} onChange={e => setFormData({...formData, rate: Number(e.target.value)})} />
              </div>
              <div>
                <label className="inv-label">Applies To</label>
                <select className="select" value={formData.applies_to} onChange={e => setFormData({...formData, applies_to: e.target.value})}>
                  <option value="both">Both</option>
                  <option value="inventory">Inventory</option>
                  <option value="service">Service</option>
                </select>
              </div>
              <div>
                <label className="inv-label">GL Account</label>
                <select className="select" value={formData.tax_account_id} onChange={e => setFormData({...formData, tax_account_id: e.target.value})}>
                  <option value="">— Select —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                </select>
              </div>
              {formData.tax_category_code === 'wht' && (
                <div>
                  <label className="inv-label">WHT Calculation Base</label>
                  <select className="select" value={formData.wht_base} onChange={e => setFormData({...formData, wht_base: e.target.value})}>
                    <option value="net">Net Amount (before GST)</option>
                    <option value="gross">Gross Amount (incl. GST)</option>
                    <option value="taxable">Taxable Amount</option>
                  </select>
                </div>
              )}
              {['sales_tax','vat','gst'].includes(formData.tax_category_code) && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={formData.is_recoverable} onChange={e => setFormData({...formData, is_recoverable: e.target.checked})} />
                  <span style={{ fontSize: 13 }}>Input tax is recoverable (asset account)</span>
                </label>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={formData.is_default} onChange={e => setFormData({...formData, is_default: e.target.checked})} />
                <span style={{ fontSize: 13 }}>Set as default for this category</span>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveCode} disabled={saving}>
                {saving ? "Saving..." : "Save Tax Code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TaxSettingsPage() {
  return (
    <PremiumGuard featureCode="tax_management" featureName="Tax Settings" featureDesc="Manage tax codes and settings">
      <TaxSettingsContent />
    </PremiumGuard>
  )
}