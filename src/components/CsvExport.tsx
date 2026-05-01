"use client"

import { Download } from "lucide-react"

export function CsvExport({ data, filename }: { data: any[]; filename: string }) {
  const handleExport = () => {
    if (!data || data.length === 0) return
    const headers = Object.keys(data[0])
    const csv = [
      headers.join(","),
      ...data.map(row => headers.map(h => `"${(row[h] ?? "").toString().replace(/"/g, '""')}"`).join(","))
    ].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button onClick={handleExport} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 12px", background: "white", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
      <Download size={14} /> Export
    </button>
  )
}