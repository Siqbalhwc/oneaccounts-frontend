"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, Save, CheckCircle } from "lucide-react"
import PremiumGuard from "@/components/PremiumGuard"

function InvoiceAutomationContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  // Automation config
  const [expenseEnabled, setExpenseEnabled] = useState(false)
  const [profitEnabled, setProfitEnabled] = useState(false)
  const [expenseRules, setExpenseRules] = useState<any[]>([])
  const [partners, setPartners] = useState<any[]>([])

  // Account list for dropdowns
  const [accounts, setAccounts] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Load accounts
        supabase
          .from("accounts")
          .select("id, code, name, type")
          .eq("company_id", cid)
          .order("code")
          .then(r => r.data && setAccounts(r.data))

        // Load existing automation config
        supabase
          .from("company_settings")
          .select("invoice_automation_config")
          .eq("company_id", cid)
          .maybeSingle()
          .then(({ data }) => {
            const config = data?.invoice_automation_config || {}
            setExpenseEnabled(config.expenseEnabled || false)
            setProfitEnabled(config.profitEnabled || false)
            setExpenseRules(config.expenseRules || [])
            setPartners(config.partners || [])
            setLoading(false)
          })
      }
    })
  }, [])

  // Expense rule helpers
  const addExpenseRule = () => {
    setExpenseRules([...expenseRules, { account_id: "", rate: 0 }])
  }

  const updateExpenseRule = (idx: number, field: string, value: any) => {
    const updated = [...expenseRules]
    updated[idx] = { ...updated[idx], [field]: value }
    setExpenseRules(updated)
  }

  const removeExpenseRule = (idx: number) => {
    setExpenseRules(expenseRules.filter((_, i) => i !== idx))
  }

  // Partner helpers
  const addPartner = () => {
    setPartners([...partners, { account_id: "", percentage: 0 }])
  }

  const updatePartner = (idx: number, field: string, value: any) => {
    const updated = [...partners]
    updated[idx] = { ...updated[idx], [field]: value }
    // Ensure percentages sum to 100
    if (field === "percentage") {
      const total = updated.reduce((s, p, i) => s + (i === idx ? Number(value) : (p.percentage || 0)), 0)
      if (total > 100) {
        updated[idx].percentage = Number(value) - (total - 100)
      }
    }
    setPartners(updated)
  }

  const removePartner = (idx: number) => {
    setPartners(partners.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!companyId) return
    setSaving(true)
    setMessage("")

    const config = {
      expenseEnabled,
      profitEnabled,
      expenseRules: expenseRules.filter(r => r.account_id),
      partners: partners.filter(p => p.account_id && p.percentage > 0),
    }

    try {
      const res = await fetch("/api/settings/invoice-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, config }),
      })
      const result = await res.json()
      if (result.success) {
        setMessage("✅ Automation settings saved!")
      } else {
        setMessage("Error saving: " + (result.error || "Unknown error"))
      }
    } catch {
      setMessage("Network error")
    }

    setSaving(false)
    setTimeout(() => setMessage(""), 3000)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 16px;
          box-shadow: var(--shadow-sm);
        }
        .section-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .toggle-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .toggle-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          cursor: pointer;
        }
        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          background: var(--border);
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .toggle-switch.active {
          background: #10B981;
        }
        .toggle-switch::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .toggle-switch.active::after {
          transform: translateX(20px);
        }
        .rule-row {
          display: grid;
          grid-template-columns: 1fr 100px 40px;
          gap: 10px;
          align-items: center;
          margin-bottom: 8px;
        }
        .input, .select {
          height: 38px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          background: var(--bg);
          color: var(--text);
          outline: none;
          box-sizing: border-box;
          width: 100%;
          font-family: inherit;
        }
        .input:focus, .select:focus {
          border-color: var(--primary);
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid var(--border);
          background: transparent;
          color: var(--text-muted);
          font-family: inherit;
          transition: all 0.15s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary {
          background: var(--primary);
          color: var(--primary-text);
          border-color: var(--primary);
        }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-danger {
          color: #EF4444;
          border-color: #FECACA;
        }
        .btn-danger:hover {
          background: #FEF2F2;
        }
        .message-bar {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 13px;
        }
        .message-bar.success {
          background: var(--card);
          border: 1px solid #065F46;
          color: #6EE7B7;
        }
        .message-bar.error {
          background: var(--card);
          border: 1px solid #FECACA;
          color: #FCA5A5;
        }
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid var(--border);
          background: transparent;
          color: var(--text-muted);
          font-family: inherit;
          transition: all 0.15s;
          margin-bottom: 20px;
        }
        .back-btn:hover { background: var(--card-hover); }
      `}</style>

      <button className="back-btn" onClick={() => router.push("/dashboard/settings")}>
        <ArrowLeft size={16} /> Back to Settings
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>⚙️ Invoice Automation</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>
        Automatically apply expenses and profit allocation to every sales invoice
      </p>

      {message && (
        <div className={`message-bar ${message.startsWith("✅") ? "success" : "error"}`}>
          <CheckCircle size={14} /> {message}
        </div>
      )}

      {/* Expense Automation */}
      <div className="card">
        <div className="section-title">
          💸 Expense Automation
        </div>
        <div className="toggle-row">
          <div
            className={`toggle-switch ${expenseEnabled ? "active" : ""}`}
            onClick={() => setExpenseEnabled(!expenseEnabled)}
          />
          <span className="toggle-label">Enable automatic expense allocation</span>
        </div>

        {expenseEnabled && (
          <>
            <div style={{ marginBottom: 12 }}>
              {expenseRules.map((rule, idx) => (
                <div key={idx} className="rule-row">
                  <select
                    className="select"
                    value={rule.account_id || ""}
                    onChange={e => updateExpenseRule(idx, "account_id", e.target.value)}
                  >
                    <option value="">Select expense account</option>
                    {accounts.filter(a => a.type === "Expense").map(a => (
                      <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      value={rule.rate || 0}
                      onChange={e => updateExpenseRule(idx, "rate", Number(e.target.value))}
                      style={{ textAlign: "right" }}
                    />
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%</span>
                  </div>
                  <button className="btn btn-danger" onClick={() => removeExpenseRule(idx)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button className="btn" onClick={addExpenseRule}>
              <Plus size={14} /> Add Expense Rule
            </button>
          </>
        )}
      </div>

      {/* Profit Allocation */}
      <div className="card">
        <div className="section-title">
          💰 Profit Allocation
        </div>
        <div className="toggle-row">
          <div
            className={`toggle-switch ${profitEnabled ? "active" : ""}`}
            onClick={() => setProfitEnabled(!profitEnabled)}
          />
          <span className="toggle-label">Enable automatic profit allocation</span>
        </div>

        {profitEnabled && (
          <>
            <div style={{ marginBottom: 12 }}>
              {partners.map((partner, idx) => (
                <div key={idx} className="rule-row">
                  <select
                    className="select"
                    value={partner.account_id || ""}
                    onChange={e => updatePartner(idx, "account_id", e.target.value)}
                  >
                    <option value="">Select partner account</option>
                    {accounts.filter(a => a.type === "Equity" || a.type === "Liability").map(a => (
                      <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      value={partner.percentage || 0}
                      onChange={e => updatePartner(idx, "percentage", Number(e.target.value))}
                      style={{ textAlign: "right" }}
                    />
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%</span>
                  </div>
                  <button className="btn btn-danger" onClick={() => removePartner(idx)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Total: {partners.reduce((s, p) => s + (p.percentage || 0), 0)}% (must equal 100%)
              </div>
            </div>
            <button className="btn" onClick={addPartner}>
              <Plus size={14} /> Add Partner
            </button>
          </>
        )}
      </div>

      {/* Save Button */}
      <button
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: 12 }}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : <><Save size={16} /> Save Automation Settings</>}
      </button>
    </div>
  )
}

export default function InvoiceAutomationPage() {
  return (
    <PremiumGuard
      featureCode="invoice_automation"
      featureName="Invoice Automation"
      featureDesc="Automate expenses and profit allocation on invoices"
    >
      <InvoiceAutomationContent />
    </PremiumGuard>
  )
}