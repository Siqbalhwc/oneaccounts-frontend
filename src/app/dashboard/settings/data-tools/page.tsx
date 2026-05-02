"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Database, Download, Upload, Trash2, AlertTriangle, Check } from "lucide-react"

export default function DataToolsPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState("")
  const [fileInput, setFileInput] = useState<File | null>(null)

  // ──────── CLEAN DATA HELPERS ─────────────────────────────────────────────
  const cleanTable = async (table: string) => {
    setLoading(`Cleaning ${table}...`)
    try {
      await supabase.from(table).delete().neq("id", 0)
      setMessage(`✅ ${table} cleaned.`)
    } catch (e: any) { setMessage(`❌ ${e.message}`) }
    setLoading("")
    setTimeout(() => setMessage(""), 4000)
  }

  const resetBalances = async () => {
    setLoading("Resetting balances...")
    try {
      await supabase.from("accounts").update({ balance: 0 }).neq("id", 0)
      setMessage("✅ All account balances reset to 0.")
    } catch (e: any) { setMessage(`❌ ${e.message}`) }
    setLoading("")
    setTimeout(() => setMessage(""), 4000)
  }

  const completeReset = async () => {
    setLoading("Resetting entire database...")
    try {
      const tables = ["journal_lines", "journal_entries", "invoice_items", "invoices", "stock_moves", "products", "customers", "suppliers", "investors"]
      for (const t of tables) {
        await supabase.from(t).delete().neq("id", 0)
      }
      await supabase.from("accounts").update({ balance: 0 }).neq("id", 0)
      setMessage("✅ Database completely reset (accounts preserved).")
    } catch (e: any) { setMessage(`❌ ${e.message}`) }
    setLoading("")
    setTimeout(() => setMessage(""), 4000)
  }

  // ──────── EXPORT ────────────────────────────────────────────────────────
  const exportCSV = async (table: string, filename: string) => {
    setLoading(`Exporting ${table}...`)
    const { data } = await supabase.from(table).select("*")
    if (!data || data.length === 0) {
      setMessage(`No data in ${table}.`)
      setLoading("")
      return
    }
    const headers = Object.keys(data[0])
    const csv = [headers.join(","), ...data.map(row => headers.map(h => `"${(row[h] ?? "").toString().replace(/"/g, '""')}"`).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setMessage(`✅ ${filename}.csv downloaded.`)
    setLoading("")
    setTimeout(() => setMessage(""), 3000)
  }

  // ──────── BACKUP / RESTORE ──────────────────────────────────────────────
  const backupDB = async () => {
    setLoading("Creating backup...")
    const tables = ["accounts", "customers", "suppliers", "products", "invoices", "journal_entries", "journal_lines", "company_settings"]
    const backup: any = {}
    for (const t of tables) {
      const { data } = await supabase.from(t).select("*")
      if (data) backup[t] = data
    }
    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `oneaccounts-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage("✅ Backup downloaded.")
    setLoading("")
    setTimeout(() => setMessage(""), 3000)
  }

  const restoreDB = async (file: File) => {
    setLoading("Restoring backup...")
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      for (const [table, rows] of Object.entries(data)) {
        await supabase.from(table).delete().neq("id", 0)
        for (const row of rows as any[]) {
          await supabase.from(table).insert(row)
        }
      }
      setMessage("✅ Database restored.")
    } catch (e: any) { setMessage(`❌ Restore failed: ${e.message}`) }
    setLoading("")
    setTimeout(() => setMessage(""), 4000)
  }

  // ──────── CSV IMPORT ────────────────────────────────────────────────────
  const importCSV = async (file: File, table: string, mapping: Record<string, string>) => {
    setLoading(`Importing ${table}...`)
    try {
      const text = await file.text()
      const lines = text.split("\n").filter(l => l.trim())
      if (lines.length < 2) {
        setMessage("File is empty or missing headers."); setLoading(""); return
      }
      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""))
      const rows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/"(.*)"/, "$1"))
        const obj: any = {}
        headers.forEach((h, i) => { if (mapping[h]) obj[mapping[h]] = vals[i] || "" })
        return obj
      })
      for (const row of rows) {
        await supabase.from(table).insert(row)
      }
      setMessage(`✅ Imported ${rows.length} rows into ${table}.`)
    } catch (e: any) { setMessage(`❌ ${e.message}`) }
    setLoading("")
    setTimeout(() => setMessage(""), 4000)
  }

  const [confirmAction, setConfirmAction] = useState("")

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .dt-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 24px; margin-bottom: 16px; }
        .dt-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .dt-subtitle { font-size: 13px; color: #94A3B8; margin-bottom: 20px; }
        .dt-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; margin-right: 8px; margin-bottom: 8px; }
        .dt-btn-danger { background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA; }
        .dt-btn-warning { background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }
        .dt-btn-primary { background: #1D4ED8; color: white; }
        .dt-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .dt-message { padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .dt-section { margin-bottom: 20px; }
        .dt-section-title { font-size: 14px; font-weight: 700; color: #1E293B; margin-bottom: 8px; }
      `}</style>

      <div className="dt-title">🗃️ Data Management</div>
      <div className="dt-subtitle">Clean, import, export, and manage your data</div>

      {message && (
        <div className="dt-message" style={{ background: message.startsWith("✅") ? "#F0FDF4" : "#FEF2F2", color: message.startsWith("✅") ? "#15803D" : "#B91C1C" }}>
          {message}
        </div>
      )}

      {/* ── Clean Data ── */}
      <div className="dt-card">
        <div className="dt-section-title"><Trash2 size={16} /> Clean Data</div>
        <div className="dt-section">
          <button className="dt-btn dt-btn-danger" onClick={() => { if (confirm("Delete ALL journal entries?")) cleanTable("journal_entries") }}>🗑️ Delete ALL Journal Entries</button>
          <button className="dt-btn dt-btn-danger" onClick={() => { if (confirm("Delete ALL invoices?")) cleanTable("invoices") }}>🗑️ Delete ALL Invoices</button>
          <button className="dt-btn dt-btn-danger" onClick={() => { if (confirm("Delete ALL sales invoices only?")) { supabase.from("invoices").delete().eq("type", "sale").then(() => { setMessage("✅ Sales invoices deleted."); setTimeout(() => setMessage(""), 3000) }) } }}>🗑️ Delete Sales Invoices</button>
          <button className="dt-btn dt-btn-danger" onClick={() => { if (confirm("Delete ALL purchase bills only?")) { supabase.from("invoices").delete().eq("type", "purchase").then(() => { setMessage("✅ Purchase bills deleted."); setTimeout(() => setMessage(""), 3000) }) } }}>🗑️ Delete Purchase Bills</button>
        </div>
        <div className="dt-section">
          <button className="dt-btn dt-btn-warning" onClick={() => { if (confirm("Delete ALL customers?")) cleanTable("customers") }}>🗑️ Delete ALL Customers</button>
          <button className="dt-btn dt-btn-warning" onClick={() => { if (confirm("Delete ALL suppliers?")) cleanTable("suppliers") }}>🗑️ Delete ALL Suppliers</button>
          <button className="dt-btn dt-btn-warning" onClick={() => { if (confirm("Delete ALL products?")) cleanTable("products") }}>🗑️ Delete ALL Products</button>
        </div>
        <div className="dt-section">
          <button className="dt-btn dt-btn-warning" onClick={() => { if (confirm("Reset ALL account balances to zero?")) resetBalances() }}>🔄 Reset All Balances</button>
          <button className="dt-btn dt-btn-danger" onClick={() => { if (confirm("COMPLETE DATABASE RESET? This will delete all transactions and master data, keeping only the chart of accounts.")) completeReset() }}>💣 COMPLETE DATABASE RESET</button>
        </div>
      </div>

      {/* ── Export ── */}
      <div className="dt-card">
        <div className="dt-section-title"><Download size={16} /> Export Data</div>
        <button className="dt-btn dt-btn-outline" onClick={() => exportCSV("accounts", "accounts")}>📥 Accounts</button>
        <button className="dt-btn dt-btn-outline" onClick={() => exportCSV("customers", "customers")}>📥 Customers</button>
        <button className="dt-btn dt-btn-outline" onClick={() => exportCSV("suppliers", "suppliers")}>📥 Suppliers</button>
        <button className="dt-btn dt-btn-outline" onClick={() => exportCSV("products", "products")}>📥 Products</button>
        <button className="dt-btn dt-btn-outline" onClick={() => exportCSV("invoices", "invoices")}>📥 Invoices</button>
        <button className="dt-btn dt-btn-outline" onClick={() => exportCSV("journal_entries", "journal_entries")}>📥 Journal Entries</button>
      </div>

      {/* ── Backup / Restore ── */}
      <div className="dt-card">
        <div className="dt-section-title"><Database size={16} /> Backup & Restore</div>
        <button className="dt-btn dt-btn-primary" onClick={backupDB}>💾 Create Backup</button>
        <div style={{ marginTop: 12 }}>
          <input type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f) { if (confirm("Restore backup? This will overwrite all current data.")) restoreDB(f) } }} />
        </div>
      </div>

      {/* ── CSV Import ── */}
      <div className="dt-card">
        <div className="dt-section-title"><Upload size={16} /> Import from CSV</div>
        <p style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>Upload a CSV file. First row must be headers matching the column names.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="file" accept=".csv" onChange={e => setFileInput(e.target.files?.[0] || null)} />
          <select id="csv-table" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #E2E8F0" }}>
            <option value="customers">Customers</option>
            <option value="suppliers">Suppliers</option>
            <option value="products">Products</option>
          </select>
          <button className="dt-btn dt-btn-primary" onClick={() => {
            if (!fileInput) { setMessage("Select a CSV file first."); return }
            const table = (document.getElementById("csv-table") as HTMLSelectElement)?.value
            if (table) importCSV(fileInput, table, {})
          }}>Import</button>
        </div>
      </div>
    </div>
  )
}