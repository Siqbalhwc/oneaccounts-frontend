"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Edit, Trash2, X } from "lucide-react"
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
  const { role } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [cashAccounts, setCashAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState("")

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [bankName, setBankName] = useState("")
  const [branch, setBranch] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  // ⚡ New GL Account modal state
  const [showNewAccountModal, setShowNewAccountModal] = useState(false)
  const [newAccountCode, setNewAccountCode] = useState("")
  const [newAccountName, setNewAccountName] = useState("")
  const [newAccountBalance, setNewAccountBalance] = useState("0")
  const [creatingAccount, setCreatingAccount] = useState(false)

  // ── Bullet‑proof company ID ──────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
    })
  }, [])

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

  if (!companyId) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

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
      setFlash("✅ Account created! You can now link bank details.")
      setShowNewAccountModal(false)
      setNewAccountCode(""); setNewAccountName(""); setNewAccountBalance("0")
      fetchData()
    }
    setCreatingAccount(false)
    setTimeout(() => setFlash(""), 4000)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .ba-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .ba-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .ba-subtitle { font-size: 13px; color: #94A3B8; }
        .ba-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
        .ba-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .ba-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .ba-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .ba-table-header, .ba-table-row { display: grid; grid-template-columns: 100px 1fr 1fr 100px 80px 60px 60px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
        .ba-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
        .ba-table-row:hover { background: #FAFBFF; }
        .ba-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .ba-modal { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
        .ba-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
        .ba-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .ba-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .ba-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .ba-input, .ba-select { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .ba-input:focus, .ba-select:focus { border-color: #1740C8; background: white; }
        .ba-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ba-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
        .ba-icon-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; color: #94A3B8; }
        .ba-icon-btn:hover { background: #F1F5F9; color: #475569; }
        @media (max-width: 768px) {
          .ba-table-header, .ba-table-row { grid-template-columns: 100px 1fr 100px 60px 60px; }
          .ba-hide-mobile { display: none; }
          .ba-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ba-header">
        <div>
          <div className="ba-title">🏦 Bank Accounts</div>
          <div className="ba-subtitle">
            {canEdit ? "Manage your bank and cash accounts" : "View bank accounts"}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ba-btn ba-btn-primary" onClick={openNew}>
              <Plus size={16} /> Add Bank Account
            </button>
            <button className="ba-btn ba-btn-outline" onClick={() => setShowNewAccountModal(true)}>
              <Plus size={16} /> New GL Account
            </button>
          </div>
        )}
      </div>

      {flash && (
        <div
          style={{
            background: flash.includes("✅") || flash.includes("updated") || flash.includes("deleted") ? "#F0FDF4" : "#FEF2F2",
            border: "1px solid #BBF7D0",
            color: "#15803D",
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {flash}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
      ) : bankAccounts.length === 0 ? (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
          No bank accounts found. {canEdit && 'Use "Add Bank Account" to link a cash/bank account, or create a new GL account first.'}
        </div>
      ) : (
        <div className="ba-table">
          <div className="ba-table-header">
            <span>Account</span>
            <span>Bank Name</span>
            <span className="ba-hide-mobile">Account #</span>
            <span className="ba-hide-mobile">Branch</span>
            <span>Balance</span>
            <span>Active</span>
            {canEdit && <span></span>}
            {canEdit && <span></span>}
          </div>
          {bankAccounts.map((b) => (
            <div key={b.id} className="ba-table-row">
              <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{b.code} - {b.name}</span>
              <span>{b.bank_name}</span>
              <span className="ba-hide-mobile" style={{ color: "#64748B" }}>{b.account_number || "—"}</span>
              <span className="ba-hide-mobile" style={{ color: "#64748B" }}>{b.branch || "—"}</span>
              <span style={{ fontWeight: 600 }}>PKR {(b.balance || 0).toLocaleString()}</span>
              <span>{b.is_active ? "✅" : "❌"}</span>
              {canEdit && (
                <button className="ba-icon-btn" onClick={() => openEdit(b)}>
                  <Edit size={13} />
                </button>
              )}
              {canEdit && (
                <button
                  className="ba-icon-btn"
                  onClick={() => setDeleteId(b.id)}
                  style={{ color: "#EF4444" }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Bank Account Modal */}
      {showModal && canEdit && (
        <div className="ba-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="ba-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ba-modal-header">
              <div className="ba-modal-title">{editing ? "✏️ Edit Bank Account" : "➕ Add Bank Account"}</div>
              <button className="ba-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="ba-modal-body">
              {!editing && (
                <div>
                  <label className="ba-label">GL Account *</label>
                  <select
                    className="ba-select"
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
                <label className="ba-label">Bank Name *</label>
                <input className="ba-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HBL, UBL" />
              </div>
              <div className="ba-row">
                <div><label className="ba-label">Branch</label><input className="ba-input" value={branch} onChange={(e) => setBranch(e.target.value)} /></div>
                <div><label className="ba-label">Account Number</label><input className="ba-input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Active</span>
              </div>
            </div>
            <div className="ba-modal-footer">
              <button className="ba-btn ba-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="ba-btn ba-btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "💾 Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* New GL Account Modal */}
      {showNewAccountModal && canEdit && (
        <div className="ba-modal-overlay" onClick={() => setShowNewAccountModal(false)}>
          <div className="ba-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="ba-modal-header">
              <div className="ba-modal-title">➕ New Cash / Bank Account</div>
              <button className="ba-icon-btn" onClick={() => setShowNewAccountModal(false)}><X size={18}/></button>
            </div>
            <div className="ba-modal-body">
              <div>
                <label className="ba-label">Account Code *</label>
                <input className="ba-input" value={newAccountCode} onChange={e => setNewAccountCode(e.target.value)} placeholder="e.g. 1002" />
              </div>
              <div>
                <label className="ba-label">Account Name *</label>
                <input className="ba-input" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} placeholder="e.g. Meezan Bank" />
              </div>
              <div>
                <label className="ba-label">Opening Balance (PKR)</label>
                <input className="ba-input" type="number" value={newAccountBalance} onChange={e => setNewAccountBalance(e.target.value)} />
              </div>
            </div>
            <div className="ba-modal-footer">
              <button className="ba-btn ba-btn-outline" onClick={() => setShowNewAccountModal(false)}>Cancel</button>
              <button className="ba-btn ba-btn-primary" onClick={handleCreateAccount} disabled={creatingAccount}>
                {creatingAccount ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && canEdit && (
        <div className="ba-modal-overlay">
          <div className="ba-modal" style={{ maxWidth: 400 }}>
            <div className="ba-modal-header"><div className="ba-modal-title">⚠️ Delete Bank Account?</div></div>
            <div className="ba-modal-body" style={{ textAlign: "center" }}>
              <p style={{ color: "#EF4444" }}>This will remove the bank details but keep the GL account.</p>
            </div>
            <div className="ba-modal-footer" style={{ justifyContent: "center" }}>
              <button className="ba-btn ba-btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="ba-btn ba-btn-primary" style={{ background: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}