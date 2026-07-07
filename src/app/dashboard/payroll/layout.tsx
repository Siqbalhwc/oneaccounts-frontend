"use client"

import { ReactNode, useEffect, useRef } from "react"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import { Loader2 } from "lucide-react"

export default function PayrollLayout({ children }: { children: ReactNode }) {
  const { hasFeature, loading: planLoading } = usePlan()
  const { role } = useRole()

  // Once we've finished loading at least once, never show the spinner again
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    if (!planLoading && role) {
      hasLoadedOnce.current = true
    }
  }, [planLoading, role])

  // Show a spinner only on the very first load
  if (!hasLoadedOnce.current) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
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

  // All good – render the page content without ever flashing the spinner again
  return <>{children}</>
}
