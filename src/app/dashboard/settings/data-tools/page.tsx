"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Trash2, Upload, Download, Save, RotateCcw, AlertTriangle,
  X, Check, FileSpreadsheet, Database,
} from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

// Helper to invalidate caches – just forces a refresh by calling a dummy RPC or we can use router.refresh
const invalidateCaches = async () => {
  // We can't call "invalidate_caches" directly, but we can re-fetch data on next page load.
  // For client-side, we just rely on React Query and manual refetches.
}

export default function DataManagementPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant" // same for now

  const [flash, setFlash] = useState("")
  const [confirmSection, setConfirmSection] = useState<string | null>(null) // tracks which delete is being confirmed

  const showMessage = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(""), 4000)
  }

  // ── Generic delete helper ──────────────────────────────────
  const deleteAllFromTable = async (table: string, message: string) => {
    try {
      // Use .neq("id",0) to delete all rows while still respecting RLS (company-scoped)
      await supabase.from(table).delete().neq("id", 0)
      showMessage("✅ " + message)
      setConfirmSection(null)
    } catch (e: any) {
      showMessage("❌ " + (e.message || "Error"))
    }
  }

  // ── Specific operations ─────────────────────────────────────
  const handleDeleteJournal = () => deleteAllFromTable("journal_lines", "Journal entries deleted.")
    .then(() => deleteAllFromTable("journal_entries", "Journal entries deleted."))
    .then(() => resetBalances())
  
  const handleDeleteInvoices = async () => {
    // delete invoice items first
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
      // delete related sales invoices
      const { data: invs } = await supabase.from("invoices").select("id").eq("type", "sale").in("party_id", custIds)
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
      const { data: invs } = await supabase.from("invoices").select("id").eq("type", "purchase").in("party_id", suppIds)
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

  const resetBalances = async () => {
    await supabase.from("accounts").update({ balance: 0 }).neq("id", 0)
    showMessage("✅ Account balances reset to zero.")
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

        <div className="dm-grid">
          {/* Clean Journal */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Delete Journal Entries</div>
            <div className="dm-card-desc">Remove all journal entries and reset balances to opening.</div>
            {confirmSection === "journal" ? (
              <div className="confirmation-box">
                ⚠️ Delete ALL journal entries?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleDeleteJournal}>✅ Yes, Delete All</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("journal")} disabled={!canEdit}>Clean Journal</button>
            )}
          </div>

          {/* Clean Invoices (All) */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Delete All Invoices</div>
            <div className="dm-card-desc">Remove all sales & purchase invoices.</div>
            {confirmSection === "all_invoices" ? (
              <div className="confirmation-box">
                ⚠️ Delete ALL invoices?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleDeleteInvoices}>✅ Yes, Delete All</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("all_invoices")} disabled={!canEdit}>Delete All Invoices</button>
            )}
          </div>

          {/* Clean Sales Invoices */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Delete Sales Invoices</div>
            <div className="dm-card-desc">Remove only sales invoices.</div>
            {confirmSection === "sales_invoices" ? (
              <div className="confirmation-box">
                ⚠️ Delete all sales invoices?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleDeleteSalesInvoices}>✅ Yes</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("sales_invoices")} disabled={!canEdit}>Delete Sales Invoices</button>
            )}
          </div>

          {/* Clean Purchase Bills */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Delete Purchase Bills</div>
            <div className="dm-card-desc">Remove only purchase bills.</div>
            {confirmSection === "purchase_bills" ? (
              <div className="confirmation-box">
                ⚠️ Delete all purchase bills?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleDeletePurchaseBills}>✅ Yes</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("purchase_bills")} disabled={!canEdit}>Delete Purchase Bills</button>
            )}
          </div>

          {/* Clean Customers */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Delete Customers</div>
            <div className="dm-card-desc">Remove all customers & related invoices.</div>
            {confirmSection === "customers" ? (
              <div className="confirmation-box">
                ⚠️ Delete ALL customers?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleDeleteCustomers}>✅ Yes</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("customers")} disabled={!canEdit}>Delete Customers</button>
            )}
          </div>

          {/* Clean Suppliers */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Delete Suppliers</div>
            <div className="dm-card-desc">Remove all suppliers & related bills.</div>
            {confirmSection === "suppliers" ? (
              <div className="confirmation-box">
                ⚠️ Delete ALL suppliers?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleDeleteSuppliers}>✅ Yes</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("suppliers")} disabled={!canEdit}>Delete Suppliers</button>
            )}
          </div>

          {/* Clean Products */}
          <div className="dm-card">
            <div className="dm-card-title"><Trash2 size={16} /> Delete Products</div>
            <div className="dm-card-desc">Remove all products, stock moves, and related invoice items.</div>
            {confirmSection === "products" ? (
              <div className="confirmation-box">
                ⚠️ Delete ALL products?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleDeleteProducts}>✅ Yes</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("products")} disabled={!canEdit}>Delete Products</button>
            )}
          </div>

          {/* Reset Balances */}
          <div className="dm-card">
            <div className="dm-card-title"><RotateCcw size={16} /> Reset Balances</div>
            <div className="dm-card-desc">Set all account balances to zero.</div>
            {confirmSection === "reset_balances" ? (
              <div className="confirmation-box">
                ⚠️ Reset ALL balances?
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={() => { resetBalances(); setConfirmSection(null); }}>✅ Yes</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("reset_balances")} disabled={!canEdit}>Reset Balances</button>
            )}
          </div>

          {/* Complete Reset (NUKE) */}
          <div className="dm-card">
            <div className="dm-card-title"><AlertTriangle size={16} /> Complete Database Reset</div>
            <div className="dm-card-desc">Delete ALL data except default chart of accounts. Irreversible!</div>
            {confirmSection === "nuke" ? (
              <div className="confirmation-box">
                ⚠️ NUKE ENTIRE DATABASE? This cannot be undone!
                <div className="confirmation-buttons">
                  <button className="dm-btn dm-btn-danger" onClick={handleCompleteReset}>💣 Yes, NUKE Everything</button>
                  <button className="dm-btn dm-btn-outline" onClick={() => setConfirmSection(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="dm-btn dm-btn-danger" onClick={() => setConfirmSection("nuke")} disabled={!canEdit}>💣 Complete Reset</button>
            )}
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>
          <AlertTriangle size={12} /> These actions are irreversible. Use with caution.
        </div>
      </div>
    </RoleGuard>
  )
}