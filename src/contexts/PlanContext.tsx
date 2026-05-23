"use client"

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

const FEATURE_CODES = [
  "inventory",
  "investors",
  "balance_sheet",
  "invoice_automation",
  "profit_allocation",
  "whatsapp_invoice",
  "payment_reminders",
  "csv_import_export",
  "email_reports",
  "purchase_orders",
]

interface PlanContextType {
  hasFeature: (code: string) => boolean
  features: string[]
  loading: boolean
  refreshFeatures: () => void
}

const PlanContext = createContext<PlanContextType>({
  hasFeature: () => true,
  features: [],
  loading: true,
  refreshFeatures: () => {},
})

export function PlanProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadFeatures = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }

      const { data: featureRows } = await supabase
        .from("features")
        .select("id, code")
        .in("code", FEATURE_CODES)

      if (!featureRows || featureRows.length === 0) {
        setFeatures([])
        setLoading(false)
        return
      }

      const featureIds = featureRows.map((f: any) => f.id)
      const codeById: Record<string, string> = {}
      featureRows.forEach((f: any) => { codeById[f.id] = f.code })

      const { data: overrides } = await supabase
        .from("company_features")
        .select("feature_id, enabled")
        .eq("company_id", cid)
        .in("feature_id", featureIds)

      const active: string[] = []
      if (overrides) {
        overrides.forEach((row: any) => {
          if (row.enabled) {
            const code = codeById[row.feature_id]
            if (code) active.push(code)
          }
        })
      }

      setFeatures(active)
      console.log("✅ Features loaded from DB:", active)
    } catch (err) {
      console.error("Failed to load features:", err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadFeatures()
  }, [loadFeatures])

  const hasFeature = (code: string) => {
    if (loading) return true   // avoid flash while loading
    console.log("🔍 hasFeature called – code:", code, "features:", features, "result:", features.includes(code))
    return features.includes(code)
  }

  const refreshFeatures = () => {
    loadFeatures()
  }

  return (
    <PlanContext.Provider value={{ hasFeature, features, loading, refreshFeatures }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  return useContext(PlanContext)
}