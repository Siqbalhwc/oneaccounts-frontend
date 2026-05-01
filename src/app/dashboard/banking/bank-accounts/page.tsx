"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Edit, Trash2, X, Check } from "lucide-react"

interface BankAccount {
  id: number
  account_id: number
  bank_name: string
  branch: string
  account_number: string
  is_active: boolean
  created_at: string
  // from accounts join
  code?: string
  name?: string
  balance?: number
}

export default function BankAccountsPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [cashAccounts, setCashAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState("")

  // Form state
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [bankName, setBankName] = useState("")
  const [branch, setBranch] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    // Fetch all bank accounts with their linked account details
    const { data: bankData } = await supabase
      .from("bank_accounts")
      .select("*, accounts(code, name, balance)")
      .order("created_at")

    // Fetch cash/bank asset accounts (code starts with 10xx)
    const { data: accountData } = await supabase
      .from("accounts")
      .select("id, code, name, balance")
      .eq("type", "Asset")
      .like("code", "10%")
      .order("code")

    if (bankData) {
      const enriched = bankData.map((b: any) => ({
        ...b,
        code: b.accounts?.code || "",
        name: b.accounts?.name || "",
        balance: b.accounts?.balance || 0,
      }))
      setBankAccounts(enriched)
    }
    if (accountData) setCashAccounts(accountData)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const openNew = () => {
    // filter out accounts that already have a bank entry
    const usedAccountIds = bankAccounts.map((b) => b.account_id)
    const available = cashAccounts.filter((a) => !usedAccountIds.includes(a.id))
    if (available.length === 0) {
      setFlash("All cash/bank accounts already have bank details.")
      setTimeout(() => setFlash(""), 3000)
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
    setEditing(b)
    setSelectedAccountId(b.account_id)
    setBankName(b.bank_name)
    setBranch(b.branch)
    setAccountNumber(b.account_number)
    setIsActive(b.is_active)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!selectedAccountId || !bankName.trim()) {
      setFlash("Account and Bank Name are required.")
      setTimeout(() => setFlash(""), 3000)
      return
    }
    setSaving(true)
    const payload = {
      account_id: selectedAccountId,
      bank_name: bankName.trim(),
      branch: branch.trim(),
      account_number: accountNumber.trim(),
      is_active: isActive,
    }

    if (editing) {
      await supabase.from("bank_accounts").update(payload).eq("id", editing.id)
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
    if (!deleteId) return
    await supabase.from("bank_accounts").delete().eq("id", deleteId)
    setDeleteId(null)
    setFlash("Bank account deleted.")
    fetchData()
    setTimeout(() => setFlash(""), 3000)
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
        .ba-table-header { display: grid; grid-template-columns: 100px 1fr 1fr 100px 100px 80px 60px 60px; padding: 10px 14px; background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
        .ba-table-row { display: grid; grid-template-columns: 100px 1fr 1fr 100px 100px 80px 60px 60px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
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
          <div className="ba-subtitle">Manage your bank and cash accounts</div>
        </div>
        <button className="ba-btn ba-btn-primary" onClick={openNew}><Plus size={16} /> Add Bank Account</button>
      </div>

      {flash && (
        <div style={{ background: flash.includes("added") || flash.includes("updated") || flash.includes("deleted") ? "#F0FDF4" : "#FEF2F2", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {flash}
        </div>
      )}

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
        bankAccounts.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No bank accounts found. Click "Add Bank Account" to link a cash/bank account.
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
              <span></span>
              <span></span>
            </div>
            {bankAccounts.map((b) => (
              <div key={b.id} className="ba-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{b.code} - {b.name}</span>
                <span>{b.bank_name}</span>
                <span className="ba-hide-mobile" style={{ color: "#64748B" }}>{b.account_number || "—"}</span>
                <span className="ba-hide-mobile" style={{ color: "#64748B" }}>{b.branch || "—"}</span>
                <span style={{ fontWeight: 600 }}>PKR {(b.balance || 0).toLocaleString()}</span>
                <span>{b.is_active ? "✅" : "❌"}</span>
                <button className="ba-icon-btn" onClick={() => openEdit(b)}><Edit size={13} /></button>
                <button className="ba-icon-btn" onClick={() => setDeleteId(b.id)} style={{ color: "#EF4444" }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )
      }

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="ba-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="ba-modal" onClick={e => e.stopPropagation()}>
            <div className="ba-modal-header">
              <div className="ba-modal-title">{editing ? "✏️ Edit Bank Account" : "➕ Add Bank Account"}</div>
              <button className="ba-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="ba-modal-body">
              {!editing && (
                <div>
                  <label className="ba-label">Account *</label>
                  <select className="ba-select" value={selectedAccountId || ""} onChange={e => setSelectedAccountId(Number(e.target.value) || null)}>
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
                <input className="ba-input" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HBL, UBL" />
              </div>
              <div className="ba-row">
                <div>
                  <label className="ba-label">Branch</label>
                  <input className="ba-input" value={branch} onChange={e => setBranch(e.target.value)} />
                </div>
                <div>
                  <label className="ba-label">Account Number</label>
                  <input className="ba-input" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Active</span>
              </div>
            </div>
            <div className="ba-modal-footer">
              <button className="ba-btn ba-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="ba-btn ba-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "💾 Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="ba-modal-overlay">
          <div className="ba-modal" style={{ maxWidth: 400 }}>
            <div className="ba-modal-header"><div className="ba-modal-title">⚠️ Delete Bank Account?</div></div>
            <div className="ba-modal-body" style={{ textAlign: "center" }}><p style={{ color: "#EF4444" }}>This will remove the bank details but keep the account.</p></div>
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