"use client"

import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"

interface NavItem {
  label: string
  icon: string
  href: string
}

interface NavGroup {
  groupLabel: string
  items: NavItem[]
}

interface NavSection {
  section: string
  items?: NavItem[]
  groups?: NavGroup[]
}

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

  // Which section contains the current page?
  const activeSection = useMemo(() => {
    for (const sec of navSections) {
      if (sec.items) {
        for (const item of sec.items) {
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

  // State: only the active section is expanded initially
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const sec of navSections) {
      initial[sec.section] = sec.section === activeSection
    }
    return initial
  })

  // When active section changes (user navigates), open it and close others
  useEffect(() => {
    if (activeSection) {
      setExpandedSections(prev => {
        if (prev[activeSection]) return prev
        const next: Record<string, boolean> = {}
        for (const sec of navSections) next[sec.section] = false
        next[activeSection] = true
        return next
      })
    }
  }, [activeSection, navSections])

  // Manual toggle: accordion behavior (only one open)
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const isOpen = prev[section]
      if (isOpen) {
        const allClosed: Record<string, boolean> = {}
        for (const sec of navSections) allClosed[sec.section] = false
        return allClosed
      }
      const next: Record<string, boolean> = {}
      for (const sec of navSections) next[sec.section] = false
      next[section] = true
      return next
    })
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href)

  return (
    <aside className="dl-sidebar" id="dl-sidebar">
      {/* Logo */}
      <div className="dl-sidebar-logo">
        <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" />
        <div>
          <div className="dl-sidebar-logo-name">{companyName}</div>
          <div className="dl-sidebar-logo-sub">{companyTagline}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="dl-sidebar-nav">
        {navSections.map((sec) => {
          const expanded = expandedSections[sec.section] ?? false
          return (
            <div key={sec.section} style={{ marginBottom: 2 }}>
              <button className="dl-section-btn" onClick={() => toggleSection(sec.section)}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{sec.section}</span>
              </button>

              {expanded && (
                <div className="dl-section-content">
                  {sec.groups &&
                    sec.groups.map(group => (
                      <div key={group.groupLabel}>
                        <div className="dl-nav-group-label">{group.groupLabel}</div>
                        {group.items.map(item => (
                          <a
                            key={item.href}
                            href={item.href}
                            className={`dl-nav-item${isActive(item.href) ? " active" : ""}`}
                          >
                            <span className="dl-nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                          </a>
                        ))}
                      </div>
                    ))}

                  {sec.items &&
                    sec.items.map(item => (
                      <a
                        key={item.href}
                        href={item.href}
                        className={`dl-nav-item${isActive(item.href) ? " active" : ""}`}
                      >
                        <span className="dl-nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                      </a>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="dl-sidebar-user">
        <div className="dl-sidebar-avatar">{initial}</div>
        <div style={{ overflow: "hidden" }}>
          <div className="dl-sidebar-email">{email}</div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="dl-sidebar-signout">Sign Out</button>
          </form>
        </div>
      </div>
    </aside>
  )
}