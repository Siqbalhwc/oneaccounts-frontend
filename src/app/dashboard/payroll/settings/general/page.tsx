"use client"

import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { weeklyOffText, type PayrollSettings } from "@/lib/payrollCalc"

type Mode = "month" | "30" | "26" | "22" | "custom"

export default function PayrollSettingsPage() {
  const { role } = useRole()
  const isAdmin = role === "admin"
  const canView = role === "admin" || role === "accountant"

  const [mode, setMode] = useState<Mode>("month")
  const [custom, setCustom] = useState("28")
  const [rateBase, setRateBase] = useState<"gross" | "basic">("gross")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    fetch("/api/payroll/settings")
      .then(r => r.json())
      .then(j => {
        const s = j.settings as PayrollSettings | undefined
        if (s) {
          if (!s.dayBasis) setMode("month")
          else if ([30, 26, 22].includes(s.dayBasis)) setMode(String(s.dayBasis) as Mode)
          else { setMode("custom"); setCustom(String(s.dayBasis)) }
          setRateBase(s.dailyRateBase)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (flash) { const t = setTimeout(() => setFlash(""), 3500); return () => clearTimeout(t) }
  }, [flash])

  const dayBasis: number | null = mode === "month" ? null : mode === "custom" ? Number(custom) : Number(mode)
  const settings: PayrollSettings = { dayBasis, dailyRateBase: rateBase }

  // Example: salary of 100,000, gross 100,000, basic 60,000
  const base = rateBase === "gross" ? 100000 : 60000
  const exampleRate = (days: number) => (base / days).toLocaleString(undefined, { maximumFractionDigits: 2 })

  const save = async () => {
    setError("")
    if (mode === "custom" && (!Number.isInteger(dayBasis) || (dayBasis as number) < 20 || (dayBasis as number) > 31)) {
      setError("Enter a whole number of days between 20 and 31")
      return
    }
    setSaving(true)
    const res = await fetch("/api/payroll/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayBasis, dailyRateBase: rateBase }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j.error || "Could not save"); return }
    setFlash("Payroll settings saved")
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", marginBottom: 8, cursor: isAdmin ? "pointer" : "default",
    border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`, borderRadius: 8, background: active ? "var(--card-hover)" : "var(--card)",
  })

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Payroll Settings</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
        These rules decide the value of one day, which is used for absence, unpaid leave and half days.
      </p>

      {flash && <div style={{ position: "fixed", bottom: 24, right: 24, background: "#16a34a", color: "white", padding: "12px 20px", borderRadius: 8, zIndex: 2000 }}>{flash}</div>}
      {error && <div style={{ background: "var(--card)", border: "1px solid #dc2626", color: "var(--text)", padding: "10px 14px", borderRadius: 8, margin: "12px 0", fontSize: 13 }}>{error}</div>}

      {loading ? <div style={{ color: "var(--text-muted)", padding: 16 }}>Loading...</div> : (
        <>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, margin: "16px 0" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>1. How many days is a month divided into?</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
              Choose 22 if Saturday and Sunday are off. Any other choice means only Sunday is off.
            </p>
            {([
              ["month", "Actual days of the month", "28, 29, 30 or 31 - whichever the month has"],
              ["30", "30 days", "Every month is treated as 30 days"],
              ["26", "26 days", "Sunday off"],
              ["22", "22 days", "Saturday and Sunday off"],
              ["custom", "Another number", "Type your own number of days (20 to 31)"],
            ] as [Mode, string, string][]).map(([m, title, desc]) => (
              <label key={m} style={optionStyle(mode === m)}>
                <input type="radio" name="mode" checked={mode === m} disabled={!isAdmin} onChange={() => setMode(m)} style={{ marginTop: 3 }} />
                <span style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{title}</strong>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{desc}</span>
                  {m === "custom" && mode === "custom" && (
                    <input type="number" value={custom} disabled={!isAdmin} onChange={e => setCustom(e.target.value)}
                      style={{ marginTop: 6, width: 100, height: 34, border: "1.5px solid var(--border)", borderRadius: 8, padding: "0 10px", background: "var(--bg)", color: "var(--text)" }} />
                  )}
                </span>
              </label>
            ))}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Weekly off with this choice: <strong>{weeklyOffText(settings)}</strong></div>
          </div>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>2. The value of one day is taken from</h2>
            {([
              ["gross", "Gross salary", "Most common. One day = Gross divided by the days above."],
              ["basic", "Basic salary", "One day = Basic divided by the days above."],
            ] as ["gross" | "basic", string, string][]).map(([v, title, desc]) => (
              <label key={v} style={optionStyle(rateBase === v)}>
                <input type="radio" name="rateBase" checked={rateBase === v} disabled={!isAdmin} onChange={() => setRateBase(v)} style={{ marginTop: 3 }} />
                <span><strong style={{ fontSize: 13 }}>{title}</strong><span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{desc}</span></span>
              </label>
            ))}
          </div>

          <div style={{ background: "var(--card-hover)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 13 }}>
            <strong>Example</strong> (Gross 100,000, Basic 60,000):
            <div style={{ marginTop: 6 }}>
              {mode === "month"
                ? <>One day in a 30-day month = <strong>{exampleRate(30)}</strong>; in a 31-day month = <strong>{exampleRate(31)}</strong>; in February (28 days) = <strong>{exampleRate(28)}</strong></>
                : <>One day = <strong>{exampleRate(dayBasis && dayBasis > 0 ? dayBasis : 30)}</strong> every month</>}
            </div>
          </div>

          {isAdmin ? (
            <button onClick={save} disabled={saving}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8, border: "none", background: "var(--primary)", color: "var(--primary-text)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
            </button>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Only an admin can change these settings.</div>
          )}
        </>
      )}
    </div>
  )
}
