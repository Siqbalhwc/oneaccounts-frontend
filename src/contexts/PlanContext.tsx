"use client"

import { createContext, useContext, ReactNode } from "react"

interface PlanContextType {
  hasFeature: (code: string) => boolean
  features: string[]
}

const PlanContext = createContext<PlanContextType>({
  hasFeature: () => true,
  features: [],
})

export function PlanProvider({
  children,
  enabledFeatures,
}: {
  children: ReactNode
  enabledFeatures: string[]
}) {
  const hasFeature = (code: string) => enabledFeatures.includes(code)

  return (
    <PlanContext.Provider value={{ hasFeature, features: enabledFeatures }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  return useContext(PlanContext)
}