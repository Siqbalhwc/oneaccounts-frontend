"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, Upload, Download, Save, RotateCcw, AlertTriangle,
  X, Check, FileSpreadsheet, Database,
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
  const [confirmSection, setConfirmSection] = useState<string | null>(null)

  // ── Import state ───────────────────────────────────────────
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importEntity, setImportEntity] = useState("customer")
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update">("skip")

  const showMessage = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(""), 5000)
  }

  // ── Helper to parse CSV/Excel before import ────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)

    try {
      const text = await file.text()
      const rows = text.split("\n").filter(line => line.trim() !== "")
      if (rows.length === 0) { showMessage("File is empty."); return }
      const headers = rows[0].split(",").map(h => h.trim())
      const data = rows.slice(1).map(row => {
        const values = row.split(",")
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = values[i]?.trim() || "" })
        return obj
      })
      setImportPreview(data)
      // Auto-map columns if names match
      const autoMap: Record<string, string> = {}
      headers.forEach(h => {
        const lower = h.toLowerCase().replace(/\s/g, "")
        if (lower.includes("name")) autoMap.name = h
        if (lower.includes("code")) autoMap.code = h
        if (lower.includes("phone")) autoMap.phone = h
        if (lower.includes("email")) autoMap.email = h
        if (lower.includes("address")) autoMap.address = h
        if (lower.includes("balance")) autoMap.balance = h
        if (lower.includes("cost")) autoMap.cost_price = h
        if (lower.includes("sale_price") || lower.includes("price")) autoMap.sale_price = h
        if (lower.includes("qty") || lower.includes("quantity")) autoMap.qty_on_hand = h
      })
      setColumnMap(autoMap)
    } catch (err) {
      showMessage("Error reading file. Please upload a valid CSV.")
    }
  }

  // ── Generic delete helper ──────────────────────────────────
  const deleteAllFromTable = async (table: string, message: string) => {
    try {
      await supabase.from(table).delete().neq("id", 0)
      showMessage("✅ " + message)
      setConfirmSection(null)
    } catch (e: any) {
      showMessage("❌ " + (e.message || "Error"))
    }
  }

  // ... (all existing delete/reset functions from previous version) ...

  // ── NEW IMPORT FUNCTION ────────────────────────────────────
  const handleImport = async () => {
    if (!importFile || importing) return
    setImporting(true)
    showMessage("")

    const tableMap: Record<string, string> = {
      customer: "customers",
      supplier: "suppliers",
      product: "products",
    }
    const tableName = tableMap[importEntity]
    if (!tableName) { showMessage("Invalid entity type."); setImporting(false); return }

    // Validate required fields
    if (!columnMap.name) { showMessage("Name column is required."); setImporting(false); return }

    // Generate code if not mapped
    const autoCode = !columnMap.code
    if (autoCode) {
      // Get next code number (simplified)
      const prefix = importEntity === "customer" ? "CUST-" : importEntity === "supplier" ? "VEND-" : "PROD-"
      const { data: existing } = await supabase.from(tableName).select("code").like("code", `${prefix}%`)
      let maxNum = 0
      existing?.forEach((r: any) => {
        const parts = r.code.split("-")
        if (parts.length === 2) {
          const n = parseInt(parts[1])
          if (!isNaN(n) && n > maxNum) maxNum = n
        }
      })
      let startNum = maxNum + 1
      // Process data with generated codes
      const records = importPreview.map(row => {
        const record: any = {}
        Object.keys(columnMap).forEach(field => {
          if (columnMap[field]) record[field] = row[columnMap[field]]
        })
        if (autoCode) {
          record.code = `${prefix}${String(startNum++).padStart(3, "0")}`
        }
        return record
      })
      await insertRecords(records, tableName, importEntity)
    } else {
      const records = importPreview.map(row => {
        const record: any = {}
        Object.keys(columnMap).forEach(field => {
          if (columnMap[field]) record[field] = row[columnMap[field]]
        })
        return record
      })
      await insertRecords(records, tableName, importEntity)
    }
    setImporting(false)
  }

  const insertRecords = async (records: any[], tableName: string, entity: string) => {
    let success = 0, updated = 0, skipped = 0
    for (const rec of records) {
      if (!rec.name) continue
      // Convert numeric fields
      if (entity === "product") {
        rec.cost_price = parseFloat(rec.cost_price || 0)
        rec.sale_price = parseFloat(rec.sale_price || 0)
        rec.qty_on_hand = parseFloat(rec.qty_on_hand || 0)
      } else {
        rec.balance = parseFloat(rec.balance || 0)
      }
      // Check for existing code
      const { data: existing } = await supabase.from(tableName).select("id").eq("code", rec.code).maybeSingle()
      if (existing) {
        if (duplicateAction === "skip") { skipped++; continue }
        else {
          const { error } = await supabase.from(tableName).update(rec).eq("code", rec.code)
          if (error) { showMessage("Error updating " + rec.code + ": " + error.message); continue }
          updated++
        }
      } else {
        const { error } = await supabase.from(tableName).insert(rec)
        if (error) { showMessage("Error inserting " + rec.code + ": " + error.message); continue }
        success++
      }
    }
    showMessage(`✅ Import completed! Inserted: ${success}, Updated: ${updated}, Skipped: ${skipped}`)
  }

  const fieldOptions: Record<string, string[]> = {
    customer: ["name", "code", "phone", "email", "address", "balance"],
    supplier: ["name", "code", "phone", "email", "address", "balance"],
    product: ["name", "code", "cost_price", "sale_price", "qty_on_hand"],
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .dm-header { margin-bottom: 20px; }
          .dm-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .dm-subtitle { font-size: 13px; color: #94A3B8; }
          .dm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 20px; }
          .dm-card {
            background: white; border: 1px solid #E2E8F0; border-radius: 10px;
            padding: 18px; display: flex; flex-direction: column; gap: 10px;
          }
          .dm-card-title { font-size: 14px; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 6px; }
          .dm-card-desc { font-size: 12px; color: #64748B; flex: 1; }
          .dm-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
            border: none; cursor: pointer; font-family: inherit;
          }
          .dm-btn-primary { background: #1D4ED8; color: white; }
          .dm-btn-danger { background: #EF4444; color: white; }
          .dm-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
          .confirmation-box {
            background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px;
            margin-top: 8px; font-size: 12px; color: #B91C1C;
          }
          .confirmation-buttons { display: flex; gap: 8px; margin-top: 8px; }
          .import-section { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px; margin-top: 20px; }
        `}</style>

        <div className="dm-header">
          <div className="dm-title">🗄️ Data Management</div>
          <div className="dm-subtitle">Clean, import, export, backup & restore</div>
        </div>

        {flash && (
          <div style={{
            background: flash.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
            border: "1px solid " + (flash.startsWith("✅") ? "#BBF7D0" : "#FECACA"),
            color: flash.startsWith("✅") ? "#15803D" : "#B91C1C",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {flash}
          </div>
        )}

        {/* ─── All the delete/reset cards (same as previous version) ─── */}
        {/* ... (omitted for brevity, but include all the cards from the previous answer) ... */}
        <div className="dm-grid">
          {/* Keep all the existing clean/reset cards exactly as in the previous answer */}
        </div>

        {/* ─── BULK IMPORT SECTION ─────────────────────────────────── */}
        <div className="import-section">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>📥 Import from CSV</h3>
          <p style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>
            Upload a CSV file to bulk import Customers, Suppliers, or Products.
          </p>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <select value={importEntity} onChange={(e) => setImportEntity(e.target.value)}>
              <option value="customer">Customers</option>
              <option value="supplier">Suppliers</option>
              <option value="product">Products</option>
            </select>
            <input type="file" accept=".csv" onChange={handleFileChange} />
          </div>

          {importPreview.length > 0 && (
            <>
              <h4>Preview ({importPreview.length} rows)</h4>
              <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 12 }}>
                <table style={{ width: "100%", fontSize: 11 }}>
                  <thead>
                    <tr>{Object.keys(importPreview[0]).map(k => <th key={k}>{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 5).map((row, i) => (
                      <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4>Column Mapping</h4>
              {fieldOptions[importEntity].map(field => (
                <div key={field} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <span style={{ width: 100, fontWeight: 600 }}>{field}:</span>
                  <select
                    value={columnMap[field] || ""}
                    onChange={(e) => setColumnMap(prev => ({ ...prev, [field]: e.target.value }))}
                  >
                    <option value="">-- Select column --</option>
                    {Object.keys(importPreview[0]).map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}

              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <label>
                  <input type="radio" value="skip" checked={duplicateAction === "skip"} onChange={() => setDuplicateAction("skip")} />
                  Skip duplicates
                </label>
                <label>
                  <input type="radio" value="update" checked={duplicateAction === "update"} onChange={() => setDuplicateAction("update")} />
                  Update duplicates
                </label>
              </div>

              <button
                className="dm-btn dm-btn-primary"
                onClick={handleImport}
                disabled={importing || !columnMap.name}
                style={{ marginTop: 12 }}
              >
                {importing ? "Importing..." : "🚀 Import Data"}
              </button>
            </>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>
          <AlertTriangle size={12} /> These actions are irreversible. Use with caution.
        </div>
      </div>
    </RoleGuard>
  )
}