"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Cog, ToggleLeft, ToggleRight } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface ToggleSetting {
  code: string
  label: string
  description: string
  enabled: boolean
}

export default function InvoiceAutomationPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [settings, setSettings] = useState<ToggleSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    init()
  }, [role, canView])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const cid = (user.app_metadata as any)?.company_id
    if (!cid) { setLoading(false); return }
    setCompanyId(cid)

    // Build the two automation features
    const defaultSettings: ToggleSetting[] = [
      {
        code: "invoice_automation",
        label: "Expense Automation",
        description: "Automatically calculate salary, ads, and fuel expenses on each invoice",
        enabled: false,
      },
      {
        code: "profit_allocation",
        label: "Profit Allocation",
        description: "Distribute net profit to partner accounts",
        enabled: false,
      },
    ]

    // Fetch actual overrides for this company
    const { data: overrides } = await supabase
      .from("company_features")
      .select("features(code), enabled")
      .eq("company_id", cid)

    if (overrides) {
      for (const row of overrides) {
        const code = (row as any).features?.code
        if (!code) continue
        const setting = defaultSettings.find(s => s.code === code)
        if (setting) setting.enabled = row.enabled
      }
    }

    setSettings(defaultSettings)
    setLoading(false)
  }

  const toggle = async (code: string, enabled: boolean) => {
    if (!canEdit || !companyId) return
    // Optimistic update
    setSettings(prev => prev.map(s => s.code === code ? { ...s, enabled } : s))

    const { error } = await supabase
      .from("company_features")
      .upsert({
        company_id: companyId,
        feature_id: code,   // assume the feature code works as the identifier; adjust if numeric
        enabled,
      })

    if (error) {
      setMessage("Error: " + error.message)
      // revert
      setSettings(prev => prev.map(s => s.code === code ? { ...s, enabled: !enabled } : s))
    } else {
      setMessage("Setting updated!")
    }
    setTimeout(() => setMessage(""), 3000)
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .aut-header { margin-bottom: 20px; }
          .aut-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .aut-subtitle { font-size: 13px; color: #94A3B8; }
          .aut-card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
          .aut-setting-label { font-size: 14px; font-weight: 700; color: #1E293B; }
          .aut-setting-desc { font-size: 12px; color: #64748B; margin-top: 2px; }
          .aut-toggle-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; }
          .aut-toggle-btn:hover { background: #F1F5F9; }
        `}</style>

        <div className="aut-header">
          <div className="aut-title">⚙️ Invoice Automation</div>
          <div className="aut-subtitle">{canEdit ? "Configure expense rules and profit allocation" : "View automation settings"}</div>
        </div>

        {message && (
          <div style={{ background: "#F0FDF4", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading settings...</div>
        ) : (
          settings.map(s => (
            <div key={s.code} className="aut-card">
              <div>
                <div className="aut-setting-label">{s.label}</div>
                <div className="aut-setting-desc">{s.description}</div>
              </div>
              <button
                className="aut-toggle-btn"
                onClick={() => toggle(s.code, !s.enabled)}
                disabled={!canEdit}
              >
                {s.enabled ? (
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