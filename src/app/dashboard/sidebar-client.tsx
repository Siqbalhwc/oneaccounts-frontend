"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export default function SidebarClient() {
  const pathname = usePathname()

  useEffect(() => {
    // ── Wire hamburger button ──────────────────────────────────────────────
    const hamburger = document.getElementById("dl-hamburger")
    const sidebar   = document.getElementById("dl-sidebar")
    const overlay   = document.getElementById("dl-overlay")

    const openMenu  = () => {
      sidebar?.classList.add("mobile-open")
      overlay?.classList.add("open")
      document.body.style.overflow = "hidden" // prevent background scroll
    }

    const closeMenu = () => {
      sidebar?.classList.remove("mobile-open")
      overlay?.classList.remove("open")
      document.body.style.overflow = ""
    }

    hamburger?.addEventListener("click", openMenu)
    overlay?.addEventListener("click", closeMenu)

    // ── Close menu on nav link click (mobile UX) ───────────────────────────
    const navLinks = sidebar?.querySelectorAll("a.dl-nav-item")
    navLinks?.forEach(link => link.addEventListener("click", closeMenu))

    // ── Close on Escape key ────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu() }
    document.addEventListener("keydown", onKey)

    return () => {
      hamburger?.removeEventListener("click", openMenu)
      overlay?.removeEventListener("click", closeMenu)
      navLinks?.forEach(link => link.removeEventListener("click", closeMenu))
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [])

  // ── Close sidebar whenever route changes (after navigation) ───────────────
  useEffect(() => {
    const sidebar = document.getElementById("dl-sidebar")
    const overlay = document.getElementById("dl-overlay")
    sidebar?.classList.remove("mobile-open")
    overlay?.classList.remove("open")
    document.body.style.overflow = ""

    // ── Highlight active nav item based on current path ────────────────────
    const navLinks = sidebar?.querySelectorAll("a.dl-nav-item")
    navLinks?.forEach(link => {
      const href = link.getAttribute("href") || ""
      if (href === pathname || (href !== "/dashboard" && pathname.startsWith(href))) {
        link.classList.add("active")
      } else {
        link.classList.remove("active")
      }
    })
  }, [pathname])

  return (
    <div
      className="dl-overlay"
      id="dl-overlay"
    />
  )
}
