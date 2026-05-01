"use client"

import { useState, useRef } from "react"
import { Upload, X } from "lucide-react"

export function CsvImport({ onImport }: { onImport: (data: any[]) => void }) {
  const [show, setShow] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split("\n").filter(l => l.trim())
      if (lines.length < 2) return
      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""))
      const rows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/"(.*)"/, "$1"))
        const obj: any = {}
        headers.forEach((h, i) => { obj[h] = vals[i] || "" })
        return obj
      })
      onImport(rows)
      setShow(false)
    }
    reader.readAsText(file)
  }

  return (
    <>
      <button onClick={() => setShow(true)} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 12px", background: "white", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        <Upload size={14} /> Import
      </button>
      {show && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, width: "90%", maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Import CSV</h3>
              <button onClick={() => setShow(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} />
          </div>
        </div>
      )}
    </>
  )
}