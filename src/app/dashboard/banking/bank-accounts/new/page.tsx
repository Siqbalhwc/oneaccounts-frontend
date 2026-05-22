"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"

export default function NewBankAccountPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [cashAccounts, setCashAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [bankName, setBankName] = useState("")
  const [branch, setBranch] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Summary state
  const [totalAccounts, setTotalAccounts] = useState(0)
  const [totalBalance, setTotalBalance] = useState(0)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      // Fetch cash accounts (code starting with "10")
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code, name, balance")
        .eq("type", "Asset")
        .like("code", "10%")
        .eq("company_id", cid)
        .order("code")
      if (accounts) setCashAccounts(accounts)

      // Fetch bank accounts for summary
      const { data: bankData } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("company_id", cid)
      setTotalAccounts(bankData?.length || 0)
      setTotalBalance(accounts?.reduce((s, a) => s + (a.balance || 0), 0) || 0)
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!selectedAccountId || !bankName.trim()) {
      setError("GL Account and Bank Name are required.")
      return
    }

    setLoading(true)
    setError("")

    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || "system"

    const { data, error: insertErr } = await supabase
      .from("bank_accounts")
      .insert({
        company_id: companyId,
        account_id: selectedAccountId,
        bank_name: bankName.trim(),
        branch: branch.trim(),
        account_number: accountNumber.trim(),
        is_active: isActive,
        created_by: userEmail,
        updated_by: userEmail,
      })
      .select("id, bank_name")
      .single()

    if (insertErr) {
      setError(insertErr.message)
      setLoading(false)
      return
    }

    setFlash(`✅ Bank account "${data.bank_name}" created!`)
    setBankName(""); setBranch(""); setAccountNumber(""); setSelectedAccountId(null); setIsActive(true)
    setTotalAccounts(prev => prev + 1)
    setLoading(false)
    setTimeout(() => router.push("/dashboard/banking/bank-accounts"), 1500)
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
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .layout {
          display: flex;
          gap: 24px;
          align-items: flex-start;
        }
        .form-side { flex: 1; min-width: 0; }
        .summary-side { width: 260px; flex-shrink: 0; }

        @media (max-width: 860px) {
          .layout { flex-direction: column; }
          .summary-side { width: 100%; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/banking/bank-accounts")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>➕ New Bank Account</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Link a GL account with bank details</p>
          </div>
        </div>

        {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="layout">
          <div className="form-side">
            <div className="form-card">
              <div style={{ marginBottom: 16 }}>
                <label className="label">GL Account *</label>
                <select
                  className="select"
                  value={selectedAccountId ?? ""}
                  onChange={e => setSelectedAccountId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— Select Account —</option>
                  {cashAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} – {a.name} (PKR {a.balance?.toLocaleString()})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Bank Name *</label>
                <input className="input" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HBL, UBL" />
              </div>

              <div className="inline-group" style={{ marginBottom: 16 }}>
                <div>
                  <label className="label">Branch</label>
                  <input className="input" value={branch} onChange={e => setBranch(e.target.value)} placeholder="e.g. Main Branch" />
                </div>
                <div>
                  <label className="label">Account Number</label>
                  <input className="input" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="e.g. 123456789" />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <span style={{ fontSize: 13, color: "var(--text)" }}>Active</span>
              </div>
            </div>
          </div>

          <div className="summary-side">
            <div className="summary-card">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>🏦 Summary</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Bank Accounts</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{totalAccounts}</div>
                </div>
                <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Balance</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#10B981" }}>PKR {totalBalance.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Saving..." : <> <Plus size={16} /> Create Bank Account </>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}