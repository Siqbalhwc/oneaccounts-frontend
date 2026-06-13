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

type SortField = "account" | "bank_name" | "account_number" | "branch" | "balance"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 40, 30, 50, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

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
      .eq("category", "Cash & Bank")
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

  // Shared th/td styles (identical to invoice page)
  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .bank-table { width: 100%; border-collapse: collapse; }
        .bank-table tbody tr:last-child td { border-bottom: none; }
        .bank-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-outline {
          background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
        }
        .btn-outline:hover {
          background: var(--card-hover);
          transform: translateY(-1px);
          box-shadow: none;
        }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .bank-table { min-width: 700px; }

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: var(--card); border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; color: var(--text); }
        .pr-modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .pr-modal-title { font-size: 18px; font-weight: 700; }
        .pr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .pr-field-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .pr-field-input, .pr-field-select { width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; }
        .pr-field-input:focus, .pr-field-select:focus { border-color: var(--primary); }
        .pr-modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
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
            <button className="btn" onClick={() => router.push("/dashboard/banking/bank-accounts/new")}>
              <Plus size={16} /> Add Bank Account
            </button>
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
        <div className="summary-item"><div className="summary-label">Total Accounts</div><div className="summary-value">{sortedFiltered.length}</div></div>
        <div className="summary-item"><div className="summary-label">Total Balance</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {totalBalance.toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search bank name, code, or account..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="bank-table">
            <colgroup>
              <col style={{ width: 180 }} /> {/* Account */}
              <col />                         {/* Bank Name – takes remaining space */}
              <col style={{ width: 120 }} /> {/* Account # */}
              <col style={{ width: 100 }} /> {/* Branch */}
              <col style={{ width: 120 }} /> {/* Balance */}
              <col style={{ width: 90  }} /> {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <SortTh field="account">Account</SortTh>
                <SortTh field="bank_name" style={{ textAlign: "left" }}>Bank Name</SortTh>
                <SortTh field="account_number" style={{ textAlign: "center" }}>Account #</SortTh>
                <SortTh field="branch" style={{ textAlign: "center" }}>Branch</SortTh>
                <SortTh field="balance" style={{ textAlign: "right" }}>Balance</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No bank accounts found. {canEdit && 'Use "Add Bank Account" to link a Cash & Bank account, or create a new GL account first.'}
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((b) => (
                  <tr key={b.id}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: "var(--primary)" }}>{b.code} - {b.name}</span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.bank_name}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{b.account_number || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{b.branch || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                      PKR {(b.balance || 0).toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        {canEdit && (
                          <button className="btn-icon" onClick={() => openEdit(b)} title="Edit">
                            <Edit size={13} />
                          </button>
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => setDeleteId(b.id)} style={{ color: "#EF4444" }} title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
              <button className="btn" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
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
              <button className="btn" style={{ background: "#EF4444", borderColor: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}