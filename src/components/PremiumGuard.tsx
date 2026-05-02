"use client"

import { usePlan } from "@/contexts/PlanContext"
import { Shield, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface PremiumGuardProps {
  featureCode: string
  featureName: string
  featureDesc: string
  children: React.ReactNode
}

export default function PremiumGuard({
  featureCode,
  featureName,
  featureDesc,
  children,
}: PremiumGuardProps) {
  const { hasFeature } = usePlan()
  const router = useRouter()

  if (hasFeature(featureCode)) {
    return <>{children}</>
  }

  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{
        background: "white",
        borderRadius: 16,
        border: "1px solid #E2E8F0",
        padding: "40px 32px",
        textAlign: "center",
        maxWidth: 440,
        width: "100%",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "#EEF2FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <Shield size={28} color="#4338CA" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1E293B", marginBottom: 8 }}>
          🔒 {featureName}
        </h2>
        <p style={{ fontSize: 14, color: "#64748B", marginBottom: 24, lineHeight: 1.6 }}>
          {featureDesc}
        </p>
        <button
          onClick={() => router.push("/dashboard/settings")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 24px",
            background: "linear-gradient(135deg, #1740C8, #071352)",
            color: "white",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Upgrade to Pro <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}