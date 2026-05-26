"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Upload, Download, CheckCircle, XCircle } from "lucide-react"
import * as XLSX from "xlsx"

export default function ImportAssetsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null)

  const handleImport = async () => {
    if (!file) return
    setImporting(true)
    setResult(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const data = e.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet)

      let success = 0
      const errors: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any
        const rowNum = i + 2 // Excel row number (header is row 1)
        try {
          const res = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: row["Asset Name"],
              purchase_date: row["Purchase Date"] || new Date().toISOString().split("T")[0],
              cost_price: row["Cost Price"],
              life_months: row["Life (Months)"],
              salvage_value: row["Salvage Value"] || 0,
              category: row["Category"],
              notes: row["Opening Flag"] === "Y" ? "Opening asset" : "",
              source_type: row["Opening Flag"] === "Y" ? "opening" : "manual",
            }),
          })
          const json = await res.json()
          if (json.success) {
            success++
          } else {
            errors.push(`Row ${rowNum}: ${json.error || 'Unknown error'}`)
          }
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err.message || 'Network error'}`)
        }
      }

      setResult({ success, errors })
      setImporting(false)
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", color: "var(--text)", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
        }
        .btn:hover { background: var(--card-hover); }
        .msg-success { background: var(--card); border: 1px solid #065F46; color: #6EE7B7; padding: 10px 16px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
        .msg-error { background: var(--card); border: 1px solid #EF4444; color: #FCA5A5; padding: 10px 16px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
      `}</style>

      <button className="btn" onClick={() => router.push("/dashboard/assets")}><ArrowLeft size={16} /> Back</button>
      <h1 style={{ marginTop: 16, fontSize: 22, fontWeight: 800 }}>📥 Import Assets</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
        Upload an Excel file with asset details. <a href="/api/assets/template" download style={{ color: "var(--primary)" }}>Download Template</a>
      </p>

      <div style={{ marginBottom: 16 }}>
        <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} style={{ color: "var(--text)" }} />
        <button className="btn" onClick={handleImport} disabled={!file || importing} style={{ marginLeft: 10 }}>
          <Upload size={14} /> {importing ? "Importing..." : "Import"}
        </button>
      </div>

      {importing && (
        <div style={{ color: "var(--text-muted)", padding: 12 }}>⏳ Processing file, please wait…</div>
      )}

      {result && (
        <>
          <div className="msg-success">
            <CheckCircle size={16} /> Imported {result.success} assets successfully.
          </div>
          {result.errors.length > 0 && (
            <div className="msg-error">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <XCircle size={16} /> {result.errors.length} rows failed:
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {result.errors.map((err, i) => <li key={i} style={{ color: "#FCA5A5", fontSize: 12 }}>{err}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}