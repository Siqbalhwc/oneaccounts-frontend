"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"

interface PlanContextType {
  hasFeature: (code: string) => boolean
  features: string[]
  loading: boolean
}

const PlanContext = createContext<PlanContextType>({
  hasFeature: () => true,
  features: [],
  loading: true,
})

export function PlanProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadFeatures = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }

      const { data: rows } = await supabase
        .from("company_features")
        .select("feature_id, enabled, features(code)")
        .eq("company_id", cid)

      if (rows) {
        const active = rows
          .filter((r: any) => r.enabled)
          .map((r: any) => r.features?.code)
          .filter(Boolean)
        setFeatures(active)
      }
      setLoading(false)
    }

    loadFeatures()
  }, [])

  const hasFeature = (code: string) => {
    if (loading) return true   // show pages while loading, avoid flash
    return features.includes(code)
  }

  return (
    <PlanContext.Provider value={{ hasFeature, features, loading }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  return useContext(PlanContext)
}