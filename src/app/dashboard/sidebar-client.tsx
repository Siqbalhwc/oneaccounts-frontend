// app/dashboard/sidebar-client.tsx
"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"

export default function SidebarClient() {
  const pathname = usePathname()

  // ── Wire hamburger on mount ──
  useEffect(() => {
    const hamburger = document.getElementById("dl-hamburger")
    const sidebar   = document.getElementById("dl-sidebar")
    const overlay   = document.getElementById("dl-overlay")

    const open = () => {
      sidebar?.classList.add("mobile-open")
      overlay?.classList.add("open")
      document.body.style.overflow = "hidden"
    }
    const close = () => {
      sidebar?.classList.remove("mobile-open")
      overlay?.classList.remove("open")
      document.body.style.overflow = ""
    }

    hamburger?.addEventListener("click", open)
    overlay?.addEventListener("click", close)

    const navLinks = sidebar?.querySelectorAll("a.dl-nav-item")
    navLinks?.forEach(link => link.addEventListener("click", close))

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    document.addEventListener("keydown", onKey)

    return () => {
      hamburger?.removeEventListener("click", open)
      overlay?.removeEventListener("click", close)
      navLinks?.forEach(link => link.removeEventListener("click", close))
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [])

  // ── Highlight active nav link on route change ──
  useEffect(() => {
    const sidebar  = document.getElementById("dl-sidebar")
    const overlay  = document.getElementById("dl-overlay")

    // Close drawer on navigation
    sidebar?.classList.remove("mobile-open")
    overlay?.classList.remove("open")
    document.body.style.overflow = ""

    // Active link
    const navLinks = sidebar?.querySelectorAll("a.dl-nav-item")
    navLinks?.forEach(link => {
      const href = link.getAttribute("href") || ""
      const isActive =
        href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname.startsWith(href)
      link.classList.toggle("active", isActive)
    })
  }, [pathname])

  return (
    <>
      {/* Mobile overlay */}
      <div className="dl-overlay" id="dl-overlay" />
    </>
  )
}