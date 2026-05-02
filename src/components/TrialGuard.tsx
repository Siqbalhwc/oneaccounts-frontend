"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

export default function TrialGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkTrial() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const { data } = await supabase
          .from("company_settings")
          .select("trial_ends_at, plan_id")
          .eq("id", 1)
          .single()

        if (!data) {
          setAllowed(true)
          return
        }

        const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null

        // No trial set, trial still active, or plan is not basic → allow
        if (!trialEnd || trialEnd > new Date() || data.plan_id !== null) {
          setAllowed(true)
          return
        }

        // Never block the upgrade page itself
        if (pathname === "/dashboard/upgrade") {
          setAllowed(true)
          return
        }

        // Trial expired and plan is basic → block
        setAllowed(false)
      } catch {
        // On error, don't block
        setAllowed(true)
      }
    }
    checkTrial()
  }, [pathname])

  // While checking, show nothing
  if (allowed === null) return null

  if (!allowed) {
    router.replace("/dashboard/upgrade")
    return null
  }

  return <>{children}</>
}