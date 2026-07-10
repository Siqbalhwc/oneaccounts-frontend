"use client"

import { ReactNode } from "react"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"

export default function PayrollLayout({ children }: { children: ReactNode }) {
  const { hasFeature, loading: planLoading } = usePlan()
  const { role } = useRole()

  // Show a minimal inline loader only while plan is still loading.
  // The global dashboard splash already handles the initial role/plan wait,
  // so this only appears on subsequent rapid navigations.
  if (planLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}>
        <div style={{
          width: 24, height: 24,
          border: "3px solid var(--border)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // If payroll feature is not enabled, show the message
  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  // All good – render the page content
  return <>{children}</>
}