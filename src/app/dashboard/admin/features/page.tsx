"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ToggleLeft, ToggleRight } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

const ALL_FEATURES = [
  { code: "inventory",            name: "Inventory & Adjustments",   desc: "Stock management, purchase orders" },
  { code: "investors",            name: "Investors",                 desc: "Track capital contributions" },
  { code: "balance_sheet",        name: "Balance Sheet",             desc: "Full balance sheet report" },
  { code: "invoice_automation",   name: "Invoice Automation",        desc: "Auto‑calculate expenses & profit allocation" },
  { code: "profit_allocation",    name: "Profit Allocation",         desc: "Distribute profit to partners" },
  { code: "whatsapp_invoice",     name: "WhatsApp Invoice Sending",  desc: "Send invoices via WhatsApp" },
  { code: "payment_reminders",    name: "Payment Reminders",         desc: "Automated overdue reminders" },
  { code: "csv_import_export",    name: "CSV Import / Export",       desc: "Bulk data import & export" },
  { code: "email_reports",        name: "Email Reports",             desc: "Send financial reports by email" },
  { code: "purchase_orders",      name: "Purchase Orders",           desc: "Create and track purchase orders" },
]

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
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!canView) { setLoading(false); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // fetch existing overrides for this company
        supabase
          .from("company_features")
          .select("features(code), enabled")
          .eq("company_id", cid)
          .then(({ data }) => {
            const map: Record<string, boolean> = {}
            // default all features to false
            ALL_FEATURES.forEach(f => { map[f.code] = false })
            if (data) {
              data.forEach((row: any) => {
                const code = row.features?.code
                if (code) map[code] = row.enabled
              })
            }
            setFeatureStates(map)
            setLoading(false)
          })
      } else {
        setMessage("No active company found.")
        setLoading(false)
      }
    })
  }, [])

  const toggleFeature = async (code: string, enabled: boolean) => {
    if (!canEdit || !companyId) return
    // Optimistic update
    setFeatureStates(prev => ({ ...prev, [code]: enabled }))
    setMessage("")
    const { error } = await supabase.from("company_features").upsert({
      company_id: companyId,
      feature_id: code,   // assumes feature_id field stores the feature code; adjust if you use numeric id
      enabled,
    })
    if (error) {
      setMessage("Error: " + error.message)
      // revert
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
          ALL_FEATURES.map(f => (
            <div key={f.code} className="fm-card">
              <div>
                <div className="fm-feature-name">{f.name}</div>
                {f.desc && <div className="fm-feature-desc">{f.desc}</div>}
              </div>
              <button
                className="fm-toggle-btn"
                onClick={() => toggleFeature(f.code, !featureStates[f.code])}
                disabled={!canEdit}
              >
                {featureStates[f.code] ? (
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