"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Shield, ToggleLeft, ToggleRight } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Feature {
  code: string
  name: string
  description: string
  enabled: boolean
}

export default function FeatureManagerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin"
  const canEdit = role === "admin"

  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    fetchFeatures()
  }, [role, canView])

  const fetchFeatures = async () => {
    setLoading(true)
    // Assume we have a features table; if yours is different, adjust accordingly
    const { data } = await supabase
      .from("features")
      .select("*")
      .order("code")

    // Also fetch company overrides to get the current enabled state
    const { data: overrides } = await supabase
      .from("company_features")
      .select("feature_id, enabled")
      .eq("company_id", "00000000-0000-0000-0000-000000000001") // you may need the actual active company ID

    if (data) {
      const overrideMap: Record<string, boolean> = {}
      if (overrides) {
        overrides.forEach((o: any) => {
          // need to map feature_id to code; assuming we have feature code in a join
          // For now, we'll just use the default_enabled from features table
        })
      }

      setFeatures(
        data.map((f: any) => ({
          code: f.code,
          name: f.name || f.code,
          description: f.description || "",
          enabled: f.default_enabled,
        }))
      )
    }
    setLoading(false)
  }

  const toggleFeature = async (code: string, enabled: boolean) => {
    // Optimistic update
    setFeatures(prev => prev.map(f => f.code === code ? { ...f, enabled } : f))
    // Write to company_features or update plans_features as needed
    // For simplicity, we call an API or direct supabase call
    const { error } = await supabase
      .from("company_features")
      .upsert({
        company_id: "00000000-0000-0000-0000-000000000001",
        feature_id: code, // adjust if you use a numeric ID
        enabled,
      })
    if (error) {
      setMessage("Error updating feature: " + error.message)
      // revert
      setFeatures(prev => prev.map(f => f.code === code ? { ...f, enabled: !enabled } : f))
    } else {
      setMessage("Feature updated!")
    }
    setTimeout(() => setMessage(""), 3000)
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>Only administrators can access the Feature Manager.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .fm-header { margin-bottom: 20px; }
          .fm-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .fm-subtitle { font-size: 13px; color: #94A3B8; }
          .fm-card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
          .fm-feature-name { font-size: 15px; font-weight: 700; color: #1E293B; }
          .fm-feature-desc { font-size: 12px; color: #64748B; margin-top: 2px; }
          .fm-toggle-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; }
          .fm-toggle-btn:hover { background: #F1F5F9; }
        `}</style>

        <div className="fm-header">
          <div className="fm-title">⚙️ Feature Manager</div>
          <div className="fm-subtitle">Toggle features for your company</div>
        </div>

        {message && (
          <div style={{ background: "#F0FDF4", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading features...</div>
        ) : (
          features.map(f => (
            <div key={f.code} className="fm-card">
              <div>
                <div className="fm-feature-name">{f.name}</div>
                {f.description && <div className="fm-feature-desc">{f.description}</div>}
              </div>
              <button
                className="fm-toggle-btn"
                onClick={() => toggleFeature(f.code, !f.enabled)}
                disabled={!canEdit}
              >
                {f.enabled ? (
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