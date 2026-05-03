"use client"

import { useRole } from "@/contexts/RoleContext"

interface Props {
  children: React.ReactNode
  allowedRoles?: string[]
  fallback?: React.ReactNode
}

export default function RoleGuard({
  children,
  allowedRoles = ["admin", "accountant"], // default: only admin & accountant can view
  fallback,
}: Props) {
  const { role, loading } = useRole()

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Checking permissions...</div>
  }

  if (!role || !allowedRoles.includes(role)) {
    return (
      fallback || (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2 style={{ color: "#1E293B", marginBottom: 8 }}>Access Denied</h2>
          <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
        </div>
      )
    )
  }

  return <>{children}</>
}