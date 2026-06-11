"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ArrowRightLeft, CheckCircle } from "lucide-react"

export default function NewBankTransferPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [accounts, setAccounts] = useState<any[]>([])   // ← changed from bankAccounts
  const [fromAccountId, setFromAccountId] = useState<number | null>(null)
  const [toAccountId, setToAccountId] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const [totalTransfers, setTotalTransfers] = useState(0)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      // ✅ Fetch accounts of type Asset (bank accounts) for the current company
      const { data: accountsData, error: accountsError } = await supabase
        .from("accounts")
        .select("id, code, name, balance")
        .eq("company_id", cid)
        .eq("type", "Asset")
        .order("code")
      
      if (accountsError) {
        console.error("Error fetching accounts:", accountsError)
      } else if (accountsData) {
        setAccounts(accountsData)
      }

      const { count } = await supabase
        .from("bank_transfers")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
      setTotalTransfers(count || 0)
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!fromAccountId || !toAccountId || !amount) {
      setError("Please fill all required fields.")
      return
    }
    if (fromAccountId === toAccountId) {
      setError("From and To accounts must be different.")
      return
    }

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/banking/bank-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_account_id: fromAccountId,
          to_account_id: toAccountId,
          amount: parseFloat(amount),
          transfer_date: transferDate,
          reference,
          notes,
        }),
      })

      const result = await res.json()
      if (!result.success) {
        setError(result.error || "Transfer failed")
        setLoading(false)
        return
      }

      setFlash("✅ Transfer recorded and balances updated!")
      setFromAccountId(null); setToAccountId(null); setAmount(""); setReference(""); setNotes("")
      setTotalTransfers(prev => prev + 1)
      setLoading(false)
      setTimeout(() => router.push("/dashboard/banking/bank-transfers"), 1500)
    } catch (err) {
      setError("Network error")
      setLoading(false)
    }
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .form-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 24px; margin-bottom: 16px;
        }
        .summary-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px;
        }
        .label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text);
        }
        .input:focus, .select:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .btn {
          padding: 10px 20px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-primary {
          background: var(--primary); color: var(--primary-text); border-color: var(--primary);
          box-shadow: 0 4px 12px rgba(37,99,235,0.3);
        }
        .btn-primary:hover { background: var(--primary-hover); }
        .layout { display: flex; gap: 24px; align-items: flex-start; }
        .form-side { flex: 1; min-width: 0; }
        .summary-side { width: 260px; flex-shrink: 0; }
        @media (max-width: 860px) { .layout { flex-direction: column; } .summary-side { width: 100%; } }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/banking/bank-transfers")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>↔️ New Bank Transfer</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Record a transfer between accounts</p>
          </div>
        </div>

        {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="layout">
          <div className="form-side">
            <div className="form-card">
              <div style={{ marginBottom: 16 }}>
                <label className="label">From Account *</label>
                <select className="select" value={fromAccountId ?? ""} onChange={e => setFromAccountId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Account —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} – {a.name} (PKR {a.balance?.toLocaleString()})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">To Account *</label>
                <select className="select" value={toAccountId ?? ""} onChange={e => setToAccountId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Account —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} – {a.name} (PKR {a.balance?.toLocaleString()})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Amount *</label>
                <input className="input" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Transfer Date</label>
                <input className="input" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Reference</label>
                <input className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Notes</label>
                <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>

          <div className="summary-side">
            <div className="summary-card">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>↔️ Summary</h2>
              <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Transfers</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{totalTransfers}</div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Saving..." : <> <ArrowRightLeft size={16} /> Record Transfer </>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}