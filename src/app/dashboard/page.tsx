"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import ManagementDashboard from "@/components/dashboard/ManagementDashboard"
import AccountantDashboard from "@/components/dashboard/AccountantDashboard"

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(r => setRole(r.data?.role || ""))
    })
  }, [])

  if (!role) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>

  // Management roles see the management dashboard
  if (role === "admin" || role === "manager" || role === "director") {
    return <ManagementDashboard role={role} />
  }

  // Everyone else sees the accountant dashboard
  return <AccountantDashboard role={role} />
}