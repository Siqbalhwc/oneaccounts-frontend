"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { X, Sun, Moon, ChevronDown, LogOut } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"
import { useCompany } from "@/contexts/CompanyContext"
import { useNavSections, matchesItem, getSectionForPath } from "@/hooks/useNavSections"

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const THEMES = ["light", "dark", "oneaccounts"] as const
const THEME_LABELS: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  oneaccounts: "OneAccounts",
}

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme: themeMode, setTheme } = useTheme()
  const { companyName, companyTagline, logoUrl } = useCompany()

  // Same menu, same rules as the desktop sidebar (shared source).
  const { sections, businessType } = useNavSections()

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  )

  const [email, setEmail] = useState("")
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data?.user?.email || "")
    }).catch(() => {})
    return () => { cancelled = true }
  }, [supabase])

  // Section containing the current page opens by default each time the drawer opens.
  const [openSection, setOpenSection] = useState<string>("")
  useEffect(() => {
    if (isOpen) setOpenSection(getSectionForPath(pathname, businessType))
  }, [isOpen, pathname, businessType])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  if (!isOpen) return null

  const cycleTheme = () => {
    const currentIndex = THEMES.indexOf(themeMode as any)
    const nextIndex = (currentIndex + 1) % THEMES.length
    setTheme(THEMES[nextIndex])
  }

  const handleNavigation = (href: string) => {
    onClose()
    router.push(href)
  }

  const handleSignOut = async () => {
    onClose()
    await supabase.auth.signOut()
    router.push("/login")
  }

  // Clicking the open section closes it; clicking another opens it.
  const toggleSection = (section: string) =>
    setOpenSection(prev => (prev === section ? "" : section))

  const renderItem = (item: { label: string; icon: string; href: string }) => {
    const active = matchesItem(item as any, pathname)
    return (
      <div
        key={item.href}
        onClick={() => handleNavigation(item.href)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 46,
          padding: "0 16px 0 20px",
          cursor: "pointer",
          fontSize: "0.92rem",
          color: active ? "var(--primary)" : "var(--text)",
          fontWeight: active ? 600 : 400,
          background: active ? "var(--card-hover)" : "transparent",
          borderLeft: active ? "3px solid var(--primary)" : "3px solid transparent",
        }}
      >
        <span style={{ fontSize: "1.1rem", width: 24, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
        <span>{item.label}</span>
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1000,
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(300px, 85vw)",
          background: "var(--card)",
          zIndex: 1001,
          boxShadow: "4px 0 20px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header: company identity */}
        <div
          style={{
            padding: "16px",
            paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt={companyName}
                style={{ width: 34, height: 34, borderRadius: 9, objectFit: "contain", flexShrink: 0 }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {companyName || "OneAccounts"}
              </div>
              {companyTagline && (
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {companyTagline}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation: identical sections/items to the desktop sidebar */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {sections.map(sec => {
            const isOpenSec = openSection === sec.section
            return (
              <div key={sec.section}>
                <div
                  onClick={() => toggleSection(sec.section)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    minHeight: 44,
                    padding: "0 16px",
                    cursor: "pointer",
                    userSelect: "none",
                    color: "var(--text-muted)",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  <span style={{ flex: 1 }}>{sec.displayLabel ?? sec.section}</span>
                  <ChevronDown
                    size={16}
                    style={{ transform: isOpenSec ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }}
                  />
                </div>
                {isOpenSec && (
                  <div>
                    {(sec.groups ?? []).map(group => (
                      <div key={group.groupLabel}>
                        <div style={{ padding: "6px 20px 2px", color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {group.groupLabel}
                        </div>
                        {group.items.map(renderItem)}
                      </div>
                    ))}
                    {(sec.items ?? []).map(renderItem)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer: user, theme, sign out */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "8px 16px",
            paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
            flexShrink: 0,
          }}
        >
          {email && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "4px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {email}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div
              onClick={cycleTheme}
              style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 10px", cursor: "pointer", borderRadius: 8, fontSize: "0.85rem", color: "var(--text)" }}
            >
              {themeMode === "light" ? <Sun size={18} /> : <Moon size={18} />}
              <span>{THEME_LABELS[themeMode] || themeMode}</span>
            </div>
            <div
              onClick={handleSignOut}
              style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 10px", cursor: "pointer", borderRadius: 8, fontSize: "0.85rem", color: "var(--text)" }}
            >
              <LogOut size={18} />
              <span>Sign out</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
