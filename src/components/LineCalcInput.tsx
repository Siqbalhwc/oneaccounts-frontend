"use client"
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

// Number box with a small lock icon. Locked = calculated automatically (read-only).
// Click the lock on an unlocked box to make that box the automatic one.
export default function LineCalcInput({ value, onChange, locked, onLock, className, style }: Props) {
  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <style href="lc-input-css" precedence="default">{`
        .lc-input::-webkit-outer-spin-button,
        .lc-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .lc-input { -moz-appearance: textfield; appearance: textfield; }
      `}</style>
      <input
        className={`${className || ""} lc-input`}
        style={{
          ...style,
          width: "100%",
          boxSizing: "border-box",
          paddingRight: 20,
          background: locked ? "var(--bg)" : undefined,
        }}
        type="number"
        step="any"
        value={value}
        readOnly={locked}
        onChange={e => onChange(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={locked ? undefined : onLock}
        title={locked ? "Calculated automatically" : "Click to calculate this field automatically"}
        style={{
          position: "absolute",
          right: 3,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          padding: 2,
          lineHeight: 0,
          cursor: locked ? "default" : "pointer",
          color: locked ? "var(--primary)" : "var(--text-muted)",
          opacity: locked ? 1 : 0.55,
        }}
      >
        {locked ? <Lock size={11} /> : <Unlock size={11} />}
      </button>
    </div>
  )
}
