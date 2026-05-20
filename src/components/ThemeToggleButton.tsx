"use client"
import { useTheme } from "@/contexts/ThemeContext"

export default function ThemeToggleButton() {
  const { theme, setTheme } = useTheme()

  const nextTheme = theme === "dark" ? "light" : "dark"

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
        padding: "4px 6px",
        borderRadius: 6,
        color: "var(--text-muted)",
        transition: "color 0.2s",
      }}
      title={`Switch to ${nextTheme} mode`}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  )
}