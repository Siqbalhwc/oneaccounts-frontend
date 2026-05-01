"use client"

import { Download } from "lucide-react"

interface DownloadPDFButtonProps {
  onGenerate: () => void
  label?: string
  style?: React.CSSProperties
}

export default function DownloadPDFButton({ onGenerate, label = "PDF", style }: DownloadPDFButtonProps) {
  return (
    <button
      onClick={onGenerate}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        background: "#F8FAFC",
        border: "1px solid #E2E8F0",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        color: "#475569",
        ...style,
      }}
    >
      <Download size={12} /> {label}
    </button>
  )
}