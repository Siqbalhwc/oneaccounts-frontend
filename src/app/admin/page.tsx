"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, ToggleLeft, ToggleRight, Plus, X, LogIn, CreditCard,
  AlertTriangle, ChevronDown, ChevronRight, Download,
} from "lucide-react"

const FEATURE_CODES = [
  "invoice_automation","profit_allocation","inventory","investors",
  "balance_sheet","whatsapp_invoice","payment_reminders",
  "csv_import_export","email_reports","purchase_orders","tax_management",
]
const FEATURE_LABELS: Record<string, string> = {
  invoice_automation:"Invoice Automation", profit_allocation:"Profit Allocation",
  inventory:"Inventory", investors:"Investors", balance_sheet:"Balance Sheet",
  whatsapp_invoice:"WhatsApp Invoice", payment_reminders:"Payment Reminders",
  csv_import_export:"CSV Import/Export", tax_management: "Tax Management", email_reports:"Email Reports",
  purchase_orders:"Purchase Orders",
}
const ADDON_FEATURES = ["whatsapp_invoice", "inventory", "purchase_orders"]
const ADDON_LABELS: Record<string, string> = {
  whatsapp_invoice: "WhatsApp Integration",
  inventory: "Inventory",
  purchase_orders: "Purchase Orders",
}

const CLEANUP_ENTITIES = [
  { entity: "journal", label: "Delete Journal Entries" },
  { entity: "all_invoices", label: "Delete All Invoices" },
  { entity: "sales_invoices", label: "Delete Sales Invoices" },
  { entity: "purchase_bills", label: "Delete Purchase Bills" },
  { entity: "customers", label: "Delete Customers" },
  { entity: "suppliers", label: "Delete Suppliers" },
  { entity: "products", label: "Delete Products" },
]

