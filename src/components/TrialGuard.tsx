"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

export default function TrialGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    // Always allow the upgrade page to load without any trial check
    if (pathname === "/dashboard/upgrade") {
      setAllowed(true)
      return
    }

    async function checkTrial() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        // Get the user's company via the secure function
        const { data: companyId, error: rpcErr } = await supabase.rpc('current_company_id')
        if (rpcErr || !companyId) {
          setAllowed(true)
          return
        }

        // Fetch trial status
        const { data: settings } = await supabase
          .from("company_settings")
          .select("trial_ends_at, plan_id")
          .eq("company_id", companyId)
          .maybeSingle()

        if (!settings) {
          setAllowed(true)
          return
        }

        const trialEnd = settings.trial_ends_at ? new Date(settings.trial_ends_at) : null
        const hasPlan = settings.plan_id !== null

        if (!hasPlan && trialEnd && trialEnd < new Date()) {
          setAllowed(false)
        } else {
          setAllowed(true)
        }
      } catch {
        setAllowed(true)
      }
    }
    checkTrial()
  }, [pathname])

  // While checking, show nothing — no flicker
  if (allowed === null) return null

  if (!allowed) {
    router.replace("/dashboard/upgrade")
    return null
  }

  return <>{children}</>
}