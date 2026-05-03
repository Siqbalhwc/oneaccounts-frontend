"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

export default function NotificationSettingsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [settings, setSettings] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      // Get user and active company
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const cid = (user.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      // Fetch notification settings
      const { data } = await supabase
        .from("notification_settings")
        .select("type, enabled")
        .eq("company_id", cid)

      const map: Record<string, boolean> = {}
      data?.forEach((r: any) => { map[r.type] = r.enabled })
      setSettings(map)
      setLoading(false)
    }
    init()
  }, [])

  const handleToggle = async (type: string, enabled: boolean) => {
    if (!companyId) return
    setSettings(prev => ({ ...prev, [type]: enabled }))
    await supabase.from("notification_settings").upsert({
      company_id: companyId,
      type,
      enabled,
    })
  }

  const notificationTypes = [
    { key: "overdue_invoice", label: "Overdue Invoice Alerts" },
    { key: "trial_expiry", label: "Trial Expiry Alerts" },
  ]

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", marginBottom: 8 }}>🔔 Notification Settings</h1>
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>Enable or disable system notifications.</p>

      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 20 }}>
        {notificationTypes.map((nt) => (
          <label key={nt.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 14, fontWeight: 600, color: "#334155" }}>
            <input
              type="checkbox"
              checked={settings[nt.key] ?? true}
              onChange={(e) => handleToggle(nt.key, e.target.checked)}
            />
            {nt.label}
          </label>
        ))}
      </div>
    </div>
  )
}