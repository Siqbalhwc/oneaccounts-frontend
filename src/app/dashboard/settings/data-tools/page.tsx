"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, Upload, Download, Save, RotateCcw, AlertTriangle,
} from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"
import * as Papa from "papaparse"
import * as XLSX from "xlsx"

// ---------- DB‑validated active company ID ----------
async function getActiveCompanyId(supabase: any): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return '00000000-0000-0000-0000-000000000001'

    const cookieMatch = document.cookie.match(/(?:^| )active_company_id=([^;]+)/)
    const candidateId = cookieMatch ? cookieMatch[2] : (user.app_metadata as any)?.company_id

    const { data: activeRole } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (activeRole?.company_id) return activeRole.company_id

    if (candidateId) {
      const { data: anyRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .eq('company_id', candidateId)
        .maybeSingle()
      if (anyRole) return candidateId
    }

    const { data: first } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    return first?.company_id || '00000000-0000-0000-0000-000000000001'
  } catch {
    return '00000000-0000-0000-0000-000000000001'
  }
}

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
  const [companyId, setCompanyId] = useState<string | null>(null)

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importEntity, setImportEntity] = useState("customer")
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update">("skip")
  const [validationError, setValidationError] = useState("")

  // ── Persistent import result (stays visible until next import) ──
  const [importResult, setImportResult] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  useEffect(() => {
    getActiveCompanyId(supabase).then(id => setCompanyId(id))
  }, [])

  const showMessage = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(""), 10000)   // longer visibility
  }

  const showPersistentResult = (type: "success" | "error", message: string) => {
    setImportResult({ type, message })
  }

  const clearImportResult = () => {
    setImportResult(null)
  }

  const resetBalances = async () => {
    if (!companyId) return
    await supabase.from("accounts").update({ balance: 0 }).eq("company_id", companyId)
    showMessage("✅ Account balances reset to zero.")
  }

  const callDeleteEntity = async (entity: string, successMsg: string) => {
    if (!companyId) return
    try {
      const res = await fetch('/api/admin/delete-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('✅ ' + successMsg)
        setConfirmSection(null)
      } else {
        showMessage('❌ ' + (data.error || 'Failed'))
      }
    } catch (e: any) {
      showMessage('❌ Network error')
    }
  }

  // ── Template download (opening_qty replaces qty_on_hand) ──
  const downloadTemplate = (entity: string) => {
    let headers: string[] = []
    let sample: Record<string, string> = {}

    if (entity === "customer") {
      headers = ["name", "code", "phone", "email", "address", "balance"]
      sample = { name: "John Doe", code: "CUST-001", phone: "+923001234567", email: "john@example.com", address: "123 Street", balance: "0" }
    } else if (entity === "supplier") {
      headers = ["name", "code", "phone", "email", "address", "balance"]
      sample = { name: "Acme Corp", code: "SUP-001", phone: "+923001234567", email: "acme@example.com", address: "456 Avenue", balance: "0" }
    } else if (entity === "product") {
      headers = ["name", "category", "unit", "cost_price", "sale_price", "opening_qty"]
      sample = { name: "Product A", category: "General", unit: "pcs", cost_price: "500", sale_price: "750", opening_qty: "100" }
    }

    const csvContent = [
      headers.join(","),
      headers.map(h => sample[h] || "").join(",")
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${entity}_template.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // ── Validation (opening_qty required) ──
  const validateImport = (map: Record<string, string>, data: Record<string, string>[]) => {
    setValidationError("")
    const required: Record<string, string[]> = {
      customer: ["name"],
      supplier: ["name"],
      product: ["name", "unit", "cost_price", "sale_price", "opening_qty"],
    }
    const reqFields = required[importEntity] || []

    for (const field of reqFields) {
      if (!map[field]) {
        setValidationError(`Required column "${field}" is not mapped. Please download the template for correct headers.`)
        return false
      }
    }

    // Numeric validation
    if (importEntity === "product") {
      const numericFields = ["cost_price", "sale_price", "opening_qty"]
      for (const field of numericFields) {
        const col = map[field]
        if (!col) continue
        for (let i = 0; i < data.length; i++) {
          const val = data[i][col]
          if (val !== undefined && val.trim() !== "" && isNaN(Number(val))) {
            setValidationError(`Row ${i+1}: "${field}" must be a valid number. Found: "${val}"`)
            return false
          }
        }
      }
    } else {
      const balCol = map["balance"]
      if (balCol) {
        for (let i = 0; i < data.length; i++) {
          const val = data[i][balCol]
          if (val !== undefined && val.trim() !== "" && isNaN(Number(val))) {
            setValidationError(`Row ${i+1}: "balance" must be a number. Found: "${val}"`)
            return false
          }
        }
      }
    }

    return true
  }

  // ── CSV / Excel Import (batch optimized) ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setValidationError("")
    clearImportResult()

    try {
      let rows: Record<string, string>[] = []
      const name = file.name.toLowerCase()

      if (name.endsWith(".xlsx")) {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: "array" })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          showMessage("Excel file has no sheets.")
          return
        }
        const worksheet = workbook.Sheets[sheetName]
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { header: 1 })
        if (rows.length > 0) {
          const headers = rows[0] as unknown as string[]
          const dataRows = rows.slice(1) as unknown as string[][]
          rows = dataRows.map(row => {
            const obj: Record<string, string> = {}
            headers.forEach((h, i) => {
              obj[String(h).trim()] = String(row[i] ?? "").trim()
            })
            return obj
          })
        }
      } else {
        const text = await file.text()
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h: string) => h.trim(),
        })
        if (result.errors.length > 0) console.warn("CSV parse warnings:", result.errors)
        rows = result.data
      }

      if (rows.length === 0) {
        showMessage("File is empty or has no valid rows.")
        return
      }

      setImportPreview(rows)

      const headers = Object.keys(rows[0])
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
        if (lower.includes("sale") || lower.includes("price")) autoMap.sale_price = h
        if (lower.includes("opening") || lower.includes("opening_qty")) autoMap.opening_qty = h   // ← changed
        if (lower.includes("category")) autoMap.category = h
        if (lower.includes("unit") || lower.includes("uom") || lower.includes("measure")) autoMap.unit = h
      })
      setColumnMap(autoMap)

      validateImport(autoMap, rows)
    } catch (err) {
      showMessage("Error reading file: " + (err as Error).message)
    }
  }

  const handleImport = async () => {
    if (!importFile || importing || !companyId) return
    if (!validateImport(columnMap, importPreview)) return

    setImporting(true)
    clearImportResult()
    const tableMap: Record<string, string> = { customer: "customers", supplier: "suppliers", product: "products" }
    const tableName = tableMap[importEntity]
    if (!tableName) {
      showPersistentResult("error", "Invalid entity type.")
      setImporting(false)
      return
    }

    try {
      const { data: existingCodes } = await supabase
        .from(tableName)
        .select("code")
        .eq("company_id", companyId)

      const existingCodeSet = new Set((existingCodes || []).map((r: any) => r.code))

      const prefix = importEntity === "customer" ? "CUST-" : importEntity === "supplier" ? "SUP-" : "PROD-"
      let maxNum = 0
      existingCodes?.forEach((r: any) => {
        const parts = r.code.split("-")
        if (parts.length === 2) {
          const n = parseInt(parts[1])
          if (!isNaN(n) && n > maxNum) maxNum = n
        }
      })
      let nextNum = maxNum + 1

      const rowsToInsert: any[] = []
      const rowsToUpdate: any[] = []
      let skipped = 0

      for (const row of importPreview) {
        const record: any = { company_id: companyId }
        Object.entries(columnMap).forEach(([field, col]) => {
          record[field] = row[col] || ""
        })
        if (!record.name) continue

        if (importEntity === "product") {
          record.cost_price = parseFloat(record.cost_price || 0)
          record.sale_price = parseFloat(record.sale_price || 0)
          record.opening_qty = parseFloat(record.opening_qty || 0)     // ← changed: opening_qty
          record.qty_on_hand = record.opening_qty                      // initial stock = opening_qty
          if (record.category === "") delete record.category
        } else {
          record.balance = parseFloat(record.balance || 0)
        }

        if (!columnMap.code || !record.code) {
          record.code = `${prefix}${String(nextNum).padStart(3, "0")}`
          nextNum++
        }

        if (existingCodeSet.has(record.code)) {
          if (duplicateAction === "skip") {
            skipped++
            continue
          } else {
            rowsToUpdate.push(record)
          }
        } else {
          rowsToInsert.push(record)
          existingCodeSet.add(record.code)
        }
      }

      let inserted = 0
      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from(tableName)
          .insert(rowsToInsert)
        if (insertError) {
          showPersistentResult("error", "Insert failed: " + insertError.message)
          setImporting(false)
          return
        }
        inserted = rowsToInsert.length
      }

      let updated = 0
      if (rowsToUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from(tableName)
          .upsert(rowsToUpdate, { onConflict: 'code' })
        if (updateError) {
          showPersistentResult("error", "Update failed: " + updateError.message)
          setImporting(false)
          return
        }
        updated = rowsToUpdate.length
      }

      showPersistentResult("success", `✅ Import completed! Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`)
    } catch (err: any) {
      showPersistentResult("error", "❌ Import error: " + (err.message || "Unknown error"))
    }
    setImporting(false)
  }

  const fieldOptions: Record<string, string[]> = {
    customer: ["name", "code", "phone", "email", "address", "balance"],
    supplier: ["name", "code", "phone", "email", "address", "balance"],
    product: ["name", "category", "unit", "cost_price", "sale_price", "opening_qty"],   // ← changed
  }

  if (companyId === null) return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading company context…</div>
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading...</div>
  if (!canView) return (
    <div style={{ padding: 24, textAlign: "center", color: "#E2E8F0" }}>
      <h2>Access Denied</h2>
      <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
    </div>
  )

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu&display=swap');

          .dm-header { margin-bottom: 20px; }
          .dm-title { font-size: 22px; font-weight: 800; color: #F1F5F9; }
          .dm-subtitle { font-size: 13px; color: #94A3B8; }
          .dm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 20px; }
          .dm-card {
            background: #111827; border: 1px solid #1E293B; border-radius: 10px;
            padding: 18px; display: flex; flex-direction: column; gap: 10px;
          }
          .dm-card-title { font-size: 14px; font-weight: 700; color: #F1F5F9; display: flex; align-items: center; gap: 6px; }
          .dm-card-desc { font-size: 12px; color: #94A3B8; flex: 1; }
          .dm-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
            border: none; cursor: pointer; font-family: inherit;
          }
          .dm-btn-primary { background: #2563EB; color: white; }
          .dm-btn-danger { background: #EF4444; color: white; }
          .dm-btn-outline { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
          .confirmation-box {
            background: #1E293B; border: 1px solid #EF4444; border-radius: 8px; padding: 12px;
            margin-top: 8px; font-size: 12px; color: #FCA5A5;
          }
          .confirmation-buttons { display: flex; gap: 8px; margin-top: 8px; }
          .import-section {
            background: #111827; border: 1px solid #1E293B; border-radius: 10px;
            padding: 20px; margin-top: 20px;
          }
          select, input[type="file"] {
            background: #1E293B; border: 1px solid #334155; border-radius: 6px;
            padding: 6px 10px; color: #F1F5F9; font-size: 12px;
          }
          table { width: 100%; border-collapse: collapse; color: #E2E8F0; }
          th { background: #1E293B; color: #94A3B8; font-size: 10px; padding: 6px; text-align: left; }
          td { border-bottom: 1px solid #1E293B; padding: 4px 6px; }
          label { color: #CBD5E1; }

          .import-preview-table td,
          .import-preview-table th {
            font-family: 'Noto Nastaliq Urdu', 'Arial', sans-serif;
          }

          .import-result {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .import-result.success {
            background: #064E3B;
            color: #6EE7B7;
            border: 1px solid #065F46;
          }
          .import-result.error {
            background: #7F1D1D;
            color: #FCA5A5;
            border: 1px solid #991B1B;
          }
        `}</style>

        <div className="dm-header">
          <div className="dm-title">🗄️ Data Management</div>
          <div className="dm-subtitle">Clean, import, export, backup & restore</div>
        </div>

        {/* ── Persistent import result message ── */}
        {importResult && (
          <div className={`import-result ${importResult.type}`}>
            <span>{importResult.message}</span>
            <button
              onClick={clearImportResult}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 14,
                marginLeft: 12,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {flash && !importResult && (
          <div style={{
            background: flash.includes("✅") ? "#064E3B" : "#1E293B",
            border: "1px solid " + (flash.includes("✅") ? "#065F46" : "#EF4444"),
            color: flash.includes("✅") ? "#6EE7B7" : "#FCA5A5",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {flash}
          </div>
        )}

        <div className="dm-grid">
          {[
            { key: "journal",          title: "Delete Journal Entries",    desc: "Remove all journal entries and reset balances.", entity: "journal",          successMsg: "Journal entries deleted." },
            { key: "all_invoices",     title: "Delete All Invoices",       desc: "Remove all sales & purchase invoices.",        entity: "invoices",         successMsg: "All invoices deleted." },
            { key: "sales_invoices",   title: "Delete Sales Invoices",     desc: "Remove only sales invoices.",                   entity: "sales_invoices",   successMsg: "Sales invoices deleted." },
            { key: "purchase_bills",   title: "Delete Purchase Bills",     desc: "Remove only purchase bills.",                   entity: "purchase_bills",   successMsg: "Purchase bills deleted." },
            { key: "customers",        title: "Delete Customers",          desc: "Remove all customers & related invoices.",     entity: "customers",        successMsg: "Customers and related invoices deleted." },
            { key: "suppliers",        title: "Delete Suppliers",          desc: "Remove all suppliers & related bills.",        entity: "suppliers",        successMsg: "Suppliers and related bills deleted." },
            { key: "products",         title: "Delete Products",           desc: "Remove all products, stock moves & invoice items.", entity: "products",    successMsg: "Products deleted." },
            { key: "reset_balances",   title: "Reset Balances",            desc: "Set all account balances to zero.",            entity: null,
              fn: () => { resetBalances(); setConfirmSection(null) } },
            { key: "nuke",             title: "Complete Reset (NUKE)",     desc: "Delete ALL data except chart of accounts.",   entity: "all",              successMsg: "Company completely reset." },
          ].map(item => (
            <div key={item.key} className="dm-card">
              <div className="dm-card-title"><Trash2 size={16} /> {item.title}</div>
              <div className="dm-card-desc">{item.desc}</div>
              {confirmSection === item.key ? (
                <div className="confirmation-box">
                  ⚠️ Are you sure?
                  <div className="confirmation-buttons">
                    <button className="dm-btn dm-btn-danger" onClick={() => {
                      if (item.entity === 'all') {
                        fetch('/api/admin/nuke-company', { method: 'POST' }).then(r => r.json()).then(data => {
                          if (data.success) showMessage('✅ Company wiped.')
                          else showMessage('❌ ' + (data.error || 'Failed'))
                        }).catch(() => showMessage('❌ Network error'))
                      } else if (item.entity) {
                        callDeleteEntity(item.entity, item.successMsg)
                      } else if (item.key === 'reset_balances') {
                        resetBalances()
                      }
                    }}>✅ Yes</button>
                    <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection(item.key)} disabled={!canEdit}>
                  {item.key === "nuke" ? "💣 Reset" : "Delete"}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="import-section">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: "#F1F5F9" }}>📥 Import from CSV or Excel</h3>
          <p style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
            Upload a CSV or Excel (.xlsx) file to bulk import Customers, Suppliers, or Products. Download the template for correct format.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className="dm-btn dm-btn-outline" onClick={() => downloadTemplate("customer")}>
              <Download size={14} /> Customer Template
            </button>
            <button className="dm-btn dm-btn-outline" onClick={() => downloadTemplate("supplier")}>
              <Download size={14} /> Supplier Template
            </button>
            <button className="dm-btn dm-btn-outline" onClick={() => downloadTemplate("product")}>
              <Download size={14} /> Product Template
            </button>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <select value={importEntity} onChange={(e) => setImportEntity(e.target.value)}>
              <option value="customer">Customers</option>
              <option value="supplier">Suppliers</option>
              <option value="product">Products</option>
            </select>
            <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
          </div>

          {validationError && (
            <div style={{ background: "#1E293B", border: "1px solid #EF4444", color: "#FCA5A5", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
              {validationError}
            </div>
          )}

          {importPreview.length > 0 && !validationError && (
            <>
              <h4 style={{ color: "#F1F5F9" }}>Preview ({importPreview.length} rows)</h4>
              <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 12 }}>
                <table className="import-preview-table">
                  <thead>
                    <tr>{Object.keys(importPreview[0]).map(k => <th key={k}>{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 5).map((row, i) => (
                      <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4 style={{ color: "#F1F5F9" }}>Column Mapping</h4>
              {fieldOptions[importEntity].map(field => (
                <div key={field} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <span style={{ width: 100, fontWeight: 600, color: "#CBD5E1" }}>{field}:</span>
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