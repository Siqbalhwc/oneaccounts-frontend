"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2,
  Upload,
  Download,
  Save,
  RotateCcw,
  AlertTriangle,
} from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

export default function DataManagementPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [flash, setFlash] = useState("")
  const [cleaning, setCleaning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const showMessage = (msg: string, isError = false) => {
    setFlash(msg)
    setTimeout(() => setFlash(""), 4000)
  }

  const handleClean = async () => {
    if (!canEdit) return
    setCleaning(true)
    try {
      // Example: delete old data or reset temporary tables
      // Adjust to your actual cleaning logic
      await supabase.rpc("clean_old_data")   // replace with your own RPC if needed
      showMessage("Old data cleaned successfully.")
    } catch (e: any) {
      showMessage(e.message || "Cleaning failed", true)
    }
    setCleaning(false)
  }

  const handleExport = async () => {
    if (!canEdit) return
    setExporting(true)
    try {
      const { data, error } = await supabase.rpc("export_all_data")
      if (error) throw error
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `oneaccounts-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      window.URL.revokeObjectURL(url)
      showMessage("Data exported successfully.")
    } catch (e: any) {
      showMessage(e.message || "Export failed", true)
    }
    setExporting(false)
  }

  const handleImport = async () => {
    if (!canEdit || !importFile) return
    setImporting(true)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const content = e.target?.result
        if (!content) return
        const json = JSON.parse(content as string)
        // Call a function or API to import data
        const { error } = await supabase.rpc("import_all_data", { data: json })
        if (error) throw error
        showMessage("Data imported successfully.")
      }
      reader.readAsText(importFile)
    } catch (e: any) {
      showMessage(e.message || "Import failed", true)
    }
    setImporting(false)
  }

  const handleBackup = async () => {
    if (!canEdit) return
    setBackingUp(true)
    try {
      await supabase.rpc("create_backup")
      showMessage("Backup created.")
    } catch (e: any) {
      showMessage(e.message || "Backup failed", true)
    }
    setBackingUp(false)
  }

  const handleRestore = async () => {
    if (!canEdit) return
    setRestoring(true)
    try {
      await supabase.rpc("restore_latest_backup")
      showMessage("Restore initiated.")
    } catch (e: any) {
      showMessage(e.message || "Restore failed", true)
    }
    setRestoring(false)
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .dm-header { margin-bottom: 20px; }
          .dm-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .dm-subtitle { font-size: 13px; color: #94A3B8; }
          .dm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px; }
          .dm-card {
            background: white;
            border: 1px solid #E2E8F0;
            border-radius: 10px;
            padding: 18px;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .dm-card-title { font-size: 14px; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 6px; }
          .dm-card-desc { font-size: 12px; color: #64748B; flex: 1; }
          .dm-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
            border: none; cursor: pointer; font-family: inherit;
          }
          .dm-btn-primary { background: #1D4ED8; color: white; }
          .dm-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
          .dm-btn-danger { background: #EF4444; color: white; }
          .dm-input-file { font-size: 12px; }
        `}</style>

        <div className="dm-header">
          <div className="dm-title">🗄️ Data Management</div>
          <div className="dm-subtitle">{canEdit ? "Clean, import, export, backup & restore" : "View data tools"}</div>
        </div>

        {flash && (
          <div style={{
            background: flash.toLowerCase().includes("error") || flash.toLowerCase().includes("failed") ? "#FEF2F2" : "#F0FDF4",
            border: "1px solid #BBF7D0",
            color: flash.toLowerCase().includes("error") || flash.toLowerCase().includes("failed") ? "#B91C1C" : "#15803D",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {flash}
          </div>
        )}

        <div className="dm-grid">
          {/* Clean Up */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Clean Data</div>
            <div className="dm-card-desc">Remove old temporary data or reset test entries.</div>
            <button
              className="dm-btn dm-btn-danger"
              onClick={handleClean}
              disabled={!canEdit || cleaning}
            >
              {cleaning ? "Cleaning..." : "Clean Now"}
            </button>
          </div>

          {/* Export */}
          <div className="dm-card">
            <div className="dm-card-title"><Download size={16} /> Export Data</div>
            <div className="dm-card-desc">Download all company data as JSON file.</div>
            <button
              className="dm-btn dm-btn-primary"
              onClick={handleExport}
              disabled={!canEdit || exporting}
            >
              {exporting ? "Exporting..." : "Export"}
            </button>
          </div>

          {/* Import */}
          <div className="dm-card">
            <div className="dm-card-title"><Upload size={16} /> Import Data</div>
            <div className="dm-card-desc">Restore from a previously exported JSON file.</div>
            <input
              type="file"
              accept=".json"
              className="dm-input-file"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              disabled={!canEdit}
            />
            <button
              className="dm-btn dm-btn-outline"
              onClick={handleImport}
              disabled={!canEdit || !importFile || importing}
            >
              {importing ? "Importing..." : "Import"}
            </button>
          </div>

          {/* Backup */}
          <div className="dm-card">
            <div className="dm-card-title"><Save size={16} /> Backup</div>
            <div className="dm-card-desc">Create a server‑side backup of your data.</div>
            <button
              className="dm-btn dm-btn-primary"
              onClick={handleBackup}
              disabled={!canEdit || backingUp}
            >
              {backingUp ? "Backing up..." : "Create Backup"}
            </button>
          </div>

          {/* Restore */}
          <div className="dm-card">
            <div className="dm-card-title"><RotateCcw size={16} /> Restore</div>
            <div className="dm-card-desc">Restore from the latest backup.</div>
            <button
              className="dm-btn dm-btn-outline"
              onClick={handleRestore}
              disabled={!canEdit || restoring}
            >
              {restoring ? "Restoring..." : "Restore"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>
          <AlertTriangle size={12} /> These actions are irreversible. Use with caution.
        </div>
      </div>
    </RoleGuard>
  )
}