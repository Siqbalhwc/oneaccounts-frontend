"use client"

import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

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
              <button
                className="dl-section-btn"
                onClick={() => toggleSection(sec.section)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  background: "none",
                  border: "none",
                  color: "#94A3B8",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  fontFamily: "inherit",
                  borderRadius: 8,
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                <motion.span
                  animate={{ rotate: expanded ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: "inline-flex" }}
                >
                  <ChevronRight size={12} />
                </motion.span>
                <span>{sec.section}</span>
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ paddingLeft: 10, marginTop: 4, marginBottom: 6 }}>
                      {sec.groups &&
                        sec.groups.map(group => (
                          <div key={group.groupLabel}>
                            <div
                              style={{
                                padding: "4px 14px 2px",
                                color: "#475569",
                                fontSize: 8,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              {group.groupLabel}
                            </div>
                            {group.items.map(item => {
                              const active = isActive(item.href)
                              return (
                                <a
                                  key={item.href}
                                  href={item.href}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 14px",
                                    borderRadius: 8,
                                    color: active ? "#FFFFFF" : "#94A3B8",
                                    fontSize: 13,
                                    fontWeight: active ? 600 : 500,
                                    textDecoration: "none",
                                    position: "relative",
                                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                                    transition: "background 0.2s, color 0.2s",
                                  }}
                                >
                                  {/* Glow pill indicator */}
                                  {active && (
                                    <motion.div
                                      layoutId="sidebar-active-pill"
                                      style={{
                                        position: "absolute",
                                        left: -2,
                                        top: 6,
                                        bottom: 6,
                                        width: 4,
                                        borderRadius: 4,
                                        background: "linear-gradient(180deg, #22D3EE, #3B82F6)",
                                        boxShadow: "0 0 12px rgba(34,211,238,0.5)",
                                      }}
                                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                    />
                                  )}
                                  <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>
                                    {item.icon}
                                  </span>
                                  <span>{item.label}</span>
                                </a>
                              )
                            })}
                          </div>
                        ))}

                      {sec.items &&
                        sec.items.map(item => {
                          const active = isActive(item.href)
                          return (
                            <a
                              key={item.href}
                              href={item.href}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 14px",
                                borderRadius: 8,
                                color: active ? "#FFFFFF" : "#94A3B8",
                                fontSize: 13,
                                fontWeight: active ? 600 : 500,
                                textDecoration: "none",
                                position: "relative",
                                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                                transition: "background 0.2s, color 0.2s",
                              }}
                            >
                              {active && (
                                <motion.div
                                  layoutId="sidebar-active-pill"
                                  style={{
                                    position: "absolute",
                                    left: -2,
                                    top: 6,
                                    bottom: 6,
                                    width: 4,
                                    borderRadius: 4,
                                    background: "linear-gradient(180deg, #22D3EE, #3B82F6)",
                                    boxShadow: "0 0 12px rgba(34,211,238,0.5)",
                                  }}
                                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                />
                              )}
                              <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>
                                {item.icon}
                              </span>
                              <span>{item.label}</span>
                            </a>
                          )
                        })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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