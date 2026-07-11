"use client"

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react"
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
  "payroll",
  "material_management",
]

interface PlanContextType {
  hasFeature: (code: string) => boolean
  features: string[]
  loading: boolean          // true ONLY during the very first load (splash-worthy)
  refreshing: boolean       // true during background refetches (not splash-worthy)
  refreshFeatures: () => void
  setFeatureState: (code: string, enabled: boolean) => void
}

const PlanContext = createContext<PlanContextType>({
  // 🔒 Deny-by-default until we actually know what this company is entitled to.
  hasFeature: () => false,
  features: [],
  loading: true,
  refreshing: false,
  refreshFeatures: () => {},
  setFeatureState: () => {},
})

export function PlanProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<string[]>([])
  const [loading, setLoading] = useState(true)       // gates splash — only true pre-first-load
  const [refreshing, setRefreshing] = useState(false) // background refetch, does NOT gate UI
  const [businessType, setBusinessType] = useState<string>("")

  const supabase = createClient()
  const hasLoadedOnceRef = useRef(false)
  const loadedForUserIdRef = useRef<string | null>(null)

  const loadFeatures = useCallback(async (isBackground: boolean) => {
    try {
      if (isBackground) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id

      if (!cid) {
        setFeatures([])
        loadedForUserIdRef.current = null
        return
      }

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
        loadedForUserIdRef.current = user?.id ?? null
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
      loadedForUserIdRef.current = user?.id ?? null
    } catch (err) {
      console.error("Failed to load features:", err)
      // 🔒 On error, fail closed — do not leave stale/unknown feature state granting access.
      if (!isBackground) setFeatures([])
    } finally {
      hasLoadedOnceRef.current = true
      if (isBackground) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [supabase])

  // Initial load — this one legitimately blocks the UI with the splash screen.
  useEffect(() => {
    loadFeatures(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to real auth changes only. Never treat a plain token refresh
  // (which fires on every tab focus) as a reason to reload or to show
  // the splash screen again — that was the cause of the constant
  // "Loading your workspace..." flicker and the state loss on tab switch.
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setFeatures([])
        loadedForUserIdRef.current = null
        return
      }

      if (event === "TOKEN_REFRESHED") {
        // Nothing about entitlements changed — ignore entirely.
        return
      }

      const uid = session?.user?.id ?? null

      // Only refetch if we're looking at a genuinely different user/session
      // than what we last loaded features for (e.g. user actually signed
      // into a different account). Do this quietly in the background —
      // never block already-rendered UI or wipe component state.
      if (uid && uid !== loadedForUserIdRef.current) {
        loadFeatures(true)
      }
    })
    return () => {
      authListener?.subscription?.unsubscribe()
    }
  }, [loadFeatures])

  const hasFeature = (code: string) => {
    if (code === "balance_sheet") return true

    // 🔒 Deny by default until the FIRST load has completed. After that,
    // background refreshes never flip this back to "unknown" — we keep
    // showing the last known-good entitlement set while refreshing quietly.
    if (!hasLoadedOnceRef.current) return false

    if (code === "inventory" && businessType === "trading") return true

    return features.includes(code)
  }

  const refreshFeatures = () => {
    loadFeatures(true)
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
      loadFeatures(true)
    }
  }

  return (
    <PlanContext.Provider value={{ hasFeature, features, loading, refreshing, refreshFeatures, setFeatureState }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  return useContext(PlanContext)
}