"use client"
import { useState } from "react"
import { Lock, Unlock } from "lucide-react"
import type { CSSProperties } from "react"

type Props = {
  value: string | number
  onChange: (raw: string) => void
  locked: boolean
  onLock: () => void
  className?: string
  style?: CSSProperties
}

// One bordered box (same look as the page's normal inputs) with a small lock button inside it.
// Locked = calculated automatically (read-only, skipped by Tab, soft tint).
// Click the lock on an unlocked box to make that box the automatic one.
export default function LineCalcInput({ value, onChange, locked, onLock, className, style }: Props) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      className={className}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        paddingRight: 4,
        borderColor: focused && !locked ? "var(--primary)" : style?.borderColor,
        background: locked ? "color-mix(in srgb, var(--primary) 7%, var(--bg))" : undefined,
      }}
    >
      <input
        type="number"
        step="any"
        value={value}
        readOnly={locked}
        tabIndex={locked ? -1 : 0}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minWidth: 0,
          width: "100%",
          height: "100%",
          padding: 0,
          margin: 0,
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
          outline: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          textAlign: "inherit",
          cursor: locked ? "default" : undefined,
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={locked ? undefined : onLock}
        title={locked ? "Calculated automatically" : "Click to calculate this field automatically"}
        aria-label={locked ? "Calculated automatically" : "Calculate this field automatically"}
        style={{
          flex: "none",
          width: 22,
          height: 22,
          minHeight: 0,
          margin: 0,
          padding: 0,
          border: "none",
          boxShadow: "none",
          borderRadius: 4,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: locked ? "default" : "pointer",
          color: locked ? "var(--primary)" : "var(--text-muted)",
          opacity: locked ? 1 : 0.6,
        }}
      >
        {locked ? <Lock size={13} /> : <Unlock size={13} />}
      </button>
    </div>
  )
}
