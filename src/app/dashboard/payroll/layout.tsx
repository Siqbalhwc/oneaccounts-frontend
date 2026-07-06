import { ReactNode } from "react"
import { PlanProvider, usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"
import { Loader2 } from "lucide-react"

function PayrollContent({ children }: { children: ReactNode }) {
  const { hasFeature, loading: planLoading } = usePlan()
  const { role } = useRole()

  // Only show loading spinner while the plan context is still resolving
  if (planLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "60vh" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
      </div>
    )
  }

  // If payroll feature is not enabled, show a consistent message
  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  // If no role yet (shouldn't happen, but guard anyway)
  if (!role) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "60vh" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
      </div>
    )
  }

  // All checks passed – render the actual page content
  return <>{children}</>
}

export default function PayrollLayout({ children }: { children: ReactNode }) {
  // The PlanProvider is already wrapping the whole app, so we just use the consumer
  return <PayrollContent>{children}</PayrollContent>
}