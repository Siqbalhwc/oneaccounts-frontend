"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, ArrowUpDown, ArrowUp, ArrowDown, Search, Edit, Trash2, X } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

// Predefined categories (same as New Account page)
const PREDEFINED_CATEGORIES = [
  { label: "Cash & Bank", codeStart: 1000, codeEnd: 1099, type: "Asset" },
  { label: "Accounts Receivable", codeStart: 1100, codeEnd: 1199, type: "Asset" },
  { label: "Inventory", codeStart: 1200, codeEnd: 1299, type: "Asset" },
  { label: "Other Current Assets", codeStart: 1300, codeEnd: 1399, type: "Asset" },
  { label: "Fixed Assets", codeStart: 1400, codeEnd: 1499, type: "Asset" },
  { label: "Vehicles", codeStart: 1500, codeEnd: 1599, type: "Asset" },
  { label: "Accounts Payable", codeStart: 2000, codeEnd: 2099, type: "Liability" },
  { label: "Other Current Liabilities", codeStart: 2100, codeEnd: 2199, type: "Liability" },
  { label: "Equity", codeStart: 3000, codeEnd: 3099, type: "Equity" },
  { label: "Revenue", codeStart: 4000, codeEnd: 4099, type: "Revenue" },
  { label: "Direct Expenses", codeStart: 5000, codeEnd: 5099, type: "Expense" },
  { label: "Operating Expenses", codeStart: 5100, codeEnd: 5199, type: "Expense" },
]
const CUSTOM_OPTION = "➕ Custom…"

function getDefaultRangeForType(type: string): { start: number; end: number } | null {
  switch (type) {
    case "Asset": return { start: 1000, end: 1999 }
    case "Liability": return { start: 2000, end: 2999 }
    case "Equity": return { start: 3000, end: 3999 }
    case "Revenue": return { start: 4000, end: 4999 }
    case "Expense": return { start: 5000, end: 5999 }
    default: return null
  }
}

function getFallbackCategory(code?: string): string {
  if (!code) return "—"
  const num = parseFloat(code)
  if (isNaN(num)) return "—"
  if (num >= 1000 && num <= 1099) return "Cash & Bank"
  if (num >= 1100 && num <= 1199) return "Accounts Receivable"
  if (num >= 1200 && num <= 1299) return "Inventory"
  if (num >= 1300 && num <= 1399) return "Other Current Assets"
  if (num >= 1400 && num <= 1499) return "Fixed Assets"
  if (num >= 1500 && num <= 1599) return "Vehicles"
  if (num >= 2000 && num <= 2099) return "Accounts Payable"
  if (num >= 2100 && num <= 2199) return "Other Current Liabilities"
  if (num >= 3000 && num <= 3099) return "Equity"
  if (num >= 4000 && num <= 4099) return "Revenue"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  return "—"
}

type SortField = "code" | "name" | "type" | "category" | "balance"
type SortDir = "asc" | "desc"

