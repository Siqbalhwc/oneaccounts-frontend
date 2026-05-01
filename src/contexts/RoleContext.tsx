"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

interface RoleContextType {
  role: string
  loading: boolean
}

const RoleContext = createContext<RoleContextType>({ role: "viewer", loading: true })

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState("viewer")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("company_id", "00000000-0000-0000-0000-000000000001")  // default company
          .maybeSingle()
        if (data) setRole(data.role)
      }
      setLoading(false)
    })
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