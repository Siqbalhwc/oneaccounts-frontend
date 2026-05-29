"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, ToggleLeft, ToggleRight, Plus, X, LogIn, CreditCard,
} from "lucide-react"

// ── Feature definitions (same as Feature Manager) ──────────────
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

interface Company {
  id: string
  name: string
  plan: string
  is_trial: boolean
  trial_ends_at: string | null
  user_count: number
  admin_email: string
  subscription: {
    plan_type: string
    status: string
    start_date: string
    payment_method: string
    payment_reference: string
    amount: number
  } | null
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
  })
  const [savingSubscription, setSavingSubscription] = useState(false)

  useEffect(() => { fetchCompanies() }, [])

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

  const showMessage = (msg: string, isError = false) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 4000)
  }

  // ── Feature toggle (opens modal) ─────────────────────────────
  const openFeatureModal = async (company: Company) => {
    setSelectedCompanyForFeatures(company)
    // Fetch current features for this company
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
  }

  // ── Impersonation ─────────────────────────────────────────────
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

  // ── Delete company ────────────────────────────────────────────
  const deleteCompany = async (company: Company) => {
    if (!confirm(`Permanently delete ${company.name} and ALL its data?`)) return
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

  // ── Subscription modal handlers ───────────────────────────────
  const openSubscriptionModal = (company: Company) => {
    setSubscriptionForm({
      companyId: company.id,
      planType: company.plan?.toLowerCase() || "basic",
      paymentMethod: "Bank Transfer",
      paymentRef: "",
      amount: "",
      startDate: new Date().toISOString().split("T")[0],
    })
    setShowSubscriptionModal(true)
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
      }),
    })
    const data = await res.json()
    if (data.success) {
      showMessage("✅ Subscription recorded & company activated")
      setShowSubscriptionModal(false)
      fetchCompanies()
    } else {
      showMessage(data.error || "Failed", true)
    }
    setSavingSubscription(false)
  }

  // ── Segmented data ────────────────────────────────────────────
  const activeTrials = companies.filter(c => c.is_trial && c.trial_ends_at && new Date(c.trial_ends_at) > new Date())
  const expiredTrials = companies.filter(c => c.is_trial && c.trial_ends_at && new Date(c.trial_ends_at) <= new Date())
  const activeClients = companies.filter(c => !c.is_trial)

  // ── KPI cards ─────────────────────────────────────────────────
  const kpiStyle = (bg: string) => ({
    background: bg, borderRadius: 8, padding: "12px 14px", color: "white",
    minWidth: 120, textAlign: "center" as const, fontWeight: 700,
  })

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading platform...</div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .sa-header { margin-bottom: 20px; }
        .sa-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .sa-subtitle { font-size: 13px; color: #94A3B8; }
        .sa-section { margin-bottom: 24px; }
        .sa-section-title { font-size: 14px; font-weight: 700; color: #334155; margin-bottom: 10px; }
        .sa-company-card {
          background: white; border: 1px solid #E2E8F0; border-radius: 10px;
          padding: 12px 16px; margin-bottom: 8px;
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
          flex-wrap: wrap;
        }
        .sa-company-card:hover { background: #FAFBFF; }
        .sa-badge {
          padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600;
          display: inline-block;
        }
        .sa-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
          border: none; cursor: pointer; font-family: inherit;
        }
        .sa-btn-outline { background: white; border: 1px solid #E2E8F0; color: #475569; }
        .sa-btn-primary { background: #1D4ED8; color: white; }
        .sa-btn-danger { background: #EF4444; color: white; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal-box {
          background: white; border-radius: 12px; padding: 24px;
          max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .input-field { width: 100%; padding: 6px 10px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 12px; margin-bottom: 10px; }
      `}</style>

      <div className="sa-header">
        <div className="sa-title">🛡️ Super Admin Dashboard</div>
        <div className="sa-subtitle">Manage all companies, features, and subscriptions</div>
      </div>

      {message && (
        <div style={{
          background: message.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
          color: message.startsWith("✅") ? "#15803D" : "#B91C1C",
          padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13,
        }}>
          {message}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={kpiStyle("#1E3A8A")}>
          <div style={{ fontSize: 20 }}>{companies.length}</div>
          <div style={{ fontSize: 10 }}>Total Companies</div>
        </div>
        <div style={kpiStyle("#10B981")}>
          <div style={{ fontSize: 20 }}>{activeTrials.length}</div>
          <div style={{ fontSize: 10 }}>Active Trials</div>
        </div>
        <div style={kpiStyle("#EF4444")}>
          <div style={{ fontSize: 20 }}>{expiredTrials.length}</div>
          <div style={{ fontSize: 10 }}>Expired Trials</div>
        </div>
        <div style={kpiStyle("#0EA5E9")}>
          <div style={{ fontSize: 20 }}>{activeClients.length}</div>
          <div style={{ fontSize: 10 }}>Active Clients</div>
        </div>
      </div>

      {/* Active Trials */}
      {activeTrials.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-title">🌟 Active Trials ({activeTrials.length})</div>
          {activeTrials.map(c => (
            <div key={c.id} className="sa-company-card">
              <div>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>
                  {c.admin_email} · Users: {c.user_count} · Plan: {c.plan}
                </div>
                {c.trial_ends_at && <div style={{ fontSize: 10, color: "#10B981" }}>Ends {new Date(c.trial_ends_at).toLocaleDateString()}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="sa-btn sa-btn-outline" onClick={() => openFeatureModal(c)}>⚙️ Features</button>
                <button className="sa-btn sa-btn-primary" onClick={() => openSubscriptionModal(c)}><CreditCard size={12}/> Subscribe</button>
                <button className="sa-btn sa-btn-outline" onClick={() => impersonate(c)}><LogIn size={12}/> Login</button>
                <button className="sa-btn sa-btn-danger" onClick={() => deleteCompany(c)}><Trash2 size={12}/> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expired Trials */}
      {expiredTrials.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-title">⏳ Expired Trials ({expiredTrials.length})</div>
          {expiredTrials.map(c => (
            <div key={c.id} className="sa-company-card">
              <div>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>
                  {c.admin_email} · Users: {c.user_count} · Plan: {c.plan}
                </div>
                {c.trial_ends_at && <div style={{ fontSize: 10, color: "#EF4444" }}>Expired {new Date(c.trial_ends_at).toLocaleDateString()}</div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="sa-btn sa-btn-primary" onClick={() => openSubscriptionModal(c)}>Subscribe</button>
                <button className="sa-btn sa-btn-danger" onClick={() => deleteCompany(c)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Clients */}
      {activeClients.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-title">💼 Active Clients ({activeClients.length})</div>
          {activeClients.map(c => (
            <div key={c.id} className="sa-company-card">
              <div>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>
                  {c.admin_email} · Users: {c.user_count} · Plan: {c.plan}
                  {c.subscription && <span> · Last payment: {c.subscription.amount ? `PKR ${c.subscription.amount}` : "—"}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="sa-btn sa-btn-outline" onClick={() => openFeatureModal(c)}>Features</button>
                <button className="sa-btn sa-btn-primary" onClick={() => openSubscriptionModal(c)}>Update</button>
                <button className="sa-btn sa-btn-outline" onClick={() => impersonate(c)}>Login</button>
                <button className="sa-btn sa-btn-danger" onClick={() => deleteCompany(c)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Feature Toggle Modal ─────────────────────────────────── */}
      {showFeatureModal && selectedCompanyForFeatures && (
        <div className="modal-overlay" onClick={() => setShowFeatureModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedCompanyForFeatures.name}</h2>
              <button className="sa-btn sa-btn-outline" onClick={() => setShowFeatureModal(false)}><X size={16}/></button>
            </div>
            {FEATURE_CODES.map(code => (
              <div key={code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                <span style={{ fontSize: 13 }}>{FEATURE_LABELS[code] || code}</span>
                <button onClick={() => toggleFeature(code)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  {featureStates[code]
                    ? <ToggleRight size={22} color="#10B981" />
                    : <ToggleLeft size={22} color="#CBD5E1" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Subscription Modal ───────────────────────────────────── */}
      {showSubscriptionModal && (
        <div className="modal-overlay" onClick={() => setShowSubscriptionModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Record Payment</h2>
              <button className="sa-btn sa-btn-outline" onClick={() => setShowSubscriptionModal(false)}><X size={16}/></button>
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
            <button className="sa-btn sa-btn-primary" onClick={submitSubscription} disabled={savingSubscription} style={{ width: "100%", padding: "10px", fontSize: 13 }}>
              {savingSubscription ? "Saving..." : "Record Subscription"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}