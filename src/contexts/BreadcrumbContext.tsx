"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { useRouter } from "next/navigation"

export interface BreadcrumbItem {
  label: string
  href: string
}

interface BreadcrumbContextType {
  trail: BreadcrumbItem[]
  /** Navigate to a new page while recording the current page as a breadcrumb ancestor */
  navigateWithBreadcrumb: (currentPage: BreadcrumbItem, targetHref: string) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<BreadcrumbItem[]>([])
  const router = useRouter()

  const navigateWithBreadcrumb = (currentPage: BreadcrumbItem, targetHref: string) => {
    // Add the current page to the trail so the target page will show it as an ancestor
    setTrail(prev => [...prev, currentPage])
    // Navigate immediately – the target page's breadcrumb will display the updated trail
    router.push(targetHref)
  }

  return (
    <BreadcrumbContext.Provider value={{ trail, navigateWithBreadcrumb }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbContext() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) throw new Error("useBreadcrumbContext must be used within BreadcrumbProvider")
  return ctx
}