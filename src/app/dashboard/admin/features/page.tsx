"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ToggleLeft, ToggleRight, Zap, ZapOff, Shield, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

const FEATURE_CODES = [
  "inventory",
  "investors",
  "balance_sheet",
  "invoice_automation",
  "profit_allocation",
  "whatsapp_invoice",
  "payment_reminders",
  "csv_import_export",
  "email_reports",
  "purchase_orders",
]

const FEATURE_INFO: Record<string, { label: string; desc: string; icon: string }> = {
  inventory:            { label: "Inventory & Adjustments",  desc: "Stock management, inflow/outflow tracking, and inventory adjustments",       icon: "📦" },
  investors:            { label: "Investors",                 desc: "Track investor capital, investment amounts, and investor details",            icon: "💼" },
  balance_sheet:        { label: "Balance Sheet",             desc: "View assets, liabilities, and equity with drill‑down to trial balance",      icon: "📊" },
  invoice_automation:   { label: "Invoice Automation",        desc: "Auto‑calculate expenses and profit allocation on invoices",                  icon: "⚙️" },
  profit_allocation:    { label: "Profit Allocation",         desc: "Distribute net profit among partners based on predefined percentages",        icon: "💰" },
  whatsapp_invoice:     { label: "WhatsApp Invoice Sending",  desc: "Send invoices directly to customers via WhatsApp with PDF attachment",         icon: "💬" },
  payment_reminders:    { label: "Payment Reminders",         desc: "Automated reminders for overdue invoices and upcoming due dates",              icon: "🔔" },
  csv_import_export:    { label: "CSV Import / Export",       desc: "Bulk import customers, products, and chart of accounts via CSV files",         icon: "📥" },
  email_reports:        { label: "Email Reports",             desc: "Schedule and send financial reports via email to stakeholders",               icon: "📧" },
  purchase_orders:      { label: "Purchase Orders",           desc: "Create and manage purchase orders with approval workflow",                     icon: "📋" },
}

