"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Edit, Trash2, X, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"

interface BankAccount {
  id: number
  account_id: number
  bank_name: string
  branch: string
  account_number: string
  is_active: boolean
  created_at: string
  code?: string
  name?: string
  balance?: number
  created_by?: string | null
  updated_by?: string | null
}

type SortField = "account" | "bank_name" | "account_number" | "branch" | "balance" | "created_by"
type SortDir = "asc" | "desc"

export default function BankAccountsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [cashAccounts, setCashAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [flash, setFlash] = useState("")

  const [sortField, setSortField] = useState<SortField>("account")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [bankName, setBankName] = useState("")
  const [branch, setBranch] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  // ── 1. Get company ID ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
    })
  }, [])

  // ── 2. Fetch data ────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)

    const { data: bankData } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at")

    const { data: accountData } = await supabase
      .from("accounts")
      .select("id, code, name, balance")
      .eq("type", "Asset")
      .like("code", "10%")
      .eq("category", "Cash & Bank")   // ← only Cash & Bank accounts
      .eq("company_id", companyId)
      .order("code")

    if (bankData) {
      const enriched = bankData.map((b: any) => {
        const matchedAccount = accountData?.find((a: any) => a.id === b.account_id)
        return {
          ...b,
          code: matchedAccount?.code || "",
          name: matchedAccount?.name || "",
          balance: matchedAccount?.balance || 0,
        }
      })
      setBankAccounts(enriched)
    }
    if (accountData) setCashAccounts(accountData)
    setLoading(false)
  }

  useEffect(() => { if (companyId) fetchData() }, [companyId])

  // ── Access guards ────────────────────────────────────────────────────────
  if (!companyId) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  // ── Filter by search ─────────────────────────────────────────────────────
  const filtered = search.trim()
    ? bankAccounts.filter(b =>
        (b.bank_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.account_number || "").includes(search) ||
        (b.code || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.name || "").toLowerCase().includes(search.toLowerCase())
      )
    : bankAccounts

  // ── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // ── Client‑side sorting ──────────────────────────────────────────────────
  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    switch (sortField) {
      case "account":
        valA = (a.code || "").toLowerCase()
        valB = (b.code || "").toLowerCase()
        break
      case "bank_name":
        valA = (a.bank_name || "").toLowerCase()
        valB = (b.bank_name || "").toLowerCase()
        break
      case "account_number":
        valA = (a.account_number || "").toLowerCase()
        valB = (b.account_number || "").toLowerCase()
        break
      case "branch":
        valA = (a.branch || "").toLowerCase()
        valB = (b.branch || "").toLowerCase()
        break
      case "balance":
        valA = a.balance || 0
        valB = b.balance || 0
        break
      case "created_by":
        valA = (a.created_by || "").toLowerCase()
        valB = (b.created_by || "").toLowerCase()
        break
      default:
        return 0
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalBalance = sortedFiltered.reduce((sum, b) => sum + (b.balance || 0), 0)

  // ── Modal helpers ────────────────────────────────────────────────────────
  const openEdit = (b: BankAccount) => {
    if (!canEdit) return
    setEditing(b)
    setSelectedAccountId(b.account_id)
    setBankName(b.bank_name)
    setBranch(b.branch)
    setAccountNumber(b.account_number)
    setIsActive(b.is_active)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!canEdit || !companyId) return
    if (!selectedAccountId || !bankName.trim()) {
      setFlash("Account and Bank Name are required.")
      setTimeout(() => setFlash(""), 3000)
      return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || "system"

    const payload = {
      company_id: companyId,
      account_id: selectedAccountId,
      bank_name: bankName.trim(),
      branch: branch.trim(),
      account_number: accountNumber.trim(),
      is_active: isActive,
      updated_by: userEmail,
    }
    if (editing) {
      await supabase.from("bank_accounts")
        .update(payload)
        .eq("id", editing.id)
        .eq("company_id", companyId)
      setFlash("Bank account updated!")
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
    setTimeout(() => setFlash(""), 3000)
  }

  const handleDelete = async () => {
    if (!canEdit || !deleteId || !companyId) return
    await supabase.from("bank_accounts")
      .delete()
      .eq("id", deleteId)
      .eq("company_id", companyId)
    setDeleteId(null)
    setFlash("Bank account deleted.")
    fetchData()
    setTimeout(() => setFlash(""), 3000)
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .table-grid {
          min-width: 900px; /* ensures columns never shrink below this width */
        }
        .header-row {
          display: grid;
          grid-template-columns: 1fr 100px 100px 100px 100px 200px 55px 55px;
          column-gap: 10px;
          padding: 14px 24px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }
        .data-row {
          display: grid;
          grid-template-columns: 1fr 100px 100px 100px 100px 200px 55px 55px;
          column-gap: 10px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 13px; align-items: center;
          transition: background 0.15s;
        }
        .data-row:hover { background: var(--card-hover); }
        .data-row:last-child { border-bottom: none; }
        .btn {
          padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border);
          font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          padding: 6px; border-radius: 8px; cursor: pointer;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .input {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px 0 36px;
          font-size: 13px; width: 260px; box-sizing: border-box; outline: none;
          font-family: inherit; background: var(--card); color: var(--text);
        }
        .input:focus { border-color: var(--primary); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .creator-editor-cell {
          display: flex; flex-direction: column; font-size: 11px; color: var(--text-muted);
          line-height: 1.3; word-wrap: break-word;
        }
        .sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .sort-btn:hover { color: var(--primary); }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: var(--card); border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; color: var(--text); }
        .pr-modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .pr-modal-title { font-size: 18px; font-weight: 700; }
        .pr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .pr-field-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .pr-field-input, .pr-field-select { width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; }
        .pr-field-input:focus, .pr-field-select:focus { border-color: var(--primary); }
        .pr-modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }

        @media (max-width: 800px) {
          .header-row, .data-row {
            column-gap: 6px;
            padding: 10px 12px;
          }
          .table-grid { min-width: 800px; }
        }
        @media (max-width: 600px) {
          .header-row, .data-row {
            column-gap: 4px;
            padding: 10px 8px;
          }
          .table-grid { min-width: 720px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🏦 Bank Accounts</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {canEdit ? "Manage your bank and cash accounts" : "View bank accounts"}
          </p>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => router.push("/dashboard/banking/bank-accounts/new")}>
              <Plus size={16} /> Add Bank Account
            </button>
            {/* Open the proper New Account page for chart-of-accounts */}
            <button className="btn btn-outline" onClick={() => router.push("/dashboard/accounts/new")}>
              <Plus size={16} /> New GL Account
            </button>
          </div>
        )}
      </div>

      {flash && (
        <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Accounts</div>
          <div className="summary-value">{sortedFiltered.length}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Balance</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalBalance.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          placeholder="Search bank name, code, or account..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
        ) : sortedFiltered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No bank accounts found. {canEdit && 'Use "Add Bank Account" to link a Cash & Bank account, or create a new GL account first.'}
          </div>
        ) : (
          <div className="table-wrapper">
            <div className="table-grid">
              <div className="header-row">
                <button className="sort-btn" onClick={() => handleSort("account")}>Account {getSortIcon("account")}</button>
                <button className="sort-btn" onClick={() => handleSort("bank_name")}>Bank Name {getSortIcon("bank_name")}</button>
                <button className="sort-btn" onClick={() => handleSort("account_number")}>Account # {getSortIcon("account_number")}</button>
                <button className="sort-btn" onClick={() => handleSort("branch")}>Branch {getSortIcon("branch")}</button>
                <button className="sort-btn" onClick={() => handleSort("balance")}>Balance {getSortIcon("balance")}</button>
                <button className="sort-btn" onClick={() => handleSort("created_by")}>Created / Edited By {getSortIcon("created_by")}</button>
                <span></span>
                <span></span>
              </div>
              {sortedFiltered.map((b) => (
                <div key={b.id} className="data-row">
                  <span style={{ fontWeight: 600, color: "var(--primary)" }}>{b.code} - {b.name}</span>
                  <span>{b.bank_name}</span>
                  <span style={{ color: "var(--text-muted)" }}>{b.account_number || "—"}</span>
                  <span style={{ color: "var(--text-muted)" }}>{b.branch || "—"}</span>
                  <span style={{ fontWeight: 600 }}>PKR {(b.balance || 0).toLocaleString()}</span>
                  <div className="creator-editor-cell">
                    <span>Created: {b.created_by || "—"}</span>
                    <span>Edited: {b.updated_by || "—"}</span>
                  </div>
                  <button className="btn-icon" onClick={() => openEdit(b)}><Edit size={14} /></button>
                  <button className="btn-icon" onClick={() => setDeleteId(b.id)} style={{ color: "#EF4444" }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-title">Edit Bank Account</div>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="pr-modal-body">
              <div>
                <label className="pr-field-label">Bank Name *</label>
                <input className="pr-field-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HBL, UBL" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="pr-field-label">Branch</label>
                  <input className="pr-field-input" value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
                <div>
                  <label className="pr-field-label">Account Number</label>
                  <input className="pr-field-input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Active</span>
              </div>
            </div>
            <div className="pr-modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && canEdit && (
        <div className="pr-modal-overlay">
          <div className="pr-modal" style={{ maxWidth: 400 }}>
            <div className="pr-modal-header"><div className="pr-modal-title">Delete Bank Account?</div></div>
            <div className="pr-modal-body" style={{ textAlign: "center" }}>
              <p style={{ color: "#EF4444" }}>This will remove the bank details but keep the GL account.</p>
            </div>
            <div className="pr-modal-footer" style={{ justifyContent: "center" }}>
              <button className="btn btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: "#EF4444", borderColor: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}