interface Subscription {
  plan_type: string
  status: string
  start_date: string
  end_date: string
  amount: number
  payment_method: string
  topups: string[]
  max_users?: number | null
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
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [featureStates, setFeatureStates] = useState<Record<string, boolean>>({})
  const [showFeatureModal, setShowFeatureModal] = useState(false)
  const [selectedCompanyForFeatures, setSelectedCompanyForFeatures] = useState<Company | null>(null)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [subscriptionForm, setSubscriptionForm] = useState({
    companyId: "", planType: "basic", paymentMethod: "Bank Transfer", paymentRef: "", amount: "", startDate: "",
    topups: [] as string[],
    maxUsers: "",
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

  const toggleRow = (companyId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(companyId)) next.delete(companyId)
      else next.add(companyId)
      return next
    })
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
      maxUsers: "",
    })
    setShowSubscriptionModal(true)
  }

  const extendTrial = async (company: Company, days: number) => {
    const res = await fetch("/api/super-admin/companies/extend-trial", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: company.id, days }),
    })
    const data = await res.json()
    if (data.success) {
      showMessage(`✅ Trial extended by ${days} days – new expiry: ${new Date(data.newTrialEndsAt).toLocaleDateString()}`)
      fetchCompanies()
    } else {
      showMessage(data.error || "Extension failed", true)
    }
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
        maxUsers: subscriptionForm.maxUsers ? parseInt(subscriptionForm.maxUsers) : null,
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

  // --- Data Cleanup Helpers ---
  const handleCleanupEntity = async (companyId: string, entity: string) => {
    if (!confirm(`Are you sure you want to delete "${entity}" for this company?`)) return
    const res = await fetch("/api/admin/delete-entity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, targetCompanyId: companyId }),
    })
    const data = await res.json()
    if (data.success) showMessage(`✅ ${entity} deleted successfully.`)
    else showMessage(`❌ ${data.error || "Failed"}`)
  }

  const handleNukeCompany = async (companyId: string) => {
    if (!confirm("This will DELETE ALL operational data for this company (keeps chart of accounts). Are you absolutely sure?")) return
    const res = await fetch("/api/admin/nuke-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetCompanyId: companyId }),
    })
    const data = await res.json()
    if (data.success) showMessage("✅ Company data has been wiped completely.")
    else showMessage(`❌ ${data.error || "Failed"}`)
  }

  const handleBackup = async (company: Company) => {
    showMessage("⏳ Generating backup...")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showMessage("Not authenticated", true); return }
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/super-admin/backup?companyId=${company.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }))
        showMessage(`❌ ${errData.error || "Backup failed"}`, true)
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `backup_${company.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      showMessage("✅ Backup downloaded.")
    } catch (err: any) {
      showMessage("❌ Network error: " + (err.message || ""))
    }
  }

  const isExpiringSoon = (sub: Subscription | null) => {
    if (!sub || !sub.end_date) return false
    const expiry = new Date(sub.end_date)
    const now = new Date()
    const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diff <= 10 && diff > 0
  }

  const getStatusBadge = (company: Company) => {
    if (company.is_trial) {
      if (company.trial_ends_at && new Date(company.trial_ends_at) <= new Date()) {
        return <span className="sa-status-badge sa-status-expired">Trial Expired</span>
      }
      return <span className="sa-status-badge sa-status-trial">Trial</span>
    }
    if (company.subscription) {
      if (isExpiringSoon(company.subscription)) {
        return <span className="sa-status-badge sa-status-expiring">Expiring Soon</span>
      }
      return <span className="sa-status-badge sa-status-active">Active</span>
    }
    return <span className="sa-status-badge sa-status-no-sub">No Subscription</span>
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

  const renderCompanyRow = (company: Company) => {
    const expanded = expandedRows.has(company.id)
    return (
      <tbody key={company.id}>
        <tr className="sa-row">
          <td className="sa-td">
            <button className="sa-expand-btn" onClick={() => toggleRow(company.id)} title="Expand row">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </td>
          <td className="sa-td" style={{ fontWeight: 600 }}>{company.name}</td>
          <td className="sa-td" style={{ fontSize: 12, color: "var(--text-muted)" }}>{company.admin_email}</td>
          <td className="sa-td">{company.plan}</td>
          <td className="sa-td" style={{ fontSize: 12 }}>
            {company.subscription ? (
              <>PKR {company.subscription.amount?.toLocaleString()} · {new Date(company.subscription.start_date).toLocaleDateString()}</>
            ) : company.is_trial ? (
              '—'
            ) : (
              <span style={{ color: "var(--text-muted)" }}>No payment</span>
            )}
          </td>
          <td className="sa-td">{getStatusBadge(company)}</td>
          <td className="sa-td sa-actions">
            {company.is_trial && (
              <select
                className="sa-select-trial"
                defaultValue=""
                onChange={(e) => {
                  const days = parseInt(e.target.value)
                  if (!days) return
                  extendTrial(company, days)
                  e.target.value = ""
                }}
              >
                <option value="" disabled>⏳ Extend</option>
                <option value="7">+7 days</option>
                <option value="15">+15 days</option>
                <option value="30">+30 days</option>
              </select>
            )}
            <button className="sa-btn" onClick={() => openFeatureModal(company)} title="Features">⚙️</button>
            <button className="sa-btn sa-btn-primary" onClick={() => openSubscriptionModal(company)} title="Subscribe / Update"><CreditCard size={12} /></button>
            <button className="sa-btn" onClick={() => impersonate(company)} title="Login as admin"><LogIn size={12} /></button>
            <button className="sa-btn sa-btn-danger" onClick={() => deleteCompany(company)} title="Delete"><Trash2 size={12} /></button>
          </td>
        </tr>
        {expanded && (
          <tr className="sa-expanded-row">
            <td colSpan={7}>
              <div className="sa-expanded-content">
                <div className="sa-expanded-grid">
                  <div>
                    <div className="sa-expanded-label">Subscription</div>
                    {company.subscription ? (
                      <div>
                        <div>{company.subscription.plan_type}</div>
                        <div className="sa-expanded-subtext">
                          Start: {new Date(company.subscription.start_date).toLocaleDateString()} · Expires: {new Date(company.subscription.end_date).toLocaleDateString()}
                        </div>
                        {company.subscription.topups?.length > 0 && (
                          <div className="sa-expanded-subtext">
                            Add‑ons: {company.subscription.topups.map(t => ADDON_LABELS[t] || t).join(', ')}
                          </div>
                        )}
                        {company.subscription.max_users != null && (
                          <div className="sa-expanded-subtext">
                            Users: {company.user_count} / {company.subscription.max_users}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="sa-expanded-subtext">
                        {company.is_trial ? `Trial ends ${new Date(company.trial_ends_at!).toLocaleDateString()}` : 'No subscription'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="sa-expanded-label">Features</div>
                    <div style={{ marginTop: 4 }}>
                      {company.features.length > 0 ? (
                        company.features.map(f => (
                          <span key={f} className="feature-pill">{FEATURE_LABELS[f] || f}</span>
                        ))
                      ) : (
                        <span className="sa-expanded-subtext">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="sa-expanded-label">Users</div>
                    <div>{company.user_count}</div>
                  </div>
                </div>

                {/* NEW: Data Cleanup & Backup Section */}
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div className="sa-expanded-label" style={{ marginBottom: 8 }}>🗄️ Data Cleanup & Backup</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {CLEANUP_ENTITIES.map(item => (
                      <button
                        key={item.entity}
                        className="sa-btn sa-btn-danger"
                        style={{ fontSize: 10 }}
                        onClick={() => handleCleanupEntity(company.id, item.entity)}
                        title={item.label}
                      >
                        {item.label}
                      </button>
                    ))}
                    <button
                      className="sa-btn sa-btn-danger"
                      style={{ fontWeight: 700, fontSize: 11 }}
                      onClick={() => handleNukeCompany(company.id)}
                    >
                      💣 Complete Nuke
                    </button>
                    <button
                      className="sa-btn"
                      style={{ background: '#2563EB', color: 'white', borderColor: '#2563EB', marginLeft: 8, fontSize: 11 }}
                      onClick={() => handleBackup(company)}
                    >
                      <Download size={12} /> Backup Excel
                    </button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </tbody>
    )
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .sa-header { margin-bottom: 20px; }
        .sa-title { font-size: 22px; font-weight: 800; color: var(--text); }
        .sa-subtitle { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; }
        
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
        .kpi-value { font-size: 22px; font-weight: 800; }
        .kpi-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-top: 2px; }
        
        .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: 10px; background: var(--card); margin-bottom: 24px; }
        .sa-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .sa-table th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); border-bottom: 2px solid var(--border); text-transform: uppercase; letter-spacing: 0.5px; }
        .sa-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
        .sa-row:hover { background: var(--card-hover); }
        
        .sa-expand-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px; }
        .sa-expanded-row { background: var(--bg); }
        .sa-expanded-content { padding: 12px; font-size: 12px; }
        .sa-expanded-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
        .sa-expanded-label { font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; margin-bottom: 4px; }
        .sa-expanded-subtext { font-size: 11px; color: var(--text-muted); }
        
        .sa-status-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; white-space: nowrap; }
        .sa-status-active { background: #065F46; color: #A7F3D0; }
        .sa-status-trial { background: #1D4ED8; color: #DBEAFE; }
        .sa-status-expiring { background: #7F1D1D; color: #FEE2E2; }
        .sa-status-expired { background: #7F1D1D; color: #FECACA; }
        .sa-status-no-sub { background: var(--border); color: var(--text-muted); }
        
        .sa-actions { display: flex; gap: 4px; align-items: center; }
        .sa-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 4px;
          padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
          border: 1px solid var(--border); cursor: pointer; font-family: inherit;
          background: transparent; color: var(--text-muted); white-space: nowrap;
          min-width: 28px; height: 28px;
        }
        .sa-btn:hover { background: var(--card-hover); }
        .sa-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .sa-btn-danger { background: #EF4444; color: white; border-color: #EF4444; }
        
        .sa-select-trial {
          padding: 4px 6px; border-radius: 6px; font-size: 11px; font-weight: 600;
          border: 1px solid var(--border); cursor: pointer; font-family: inherit;
          background: transparent; color: var(--text-muted); height: 28px;
        }
        
        .feature-pill {
          display: inline-block; padding: 1px 6px; margin-right: 4px; margin-bottom: 4px;
          background: #065F46; color: #A7F3D0; border-radius: 12px; font-size: 10px; font-weight: 600;
        }
        
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
        
        @media (max-width: 640px) {
          .sa-table { min-width: 700px; }
          .kpi-grid { grid-template-columns: 1fr 1fr; }
          .sa-btn { font-size: 10px; padding: 4px 6px; }
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

      <div className="table-wrap">
        <table className="sa-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Company</th>
              <th>Admin Email</th>
              <th>Plan</th>
              <th>Last Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          {activeTrials.map(renderCompanyRow)}
          {expiredTrials.map(renderCompanyRow)}
          {activeClients.map(renderCompanyRow)}
        </table>
      </div>

      <div className="sa-section">
        <div className="sa-section-title" style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📬 Payment Notifications ({payments.length})</div>
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
            <input className="input-field" placeholder="Max Users (e.g., 1, 5, blank=unlimited)" type="number" value={subscriptionForm.maxUsers} onChange={e => setSubscriptionForm({...subscriptionForm, maxUsers: e.target.value})} />

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