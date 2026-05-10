"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

interface RoleContextType {
  role: string | null
  loading: boolean
}

const RoleContext = createContext<RoleContextType>({ role: null, loading: true })

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchRole = async () => {
      const supabase = createClient()

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (cancelled) return
      if (userError || !user) {
        setRole(null)
        setLoading(false)
        return
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle()

      if (!cancelled) {
        if (roleData?.role) {
          setRole(roleData.role)
        } else {
          const jwtRole = (user.app_metadata as any)?.role as string | undefined
          const jwtCompany = (user.app_metadata as any)?.company_id as string | undefined
          setRole(jwtRole || (jwtCompany ? "admin" : null))
        }
        setLoading(false)
      }
    }

    fetchRole()
    return () => { cancelled = true }
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