export default function AccountsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin"

  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("code")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<any | null>(null)
  const [editType, setEditType] = useState("")
  const [editCategory, setEditCategory] = useState("")
  const [customCategoryName, setCustomCategoryName] = useState("")
  const [customCodeStart, setCustomCodeStart] = useState("")
  const [customCodeEnd, setCustomCodeEnd] = useState("")
  const [editCode, setEditCode] = useState("")
  const [editName, setEditName] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState("")

  const isCustomCategory = editCategory === CUSTOM_OPTION
  const finalEditCategory = isCustomCategory ? customCategoryName.trim() : editCategory

  const effectiveCodeStart = (() => {
    if (!editCategory) return null
    if (isCustomCategory) {
      if (customCodeStart) return parseInt(customCodeStart, 10)
      const def = getDefaultRangeForType(editType)
      return def ? def.start : null
    }
    const cat = PREDEFINED_CATEGORIES.find(c => c.label === editCategory)
    return cat ? cat.codeStart : null
  })()
  const effectiveCodeEnd = (() => {
    if (!editCategory) return null
    if (isCustomCategory) {
      if (customCodeEnd) return parseInt(customCodeEnd, 10)
      const def = getDefaultRangeForType(editType)
      return def ? def.end : null
    }
    const cat = PREDEFINED_CATEGORIES.find(c => c.label === editCategory)
    return cat ? cat.codeEnd : null
  })()

  const availablePredefined = PREDEFINED_CATEGORIES.filter(c => c.type === editType)

  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    supabase
      .from("accounts")
      .select("*")
      .order("code", { ascending: true })
      .then(({ data }) => {
        setAccounts(data || [])
        setLoading(false)
      })
  }, [role, canView])

  const filteredAccounts = useMemo(() => {
    let list = accounts.map(a => ({
      ...a,
      category: a.category || getFallbackCategory(a.code),
    }))

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.code?.toLowerCase().includes(q) ||
        a.name?.toLowerCase().includes(q) ||
        a.type?.toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q)
      )
    }

    list = [...list].sort((a, b) => {
      let valA: any, valB: any
      if (sortField === "balance") {
        valA = a.balance || 0
        valB = b.balance || 0
      } else if (sortField === "code") {
        valA = parseFloat(a.code) || 0
        valB = parseFloat(b.code) || 0
      } else {
        valA = (a[sortField] || "").toString().toLowerCase()
        valB = (b[sortField] || "").toString().toLowerCase()
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return list
  }, [accounts, search, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const totalAccounts = filteredAccounts.length
  const totalAssets = filteredAccounts.filter(a => a.type === "Asset").reduce((s, a) => s + (a.balance || 0), 0)
  const totalLiabilities = filteredAccounts.filter(a => a.type === "Liability").reduce((s, a) => s + (a.balance || 0), 0)
  const totalEquity = filteredAccounts.filter(a => a.type === "Equity").reduce((s, a) => s + (a.balance || 0), 0)

  // Open edit modal with current account data
  const openEdit = (account: any) => {
    setEditingAccount(account)
    setEditType(account.type)
    setEditCategory(account.category || CUSTOM_OPTION)
    setCustomCategoryName(account.category || "")
    setCustomCodeStart("")
    setCustomCodeEnd("")
    setEditCode(account.code)
    setEditName(account.name)
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editingAccount) return
    if (!editType || !editCategory) {
      setFlash("Please select type and category."); setTimeout(() => setFlash(""), 3000); return
    }
    if (isCustomCategory && !customCategoryName.trim()) {
      setFlash("Custom category name is required."); setTimeout(() => setFlash(""), 3000); return
    }
    if (!editName.trim()) {
      setFlash("Account name is required."); setTimeout(() => setFlash(""), 3000); return
    }
    const code = parseInt(editCode, 10)
    if (isNaN(code) || code < 0) {
      setFlash("Invalid account code."); setTimeout(() => setFlash(""), 3000); return
    }
    setSaving(true)

    const { error } = await supabase
      .from("accounts")
      .update({
        type: editType,
        category: finalEditCategory,
        code: editCode,
        name: editName.trim(),
      })
      .eq("id", editingAccount.id)
      .eq("company_id", editingAccount.company_id)

    if (error) {
      setFlash("Update failed: " + error.message)
    } else {
      setFlash("Account updated!")
      setShowEditModal(false)
      supabase.from("accounts").select("*").order("code", { ascending: true }).then(({ data }) => {
        if (data) setAccounts(data)
      })
    }
    setSaving(false)
    setTimeout(() => setFlash(""), 3000)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", deleteId)

    if (error) {
      setFlash("Cannot delete account: " + error.message)
    } else {
      setFlash("Account deleted.")
      setAccounts(prev => prev.filter(a => a.id !== deleteId))
    }
    setDeleteId(null)
    setTimeout(() => setFlash(""), 4000)
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .ac-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .table-grid {
          min-width: 760px; /* ensures enough room for all columns */
        }
        .ac-header {
          display: grid;
          grid-template-columns: 80px 1fr 100px 130px 110px 70px;
          gap: 8px;
          padding: 14px 24px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }
        .ac-row {
          display: grid;
          grid-template-columns: 80px 1fr 100px 130px 110px 70px;
          gap: 8px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 13px; align-items: center;
          transition: background 0.15s;
        }
        .ac-row:hover { background: var(--card-hover); }
        .ac-row:last-child { border-bottom: none; }
        .ac-sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .ac-sort-btn:hover { color: var(--primary); }
        .ac-search {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px; width: 260px; box-sizing: border-box;
          outline: none; font-family: inherit; background: var(--card); color: var(--text);
        }
        .ac-search:focus { border-color: var(--primary); }
        .btn {
          padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border);
          font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          padding: 6px; border-radius: 8px; cursor: pointer;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: var(--card); border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; color: var(--text); }
        .pr-modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .pr-modal-title { font-size: 18px; font-weight: 700; }
        .pr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .pr-field-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .pr-field-input, .pr-field-select { width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; }
        .pr-field-input:focus, .pr-field-select:focus { border-color: var(--primary); }
        .pr-modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }

        @media (max-width: 640px) {
          .ac-search { width: 100%; }
        }
      `}</style>

      {flash && (
        <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📋 Chart of Accounts</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Manage your general ledger accounts</p>
        </div>
        {canEdit && (
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/accounts/new")}>
            <Plus size={16} /> Add Account
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Accounts</div>
          <div className="summary-value">{totalAccounts}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Assets</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalAssets.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Liabilities</div>
          <div className="summary-value" style={{ color: "#EF4444" }}>PKR {totalLiabilities.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Equity</div>
          <div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalEquity.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="ac-search" placeholder="Filter by code, name, type..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="ac-card">
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading accounts…</div>
        ) : filteredAccounts.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No accounts found. {canEdit && "Add a new account to get started."}
          </div>
        ) : (
          <div className="table-wrapper">
            <div className="table-grid">
              <div className="ac-header">
                <button className="ac-sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
                <button className="ac-sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
                <button className="ac-sort-btn" onClick={() => handleSort("type")}>Type {getSortIcon("type")}</button>
                <button className="ac-sort-btn" onClick={() => handleSort("category")}>Category {getSortIcon("category")}</button>
                <button className="ac-sort-btn" onClick={() => handleSort("balance")} style={{ justifyContent: "flex-end" }}>Balance {getSortIcon("balance")}</button>
                <span></span>
              </div>
              {filteredAccounts.map(a => (
                <div key={a.id} className="ac-row">
                  <span style={{ fontWeight: 600, color: "var(--primary)" }}>{a.code}</span>
                  <span style={{ color: "var(--text)" }}>{a.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.type}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.category || "—"}</span>
                  <span style={{ textAlign: "right", fontWeight: 600, color: a.balance >= 0 ? "#10B981" : "#EF4444" }}>
                    PKR {(a.balance || 0).toLocaleString()}
                  </span>
                  {canEdit && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn-icon" onClick={() => openEdit(a)}><Edit size={14} /></button>
                      <button className="btn-icon" onClick={() => setDeleteId(a.id)} style={{ color: "#EF4444" }}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingAccount && (
        <div className="pr-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-title">Edit Account</div>
              <button className="btn-icon" onClick={() => setShowEditModal(false)}><X size={18} /></button>
            </div>
            <div className="pr-modal-body">
              <div>
                <label className="pr-field-label">Account Type *</label>
                <select className="pr-field-select" value={editType} onChange={e => {
                  setEditType(e.target.value);
                  setEditCategory(""); setCustomCategoryName(""); setCustomCodeStart(""); setCustomCodeEnd("");
                }}>
                  {["Asset", "Liability", "Equity", "Revenue", "Expense"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="pr-field-label">Category *</label>
                <select className="pr-field-select" value={editCategory} onChange={e => {
                  setEditCategory(e.target.value); setCustomCategoryName(""); setCustomCodeStart(""); setCustomCodeEnd("");
                }}>
                  <option value="">— Select Category —</option>
                  {availablePredefined.map(c => <option key={c.label} value={c.label}>{c.label} ({c.codeStart}-{c.codeEnd})</option>)}
                  <option value={CUSTOM_OPTION}>{CUSTOM_OPTION}</option>
                </select>
              </div>

              {isCustomCategory && (
                <>
                  <div>
                    <label className="pr-field-label">Custom Category Name *</label>
                    <input className="pr-field-input" value={customCategoryName} onChange={e => setCustomCategoryName(e.target.value)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label className="pr-field-label">Code Start (optional)</label>
                      <input className="pr-field-input" type="number" value={customCodeStart} onChange={e => setCustomCodeStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="pr-field-label">Code End (optional)</label>
                      <input className="pr-field-input" type="number" value={customCodeEnd} onChange={e => setCustomCodeEnd(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="pr-field-label">Account Code</label>
                <input className="pr-field-input" type="number" value={editCode} onChange={e => setEditCode(e.target.value)} />
              </div>

              <div>
                <label className="pr-field-label">Account Name *</label>
                <input className="pr-field-input" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
            </div>
            <div className="pr-modal-footer">
              <button className="btn btn-outline" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-outline" onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="pr-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="pr-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header"><div className="pr-modal-title">Delete Account?</div></div>
            <div className="pr-modal-body" style={{ textAlign: "center" }}>
              <p style={{ color: "#EF4444" }}>This will permanently delete the account. If it has any transactions, the deletion will fail.</p>
            </div>
            <div className="pr-modal-footer" style={{ justifyContent: "center" }}>
              <button className="btn btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-outline" style={{ background: "#EF4444", color: "white", borderColor: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}