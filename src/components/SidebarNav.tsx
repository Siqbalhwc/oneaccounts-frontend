"use client"

import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"

// … types remain unchanged (NavItem, NavGroup, NavSection) …

export default function SidebarNav({
  navSections,
  email,
  initial,
  logoUrl,
  companyName,
  companyTagline,
}: {
  navSections: NavSection[]
  email: string
  initial: string
  logoUrl: string
  companyName: string
  companyTagline: string
}) {
  const pathname = usePathname()

  // 1. Find which section contains the current page
  const activeSection = useMemo(() => {
    for (const sec of navSections) {
      if (sec.items) {
        for (const item of sec.items) {
          // handled: dashboard exact match, others prefix match
          if (item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)) {
            return sec.section
          }
        }
      }
      if (sec.groups) {
        for (const group of sec.groups) {
          for (const item of group.items) {
            if (item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)) {
              return sec.section
            }
          }
        }
      }
    }
    return null
  }, [pathname, navSections])

  // 2. Expanded sections – start with only the active section open
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const sec of navSections) {
      initial[sec.section] = sec.section === activeSection
    }
    return initial
  })

  // 3. When active section changes (navigation), auto‑open that section
  useEffect(() => {
    if (activeSection) {
      setExpandedSections(prev => {
        // Already open? Do nothing
        if (prev[activeSection]) return prev
        // Open only the active section – accordion style
        const next: Record<string, boolean> = {}
        for (const sec of navSections) {
          next[sec.section] = false
        }
        next[activeSection] = true
        return next
      })
    }
  }, [activeSection, navSections])

  // 4. Manual toggle – accordion: only one section open at a time
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const isCurrentlyOpen = prev[section]
      // If it's already open, close it (no open sections)
      if (isCurrentlyOpen) {
        const allClosed: Record<string, boolean> = {}
        for (const sec of navSections) allClosed[sec.section] = false
        return allClosed
      }
      // Open this section, close all others
      const next: Record<string, boolean> = {}
      for (const sec of navSections) next[sec.section] = false
      next[section] = true
      return next
    })
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href)

  // … JSX remains exactly the same …
}