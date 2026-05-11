"use client"

import { useState } from "react"
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    MAIN: false,
    CRM: false,
    BANKING: false,
    INVENTORY: false,
    ACCOUNTING: false,
    SYSTEM: false,
  })

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
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

      {/* Nav */}
      <nav className="dl-sidebar-nav">
        {navSections.map((sec) => {
          const expanded = expandedSections[sec.section] ?? true

          return (
            <div key={sec.section} style={{ marginBottom: 2 }}>
              {/* Section toggle */}
              <button className="dl-section-btn" onClick={() => toggleSection(sec.section)}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{sec.section}</span>
              </button>

              {expanded && (
                <div className="dl-section-content">
                  {/* Grouped items (ACCOUNTING) */}
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

                  {/* Flat items */}
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