"use client"

import { createContext, useContext, useState, useEffect } from "react"
import type { ReactNode } from "react"

export type ThemeMode = "dark" | "green" | "light"

interface ThemeContextType {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("dark")

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}