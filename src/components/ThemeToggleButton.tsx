"use client"
import { useTheme } from "@/contexts/ThemeContext"

const icons: Record<string, string> = {
  light: "☀️",
  dark: "🌙",
  oneaccounts: "🔷",
}

const nextTheme: Record<string, string> = {
  light: "dark",
  dark: "oneaccounts",
  oneaccounts: "light",
}

export default function ThemeToggleButton() {
  const { theme, setTheme } = useTheme()
  const currentIcon = icons[theme] || icons.light

  const handleToggle = () => {
    const next = nextTheme[theme] || "light"
    setTheme(next)
  }

  return (
    <button
      onClick={handleToggle}
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
      title={`Switch theme (current: ${theme})`}
      aria-label="Toggle theme"
    >
      {currentIcon}
    </button>
  )
}