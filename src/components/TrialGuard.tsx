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

        // 1. Get the current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setAllowed(true)   // not even logged in – let the auth guard handle it
          return
        }

        // 2. Get the user's company_id from app_metadata (or user_roles)
        const companyId = (user.app_metadata as any)?.company_id
        if (!companyId) {
          // No company linked – probably a platform admin, allow
          setAllowed(true)
          return
        }

        // 3. Fetch the company_settings for THAT company
        const { data: settings } = await supabase
          .from("company_settings")
          .select("trial_ends_at, plan_id")
          .eq("company_id", companyId)
          .maybeSingle()

        // No settings row or plan active → allow
        if (!settings || settings.plan_id !== null) {
          setAllowed(true)
          return
        }

        // Trial has not ended → allow
        const trialEnd = settings.trial_ends_at ? new Date(settings.trial_ends_at) : null
        if (!trialEnd || trialEnd > new Date()) {
          setAllowed(true)
          return
        }

        // Already on the upgrade page → allow
        if (pathname === "/dashboard/upgrade") {
          setAllowed(true)
          return
        }

        // Trial expired and no plan → block
        setAllowed(false)
      } catch {
        // In case of any error, allow access to avoid locking everyone out
        setAllowed(true)
      }
    }
    checkTrial()
  }, [pathname])

  if (allowed === null) return null

  if (!allowed) {
    router.replace("/dashboard/upgrade")
    return null
  }

  return <>{children}</>
}