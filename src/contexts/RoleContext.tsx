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
    supabase.auth.getUser().then(
      ({ data: { user } }) => {
        if (!user) {
          setRole(null)
          setLoading(false)
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
                setRole(data?.role || "viewer")
                setLoading(false)
              },
              () => {
                setRole(null)
                setLoading(false)
              }
            )
        }

        if (companyId) {
          fetchRole(companyId)
        } else {
          supabase
            .from("user_roles")
            .select("company_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle()
            .then(
              ({ data }) => {
                const cid = data?.company_id
                if (cid) {
                  fetchRole(cid)
                } else {
                  setRole(null)
                  setLoading(false)
                }
              },
              () => {
                setRole(null)
                setLoading(false)
              }
            )
        }
      },
      () => {
        // can’t even get the user – loading ends with no role
        setRole(null)
        setLoading(false)
      }
    )
  }, [])

  return (
    <RoleContext.Provider value={{ role, loading }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}