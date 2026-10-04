"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { fmtLongDate, type AccessStatus } from "@/lib/access"

// Pages that are always reachable, even when the company is blocked
const ALLOWED_PREFIXES = [
  "/dashboard/upgrade",
  "/dashboard/payment",
]

// Despite the file name, this guard covers trials, paid subscriptions and suspension.
// The rule itself lives in the database function company_access_status().
export default function TrialGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [status, setStatus] = useState<AccessStatus | null>(null)

  const onAllowedPage = ALLOWED_PREFIXES.some(prefix => pathname?.startsWith(prefix))

  useEffect(() => {
    let cancelled = false

    async function checkAccess() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        const { data, error } = await supabase.rpc("company_access_status")
        if (cancelled) return

        if (error || !data) {
          console.error("company_access_status failed:", error?.message)
          setAllowed(true) // do not lock people out because of a temporary error
          return
        }

        const s = data as AccessStatus
        setStatus(s)
        setAllowed(!s.blocked)
      } catch (e) {
        console.error("Access check failed:", e)
        if (!cancelled) setAllowed(true)
      }
    }

    // The upgrade / payment pages are always open; still load the status for the banner
    checkAccess()
    return () => { cancelled = true }
  }, [pathname])

  // Blocked users are sent to the upgrade page
  useEffect(() => {
    if (allowed === false && !onAllowedPage) {
      router.replace("/dashboard/upgrade")
    }
  }, [allowed, onAllowedPage, router])

  if (onAllowedPage) return <>{children}</>
  if (allowed === null) return null
  if (allowed === false) return null

  return (
    <>
      {status?.state === "grace" && (
        <div
          style={{
            background: "var(--card)", border: "1px solid #F59E0B", color: "#92400E",
            padding: "10px 16px", margin: "8px 12px", borderRadius: 10,
            fontSize: 13, fontWeight: 600, display: "flex", gap: 10,
            alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
          }}
        >
          <span>
            Your subscription ended on {fmtLongDate(status.access_until)}.
            Access will stop in {status.grace_days_left} day{status.grace_days_left === 1 ? "" : "s"}
            {" "}(after {fmtLongDate(status.grace_until)}).
          </span>
          <button
            onClick={() => router.push("/dashboard/upgrade")}
            style={{
              background: "var(--primary)", color: "var(--primary-text, #fff)", border: "none",
              borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            Renew now
          </button>
        </div>
      )}
      {children}
    </>
  )
}