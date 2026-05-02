"use client"

import { useState, useEffect } from "react"

interface Company {
  id: string
  name: string
  status: string
  plan_code: string
  plan_name: string
  features: { code: string; name: string; enabled: boolean; overridden: boolean }[]
}

export default function AdminFeaturesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/companies")
      const data = await res.json()
      if (data.companies) {
        setCompanies(data.companies)
      } else if (data.error) {
        setError(data.error)
      } else {
        setError("Unknown response from server")
      }
    } catch {
      setError("Network error. Please check your connection.")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCompanies()
  }, [])

  const toggleFeature = async (companyId: string, featureCode: string, current: boolean) => {
    try {
      const res = await fetch("/api/admin/company-features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, featureCode, enabled: !current }),
      })
      const result = await res.json()
      if (result.success) {
        setCompanies(prev =>
          prev.map(c =>
            c.id === companyId
              ? {
                  ...c,
                  features: c.features.map(f =>
                    f.code === featureCode ? { ...f, enabled: !f.enabled, overridden: true } : f
                  ),
                }
              : c
          )
        )
        setMessage(`✅ ${featureCode} ${!current ? 'enabled' : 'disabled'} for company`)
        setTimeout(() => setMessage(""), 3000)
      } else {
        setMessage(`❌ ${result.error}`)
        setTimeout(() => setMessage(""), 5000)
      }
    } catch {
      setMessage("Network error")
      setTimeout(() => setMessage(""), 5000)
    }
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .af-header { margin-bottom: 20px; }
        .af-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .af-subtitle { font-size: 13px; color: #94A3B8; }
        .af-table { background: white; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; }
        .af-row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #F1F5F9; cursor: pointer; transition: background 0.15s; justify-content: space-between; }
        .af-row:hover { background: #FAFBFF; }
        .af-row-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; cursor: default; }
        .af-feature-list { padding: 10px 16px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; display: flex; flex-wrap: wrap; gap: 10px; }
        .af-toggle { display: flex; align-items: center; gap: 8px; }
        .af-switch { position: relative; width: 40px; height: 22px; border-radius: 11px; cursor: pointer; border: none; transition: background 0.2s; }
        .af-switch.on { background: #10B981; }
        .af-switch.off { background: #CBD5E1; }
        .af-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: white; transition: transform 0.2s; }
        .af-switch.on::after { transform: translateX(18px); }
        .af-plan-badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .af-override-badge { padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #FEF3C7; color: #92400E; margin-left: 6px; }
      `}</style>

      <div className="af-header">
        <div className="af-title">⚙️ Feature Management</div>
        <div className="af-subtitle">Toggle features per company</div>
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {message && (
        <div style={{ background: message.startsWith("✅") ? "#F0FDF4" : "#FEF2F2", color: message.startsWith("✅") ? "#15803D" : "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading companies...</div>
      ) : companies.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No companies found.</div>
      ) : (
        <div className="af-table">
          <div className="af-row af-row-header">
            <span style={{ flex: 1 }}>Company</span>
            <span style={{ width: 120 }}>Plan</span>
            <span style={{ width: 80 }}>Status</span>
            <span style={{ width: 40 }}></span>
          </div>
          {companies.map(company => (
            <div key={company.id}>
              <div
                className="af-row"
                onClick={() => setExpandedCompany(expandedCompany === company.id ? null : company.id)}
              >
                <span style={{ flex: 1, fontWeight: 600 }}>{company.name}</span>
                <span style={{ width: 120 }}>
                  <span className="af-plan-badge" style={{
                    background: company.plan_code === 'enterprise' ? '#D1FAE5' : company.plan_code === 'pro' ? '#EEF2FF' : '#F1F5F9',
                    color: company.plan_code === 'enterprise' ? '#065F46' : company.plan_code === 'pro' ? '#4338CA' : '#475569'
                  }}>
                    {company.plan_name}
                  </span>
                </span>
                <span style={{ width: 80, fontSize: 12, color: company.status === 'active' ? '#10B981' : '#EF4444' }}>
                  ● {company.status}
                </span>
                <span style={{ width: 40, textAlign: "right", color: expandedCompany === company.id ? '#1E3A8A' : '#94A3B8' }}>
                  {expandedCompany === company.id ? '▲' : '▼'}
                </span>
              </div>
              {expandedCompany === company.id && (
                <div className="af-feature-list">
                  {company.features.map(f => (
                    <div key={f.code} className="af-toggle">
                      <button
                        className={`af-switch ${f.enabled ? 'on' : 'off'}`}
                        onClick={(e) => { e.stopPropagation(); toggleFeature(company.id, f.code, f.enabled) }}
                      />
                      <span style={{ fontSize: 12, color: f.enabled ? '#1E293B' : '#94A3B8' }}>
                        {f.name}
                      </span>
                      {f.overridden && <span className="af-override-badge">override</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}