export default function FeatureManagerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const { setFeatureState } = usePlan()
  const canView = role === "admin"
  const canEdit = role === "admin"

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [featureStates, setFeatureStates] = useState<Record<string, boolean>>({})
  const [featureIdMap, setFeatureIdMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [savingAll, setSavingAll] = useState(false)

  useEffect(() => {
    if (!canView) { setLoading(false); return }

    const loadFeatures = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const cid = (user?.app_metadata as any)?.company_id
        if (!cid) {
          setMessage("No active company found.")
          setLoading(false)
          return
        }
        setCompanyId(cid)

        const { data: featureRows, error: featureErr } = await supabase
          .from("features")
          .select("id, code")
          .in("code", FEATURE_CODES)

        if (featureErr) throw featureErr

        const map: Record<string, string> = {}
        if (featureRows) {
          featureRows.forEach((f: any) => { map[f.code] = f.id })
        }
        setFeatureIdMap(map)

        const { data: overrides, error: overridesErr } = await supabase
          .from("company_features")
          .select("feature_id, enabled")
          .eq("company_id", cid)

        if (overridesErr) throw overridesErr

        const states: Record<string, boolean> = {}
        FEATURE_CODES.forEach(code => { states[code] = false })

        if (overrides) {
          overrides.forEach((row: any) => {
            const fid = row.feature_id
            const code = Object.keys(map).find(k => map[k] === fid)
            if (code) states[code] = row.enabled
          })
        }
        setFeatureStates(states)
      } catch (err: any) {
        setMessage("Error loading features: " + (err.message || ""))
      } finally {
        setLoading(false)
      }
    }

    loadFeatures()
  }, [canView])

  const toggleFeature = async (code: string, enabled: boolean) => {
    if (!canEdit || !companyId) return
    const featureId = featureIdMap[code]
    if (!featureId) {
      setMessage("Feature not found in database.")
      return
    }

    // Optimistic UI update on the feature manager page
    setFeatureStates(prev => ({ ...prev, [code]: enabled }))
    // Instantly update the global PlanContext so all pages reflect the change
    setFeatureState(code, enabled)
    setMessage("")
    setTimeout(() => setMessage(""), 3000)
  }

  const setAllFeatures = async (enable: boolean) => {
    if (!canEdit || !companyId) return
    setSavingAll(true)
    let errorOccurred = false

    // Update each feature using the global setter
    for (const code of FEATURE_CODES) {
      setFeatureState(code, enable)  // instant update, DB in background
    }

    const newStates: Record<string, boolean> = {}
    FEATURE_CODES.forEach(code => { newStates[code] = enable })
    setFeatureStates(newStates)
    setSavingAll(false)
    setMessage(enable ? "✅ All features enabled!" : "✅ All features disabled!")
    setTimeout(() => setMessage(""), 3000)
  }

  const enabledCount = Object.values(featureStates).filter(Boolean).length
  const totalCount = FEATURE_CODES.length

  if (role === null) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>

  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>Only administrators can manage features.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .page-title {
          font-size: 22px;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 4px;
        }
        .page-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }

        .summary-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }
        .summary-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: var(--shadow-sm);
        }
        .summary-icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        .summary-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 2px;
        }
        .summary-value {
          font-size: 24px;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 14px;
        }

        .feature-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px 22px;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: all 0.2s;
          box-shadow: var(--shadow-sm);
          position: relative;
          overflow: hidden;
        }
        .feature-card:hover {
          border-color: var(--border-strong);
          box-shadow: var(--shadow);
        }
        .feature-card.enabled {
          border-left: 4px solid #10B981;
        }
        .feature-card.disabled {
          border-left: 4px solid var(--border);
        }

        .feature-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
        }

        .feature-content {
          flex: 1;
          min-width: 0;
        }
        .feature-name {
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 3px;
        }
        .feature-desc {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.4;
        }

        .toggle-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          transition: all 0.15s;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .toggle-btn:hover {
          background: var(--card-hover);
        }
        .toggle-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .status-badge.enabled {
          background: #065F46;
          color: #6EE7B7;
        }
        .status-badge.disabled {
          background: var(--card-hover);
          color: var(--text-muted);
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          border: 1.5px solid var(--border);
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          background: transparent;
          color: var(--text-muted);
          font-family: inherit;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary {
          background: var(--primary);
          color: var(--primary-text);
          border-color: var(--primary);
        }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .message-bar {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .message-bar.success {
          background: var(--card);
          border: 1px solid #065F46;
          color: #6EE7B7;
        }
        .message-bar.error {
          background: var(--card);
          border: 1px solid #FECACA;
          color: #FCA5A5;
        }

        @media (max-width: 500px) {
          .feature-grid { grid-template-columns: 1fr; }
          .feature-card { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ Feature Manager</h1>
          <p className="page-subtitle">
            {companyId
              ? "Enable or disable premium features for your company"
              : "No active company"}
          </p>
        </div>
        {canEdit && companyId && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => setAllFeatures(true)}
              disabled={savingAll || enabledCount === totalCount}
            >
              <Zap size={14} /> Enable All
            </button>
            <button
              className="btn"
              onClick={() => setAllFeatures(false)}
              disabled={savingAll || enabledCount === 0}
            >
              <ZapOff size={14} /> Disable All
            </button>
          </div>
        )}
      </div>

      {/* Message bar */}
      {message && (
        <div className={`message-bar ${message.startsWith("✅") ? "success" : "error"}`}>
          <CheckCircle size={14} />
          {message}
        </div>
      )}

      {/* Summary */}
      <div className="summary-row">
        <div className="summary-card">
          <div className="summary-icon" style={{ background: "#1E3A5F" }}>
            <Shield size={20} color="#93C5FD" />
          </div>
          <div>
            <div className="summary-label">Features Enabled</div>
            <div className="summary-value" style={{ color: "#10B981" }}>
              {enabledCount} <span style={{ fontSize: 14, color: "var(--text-muted)" }}>/ {totalCount}</span>
            </div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon" style={{ background: "#1E293B" }}>
            <Zap size={20} color="#F59E0B" />
          </div>
          <div>
            <div className="summary-label">Status</div>
            <div className="summary-value" style={{ fontSize: 18, color: enabledCount === totalCount ? "#10B981" : enabledCount === 0 ? "#EF4444" : "#F59E0B" }}>
              {enabledCount === totalCount ? "All Active" : enabledCount === 0 ? "All Disabled" : "Partial"}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)", fontSize: 14 }}>
          Loading features…
        </div>
      ) : (
        <div className="feature-grid">
          {FEATURE_CODES.map(code => {
            const info = FEATURE_INFO[code] || { label: code, desc: "", icon: "🔧" }
            const isEnabled = featureStates[code] || false
            return (
              <div key={code} className={`feature-card ${isEnabled ? "enabled" : "disabled"}`}>
                <div className="feature-icon" style={{ background: isEnabled ? "#065F46" : "var(--card-hover)" }}>
                  {info.icon}
                </div>
                <div className="feature-content">
                  <div className="feature-name">{info.label}</div>
                  <div className="feature-desc">{info.desc}</div>
                  <div style={{ marginTop: 6 }}>
                    <span className={`status-badge ${isEnabled ? "enabled" : "disabled"}`}>
                      {isEnabled ? "● Enabled" : "○ Disabled"}
                    </span>
                  </div>
                </div>
                <button
                  className="toggle-btn"
                  onClick={() => toggleFeature(code, !isEnabled)}
                  disabled={!canEdit}
                  title={isEnabled ? "Click to disable" : "Click to enable"}
                >
                  {isEnabled ? (
                    <ToggleRight size={28} color="#10B981" />
                  ) : (
                    <ToggleLeft size={28} color="var(--text-muted)" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}