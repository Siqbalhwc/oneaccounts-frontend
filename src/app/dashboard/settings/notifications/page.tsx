"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Save } from "lucide-react"

export default function NotificationSettingsPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [settings, setSettings] = useState({
    overdue_enabled: true,
    overdue_days_before: 0,
    trial_enabled: true,
    trial_days_before: 3,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    supabase
      .from("notification_settings")
      .select("*")
      .eq("company_id", "00000000-0000-0000-0000-000000000001")
      .single()
      .then(({ data }) => {
        if (data) {
          setSettings({
            overdue_enabled: data.overdue_enabled,
            overdue_days_before: data.overdue_days_before,
            trial_enabled: data.trial_enabled,
            trial_days_before: data.trial_days_before,
          })
        }
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from("notification_settings")
      .upsert({
        company_id: "00000000-0000-0000-0000-000000000001",
        ...settings,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setMessage("❌ Failed to save settings.")
    } else {
      setMessage("✅ Settings saved!")
    }
    setSaving(false)
    setTimeout(() => setMessage(""), 3000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>🔔 Notification Settings</h1>
        <p style={{ color: "#94A3B8", fontSize: 14, marginBottom: 24 }}>Configure when to receive reminders and alerts</p>

        {message && (
          <div style={{
            background: message.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
            color: message.startsWith("✅") ? "#15803D" : "#B91C1C",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {message}
          </div>
        )}

        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", color: "#EF4444" }}>📅 Overdue Invoice Reminders</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={settings.overdue_enabled}
                onChange={(e) => setSettings({ ...settings, overdue_enabled: e.target.checked })}
              />
              Enable automatic overdue reminders
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>
              Days before/after due date
            </label>
            <input
              type="number"
              value={settings.overdue_days_before}
              onChange={(e) => setSettings({ ...settings, overdue_days_before: Number(e.target.value) })}
              disabled={!settings.overdue_enabled}
              style={{
                width: 80,
                height: 40,
                border: "1.5px solid #E5EAF2",
                borderRadius: 9,
                padding: "0 14px",
                fontSize: 13,
                fontFamily: "inherit",
                background: settings.overdue_enabled ? "#FAFBFF" : "#F1F5F9",
                outline: "none",
              }}
            />
            <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
              (0 = on due date, positive = days after due)
            </span>
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", color: "#F59E0B" }}>⏳ Trial Expiry Warnings</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={settings.trial_enabled}
                onChange={(e) => setSettings({ ...settings, trial_enabled: e.target.checked })}
              />
              Enable trial expiry warnings
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>
              Days before trial expires
            </label>
            <input
              type="number"
              value={settings.trial_days_before}
              onChange={(e) => setSettings({ ...settings, trial_days_before: Number(e.target.value) })}
              disabled={!settings.trial_enabled}
              style={{
                width: 80,
                height: 40,
                border: "1.5px solid #E5EAF2",
                borderRadius: 9,
                padding: "0 14px",
                fontSize: 13,
                fontFamily: "inherit",
                background: settings.trial_enabled ? "#FAFBFF" : "#F1F5F9",
                outline: "none",
              }}
            />
            <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
              (e.g., 3 = warn 3 days before expiry)
            </span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 24px",
            background: saving ? "#94A3B8" : "linear-gradient(135deg, #1740C8, #071352)",
            color: "white",
            border: "none",
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  )
}