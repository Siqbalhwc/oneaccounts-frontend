"use client"

import { usePlan } from "@/contexts/PlanContext"

const FLOW_STAGES = [
  { icon: "🚛", label: "Gate Pass (Inward)", desc: "Raw material received from suppliers" },
  { icon: "🏬", label: "Material Store", desc: "Raw material held before production" },
  { icon: "⚙️", label: "WIP", desc: "Work-in-progress / production runs" },
  { icon: "♻️", label: "RC Store", desc: "Waste & returnable components" },
  { icon: "📦", label: "Finished Goods", desc: "Completed products ready to ship" },
  { icon: "🚚", label: "Outward Gate Pass", desc: "Dispatched to customers" },
]

export default function MaterialsOverviewPage() {
  const { hasFeature, loading } = usePlan()

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  if (!hasFeature("material_management")) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text)" }}>
        <h2>Feature Not Enabled</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Material Management is not enabled for your company. Contact your administrator to turn it on
          in Settings → Feature Manager.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .mm-header { margin-bottom: 24px; }
        .mm-title { font-size: 22px; font-weight: 800; color: var(--text); margin: 0 0 4px; }
        .mm-subtitle { font-size: 13px; color: var(--text-muted); margin: 0; max-width: 640px; line-height: 1.5; }

        .mm-flow {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 14px;
          margin: 24px 0;
        }
        .mm-stage {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px 16px;
          text-align: center;
          box-shadow: var(--shadow-sm);
        }
        .mm-stage-icon { font-size: 28px; margin-bottom: 8px; }
        .mm-stage-label { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .mm-stage-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

        .mm-notice {
          background: var(--card);
          border: 1px dashed var(--border);
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 13px;
          color: var(--text-muted);
          margin-top: 24px;
        }

        @media (max-width: 500px) {
          .mm-flow { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="mm-header">
        <h1 className="mm-title">🏭 Material Management</h1>
        <p className="mm-subtitle">
          Tracks the physical flow of raw material through the factory — from supplier receipt,
          through production, to customer dispatch. All quantities are recorded in KG.
        </p>
      </div>

      <div className="mm-flow">
        {FLOW_STAGES.map(stage => (
          <div key={stage.label} className="mm-stage">
            <div className="mm-stage-icon">{stage.icon}</div>
            <div className="mm-stage-label">{stage.label}</div>
            <div className="mm-stage-desc">{stage.desc}</div>
          </div>
        ))}
      </div>

      <div className="mm-notice">
        📌 This module is being set up. Individual pages (Gate Pass, Material Store, Production, Stock Position, etc.)
        will appear here one at a time as they're added.
      </div>
    </div>
  )
}