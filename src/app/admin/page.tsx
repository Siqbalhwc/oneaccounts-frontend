"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, ToggleLeft, ToggleRight, Plus, X, LogIn, CreditCard, AlertTriangle,
} from "lucide-react"

const FEATURE_CODES = [
  "invoice_automation","profit_allocation","inventory","investors",
  "balance_sheet","whatsapp_invoice","payment_reminders",
  "csv_import_export","email_reports","purchase_orders",
]
const FEATURE_LABELS: Record<string, string> = {
  invoice_automation:"Invoice Automation", profit_allocation:"Profit Allocation",
  inventory:"Inventory", investors:"Investors", balance_sheet:"Balance Sheet",
  whatsapp_invoice:"WhatsApp Invoice", payment_reminders:"Payment Reminders",
  csv_import_export:"CSV Import/Export", email_reports:"Email Reports",
  purchase_orders:"Purchase Orders",
}
const ADDON_FEATURES = ["whatsapp_invoice", "inventory", "purchase_orders"]
const ADDON_LABELS: Record<string, string> = {
  whatsapp_invoice: "WhatsApp Integration",
  inventory: "Inventory",
  purchase_orders: "Purchase Orders",
}

interface Subscription {
  plan_type: string
  status: string
  start_date: string
  end_date: string
  amount: number
  payment_method: string
  topups: string[]
}

interface Company {
  id: string
  name: string
  plan: string
  is_trial: boolean
  trial_ends_at: string | null
  user_count: number
  admin_email: string
  features: string[]
  subscription: Subscription | null
}

