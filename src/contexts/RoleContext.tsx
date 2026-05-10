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

    const fetchRole = async () => {
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (cancelled) return

      if (userError || !user) {
        setRole(null)
        setLoading(false)
        return
      }

      // 2. Try DB for active role
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle()

      if (!cancelled) {
        if (roleData?.role) {
          setRole(roleData.role)
        } else {
          // 3. Fallback to JWT claim (app_metadata.role)
          const jwtRole = (user.app_metadata as any)?.role as string | undefined
          const jwtCompany = (user.app_metadata as any)?.company_id as string | undefined

          // If JWT has a role, use it — otherwise default to "admin" for single‑user setup
          setRole(jwtRole || (jwtCompany ? "admin" : null))
        }
        setLoading(false)
      }
    }

    fetchRole()

    return () => {
      cancelled = true
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