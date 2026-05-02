"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

export default function TrialGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    supabase
      .from("company_settings")
      .select("trial_ends_at, plan_id")
      .eq("id", 1) // default company settings row
      .single()
      .then(({ data }) => {
        if (!data) {
          // No settings yet – allow access
          setAllowed(true)
          return
        }

        const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null

        // No trial set OR trial still active OR plan is not basic → allow
        if (!trialEnd || trialEnd > new Date() || data.plan_id !== null) {
          setAllowed(true)
          return
        }

        // Trial expired and plan is basic → block
        // But never block the upgrade page itself
        if (pathname === "/dashboard/upgrade") {
          setAllowed(true)
          return
        }

        setAllowed(false)
      })
      .catch(() => setAllowed(true)) // on error, don't block
  }, [pathname])

  // While checking, show nothing (or a brief loading)
  if (allowed === null) return null

  if (!allowed) {
    // Redirect to upgrade page
    router.replace("/dashboard/upgrade")
    return null
  }

  return <>{children}</>
}