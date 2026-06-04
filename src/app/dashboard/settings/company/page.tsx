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

export default function CompanySettingsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [settings, setSettings] = useState<CompanySettings>({
    business_name: "",
    tagline: "",
    address: "",
    phone: "",
    email: "",
    logo_url: "",
  })
  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // 1. Get company ID from JWT
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // 2. Load settings for THIS company only
  useEffect(() => {
    if (!companyId) return
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle()

      if (data) {
        setSettings({
          business_name: data.business_name || "",
          tagline: data.tagline || "",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
          logo_url: data.logo_url || "",
        })
        if (data.logo_url) setLogoPreview(data.logo_url)
      } else {
        // No settings yet – grab the company name from the companies table
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", companyId)
          .single()
        if (company) {
          setSettings(prev => ({ ...prev, business_name: company.name }))
        }
      }
      setLoading(false)
    }
    fetchSettings()
  }, [companyId])

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

    // Upload new logo if provided
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

    // Try to update existing row for this company
    const { data: updated, error: updateError } = await supabase
      .from("company_settings")
      .update({
        business_name: settings.business_name,
        tagline: settings.tagline,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        logo_url: newLogoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .select()

    if (!updated || updated.length === 0) {
      // No row yet – insert a new one
      const { error: insertError } = await supabase
        .from("company_settings")
        .insert({
          company_id: companyId,
          business_name: settings.business_name,
          tagline: settings.tagline,
          address: settings.address,
          phone: settings.phone,
          email: settings.email,
          logo_url: newLogoUrl,
          updated_at: new Date().toISOString(),
        })

      if (insertError) {
        setMessage("Error saving settings: " + insertError.message)
        setSaving(false)
        return
      }
    } else if (updateError) {
      setMessage("Error saving settings: " + updateError.message)
      setSaving(false)
      return
    }

    // Also update company name in the companies table
    await supabase
      .from("companies")
      .update({ name: settings.business_name })
      .eq("id", companyId)

    setMessage("✅ Settings saved! Refreshing page…")
    setSettings(prev => ({ ...prev, logo_url: newLogoUrl }))
    setLogoFile(null)

    // Reload so sidebar/dashboard reflect the new name/logo
    setTimeout(() => {
      window.location.reload()
    }, 1500)
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading…</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>🏢 Company Settings</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Manage your business details, logo, and contact information.</p>
        </div>

        {message && (
          <div style={{
            background: message.startsWith("✅") ? "var(--card)" : "var(--card)",
            border: `1px solid ${message.startsWith("✅") ? "var(--primary)" : "#EF4444"}`,
            color: message.startsWith("✅") ? "var(--primary)" : "#FCA5A5",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {message}
          </div>
        )}

        <div style={{
          background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
          padding: 24, marginBottom: 16
        }}>
          <div style={{ marginBottom: 20 }}>
            <label className="inv-label">Business Name</label>
            <input
              className="inv-input"
              value={settings.business_name}
              onChange={e => setSettings({ ...settings, business_name: e.target.value })}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="inv-label">Tagline / Slogan</label>
            <input
              className="inv-input"
              value={settings.tagline}
              onChange={e => setSettings({ ...settings, tagline: e.target.value })}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <label className="inv-label">Phone</label>
              <input
                className="inv-input"
                value={settings.phone}
                onChange={e => setSettings({ ...settings, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="inv-label">Email</label>
              <input
                className="inv-input"
                value={settings.email}
                onChange={e => setSettings({ ...settings, email: e.target.value })}
              />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="inv-label">Address</label>
            <textarea
              className="inv-input"
              value={settings.address}
              onChange={e => setSettings({ ...settings, address: e.target.value })}
              rows={2}
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="inv-label">Company Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 100, height: 100, borderRadius: 12,
                  border: "2px dashed var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", overflow: "hidden", background: "var(--bg)"
                }}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    <Upload size={20} />
                    <div style={{ fontSize: 10, marginTop: 4 }}>Upload</div>
                  </div>
                )}
              </div>
              <div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Click to upload a new logo</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>PNG, JPG or SVG. Best size: 200×200px</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} hidden />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="inv-btn"
            style={{
              justifyContent: "center",
              width: "100%",
              background: saving ? "var(--text-muted)" : "var(--primary)",
              color: "var(--primary-text)",
              borderColor: "var(--primary)",
            }}
          >
            <Save size={16} /> {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      <style>{`
        .inv-label {
          font-size: 10px; font-weight: 600; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 4px; display: block;
        }
        .inv-input {
          width: 100%; height: 42px; border: 1.5px solid var(--border);
          border-radius: 9px; padding: 0 14px; font-size: 14px;
          font-family: inherit; background: var(--bg); color: var(--text);
          outline: none; box-sizing: border-box;
        }
        .inv-input:focus { border-color: var(--primary); }
        textarea.inv-input {
          height: auto; padding: 10px 14px;
        }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 24px; border-radius: 9px; font-size: 14px;
          font-weight: 600; border: none; cursor: pointer;
          font-family: inherit; transition: all 0.15s;
        }
      `}</style>
    </div>
  )
}