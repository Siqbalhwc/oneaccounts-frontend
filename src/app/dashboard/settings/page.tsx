"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Upload, Save } from "lucide-react"

interface CompanySettings {
  business_name: string
  tagline: string
  address: string
  phone: string
  email: string
  logo_url: string
}

export default function SettingsPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState<CompanySettings>({
    business_name: "OneAccounts",
    tagline: "Smart Accounting, Stronger Business",
    address: "",
    phone: "",
    email: "",
    logo_url: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from("company_settings").select("*").single()
      if (data) {
        setSettings({
          business_name: data.business_name || "OneAccounts",
          tagline: data.tagline || "Smart Accounting, Stronger Business",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
          logo_url: data.logo_url || "",
        })
        if (data.logo_url) setLogoPreview(data.logo_url)
      }
      setLoading(false)
    }
    fetchSettings()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onload = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage("")

    let newLogoUrl = settings.logo_url

    if (logoFile) {
      const fileExt = logoFile.name.split(".").pop()
      const fileName = `logo-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, logoFile, { upsert: true, contentType: logoFile.type })

      if (uploadError) {
        setMessage("Failed to upload logo.")
        setSaving(false)
        return
      }

      const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(fileName)
      newLogoUrl = publicUrlData?.publicUrl || ""
    }

    const { error } = await supabase
      .from("company_settings")
      .upsert({
        id: 1,
        business_name: settings.business_name,
        tagline: settings.tagline,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        logo_url: newLogoUrl,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setMessage("Error saving settings.")
    } else {
      setMessage("✅ Settings saved successfully!")
      setSettings({ ...settings, logo_url: newLogoUrl })
      setLogoFile(null)
    }
    setSaving(false)
    setTimeout(() => setMessage(""), 3000)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading...</div>

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>🏢 Company Settings</h1>
          <p style={{ color: "#94A3B8", fontSize: 14 }}>Manage your business details, logo, and contact information.</p>
        </div>

        {message && (
          <div style={{
            background: message.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${message.startsWith("✅") ? "#BBF7D0" : "#FECACA"}`,
            color: message.startsWith("✅") ? "#15803D" : "#B91C1C",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {message}
          </div>
        )}

        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", padding: 24, marginBottom: 16 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Business Name</label>
            <input
              value={settings.business_name}
              onChange={e => setSettings({ ...settings, business_name: e.target.value })}
              style={{ width: "100%", height: 42, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px", fontSize: 14, outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Tagline / Slogan</label>
            <input
              value={settings.tagline}
              onChange={e => setSettings({ ...settings, tagline: e.target.value })}
              style={{ width: "100%", height: 42, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px", fontSize: 14, outline: "none" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Phone</label>
              <input
                value={settings.phone}
                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                style={{ width: "100%", height: 42, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px", fontSize: 14, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Email</label>
              <input
                value={settings.email}
                onChange={e => setSettings({ ...settings, email: e.target.value })}
                style={{ width: "100%", height: 42, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px", fontSize: 14, outline: "none" }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Address</label>
            <textarea
              value={settings.address}
              onChange={e => setSettings({ ...settings, address: e.target.value })}
              rows={2}
              style={{ width: "100%", border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "10px 14px", fontSize: 14, outline: "none", resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Company Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 100, height: 100, borderRadius: 12, border: "2px dashed #E2E8F0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", overflow: "hidden", background: "#F8FAFC"
                }}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ textAlign: "center", color: "#94A3B8" }}>
                    <Upload size={20} />
                    <div style={{ fontSize: 10, marginTop: 4 }}>Upload</div>
                  </div>
                )}
              </div>
              <div>
                <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>Click to upload a new logo</p>
                <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>PNG, JPG or SVG. Best size: 200x200px</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} hidden />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 24px", background: saving ? "#94A3B8" : "linear-gradient(135deg, #1740C8, #071352)",
              color: "white", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s"
            }}
          >
            <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  )
}