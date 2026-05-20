"use client"
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark" | "system"

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
} | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark")   // keep dark as default (your current look)

  // Load saved theme from localStorage on first mount
  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null
    if (saved) setTheme(saved)
  }, [])

  // Apply theme to <html> and save to localStorage whenever theme changes
  useEffect(() => {
    const root = document.documentElement

    const applied =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme

    root.setAttribute("data-theme", applied)
    localStorage.setItem("theme", theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}