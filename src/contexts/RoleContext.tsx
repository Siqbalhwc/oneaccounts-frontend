"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"

interface RoleContextType {
  role: string | null
  loading: boolean
}

const RoleContext = createContext<RoleContextType>({ role: null, loading: true })

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Safety timeout – after 2 seconds, stop loading in any case
    const timeout = setTimeout(() => {
      if (cancelled) return
      setLoading(false)
    }, 2000)

    supabase.auth.getUser().then(
      ({ data: { user } }) => {
        if (cancelled) return

        if (!user) {
          setRole(null)
          setLoading(false)
          clearTimeout(timeout)
          return
        }

        const companyId = (user.app_metadata as any)?.company_id

        const fetchRole = (cid: string) => {
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("company_id", cid)
            .maybeSingle()
            .then(
              ({ data }) => {
                if (cancelled) return
                setRole(data?.role || "viewer")
                setLoading(false)
                clearTimeout(timeout)
              },
              () => {
                if (cancelled) return
                setRole(null)
                setLoading(false)
                clearTimeout(timeout)
              }
            )
        }

        if (companyId) {
          fetchRole(companyId)
        } else {
          // Fallback – find first company for this user
          supabase
            .from("user_roles")
            .select("company_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle()
            .then(
              ({ data }) => {
                if (cancelled) return
                const cid = data?.company_id
                if (cid) {
                  fetchRole(cid)
                } else {
                  setRole(null)
                  setLoading(false)
                  clearTimeout(timeout)
                }
              },
              () => {
                if (cancelled) return
                setRole(null)
                setLoading(false)
                clearTimeout(timeout)
              }
            )
        }
      },
      () => {
        if (cancelled) return
        setRole(null)
        setLoading(false)
        clearTimeout(timeout)
      }
    )

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [supabase])

  return (
    <RoleContext.Provider value={{ role, loading }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}