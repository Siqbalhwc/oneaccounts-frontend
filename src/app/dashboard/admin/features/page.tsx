"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ToggleLeft, ToggleRight } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
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
  const [featureIdMap, setFeatureIdMap] = useState<Record<string, string>>({}) // code -> uuid
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!canView) { setLoading(false); return }

    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) {
        setMessage("No active company found.")
        setLoading(false)
        return
      }
      setCompanyId(cid)

      // Fetch feature IDs from features table
      supabase
        .from("features")
        .select("id, code")
        .in("code", FEATURE_CODES)
        .then(({ data: featureRows }) => {
          const map: Record<string, string> = {}
          if (featureRows) {
            featureRows.forEach((f: any) => { map[f.code] = f.id })
          }
          setFeatureIdMap(map)

          // Fetch current overrides for this company
          return supabase
            .from("company_features")
            .select("features(code), enabled")
            .eq("company_id", cid)
            .then(({ data }) => {
              const states: Record<string, boolean> = {}
              FEATURE_CODES.forEach(code => { states[code] = false })
              if (data) {
                data.forEach((row: any) => {
                  const code = row.features?.code
                  if (code) states[code] = row.enabled
                })
              }
              setFeatureStates(states)
              setLoading(false)
            })
        })
          .then(
      () => {},
      () => {
        setMessage("Error loading features.")
        setLoading(false)
      }
    )
    })
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
        features: featureId,   // correct foreign key column name
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

  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>Only administrators can manage features.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .fm-header { margin-bottom: 16px; }
          .fm-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .fm-subtitle { font-size: 13px; color: #94A3B8; }
          .fm-card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
          .fm-feature-name { font-size: 15px; font-weight: 700; color: #1E293B; }
          .fm-feature-desc { font-size: 12px; color: #64748B; margin-top: 2px; }
          .fm-toggle-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; }
          .fm-toggle-btn:hover { background: #F1F5F9; }
        `}</style>

        <div className="fm-header">
          <div className="fm-title">⚙️ Feature Manager</div>
          <div className="fm-subtitle">{companyId ? "Toggle features for your company" : "No active company"}</div>
        </div>

        {message && (
          <div style={{
            background: message.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
            color: message.startsWith("✅") ? "#15803D" : "#B91C1C",
            padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12,
          }}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 30 }}>Loading features...</div>
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
                  <ToggleLeft size={24} color="#CBD5E1" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </RoleGuard>
  )
}