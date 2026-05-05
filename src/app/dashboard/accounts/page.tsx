"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Pencil } from "lucide-react"

// ── Recommended code ranges for each account type ──────────────────────
const CODE_RANGES: Record<string, { min: number; max: number }> = {
  Asset:    { min: 1000, max: 1999 },
  Liability:{ min: 2000, max: 2999 },
  Equity:   { min: 3000, max: 3999 },
  Revenue:  { min: 4000, max: 4999 },
  Expense:  { min: 5000, max: 5999 },
}

export default function AccountsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("All")
  const [isAdmin, setIsAdmin] = useState(false)
  const [companyId, setCompanyId] = useState<string>("")

  // ── Bank mapping (account_id -> { bankName, bankId }) ──
  const [bankMap, setBankMap] = useState<Record<number, any>>({})

  // ── Modal state ─────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formCode, setFormCode] = useState("")
  const [formName, setFormName] = useState("")
  const [formType, setFormType] = useState("Asset")
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState("")

  useEffect(() => {
    // ── Get company ID from JWT (same as every other page) ──
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
    })

    // Fetch accounts
    supabase
      .from("accounts")
      .select("*")
      .order("code")
      .then(r => {
        if (r.data) setAccounts(r.data)
        setLoading(false)
      })

    // Check if the current user is an admin
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.role === "admin") setIsAdmin(true)
        })
    })

    // Fetch linked bank accounts
    supabase
      .from("bank_accounts")
      .select("account_id, bank_name, id")
      .then(r => {
        if (r.data) {
          const map: Record<number, any> = {}
          r.data.forEach((b: any) => {
            map[b.account_id] = { bankName: b.bank_name, bankId: b.id }
          })
          setBankMap(map)
        }
      })
  }, [])

  const types = ["All", "Asset", "Liability", "Equity", "Revenue", "Expense"]
  const filtered = filter === "All" ? accounts : accounts.filter(a => a.type === filter)

  const typeColors: Record<string, string> = {
    Asset: "#1E3A8A",
    Liability: "#EF4444",
    Equity: "#8B5CF6",
    Revenue: "#10B981",
    Expense: "#F59E0B",
  }

  const openAdd = () => {
    setEditId(null)
    setFormCode("")
    setFormName("")
    setFormType("Asset")
    setModalError("")
    setShowModal(true)
  }

  const openEdit = (acct: any) => {
    setEditId(acct.id)
    setFormCode(String(acct.code))
    setFormName(acct.name)
    setFormType(acct.type)
    setModalError("")
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formCode.trim() || !formName.trim()) return
    setSaving(true)
    setModalError("")

    const payload = {
      code: formCode.trim(),
      name: formName.trim(),
      type: formType,
    }

    if (editId) {
      const { error } = await supabase
        .from("accounts")
        .update(payload)
        .eq("id", editId)
      if (error) {
        setModalError(error.message)
        setSaving(false)
        return
      }
      setAccounts(prev => prev.map(a => a.id === editId ? { ...a, ...payload } : a))
    } else {
      // ⭐ Always include company_id when inserting a new account
      if (!companyId) {
        setModalError("Company ID not available. Please refresh and try again.")
        setSaving(false)
        return
      }
      const { data: inserted, error } = await supabase
        .from("accounts")
        .insert({ ...payload, company_id: companyId })
        .select()
        .single()
      if (error) {
        setModalError(error.message)
        setSaving(false)
        return
      }
      setAccounts(prev => [...prev, inserted].sort((a, b) => a.code.localeCompare(b.code)))
    }

    setSaving(false)
    setShowModal(false)
  }

  const range = CODE_RANGES[formType]

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.4); display: flex; justify-content: center;
          align-items: center; z-index: 1000; }
        .modal-box { background: white; border-radius: 12px; padding: 24px;
          max-width: 400px; width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
        .input-field { width: 100%; padding: 8px 12px; border: 1px solid #E2E8F0;
          border-radius: 6px; font-size: 13px; margin-bottom: 12px; box-sizing: border-box; }
        .btn-primary { padding: 10px 20px; background: #1D4ED8; color: white;
          border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { padding: 10px 20px; background: white; color: #475569;
          border: 1px solid #CBD5E1; border-radius: 8px; cursor: pointer;
          font-weight: 600; font-size: 14px; margin-right: 8px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📊 Chart of Accounts</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Manage your chart of accounts</p>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", background: "#1D4ED8", color: "white",
              border: "none", borderRadius: 8, cursor: "pointer",
              fontWeight: 600, fontSize: 13,
            }}
          >
            <Plus size={15} /> Add Account
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid #E2E8F0",
              background: filter === t ? "#1E3A8A" : "white",
              color: filter === t ? "white" : "#64748B",
              fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
      ) : (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isAdmin ? "80px 1fr 100px 120px 120px 50px" : "80px 1fr 100px 120px 120px",
            padding: "10px 16px", background: "#F8FAFC", fontSize: 9,
            fontWeight: 700, textTransform: "uppercase", color: "#94A3B8",
          }}>
            <span>Code</span><span>Name</span><span>Type</span>
            <span style={{ textAlign: "right" }}>Balance</span>
            <span>Bank</span>
            {isAdmin && <span></span>}
          </div>
          {filtered.map((a, i) => (
            <div key={a.id} style={{
              display: "grid",
              gridTemplateColumns: isAdmin ? "80px 1fr 100px 120px 120px 50px" : "80px 1fr 100px 120px 120px",
              padding: "10px 16px", borderBottom: i < filtered.length - 1 ? "1px solid #F1F5F9" : "none",
              fontSize: 13, alignItems: "center",
            }}>
              <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{a.code}</span>
              <span>{a.name}</span>
              <span>
                <span style={{
                  padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                  background: (typeColors[a.type] || "#64748B") + "18",
                  color: typeColors[a.type] || "#64748B",
                }}>{a.type}</span>
              </span>
              <span style={{ textAlign: "right", fontWeight: 600 }}>
                PKR {(a.balance || 0).toLocaleString()}
              </span>
              <span style={{ fontSize: 12, color: "#1E3A8A" }}>
                {bankMap[a.id]?.bankName || "—"}
                {bankMap[a.id]?.bankId && (
                  <button
                    style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#1D4ED8', padding: 0 }}
                    onClick={() => window.location.href = `/dashboard/banking/bank-accounts`}
                    title="View bank details"
                  >
                    🔗
                  </button>
                )}
              </span>
              {isAdmin && (
                <span style={{ textAlign: "center" }}>
                  <button
                    onClick={() => openEdit(a)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B", padding: 0 }}
                    title="Edit account"
                  >
                    <Pencil size={14} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>
              {editId ? "Edit Account" : "Add New Account"}
            </h3>
            <p style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>
              {editId ? "Update the account name, code, or type." : "Create a new account. Choose a code within the recommended range."}
            </p>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Account Type</label>
            <select className="input-field" value={formType} onChange={e => { setFormType(e.target.value); setFormCode("") }}>
              {Object.keys(CODE_RANGES).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {range && (
              <p style={{ fontSize: 11, color: "#64748B", marginTop: -8, marginBottom: 10 }}>
                Recommended range: {range.min} – {range.max}
              </p>
            )}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Account Code</label>
            <input className="input-field" type="text" placeholder={range ? `e.g., ${range.min + 1}` : "Enter code"} value={formCode} onChange={e => setFormCode(e.target.value)} />
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Account Name</label>
            <input className="input-field" type="text" placeholder="e.g., Office Supplies" value={formName} onChange={e => setFormName(e.target.value)} />
            {modalError && <div style={{ color: "#B91C1C", fontSize: 12, marginBottom: 10 }}>{modalError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving || !formCode.trim() || !formName.trim()}>
                {saving ? "Saving..." : editId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}