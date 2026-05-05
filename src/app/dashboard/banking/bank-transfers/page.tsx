"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowRightLeft, X } from "lucide-react"
import { useRouter } from "next/navigation"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Transfer {
  id: number
  from_account_id: number   // GL account ID
  to_account_id: number     // GL account ID
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
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [glAccounts, setGlAccounts] = useState<any[]>([])   // cash/bank GL accounts (10xx)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [flash, setFlash] = useState("")

  const [fromAccountId, setFromAccountId] = useState<number | null>(null)
  const [toAccountId, setToAccountId] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

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

    // Fetch the cash/bank GL accounts (10xx) – these are the real accounts
    const { data: accountData } = await supabase
      .from("accounts")
      .select("id, code, name, balance")
      .eq("type", "Asset")
      .like("code", "10%")
      .eq("company_id", companyId)
      .order("code")

    setGlAccounts(accountData || [])

    // Fetch transfers
    const { data: transferData } = await supabase
      .from("bank_transfers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    // Enrich transfers with GL account names
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

  if (!companyId) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

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
      from_account_id: fromAccountId,   // now a proper GL account ID
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
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .bt-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .bt-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .bt-subtitle { font-size: 13px; color: #94A3B8; }
          .bt-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
          .bt-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
          .bt-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
          .bt-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .bt-table-header, .bt-table-row { display: grid; grid-template-columns: 1fr 1fr 100px 100px 1fr; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .bt-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .bt-table-row:hover { background: #FAFBFF; }
          .bt-form-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
          .bt-form { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
          .bt-form-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
          .bt-form-title { font-size: 18px; font-weight: 700; color: #1E293B; }
          .bt-form-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
          .bt-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
          .bt-input, .bt-select { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
          .bt-input:focus, .bt-select:focus { border-color: #1740C8; background: white; }
          .bt-form-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
          .bt-icon-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; color: #94A3B8; }
          .bt-icon-btn:hover { background: #F1F5F9; color: #475569; }
          @media (max-width: 768px) {
            .bt-table-header, .bt-table-row { grid-template-columns: 1fr 1fr 80px 80px; }
            .bt-hide-mobile { display: none; }
          }
        `}</style>

        <div className="bt-header">
          <div>
            <div className="bt-title">↔️ Bank Transfers</div>
            <div className="bt-subtitle">Record a transfer between your bank accounts</div>
          </div>
          {canEdit && (
            <button className="bt-btn bt-btn-primary" onClick={() => setShowForm(true)}>
              <ArrowRightLeft size={16} /> New Transfer
            </button>
          )}
        </div>

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

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading transfers...</div>
        ) : transfers.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No transfers recorded yet. {canEdit && 'Click "New Transfer" to record one.'}
          </div>
        ) : (
          <div className="bt-table">
            <div className="bt-table-header">
              <span>From Account</span>
              <span>To Account</span>
              <span>Amount</span>
              <span>Date</span>
              <span className="bt-hide-mobile">Reference</span>
            </div>
            {transfers.map(t => (
              <div key={t.id} className="bt-table-row">
                <span>{t.from_code} - {t.from_name}</span>
                <span>{t.to_code} - {t.to_name}</span>
                <span style={{ fontWeight: 600 }}>PKR {t.amount.toLocaleString()}</span>
                <span>{new Date(t.transfer_date).toLocaleDateString()}</span>
                <span className="bt-hide-mobile" style={{ color: "#64748B" }}>{t.reference || "—"}</span>
              </div>
            ))}
          </div>
        )}

        {/* New Transfer Form – editors only */}
        {showForm && canEdit && (
          <div className="bt-form-overlay" onClick={() => setShowForm(false)}>
            <div className="bt-form" onClick={e => e.stopPropagation()}>
              <div className="bt-form-header">
                <div className="bt-form-title">New Bank Transfer</div>
                <button className="bt-icon-btn" onClick={() => setShowForm(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="bt-form-body">
                  <div>
                    <label className="bt-label">From Account *</label>
                    <select className="bt-select" value={fromAccountId ?? ""} onChange={e => setFromAccountId(Number(e.target.value) || null)} required>
                      <option value="">Select account</option>
                      {glAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name} (PKR {a.balance?.toLocaleString()})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="bt-label">To Account *</label>
                    <select className="bt-select" value={toAccountId ?? ""} onChange={e => setToAccountId(Number(e.target.value) || null)} required>
                      <option value="">Select account</option>
                      {glAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name} (PKR {a.balance?.toLocaleString()})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="bt-label">Amount *</label>
                    <input className="bt-input" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
                  </div>
                  <div>
                    <label className="bt-label">Transfer Date</label>
                    <input className="bt-input" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Reference</label>
                    <input className="bt-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="bt-label">Notes</label>
                    <input className="bt-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
                <div className="bt-form-footer">
                  <button type="button" className="bt-btn bt-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="bt-btn bt-btn-primary" disabled={saving}>
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