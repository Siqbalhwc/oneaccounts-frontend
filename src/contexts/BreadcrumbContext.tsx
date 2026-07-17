"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { BREADCRUMB_CONFIG, MODULE_NAMES } from "@/components/Breadcrumb" // we'll export these from Breadcrumb

export interface BreadcrumbItem {
  label: string
  href: string
}

interface BreadcrumbContextType {
  trail: BreadcrumbItem[]
  push: (targetHref: string) => void   // new generic push – automatically adds current page
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<BreadcrumbItem[]>([])
  const router = useRouter()
  const pathname = usePathname()

  const push = (targetHref: string) => {
    // auto‑detect current page label from the URL
    const currentLabel = getPageLabelFromPath(pathname)
    if (currentLabel) {
      setTrail(prev => [...prev, { label: currentLabel, href: pathname }])
    }
    router.push(targetHref)
  }

  return (
    <BreadcrumbContext.Provider value={{ trail, push }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbContext() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) throw new Error("useBreadcrumbContext must be used within BreadcrumbProvider")
  return ctx
}

// Helper: guess a readable label from the current path using the same config as Breadcrumb
function getPageLabelFromPath(path: string): string | null {
  if (!path) return null
  const segments = path.split("/").filter(Boolean)
  if (segments.length === 0) return null

  // check last segment that is not a number (like id)
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    if (/^\d+$/.test(seg)) continue // skip numeric IDs
    const config = BREADCRUMB_CONFIG[seg]
    if (config) return config.label
    // if segment is a known module
    if (MODULE_NAMES[seg]) return MODULE_NAMES[seg]
    // fallback: humanize the segment
    return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return null
}