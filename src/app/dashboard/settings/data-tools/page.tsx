"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, Upload, Download, Save, RotateCcw, AlertTriangle,
} from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

// ---------- DB‑validated active company ID ----------
async function getActiveCompanyId(supabase: any): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return '00000000-0000-0000-0000-000000000001'

    const cookieMatch = document.cookie.match(/(?:^| )active_company_id=([^;]+)/)
    const candidateId = cookieMatch ? cookieMatch[2] : (user.app_metadata as any)?.company_id

    // prefer the active company from user_roles
    const { data: activeRole } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (activeRole?.company_id) return activeRole.company_id

    // fallback: any company the user belongs to
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

  // import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importEntity, setImportEntity] = useState("customer")
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update">("skip")

  useEffect(() => {
    getActiveCompanyId(supabase).then(id => setCompanyId(id))
  }, [])

  const showMessage = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(""), 5000)
  }

  // ----- delete helpers (all scoped by companyId) -----
  const deleteAllFromTable = async (table: string, message: string) => {
    try {
      await supabase.from(table).delete().eq("company_id", companyId!)
      showMessage("✅ " + message)
      setConfirmSection(null)
    } catch (e: any) { showMessage("❌ " + (e.message || "Error")) }
  }

  const resetBalances = async () => {
    await supabase.from("accounts").update({ balance: 0 }).eq("company_id", companyId!)
    showMessage("✅ Account balances reset to zero.")
  }

  const handleDeleteJournal = async () => {
    await supabase.from("journal_lines").delete().eq("company_id", companyId!)
    await supabase.from("journal_entries").delete().eq("company_id", companyId!)
    await resetBalances()
    setConfirmSection(null)
  }
  const handleDeleteInvoices = async () => {
    await supabase.from("invoice_items").delete().eq("company_id", companyId!)
    await supabase.from("invoices").delete().eq("company_id", companyId!)
    showMessage("✅ All invoices deleted."); setConfirmSection(null)
  }
  const handleDeleteSalesInvoices = async () => {
    const { data: sales } = await supabase.from("invoices").select("id").eq("company_id", companyId!).eq("type", "sale")
    if (sales && sales.length) {
      const ids = sales.map((i: any) => i.id)
      await supabase.from("invoice_items").delete().in("invoice_id", ids).eq("company_id", companyId!)
      await supabase.from("invoices").delete().in("id", ids).eq("company_id", companyId!)
    }
    showMessage("✅ Sales invoices deleted."); setConfirmSection(null)
  }
  const handleDeletePurchaseBills = async () => {
    const { data: purchases } = await supabase.from("invoices").select("id").eq("company_id", companyId!).eq("type", "purchase")
    if (purchases && purchases.length) {
      const ids = purchases.map((i: any) => i.id)
      await supabase.from("invoice_items").delete().in("invoice_id", ids).eq("company_id", companyId!)
      await supabase.from("invoices").delete().in("id", ids).eq("company_id", companyId!)
    }
    showMessage("✅ Purchase bills deleted."); setConfirmSection(null)
  }
  const handleDeleteCustomers = async () => {
    const { data: custs } = await supabase.from("customers").select("id").eq("company_id", companyId!)
    if (custs && custs.length) {
      const custIds = custs.map((c: any) => c.id)
      const { data: invs } = await supabase.from("invoices").select("id").eq("company_id", companyId!).eq("type", "sale").in("party_id", custIds)
      if (invs && invs.length) {
        const invIds = invs.map((i: any) => i.id)
        await supabase.from("invoice_items").delete().in("invoice_id", invIds).eq("company_id", companyId!)
        await supabase.from("invoices").delete().in("id", invIds).eq("company_id", companyId!)
      }
      await supabase.from("customers").delete().eq("company_id", companyId!)
    }
    showMessage("✅ Customers and related invoices deleted."); setConfirmSection(null)
  }
  const handleDeleteSuppliers = async () => {
    const { data: supps } = await supabase.from("suppliers").select("id").eq("company_id", companyId!)
    if (supps && supps.length) {
      const suppIds = supps.map((s: any) => s.id)
      const { data: invs } = await supabase.from("invoices").select("id").eq("company_id", companyId!).eq("type", "purchase").in("party_id", suppIds)
      if (invs && invs.length) {
        const invIds = invs.map((i: any) => i.id)
        await supabase.from("invoice_items").delete().in("invoice_id", invIds).eq("company_id", companyId!)
        await supabase.from("invoices").delete().in("id", invIds).eq("company_id", companyId!)
      }
      await supabase.from("suppliers").delete().eq("company_id", companyId!)
    }
    showMessage("✅ Suppliers and related bills deleted."); setConfirmSection(null)
  }
  const handleDeleteProducts = async () => {
    await supabase.from("stock_moves").delete().eq("company_id", companyId!)
    await supabase.from("invoice_items").delete().eq("company_id", companyId!)
    await supabase.from("products").delete().eq("company_id", companyId!)
    showMessage("✅ Products deleted."); setConfirmSection(null)
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
      await supabase.from(table).delete().eq("company_id", companyId!)
    }
    await resetBalances()
    showMessage("✅ Complete reset done."); setConfirmSection(null)
  }

  // ----- CSV Import handlers (same as before, scoped) -----
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
    } catch { showMessage("Error reading file.") }
  }

  const handleImport = async () => {
    if (!importFile || importing || !companyId) return
    setImporting(true)
    const tableMap: Record<string, string> = { customer: "customers", supplier: "suppliers", product: "products" }
    const tableName = tableMap[importEntity]
    if (!tableName) { showMessage("Invalid entity type."); setImporting(false); return }

    let startNum = 1
    if (!columnMap.code) {
      const prefix = importEntity === "customer" ? "CUST-" : importEntity === "supplier" ? "VEND-" : "PROD-"
      const { data: existing } = await supabase.from(tableName).select("code").like("code", `${prefix}%`).eq("company_id", companyId)
      let maxNum = 0
      existing?.forEach((r: any) => {
        const parts = r.code.split("-")
        if (parts.length === 2) { const n = parseInt(parts[1]); if (!isNaN(n) && n > maxNum) maxNum = n }
      })
      startNum = maxNum + 1
    }

    let success = 0, updated = 0, skipped = 0
    for (const row of importPreview) {
      const record: any = {}
      Object.entries(columnMap).forEach(([field, col]) => { record[field] = row[col] || "" })
      if (!record.name) continue
      if (importEntity === "product") {
        record.cost_price = parseFloat(record.cost_price || 0)
        record.sale_price = parseFloat(record.sale_price || 0)
        record.qty_on_hand = parseFloat(record.qty_on_hand || 0)
      } else {
        record.balance = parseFloat(record.balance || 0)
      }
      if (!columnMap.code) {
        const code = importEntity === "customer" ? `CUST-${String(startNum++).padStart(3, "0")}`
          : importEntity === "supplier" ? `VEND-${String(startNum++).padStart(3, "0")}`
          : `PROD-${String(startNum++).padStart(3, "0")}`
        record.code = code
      }
      const { data: existing } = await supabase.from(tableName).select("id").eq("code", record.code).eq("company_id", companyId).maybeSingle()
      if (existing) {
        if (duplicateAction === "skip") { skipped++; continue }
        else { await supabase.from(tableName).update(record).eq("code", record.code).eq("company_id", companyId); updated++ }
      } else {
        await supabase.from(tableName).insert({ ...record, company_id: companyId }); success++
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

  // ----- Access guards -----
  if (companyId === null) return <div style={{ padding: 24, textAlign: "center" }}>Loading company context…</div>
  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <h2>Access Denied</h2>
      <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
    </div>
  )

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
            background: flash.includes("✅") ? "#F0FDF4" : "#FEF2F2",
            border: "1px solid " + (flash.includes("✅") ? "#BBF7D0" : "#FECACA"),
            color: flash.includes("✅") ? "#15803D" : "#B91C1C",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {flash}
          </div>
        )}

        {/* ── Delete / Reset cards ─────────────────────────── */}
        <div className="dm-grid">
          {[
            { key: "journal", title: "Delete Journal Entries", desc: "Remove all journal entries and reset balances.", fn: handleDeleteJournal },
            { key: "all_invoices", title: "Delete All Invoices", desc: "Remove all sales & purchase invoices.", fn: handleDeleteInvoices },
            { key: "sales_invoices", title: "Delete Sales Invoices", desc: "Remove only sales invoices.", fn: handleDeleteSalesInvoices },
            { key: "purchase_bills", title: "Delete Purchase Bills", desc: "Remove only purchase bills.", fn: handleDeletePurchaseBills },
            { key: "customers", title: "Delete Customers", desc: "Remove all customers & related invoices.", fn: handleDeleteCustomers },
            { key: "suppliers", title: "Delete Suppliers", desc: "Remove all suppliers & related bills.", fn: handleDeleteSuppliers },
            { key: "products", title: "Delete Products", desc: "Remove all products, stock moves & invoice items.", fn: handleDeleteProducts },
            { key: "reset_balances", title: "Reset Balances", desc: "Set all account balances to zero.", fn: () => { resetBalances(); setConfirmSection(null) } },
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

        {/* ── Bulk Import Section ───────────────────────────── */}
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