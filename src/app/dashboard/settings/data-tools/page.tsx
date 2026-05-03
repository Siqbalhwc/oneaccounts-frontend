"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, Upload, Download, Save, RotateCcw, AlertTriangle,
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
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update">("skip")

  const showMessage = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(""), 5000)
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

  const resetBalances = async () => {
    await supabase.from("accounts").update({ balance: 0 }).neq("id", 0)
    showMessage("✅ Account balances reset to zero.")
  }

  // ── Specific operations ─────────────────────────────────────
  const handleDeleteJournal = async () => {
    await supabase.from("journal_lines").delete().neq("id", 0)
    await supabase.from("journal_entries").delete().neq("id", 0)
    await resetBalances()
    setConfirmSection(null)
  }

  const handleDeleteInvoices = async () => {
    await supabase.from("invoice_items").delete().neq("id", 0)
    await supabase.from("invoices").delete().neq("id", 0)
    showMessage("✅ All invoices deleted.")
    setConfirmSection(null)
  }

  const handleDeleteSalesInvoices = async () => {
    const { data: sales } = await supabase.from("invoices").select("id").eq("type", "sale")
    if (sales && sales.length) {
      const ids = sales.map((i: any) => i.id)
      await supabase.from("invoice_items").delete().in("invoice_id", ids)
      await supabase.from("invoices").delete().eq("type", "sale")
    }
    showMessage("✅ Sales invoices deleted.")
    setConfirmSection(null)
  }

  const handleDeletePurchaseBills = async () => {
    const { data: purchases } = await supabase.from("invoices").select("id").eq("type", "purchase")
    if (purchases && purchases.length) {
      const ids = purchases.map((i: any) => i.id)
      await supabase.from("invoice_items").delete().in("invoice_id", ids)
      await supabase.from("invoices").delete().eq("type", "purchase")
    }
    showMessage("✅ Purchase bills deleted.")
    setConfirmSection(null)
  }

  const handleDeleteCustomers = async () => {
    const { data: custs } = await supabase.from("customers").select("id")
    if (custs && custs.length) {
      const custIds = custs.map((c: any) => c.id)
      const { data: invs } = await supabase
        .from("invoices")
        .select("id")
        .eq("type", "sale")
        .in("party_id", custIds)
      if (invs && invs.length) {
        const invIds = invs.map((i: any) => i.id)
        await supabase.from("invoice_items").delete().in("invoice_id", invIds)
        await supabase.from("invoices").delete().in("id", invIds)
      }
      await supabase.from("customers").delete().neq("id", 0)
    }
    showMessage("✅ Customers and related invoices deleted.")
    setConfirmSection(null)
  }

  const handleDeleteSuppliers = async () => {
    const { data: supps } = await supabase.from("suppliers").select("id")
    if (supps && supps.length) {
      const suppIds = supps.map((s: any) => s.id)
      const { data: invs } = await supabase
        .from("invoices")
        .select("id")
        .eq("type", "purchase")
        .in("party_id", suppIds)
      if (invs && invs.length) {
        const invIds = invs.map((i: any) => i.id)
        await supabase.from("invoice_items").delete().in("invoice_id", invIds)
        await supabase.from("invoices").delete().in("id", invIds)
      }
      await supabase.from("suppliers").delete().neq("id", 0)
    }
    showMessage("✅ Suppliers and related bills deleted.")
    setConfirmSection(null)
  }

  const handleDeleteProducts = async () => {
    await supabase.from("stock_moves").delete().neq("id", 0)
    await supabase.from("invoice_items").delete().neq("id", 0)
    await supabase.from("products").delete().neq("id", 0)
    showMessage("✅ Products deleted.")
    setConfirmSection(null)
  }

  const handleCompleteReset = async () => {
    const tables = [
      "journal_lines", "journal_entries",
      "invoice_items", "invoices",
      "stock_moves", "products",
      "customers", "suppliers", "investors",
      "company_settings", "user_roles"
    ]
    for (const table of tables) {
      await supabase.from(table).delete().neq("id", 0)
    }
    await resetBalances()
    showMessage("✅ Complete reset done. Default chart of accounts preserved.")
    setConfirmSection(null)
  }

  // ── CSV IMPORT HANDLERS ────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)

    try {
      const text = await file.text()
      const rows = text.split("\n").filter(line => line.trim() !== "")
      if (rows.length === 0) {
        showMessage("File is empty.")
        return
      }
      const headers = rows[0].split(",").map(h => h.trim())
      const data = rows.slice(1).map(row => {
        const values = row.split(",")
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = values[i]?.trim() || "" })
        return obj
      })
      setImportPreview(data)
      // Auto‑map columns
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

    if (!columnMap.name) { showMessage("Name column is required."); setImporting(false); return }

    const autoCode = !columnMap.code
    let startNum = 1
    if (autoCode) {
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
      startNum = maxNum + 1
    }

    let success = 0, updated = 0, skipped = 0
    for (const row of importPreview) {
      const record: any = {}
      Object.entries(columnMap).forEach(([field, col]) => {
        record[field] = row[col] || ""
      })
      if (!record.name) continue

      // numeric conversion
      if (importEntity === "product") {
        record.cost_price = parseFloat(record.cost_price || 0)
        record.sale_price = parseFloat(record.sale_price || 0)
        record.qty_on_hand = parseFloat(record.qty_on_hand || 0)
      } else {
        record.balance = parseFloat(record.balance || 0)
      }

      if (autoCode) {
        const code = importEntity === "customer" ? `CUST-${String(startNum++).padStart(3, "0")}`
          : importEntity === "supplier" ? `VEND-${String(startNum++).padStart(3, "0")}`
          : `PROD-${String(startNum++).padStart(3, "0")}`
        record.code = code
      }

      const { data: existing } = await supabase.from(tableName).select("id").eq("code", record.code).maybeSingle()
      if (existing) {
        if (duplicateAction === "skip") { skipped++; continue }
        else {
          const { error } = await supabase.from(tableName).update(record).eq("code", record.code)
          if (error) {
            showMessage("Error updating " + record.code + ": " + error.message)
            continue
          }
          updated++
        }
      } else {
        const { error } = await supabase.from(tableName).insert(record)
        if (error) {
          showMessage("Error inserting " + record.code + ": " + error.message)
          continue
        }
        success++
      }
    }
    showMessage(`✅ Import completed! Inserted: ${success}, Updated: ${updated}, Skipped: ${skipped}`)
    setImporting(false)
  }

  const fieldOptions: Record<string, string[]> = {
    customer: ["name", "code", "phone", "email", "address", "balance"],
    supplier: ["name", "code", "phone", "email", "address", "balance"],
    product: ["name", "code", "cost_price", "sale_price", "qty_on_hand"],
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

        {/* ─── Clean / Reset cards ────────────────────────────────── */}
        <div className="dm-grid">
          {[
            { key: "journal", title: "Delete Journal Entries", desc: "Remove all journal entries and reset balances.", fn: handleDeleteJournal },
            { key: "all_invoices", title: "Delete All Invoices", desc: "Remove all sales & purchase invoices.", fn: handleDeleteInvoices },
            { key: "sales_invoices", title: "Delete Sales Invoices", desc: "Remove only sales invoices.", fn: handleDeleteSalesInvoices },
            { key: "purchase_bills", title: "Delete Purchase Bills", desc: "Remove only purchase bills.", fn: handleDeletePurchaseBills },
            { key: "customers", title: "Delete Customers", desc: "Remove all customers & related invoices.", fn: handleDeleteCustomers },
            { key: "suppliers", title: "Delete Suppliers", desc: "Remove all suppliers & related bills.", fn: handleDeleteSuppliers },
            { key: "products", title: "Delete Products", desc: "Remove all products, stock moves & invoice items.", fn: handleDeleteProducts },
            { key: "reset_balances", title: "Reset Balances", desc: "Set all account balances to zero.", fn: () => { resetBalances(); setConfirmSection(null); } },
            { key: "nuke", title: "Complete Reset", desc: "Delete ALL data except default chart of accounts.", fn: handleCompleteReset },
          ].map(item => (
            <div key={item.key} className="dm-card">
              <div className="dm-card-title"><Trash2 size={16} /> {item.title}</div>
              <div className="dm-card-desc">{item.desc}</div>
              {confirmSection === item.key ? (
                <div className="confirmation-box">
                  ⚠️ Are you sure?
                  <div className="confirmation-buttons">
                    <button className="dm-btn dm-btn-danger" onClick={item.fn}>✅ Yes</button>
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

        {/* ─── Bulk Import Section ───────────────────────────────── */}
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
                      <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
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