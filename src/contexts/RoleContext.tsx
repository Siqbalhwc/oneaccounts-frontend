"use client"
import { createContext, useContext, useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

interface RoleContextType {
  role: string | null
  loading: boolean
}

const RoleContext = createContext<RoleContextType>({ role: null, loading: true })

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const finishedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const finished = () => finishedRef.current

    // Safety timer – if role still null after 5s, default to admin
    const safetyTimer = setTimeout(() => {
      if (!cancelled && !finished()) {
        setRole("admin")
        setLoading(false)
        finishedRef.current = true
      }
    }, 5000)

    const fetchRole = async () => {
      const supabase = createClient()

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (cancelled || finished()) return
      if (userError || !user) {
        // No user → keep role null, but stop loading so pages won't hang
        if (!finished()) {
          setRole("admin")    // default for unauthenticated/trial users
          setLoading(false)
          finishedRef.current = true
        }
        return
      }

      // ✅ Fetch role from user_roles table ONLY – never from JWT metadata
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle()

      if (!cancelled && !finished()) {
        clearTimeout(safetyTimer)
        setRole(roleData?.role || "admin")   // fallback for new users without a role row
        setLoading(false)
        finishedRef.current = true
      }
    }

    fetchRole()
    return () => {
      cancelled = true
      clearTimeout(safetyTimer)
    }
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