"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ToggleLeft, ToggleRight, Zap, ZapOff } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

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

const FEATURE_LABELS: Record<string, string> = {
  inventory:            "Inventory & Adjustments",
  investors:            "Investors",
  balance_sheet:        "Balance Sheet",
  invoice_automation:   "Invoice Automation",
  profit_allocation:    "Profit Allocation",
  whatsapp_invoice:     "WhatsApp Invoice Sending",
  payment_reminders:    "Payment Reminders",
  csv_import_export:    "CSV Import / Export",
  email_reports:        "Email Reports",
  purchase_orders:      "Purchase Orders",
}

export default function FeatureManagerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin"
  const canEdit = role === "admin"

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [featureStates, setFeatureStates] = useState<Record<string, boolean>>({})
  const [featureIdMap, setFeatureIdMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

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

        // Get all feature UUIDs
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

        // Fetch which features are enabled for this company
        const { data: overrides, error: overridesErr } = await supabase
          .from("company_features")
          .select("feature_id, enabled")
          .eq("company_id", cid)

        if (overridesErr) throw overridesErr

        const states: Record<string, boolean> = {}
        FEATURE_CODES.forEach(code => { states[code] = false })

        if (overrides) {
          // Match by feature_id → code
          overrides.forEach((row: any) => {
            const fid = row.feature_id
            // find the code for this feature_id
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
  }, [])

  const toggleFeature = async (code: string, enabled: boolean) => {
    if (!canEdit || !companyId) return
    const featureId = featureIdMap[code]
    if (!featureId) {
      setMessage("Feature not found in database.")
      return
    }

    // Optimistic update
    setFeatureStates(prev => ({ ...prev, [code]: enabled }))
    setMessage("")

    const { error } = await supabase
      .from("company_features")
      .upsert({
        company_id: companyId,
        feature_id: featureId,      // ← correct column
        enabled,
      })

    if (error) {
      setMessage("Error: " + error.message)
      setFeatureStates(prev => ({ ...prev, [code]: !enabled }))
    } else {
      setMessage("✅ Feature updated!")
    }
    setTimeout(() => setMessage(""), 3000)
  }

  // Bulk enable / disable all
  const setAllFeatures = async (enable: boolean) => {
    if (!canEdit || !companyId) return
    setLoading(true)
    for (const code of FEATURE_CODES) {
      const featureId = featureIdMap[code]
      if (!featureId) continue
      await supabase
        .from("company_features")
        .upsert({ company_id: companyId, feature_id: featureId, enabled: enable })
    }
    const newStates: Record<string, boolean> = {}
    FEATURE_CODES.forEach(code => { newStates[code] = enable })
    setFeatureStates(newStates)
    setLoading(false)
    setMessage(enable ? "✅ All features enabled!" : "✅ All features disabled!")
    setTimeout(() => setMessage(""), 3000)
  }

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
        .fm-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: var(--shadow-sm);
        }
        .fm-feature-name { font-size: 15px; font-weight: 700; color: var(--text); }
        .fm-toggle-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; }
        .fm-toggle-btn:hover { background: var(--card-hover); }
        .btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border);
          font-weight: 600; font-size: 13px; cursor: pointer;
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { background: var(--primary-hover); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>⚙️ Feature Manager</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {companyId ? "Toggle premium features for your company" : "No active company"}
          </p>
        </div>
        {canEdit && companyId && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setAllFeatures(true)} disabled={loading}>
              <Zap size={14} /> Enable All
            </button>
            <button className="btn" onClick={() => setAllFeatures(false)} disabled={loading}>
              <ZapOff size={14} /> Disable All
            </button>
          </div>
        )}
      </div>

      {message && (
        <div style={{
          background: "var(--card)",
          border: message.startsWith("✅") ? "1px solid #065F46" : "1px solid #FECACA",
          color: message.startsWith("✅") ? "#6EE7B7" : "#FCA5A5",
          padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12,
        }}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading features…</div>
      ) : (
        FEATURE_CODES.map(code => (
          <div key={code} className="fm-card">
            <div>
              <div className="fm-feature-name">{FEATURE_LABELS[code] || code}</div>
            </div>
            <button
              className="fm-toggle-btn"
              onClick={() => toggleFeature(code, !featureStates[code])}
              disabled={!canEdit}
            >
              {featureStates[code] ? (
                <ToggleRight size={24} color="#10B981" />
              ) : (
                <ToggleLeft size={24} color="var(--text-muted)" />
              )}
            </button>
          </div>
        ))
      )}
    </div>
  )
}