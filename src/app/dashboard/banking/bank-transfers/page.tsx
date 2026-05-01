"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ArrowRightLeft, CheckCircle, X } from "lucide-react"
import { useRouter } from "next/navigation"

interface BankAccount {
  id: number
  account_id: number
  bank_name: string
  account_number: string
  balance: number
  code: string
  name: string
}

interface Transfer {
  id: number
  from_account_id: number
  to_account_id: number
  amount: number
  transfer_date: string
  reference: string
  notes: string
  created_at: string
  from_account?: { code: string; name: string }
  to_account?: { code: string; name: string }
}

export default function BankTransfersPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [fromId, setFromId] = useState<number | null>(null)
  const [toId, setToId] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    // fetch bank accounts with balances
    supabase
      .from("bank_accounts")
      .select("id, account_id, bank_name, account_number, accounts(code, name, balance)")
      .eq("is_active", true)
      .order("id")
      .then(r => {
        if (r.data) {
          const enriched = r.data
            .filter((b: any) => b.accounts)
            .map((b: any) => ({
              id: b.id,
              account_id: b.account_id,
              bank_name: b.bank_name,
              account_number: b.account_number,
              balance: b.accounts.balance || 0,
              code: b.accounts.code || "",
              name: b.accounts.name || "",
            }))
          setAccounts(enriched)
        }
      })

    // fetch recent transfers
    supabase
      .from("bank_transfers")
      .select("*, from_account:bank_accounts!from_account_id(account_id, accounts(code,name)), to_account:bank_accounts!to_account_id(account_id, accounts(code,name))")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(r => {
        if (r.data) setTransfers(r.data)
      })
  }, [])

  const fromAccount = accounts.find(a => a.id === fromId)
  const toAccount = accounts.find(a => a.id === toId)

  const handleSubmit = async () => {
    if (!fromId || !toId) {
      setError("Select both source and destination accounts")
      return
    }
    if (fromId === toId) {
      setError("Source and destination must be different")
      return
    }
    if (amount <= 0) {
      setError("Amount must be greater than 0")
      return
    }
    if (!fromAccount || (fromAccount.balance || 0) < amount) {
      setError(`Insufficient balance. Available: PKR ${(fromAccount?.balance || 0).toLocaleString()}`)
      return
    }

    setLoading(true)
    setError("")

    try {
      // 1. Update account balances (transfer = DR destination / CR source)
      const { data: toAcc } = await supabase.from("accounts").select("id,balance").eq("id", toAccount!.account_id).single()
      const { data: fromAcc } = await supabase.from("accounts").select("id,balance").eq("id", fromAccount.account_id).single()

      if (!toAcc || !fromAcc) throw new Error("Accounts not found")

      await supabase.from("accounts").update({ balance: toAcc.balance + amount }).eq("id", toAcc.id)
      await supabase.from("accounts").update({ balance: fromAcc.balance - amount }).eq("id", fromAcc.id)

      // 2. Create journal entry
      const entryNo = `BT-${transferDate.replace(/-/g, "")}-${Date.now().toString(36).toUpperCase()}`
      const { data: je } = await supabase.from("journal_entries")
        .insert({
          entry_no: entryNo,
          date: transferDate,
          description: `Bank Transfer from ${fromAccount.code} to ${toAccount.code}`,
          reference,
        })
        .select("id")
        .single()

      if (je) {
        await supabase.from("journal_lines").insert([
          { entry_id: je.id, account_id: toAcc.id, debit: amount, credit: 0, narration: `Transfer to ${toAccount.code}` },
          { entry_id: je.id, account_id: fromAcc.id, debit: 0, credit: amount, narration: `Transfer from ${fromAccount.code}` },
        ])
      }

      // 3. Record the transfer
      await supabase.from("bank_transfers").insert({
        from_account_id: fromId,
        to_account_id: toId,
        amount,
        transfer_date: transferDate,
        reference,
        notes,
        journal_entry_id: je?.id || null,
      })

      setSuccess(`Transfer of PKR ${amount.toLocaleString()} completed!`)
      setAmount(0)
      setFromId(null)
      setToId(null)
      setReference("")
      setNotes("")

      // Refresh the list
      const { data: freshTransfers } = await supabase
        .from("bank_transfers")
        .select("*, from_account:bank_accounts!from_account_id(account_id, accounts(code,name)), to_account:bank_accounts!to_account_id(account_id, accounts(code,name))")
        .order("created_at", { ascending: false })
        .limit(20)
      if (freshTransfers) setTransfers(freshTransfers)

      setTimeout(() => setSuccess(""), 3000)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .bt-shell { max-width: 800px; margin: 0 auto; }
        .bt-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 24px; margin-bottom: 16px; }
        .bt-title { font-size: 22px; font-weight: 800; color: #1E293B; margin-bottom: 4px; }
        .bt-subtitle { font-size: 13px; color: #94A3B8; }
        .bt-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: block; }
        .bt-input, .bt-select { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .bt-input:focus, .bt-select:focus { border-color: #1740C8; background: white; }
        .bt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .bt-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
        .bt-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .bt-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .bt-transfer-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        @media (max-width: 500px) {
          .bt-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="bt-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="bt-btn bt-btn-outline" onClick={() => router.push("/dashboard/banking/bank-accounts")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="bt-title">🔄 Bank Transfers</div>
            <div className="bt-subtitle">Transfer funds between bank accounts</div>
          </div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ✅ {success}
          </div>
        )}

        <div className="bt-card">
          <div className="bt-row">
            <div>
              <label className="bt-label">From Account *</label>
              <select className="bt-select" value={fromId || ""} onChange={e => setFromId(Number(e.target.value) || null)}>
                <option value="">Select source account...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.bank_name} (PKR {a.balance?.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="bt-label">To Account *</label>
              <select className="bt-select" value={toId || ""} onChange={e => setToId(Number(e.target.value) || null)}>
                <option value="">Select destination account...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.bank_name} (PKR {a.balance?.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="bt-label">Amount (PKR) *</label>
              <input className="bt-input" type="number" value={amount || ""} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            <div>
              <label className="bt-label">Date *</label>
              <input className="bt-input" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
            </div>
          </div>
          <div className="bt-row" style={{ marginTop: 14 }}>
            <div>
              <label className="bt-label">Reference</label>
              <input className="bt-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="bt-label">Notes</label>
              <input className="bt-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <button className="bt-btn bt-btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={handleSubmit} disabled={loading}>
            <ArrowRightLeft size={16} /> {loading ? "Processing..." : "Execute Transfer"}
          </button>
        </div>

        <div className="bt-card">
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#1E293B" }}>Recent Transfers</h3>
          {transfers.length === 0 ? (
            <p style={{ color: "#94A3B8", textAlign: "center", padding: 20 }}>No transfers yet.</p>
          ) : (
            transfers.map((t, i) => (
              <div key={t.id} className="bt-transfer-row">
                <div>
                  <span style={{ fontWeight: 600 }}>{t.transfer_date}</span>
                  <span style={{ marginLeft: 12, color: "#64748B" }}>
                    {t.from_account?.accounts?.code} → {t.to_account?.accounts?.code}
                  </span>
                </div>
                <span style={{ fontWeight: 700, color: "#1D4ED8" }}>PKR {t.amount.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}