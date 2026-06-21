"use client"

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

const FEATURE_CODES = [
  "inventory",
  "investors",
  "invoice_automation",
  "profit_allocation",
  "whatsapp_invoice",
  "payment_reminders",
  "csv_import_export",
  "email_reports",
  "purchase_orders",
  "asset_management",
  "tax_management",
]

interface PlanContextType {
  hasFeature: (code: string) => boolean
  features: string[]
  loading: boolean
  refreshFeatures: () => void
  setFeatureState: (code: string, enabled: boolean) => void
}

const PlanContext = createContext<PlanContextType>({
  hasFeature: () => true,
  features: [],
  loading: true,
  refreshFeatures: () => {},
  setFeatureState: () => {},
})

export function PlanProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [businessType, setBusinessType] = useState<string>("")
  const supabase = createClient()

  const loadFeatures = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }

      const { data: companyData } = await supabase
        .from("companies")
        .select("business_type")
        .eq("id", cid)
        .single()

      if (companyData) {
        setBusinessType(companyData.business_type || "")
      }

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
    } catch (err) {
      console.error("Failed to load features:", err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadFeatures()
  }, [loadFeatures])

  useEffect(() => {
    if (!loading && features.length > 0) {
      console.log('✅ PlanContext loaded with features:', features)
      console.log('✅ Business type:', businessType)
    }
  }, [loading, features, businessType])

  const hasFeature = (code: string) => {
    if (code === "balance_sheet") return true
    if (loading) return true

    // ✅ Inventory is always enabled for trading companies
    if (code === "inventory" && businessType === "trading") return true

    // ❌ Purchase Orders fallback REMOVED – it is an add‑on, must be explicitly enabled

    return features.includes(code)
  }

  const refreshFeatures = () => {
    loadFeatures()
  }

  const setFeatureState = async (code: string, enabled: boolean) => {
    if (code === "balance_sheet") return

    if (code === "inventory" && businessType === "trading") {
      console.warn("Inventory cannot be disabled for trading companies")
      return
    }

    setFeatures(prev => {
      if (enabled) {
        return prev.includes(code) ? prev : [...prev, code]
      } else {
        return prev.filter(c => c !== code)
      }
    })

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return

      const { data: featureRow } = await supabase
        .from("features")
        .select("id")
        .eq("code", code)
        .single()

      if (featureRow) {
        await supabase
          .from("company_features")
          .upsert(
            { company_id: cid, feature_id: featureRow.id, enabled },
            { onConflict: "company_id,feature_id" }
          )
      }
    } catch (err) {
      console.error("Failed to save feature state:", err)
      loadFeatures()
    }
  }

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadFeatures()
    })
    return () => {
      authListener?.subscription?.unsubscribe()
    }
  }, [loadFeatures])

  return (
    <PlanContext.Provider value={{ hasFeature, features, loading, refreshFeatures, setFeatureState }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  return useContext(PlanContext)
}