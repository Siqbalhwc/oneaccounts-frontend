"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Edit, Trash2, X, Search } from "lucide-react"
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
}

export default function BankAccountsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [cashAccounts, setCashAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [flash, setFlash] = useState("")

  // Modal state for add/edit bank account
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [bankName, setBankName] = useState("")
  const [branch, setBranch] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  // New GL Account modal
  const [showNewAccountModal, setShowNewAccountModal] = useState(false)
  const [newAccountCode, setNewAccountCode] = useState("")
  const [newAccountName, setNewAccountName] = useState("")
  const [newAccountBalance, setNewAccountBalance] = useState("0")
  const [creatingAccount, setCreatingAccount] = useState(false)

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
  if (!companyId) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
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

  const totalBalance = filtered.reduce((sum, b) => sum + (b.balance || 0), 0)

  // ── Modal helpers ────────────────────────────────────────────────────────
  const openNew = () => {
    if (!canEdit) return
    const usedAccountIds = bankAccounts.map((b) => b.account_id)
    const available = cashAccounts.filter((a) => !usedAccountIds.includes(a.id))
    if (available.length === 0) {
      setFlash("All cash/bank accounts already have bank details. Create a new GL account first.")
      setTimeout(() => setFlash(""), 4000)
      return
    }
    setEditing(null)
    setSelectedAccountId(available[0]?.id || null)
    setBankName("")
    setBranch("")
    setAccountNumber("")
    setIsActive(true)
    setShowModal(true)
  }

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
    const payload = {
      company_id: companyId,
      account_id: selectedAccountId,
      bank_name: bankName.trim(),
      branch: branch.trim(),
      account_number: accountNumber.trim(),
      is_active: isActive,
    }
    if (editing) {
      await supabase.from("bank_accounts")
        .update(payload)
        .eq("id", editing.id)
        .eq("company_id", companyId)
      setFlash("Bank account updated!")
    } else {
      await supabase.from("bank_accounts").insert(payload)
      setFlash("Bank account added!")
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

  const handleCreateAccount = async () => {
    if (!companyId || !newAccountCode.trim() || !newAccountName.trim()) return
    setCreatingAccount(true)
    const { error } = await supabase.from("accounts").insert({
      company_id: companyId,
      code: newAccountCode.trim(),
      name: newAccountName.trim(),
      type: "Asset",
      balance: parseFloat(newAccountBalance) || 0,
    })
    if (error) {
      setFlash("Error creating account: " + error.message)
    } else {
      setFlash("Account created! You can now link bank details.")
      setShowNewAccountModal(false)
      setNewAccountCode(""); setNewAccountName(""); setNewAccountBalance("0")
      fetchData()
    }
    setCreatingAccount(false)
    setTimeout(() => setFlash(""), 4000)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .btn-side { background: #1D4ED8; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
        .pr-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
        .pr-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .pr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .pr-field-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .pr-field-input, .pr-field-select { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .pr-field-input:focus, .pr-field-select:focus { border-color: #1740C8; background: white; }
        .pr-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
        .pr-icon-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; color: #94A3B8; }
        .pr-icon-btn:hover { background: #F1F5F9; color: #475569; }
        @media (max-width: 768px) {
          th:nth-child(3), td:nth-child(3),
          th:nth-child(4), td:nth-child(4) { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>🏦 Bank Accounts</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
            {canEdit ? "Manage your bank and cash accounts" : "View bank accounts"}
          </p>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={16} /> Add Bank Account
            </button>
            <button className="btn btn-outline" onClick={() => setShowNewAccountModal(true)}>
              <Plus size={16} /> New GL Account
            </button>
          </div>
        )}
      </div>

      {/* Flash message */}
      {flash && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {flash}
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Accounts</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{filtered.length}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Balance</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>PKR {totalBalance.toLocaleString()}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ maxWidth: 320, marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
          <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search bank name, code, or account..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No bank accounts found. {canEdit && 'Use "Add Bank Account" to link a cash/bank account, or create a new GL account first.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Bank Name</th>
                <th>Account #</th>
                <th>Branch</th>
                <th>Balance</th>
                <th>Active</th>
                {canEdit && <th></th>}
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600, color: "#1E3A8A" }}>{b.code} - {b.name}</td>
                  <td>{b.bank_name}</td>
                  <td style={{ color: "#64748B" }}>{b.account_number || "—"}</td>
                  <td style={{ color: "#64748B" }}>{b.branch || "—"}</td>
                  <td style={{ fontWeight: 600 }}>PKR {(b.balance || 0).toLocaleString()}</td>
                  <td>{b.is_active ? "✅" : "❌"}</td>
                  {canEdit && (
                    <td>
                      <button className="pr-icon-btn" onClick={() => openEdit(b)}>
                        <Edit size={14} />
                      </button>
                    </td>
                  )}
                  {canEdit && (
                    <td>
                      <button className="pr-icon-btn" onClick={() => setDeleteId(b.id)} style={{ color: "#EF4444" }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Bank Account Modal */}
      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-title">{editing ? "Edit Bank Account" : "Add Bank Account"}</div>
              <button className="pr-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="pr-modal-body">
              {!editing && (
                <div>
                  <label className="pr-field-label">GL Account *</label>
                  <select
                    className="pr-field-select"
                    value={selectedAccountId || ""}
                    onChange={(e) => setSelectedAccountId(Number(e.target.value) || null)}
                  >
                    {cashAccounts
                      .filter((a) => !bankAccounts.some((b) => b.account_id === a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name} (PKR {a.balance?.toLocaleString()})</option>
                      ))}
                  </select>
                </div>
              )}
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

      {/* New GL Account Modal */}
      {showNewAccountModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowNewAccountModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="pr-modal-header">
              <div className="pr-modal-title">New Cash / Bank Account</div>
              <button className="pr-icon-btn" onClick={() => setShowNewAccountModal(false)}><X size={18}/></button>
            </div>
            <div className="pr-modal-body">
              <div>
                <label className="pr-field-label">Account Code *</label>
                <input className="pr-field-input" value={newAccountCode} onChange={e => setNewAccountCode(e.target.value)} placeholder="e.g. 1002" />
              </div>
              <div>
                <label className="pr-field-label">Account Name *</label>
                <input className="pr-field-input" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} placeholder="e.g. Meezan Bank" />
              </div>
              <div>
                <label className="pr-field-label">Opening Balance (PKR)</label>
                <input className="pr-field-input" type="number" value={newAccountBalance} onChange={e => setNewAccountBalance(e.target.value)} />
              </div>
            </div>
            <div className="pr-modal-footer">
              <button className="btn btn-outline" onClick={() => setShowNewAccountModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateAccount} disabled={creatingAccount}>
                {creatingAccount ? "Creating..." : "Create Account"}
              </button>
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
              <button className="btn btn-primary" style={{ background: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}