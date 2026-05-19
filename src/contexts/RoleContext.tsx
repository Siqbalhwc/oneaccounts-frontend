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

      // ✅ Fetch role from user_roles table ONLY – never from JWT metadata
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle()

      if (!cancelled) {
        setRole(roleData?.role || null)
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