export default function SuperAdminPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)
  const [featureStates, setFeatureStates] = useState<Record<string, boolean>>({})
  const [showFeatureModal, setShowFeatureModal] = useState(false)
  const [selectedCompanyForFeatures, setSelectedCompanyForFeatures] = useState<Company | null>(null)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [subscriptionForm, setSubscriptionForm] = useState({
    companyId: "", planType: "basic", paymentMethod: "Bank Transfer", paymentRef: "", amount: "", startDate: "",
    topups: [] as string[],
  })
  const [savingSubscription, setSavingSubscription] = useState(false)
  const [payments, setPayments] = useState<any[]>([])

  // --- Super Admin Access Control ---
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [checkingAccess, setCheckingAccess] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setCheckingAccess(false)
        return
      }
      supabase
        .from("super_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          setIsSuperAdmin(!!data)
          setCheckingAccess(false)
        })
    })
  }, [])

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies()
      fetchPayments()
    }
  }, [isSuperAdmin])
  // --- End Access Control ---

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/super-admin/companies")
      const data = await res.json()
      if (data.companies) setCompanies(data.companies)
      else showMessage(data.error || "Failed to load", true)
    } catch { showMessage("Network error", true) }
    setLoading(false)
  }

  const fetchPayments = async () => {
    try {
      const res = await fetch("/api/super-admin/payments")
      const data = await res.json()
      if (data.payments) setPayments(data.payments)
    } catch {}
  }

  const showMessage = (msg: string, isError = false) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 4000)
  }

  const openFeatureModal = async (company: Company) => {
    setSelectedCompanyForFeatures(company)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    try {
      const res = await fetch(`/api/super-admin/features/${company.id}`)
      if (res.ok) {
        const data = await res.json()
        const states: Record<string, boolean> = {}
        FEATURE_CODES.forEach(c => { states[c] = false })
        if (data.features) {
          data.features.forEach((f: any) => { if (f.code) states[f.code] = f.enabled })
        }
        setFeatureStates(states)
      }
    } catch {}
    setShowFeatureModal(true)
  }

  const toggleFeature = async (code: string) => {
    if (!selectedCompanyForFeatures) return
    const newEnabled = !featureStates[code]
    setFeatureStates(prev => ({ ...prev, [code]: newEnabled }))
    await fetch("/api/super-admin/features/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedCompanyForFeatures.id,
        featureCode: code,
        enabled: newEnabled,
      }),
    })
    showMessage(`✅ ${FEATURE_LABELS[code] || code} updated`)
    fetchCompanies()
  }

  const impersonate = async (company: Company) => {
    const res = await fetch("/api/super-admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: company.id }),
    })
    const data = await res.json()
    if (data.redirectUrl) {
      window.open(data.redirectUrl, "_blank")
    } else {
      showMessage("Impersonation failed", true)
    }
  }

  const deleteCompany = async (company: Company) => {
    if (!confirm(`Delete ${company.name}? It will be hidden but can be restored later.`)) return
    const res = await fetch("/api/super-admin/companies/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: company.id }),
    })
    const data = await res.json()
    if (data.success) {
      showMessage(`✅ ${company.name} deleted`)
      setCompanies(prev => prev.filter(c => c.id !== company.id))
      setExpandedCompany(null)
    } else showMessage(data.error || "Delete failed", true)
  }

  const openSubscriptionModal = (company: Company) => {
    setSubscriptionForm({
      companyId: company.id,
      planType: company.plan?.toLowerCase().replace(/ .*/, '') || "basic",
      paymentMethod: "Bank Transfer",
      paymentRef: "",
      amount: "",
      startDate: new Date().toISOString().split("T")[0],
      topups: [],
    })
    setShowSubscriptionModal(true)
  }

  const toggleTopup = (code: string) => {
    setSubscriptionForm(prev => ({
      ...prev,
      topups: prev.topups.includes(code)
        ? prev.topups.filter(t => t !== code)
        : [...prev.topups, code],
    }))
  }

  const submitSubscription = async () => {
    setSavingSubscription(true)
    const res = await fetch("/api/super-admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: subscriptionForm.companyId,
        planType: subscriptionForm.planType,
        paymentMethod: subscriptionForm.paymentMethod,
        paymentRef: subscriptionForm.paymentRef,
        amount: parseFloat(subscriptionForm.amount) || 0,
        startDate: subscriptionForm.startDate,
        topups: subscriptionForm.topups,
      }),
    })
    const data = await res.json()
    if (data.success) {
      showMessage("✅ Subscription recorded & company activated")
      setShowSubscriptionModal(false)
      fetchCompanies()
      fetchPayments()
    } else {
      showMessage(data.error || "Failed", true)
    }
    setSavingSubscription(false)
  }

  const isExpiringSoon = (sub: Subscription | null) => {
    if (!sub || !sub.end_date) return false
    const expiry = new Date(sub.end_date)
    const now = new Date()
    const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diff <= 10 && diff > 0
  }

  const activeTrials = companies.filter(c => c.is_trial && c.trial_ends_at && new Date(c.trial_ends_at) > new Date())
  const expiredTrials = companies.filter(c => c.is_trial && c.trial_ends_at && new Date(c.trial_ends_at) <= new Date())
  const activeClients = companies.filter(c => !c.is_trial)

  if (checkingAccess) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Checking permissions…</div>
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading platform...</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .sa-header { margin-bottom: 20px; }
        .sa-title { font-size: 22px; font-weight: 800; color: var(--text); }
        .sa-subtitle { font-size: 13px; color: var(--text-muted); }
        .sa-section { margin-bottom: 24px; }
        .sa-section-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
        .sa-company-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          padding: 12px 16px; margin-bottom: 8px;
          display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
          flex-wrap: nowrap;
        }
        .sa-company-card:hover { background: var(--card-hover); }
        .sa-card-left {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; gap: 4px;
        }
        .sa-card-right {
          display: flex; gap: 6px; flex-shrink: 0; align-items: center;
        }
        .sa-badge {
          padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600;
          display: inline-block;
        }
        .sa-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
          border: 1px solid var(--border); cursor: pointer; font-family: inherit;
          background: transparent; color: var(--text-muted);
          white-space: nowrap;
        }
        .sa-btn:hover { background: var(--card-hover); }
        .sa-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .sa-btn-danger { background: #EF4444; color: white; border-color: #EF4444; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal-box {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px;
          max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; color: var(--text);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .input-field { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; margin-bottom: 10px; background: var(--bg); color: var(--text); }
        .pay-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .pay-table th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); border-bottom: 2px solid var(--border); }
        .pay-table td { padding: 8px 12px; font-size: 12px; color: var(--text); border-bottom: 1px solid var(--border); }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
        .kpi-value { font-size: 22px; font-weight: 800; }
        .kpi-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-top: 2px; }
        .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
        .feature-pill {
          display: inline-block; padding: 1px 6px; margin-right: 4px; margin-bottom: 4px;
          background: #065F46; color: #A7F3D0; border-radius: 12px; font-size: 10px; font-weight: 600;
        }
        .expiry-warning {
          color: #EF4444; font-weight: 600; font-size: 11px; display: flex; align-items: center; gap: 3px;
        }
        @media (max-width: 640px) {
          .sa-company-card { flex-direction: column; align-items: stretch; }
          .sa-card-right { justify-content: flex-end; flex-wrap: wrap; }
          .sa-btn { font-size: 10px; padding: 4px 8px; }
          .kpi-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="sa-header">
        <div className="sa-title">🛡️ Super Admin Dashboard</div>
        <div className="sa-subtitle">Manage all companies, features, and subscriptions</div>
      </div>

      {message && (
        <div style={{
          background: message.startsWith("✅") ? "#065F46" : "#7F1D1D",
          color: "white",
          padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13,
        }}>
          {message}
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "#3B82F6" }}>{companies.length}</div>
          <div className="kpi-label">Total Companies</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "#10B981" }}>{activeTrials.length}</div>
          <div className="kpi-label">Active Trials</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "#EF4444" }}>{expiredTrials.length}</div>
          <div className="kpi-label">Expired Trials</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "#0EA5E9" }}>{activeClients.length}</div>
          <div className="kpi-label">Active Clients</div>
        </div>
      </div>

      {activeTrials.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-title">🌟 Active Trials ({activeTrials.length})</div>
          {activeTrials.map(c => (
            <div key={c.id} className="sa-company-card">
              <div className="sa-card-left">
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {c.admin_email} · Users: {c.user_count} · Plan: {c.plan}
                </div>
                {c.trial_ends_at && <div style={{ fontSize: 10, color: "#10B981" }}>Trial ends {new Date(c.trial_ends_at).toLocaleDateString()}</div>}
                {c.features.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    {c.features.map(f => (
                      <span key={f} className="feature-pill">{FEATURE_LABELS[f] || f}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="sa-card-right">
                <button className="sa-btn" onClick={() => openFeatureModal(c)}>⚙️ Features</button>
                <button className="sa-btn sa-btn-primary" onClick={() => openSubscriptionModal(c)}><CreditCard size={12}/> Subscribe</button>
                <button className="sa-btn" onClick={() => impersonate(c)}><LogIn size={12}/> Login</button>
                <button className="sa-btn sa-btn-danger" onClick={() => deleteCompany(c)}><Trash2 size={12}/> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {expiredTrials.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-title">⏳ Expired Trials ({expiredTrials.length})</div>
          {expiredTrials.map(c => (
            <div key={c.id} className="sa-company-card">
              <div className="sa-card-left">
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {c.admin_email} · Users: {c.user_count} · Plan: {c.plan}
                </div>
                {c.trial_ends_at && <div style={{ fontSize: 10, color: "#EF4444" }}>Expired {new Date(c.trial_ends_at).toLocaleDateString()}</div>}
                {c.features.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    {c.features.map(f => (
                      <span key={f} className="feature-pill">{FEATURE_LABELS[f] || f}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="sa-card-right">
                <button className="sa-btn sa-btn-primary" onClick={() => openSubscriptionModal(c)}>Subscribe</button>
                <button className="sa-btn sa-btn-danger" onClick={() => deleteCompany(c)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeClients.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-title">💼 Active Clients ({activeClients.length})</div>
          {activeClients.map(c => (
            <div key={c.id} className="sa-company-card">
              <div className="sa-card-left">
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  {c.name}
                  {isExpiringSoon(c.subscription) && (
                    <span className="expiry-warning"><AlertTriangle size={12}/> Expiring soon</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {c.admin_email} · Users: {c.user_count}
                </div>
                {c.subscription ? (
                  <div style={{ fontSize: 12, color: "var(--text)", marginTop: 2 }}>
                    {c.subscription.plan_type} · PKR {c.subscription.amount?.toLocaleString()}
                    {c.subscription.topups?.length > 0 && ` + ${c.subscription.topups.map(t => ADDON_LABELS[t] || t).join(', ')}`}
                    <br/>
                    Start: {new Date(c.subscription.start_date).toLocaleDateString()} · Expires: {new Date(c.subscription.end_date).toLocaleDateString()}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No payment recorded yet</div>
                )}
                {c.features.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    {c.features.map(f => (
                      <span key={f} className="feature-pill">{FEATURE_LABELS[f] || f}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="sa-card-right">
                <button className="sa-btn" onClick={() => openFeatureModal(c)}>Features</button>
                <button className="sa-btn sa-btn-primary" onClick={() => openSubscriptionModal(c)}>Update</button>
                <button className="sa-btn" onClick={() => impersonate(c)}>Login</button>
                <button className="sa-btn sa-btn-danger" onClick={() => deleteCompany(c)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sa-section">
        <div className="sa-section-title">📬 Payment Notifications ({payments.length})</div>
        {payments.length === 0 ? (
          <div style={{ background: "var(--card)", borderRadius: 8, padding: 16, textAlign: "center", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            No payment notifications yet.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="pay-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Amount</th>
                  <th>Plan / Period</th>
                  <th>Top‑ups</th>
                  <th>Receipt</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.companies?.name || '—'}</td>
                    <td>PKR {p.amount?.toLocaleString()}</td>
                    <td>{p.plan_code} / {p.period}</td>
                    <td>
                      {p.topups && p.topups.length > 0
                        ? p.topups.map((t: string) => ADDON_LABELS[t] || t).join(', ')
                        : '—'}
                    </td>
                    <td>
                      {p.receipt_url ? (
                        <a href={p.receipt_url} target="_blank" rel="noopener noreferrer"
                           style={{ color: '#3B82F6', textDecoration: 'underline' }}>
                          View
                        </a>
                      ) : '—'}
                    </td>
                    <td>{new Date(p.created_at).toLocaleDateString('en-PK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showFeatureModal && selectedCompanyForFeatures && (
        <div className="modal-overlay" onClick={() => setShowFeatureModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedCompanyForFeatures.name}</h2>
              <button className="sa-btn" onClick={() => setShowFeatureModal(false)}><X size={16}/></button>
            </div>
            {FEATURE_CODES.map(code => (
              <div key={code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13 }}>{FEATURE_LABELS[code] || code}</span>
                <button onClick={() => toggleFeature(code)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  {featureStates[code]
                    ? <ToggleRight size={22} color="#10B981" />
                    : <ToggleLeft size={22} color="var(--text-muted)" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSubscriptionModal && (
        <div className="modal-overlay" onClick={() => setShowSubscriptionModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Record Payment</h2>
              <button className="sa-btn" onClick={() => setShowSubscriptionModal(false)}><X size={16}/></button>
            </div>
            <select className="input-field" value={subscriptionForm.planType} onChange={e => setSubscriptionForm({...subscriptionForm, planType: e.target.value})}>
              <option value="basic">Basic</option>
              <option value="pro">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <input className="input-field" placeholder="Payment Reference" value={subscriptionForm.paymentRef} onChange={e => setSubscriptionForm({...subscriptionForm, paymentRef: e.target.value})} />
            <input className="input-field" placeholder="Amount (PKR)" type="number" value={subscriptionForm.amount} onChange={e => setSubscriptionForm({...subscriptionForm, amount: e.target.value})} />
            <input className="input-field" type="date" value={subscriptionForm.startDate} onChange={e => setSubscriptionForm({...subscriptionForm, startDate: e.target.value})} />
            <input className="input-field" placeholder="Payment Method" value={subscriptionForm.paymentMethod} onChange={e => setSubscriptionForm({...subscriptionForm, paymentMethod: e.target.value})} />

            <div style={{ marginTop: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Add‑ons (select if purchased)</div>
              {ADDON_FEATURES.map(addon => (
                <label key={addon} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={subscriptionForm.topups.includes(addon)}
                    onChange={() => toggleTopup(addon)}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  {ADDON_LABELS[addon] || addon}
                </label>
              ))}
            </div>

            <button className="sa-btn sa-btn-primary" onClick={submitSubscription} disabled={savingSubscription} style={{ width: "100%", padding: "10px", fontSize: 13 }}>
              {savingSubscription ? "Saving..." : "Record Subscription"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}