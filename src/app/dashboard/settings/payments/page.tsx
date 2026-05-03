"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

export default function PaymentSettingsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [settings, setSettings] = useState({
    merchant_id: "",
    password: "",
    integrity_salt: "",
    sandbox_mode: true,
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: role } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!role?.company_id) { setLoading(false); return }

      const { data } = await supabase
        .from('payment_settings')
        .select('*')
        .eq('company_id', role.company_id)
        .maybeSingle()

      if (data) {
        setSettings({
          merchant_id: data.merchant_id || "",
          password: data.password || "",
          integrity_salt: data.integrity_salt || "",
          sandbox_mode: data.sandbox_mode ?? true,
        })
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  const handleSave = async () => {
    setSaving(true)
    setMessage("")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMessage("Not authenticated"); setSaving(false); return }

    const { data: role } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!role?.company_id) { setMessage("No company found"); setSaving(false); return }

    const { error } = await supabase
      .from('payment_settings')
      .upsert({
        company_id: role.company_id,
        gateway: 'jazzcash',
        ...settings,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setMessage("Error saving: " + error.message)
    } else {
      setMessage("✅ Payment settings saved successfully!")
    }
    setSaving(false)
    setTimeout(() => setMessage(""), 4000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <style>{`
        .setting-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 24px;
          max-width: 600px;
          margin-bottom: 16px;
        }
        .setting-group { margin-bottom: 16px; }
        .setting-label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px; }
        .setting-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #E2E8F0;
          border-radius: 6px;
          font-size: 13px;
          box-sizing: border-box;
        }
        .setting-hint { font-size: 11px; color: #94A3B8; margin-top: 2px; }
        .btn-save {
          padding: 10px 24px;
          background: #1D4ED8;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
        .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>💳 Payment Settings</h1>
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>
        Configure your JazzCash merchant account for plan payments and user billing.
      </p>

      {message && (
        <div style={{
          background: message.includes("✅") ? "#F0FDF4" : "#FEF2F2",
          color: message.includes("✅") ? "#15803D" : "#B91C1C",
          padding: "10px 16px",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
        }}>
          {message}
        </div>
      )}

      <div className="setting-card">
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1E293B", marginBottom: 16 }}>JazzCash Configuration</h2>

        <div className="setting-group">
          <label className="setting-label">Merchant ID</label>
          <input
            className="setting-input"
            type="text"
            value={settings.merchant_id}
            onChange={(e) => setSettings({ ...settings, merchant_id: e.target.value })}
            placeholder="e.g., MC12345"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">Password</label>
          <input
            className="setting-input"
            type="password"
            value={settings.password}
            onChange={(e) => setSettings({ ...settings, password: e.target.value })}
            placeholder="Your JazzCash merchant password"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">Integrity Salt (Hash Key)</label>
          <input
            className="setting-input"
            type="text"
            value={settings.integrity_salt}
            onChange={(e) => setSettings({ ...settings, integrity_salt: e.target.value })}
            placeholder="e.g., a1b2c3d4e5f6..."
          />
          <p className="setting-hint">Found in your JazzCash merchant portal under API Settings</p>
        </div>

        <div className="setting-group">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={settings.sandbox_mode}
              onChange={(e) => setSettings({ ...settings, sandbox_mode: e.target.checked })}
            />
            <span style={{ fontWeight: 600, color: "#334155" }}>Sandbox Mode (Test Environment)</span>
          </label>
          <p className="setting-hint" style={{ marginLeft: 24 }}>
            Enable for testing. Disable when you're ready for real transactions.
          </p>
        </div>

        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Payment Settings"}
        </button>
      </div>

      <div className="setting-card">
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1E293B", marginBottom: 8 }}>📋 How to get your credentials</h2>
        <ol style={{ fontSize: 13, color: "#475569", lineHeight: 1.8, paddingLeft: 18 }}>
          <li>Register as a JazzCash merchant at <a href="https://payments.jazzcash.com.pk" target="_blank" style={{ color: "#1D4ED8" }}>payments.jazzcash.com.pk</a></li>
          <li>After approval, log in and navigate to <strong>API Settings</strong></li>
          <li>Copy your <strong>Merchant ID</strong>, <strong>Password</strong>, and <strong>Integrity Salt</strong></li>
          <li>Paste them above and toggle <strong>Sandbox Mode</strong> off when ready</li>
        </ol>
      </div>
    </div>
  )
}