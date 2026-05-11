"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowRightLeft, X, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Transfer {
  id: number
  from_account_id: number
  to_account_id: number
  amount: number
  transfer_date: string
  reference: string
  notes: string
  created_at: string
  from_code?: string
  from_name?: string
  to_code?: string
  to_name?: string
}

export default function BankTransfersPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()   // FIX: added loading
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [glAccounts, setGlAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [flash, setFlash] = useState("")

  // New transfer form
  const [showForm, setShowForm] = useState(false)
  const [fromAccountId, setFromAccountId] = useState<number | null>(null)
  const [toAccountId, setToAccountId] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  // ── 1. Company ID & data ─────────────────────────────────────────────────
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

    const { data: accountData } = await supabase
      .from("accounts")
      .select("id, code, name, balance")
      .eq("type", "Asset")
      .like("code", "10%")
      .eq("company_id", companyId)
      .order("code")

    setGlAccounts(accountData || [])

    const { data: transferData } = await supabase
      .from("bank_transfers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    const accountMap: Record<number, any> = {}
    accountData?.forEach((a: any) => { accountMap[a.id] = a })

    const enrichedTransfers = transferData?.map((t: any) => ({
      ...t,
      from_code: accountMap[t.from_account_id]?.code || "—",
      from_name: accountMap[t.from_account_id]?.name || "—",
      to_code: accountMap[t.to_account_id]?.code || "—",
      to_name: accountMap[t.to_account_id]?.name || "—",
    })) || []

    setTransfers(enrichedTransfers)
    setLoading(false)
  }

  useEffect(() => { if (companyId) fetchData() }, [companyId])

  // ── Access guards (FIXED) ──────────────────────────────────────────────
  if (!companyId || roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
  }
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
    ? transfers.filter(t =>
        (t.from_code || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.from_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.to_code || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.to_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.reference || "").toLowerCase().includes(search.toLowerCase())
      )
    : transfers

  const totalAmount = filtered.reduce((sum, t) => sum + (t.amount || 0), 0)

  // ── New transfer form ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    if (!fromAccountId || !toAccountId || !amount || fromAccountId === toAccountId) {
      setFlash("Please fill all fields and make sure accounts are different.")
      setTimeout(() => setFlash(""), 3000)
      return
    }
    setSaving(true)
    const { error } = await supabase.from("bank_transfers").insert({
      company_id: companyId,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      amount: parseFloat(amount),
      transfer_date: transferDate,
      reference,
      notes,
    })
    if (error) {
      setFlash("Error: " + error.message)
    } else {
      setFlash("Transfer recorded!")
      setShowForm(false)
      fetchData()
    }
    setSaving(false)
    setTimeout(() => setFlash(""), 3000)
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{`
          .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .input { height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #1D4ED8; color: white; }
          .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
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
            th:nth-child(3), td:nth-child(3) { display: none; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>↔️ Bank Transfers</h1>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Record transfers between your bank accounts</p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <ArrowRightLeft size={16} /> New Transfer
            </button>
          )}
        </div>

        {/* Flash message */}
        {flash && (
          <div style={{
            background: flash.includes("Error") ? "#FEF2F2" : "#F0FDF4",
            border: "1px solid #BBF7D0",
            color: flash.includes("Error") ? "#B91C1C" : "#15803D",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {flash}
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Transfers</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{filtered.length}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Amount</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>PKR {totalAmount.toLocaleString()}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ maxWidth: 320, marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
            <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search account name, code, or reference..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading transfers...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
              No transfers recorded yet. {canEdit && 'Click "New Transfer" to record one.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>From Account</th>
                  <th>To Account</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td>{t.from_code} - {t.from_name}</td>
                    <td>{t.to_code} - {t.to_name}</td>
                    <td style={{ fontWeight: 600 }}>PKR {t.amount.toLocaleString()}</td>
                    <td>{new Date(t.transfer_date).toLocaleDateString()}</td>
                    <td style={{ color: "#64748B" }}>{t.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* New Transfer Form Modal */}
        {showForm && canEdit && (
          <div className="pr-modal-overlay" onClick={() => setShowForm(false)}>
            <div className="pr-modal" onClick={e => e.stopPropagation()}>
              <div className="pr-modal-header">
                <div className="pr-modal-title">New Bank Transfer</div>
                <button className="pr-icon-btn" onClick={() => setShowForm(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="pr-modal-body">
                  <div>
                    <label className="pr-field-label">From Account *</label>
                    <select className="pr-field-select" value={fromAccountId ?? ""} onChange={e => setFromAccountId(Number(e.target.value) || null)} required>
                      <option value="">Select account</option>
                      {glAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name} (PKR {a.balance?.toLocaleString()})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="pr-field-label">To Account *</label>
                    <select className="pr-field-select" value={toAccountId ?? ""} onChange={e => setToAccountId(Number(e.target.value) || null)} required>
                      <option value="">Select account</option>
                      {glAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name} (PKR {a.balance?.toLocaleString()})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="pr-field-label">Amount *</label>
                    <input className="pr-field-input" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
                  </div>
                  <div>
                    <label className="pr-field-label">Transfer Date</label>
                    <input className="pr-field-input" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="pr-field-label">Reference</label>
                    <input className="pr-field-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="pr-field-label">Notes</label>
                    <input className="pr-field-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
                <div className="pr-modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Transfer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}