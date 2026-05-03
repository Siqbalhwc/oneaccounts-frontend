"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Save } from "lucide-react"
import PremiumGuard from "@/components/PremiumGuard"

function InvoiceAutomationContent() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [expenseRules, setExpenseRules] = useState([
    { name: "Salaries", rate: 4.0, account: "Salaries Expense" },
    { name: "Advertising", rate: 0.5, account: "Advertisement Expense" },
    { name: "Fuel", rate: 0.5, account: "Fuel Expense" },
  ])
  const [profitAllocations, setProfitAllocations] = useState([
    { account: "Profit A", percentage: 5.0 },
    { account: "Profit BA", percentage: 5.0 },
    { account: "Profit AM", percentage: 5.0 },
    { account: "Profit MA", percentage: 5.0 },
    { account: "Profit Owner", percentage: 80.0 },
  ])
  const [message, setMessage] = useState("")
  const [accounts, setAccounts] = useState<any[]>([])

  useEffect(() => {
    supabase.from("accounts").select("id, code, name, type").eq("type", "Equity").order("code").then(r => r.data && setAccounts(r.data))
  }, [])

  const handleSave = () => {
    localStorage.setItem("invoice-expense-rules", JSON.stringify(expenseRules))
    localStorage.setItem("invoice-profit-allocations", JSON.stringify(profitAllocations))
    setMessage("✅ Automation rules saved!")
    setTimeout(() => setMessage(""), 3000)
  }

  const totalPct = profitAllocations.reduce((s, a) => s + a.percentage, 0)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .ia-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 24px; margin-bottom: 16px; }
        .ia-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .ia-subtitle { font-size: 13px; color: #64748B; margin-bottom: 20px; }
        .ia-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; display: block; }
        .ia-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .ia-row { display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 14px; margin-bottom: 10px; align-items: end; }
        .ia-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        @media (max-width: 500px) { .ia-row { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="ia-title">⚙️ Invoice Automation</div>
      <div className="ia-subtitle">Configure expense rates and profit allocation</div>

      {message && <div style={{ background: "#F0FDF4", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{message}</div>}

      <div className="ia-card">
        <h3 style={{ marginTop: 0, marginBottom: 16, color: "#EF4444" }}>💰 Expense Rules</h3>
        {expenseRules.map((rule, i) => (
          <div key={i} className="ia-row">
            <div>
              <label className="ia-label">Expense Name</label>
              <input className="ia-input" value={rule.name} onChange={e => {
                const updated = [...expenseRules]; updated[i].name = e.target.value; setExpenseRules(updated)
              }} />
            </div>
            <div>
              <label className="ia-label">Rate (%)</label>
              <input className="ia-input" type="number" value={rule.rate} onChange={e => {
                const updated = [...expenseRules]; updated[i].rate = Number(e.target.value); setExpenseRules(updated)
              }} />
            </div>
            <div>
              <label className="ia-label">Account</label>
              <input className="ia-input" value={rule.account} onChange={e => {
                const updated = [...expenseRules]; updated[i].account = e.target.value; setExpenseRules(updated)
              }} />
            </div>
          </div>
        ))}
      </div>

      <div className="ia-card">
        <h3 style={{ marginTop: 0, marginBottom: 16, color: "#10B981" }}>📊 Profit Allocation</h3>
        {profitAllocations.map((alloc, i) => (
          <div key={i} className="ia-row" style={{ gridTemplateColumns: "2fr 1fr 80px" }}>
            <div>
              <label className="ia-label">Equity Account</label>
              <select className="ia-input" value={alloc.account} onChange={e => {
                const updated = [...profitAllocations]; updated[i].account = e.target.value; setProfitAllocations(updated)
              }}>
                {accounts.map(a => <option key={a.id} value={a.name}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="ia-label">%</label>
              <input className="ia-input" type="number" value={alloc.percentage} onChange={e => {
                const updated = [...profitAllocations]; updated[i].percentage = Number(e.target.value); setProfitAllocations(updated)
              }} />
            </div>
            <div>
              <button style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", marginTop: 20 }}
                onClick={() => setProfitAllocations(profitAllocations.filter((_, idx) => idx !== i))}>🗑️</button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <button className="ia-btn" style={{ background: "white", border: "1px dashed #E2E8F0", color: "#64748B" }}
            onClick={() => setProfitAllocations([...profitAllocations, { account: accounts[0]?.name || "", percentage: 0 }])}>
            + Add Allocation
          </button>
        </div>
        <div style={{ marginTop: 12, fontWeight: 600, color: totalPct === 100 ? "#10B981" : "#EF4444" }}>
          Total: {totalPct}% {totalPct !== 100 && "⚠️ Should be 100%"}
        </div>
      </div>

      <button className="ia-btn" onClick={handleSave}><Save size={16} /> Save Configuration</button>
    </div>
  )
}

export default function InvoiceAutomationPage() {
  return (
    <PremiumGuard
      featureCode="invoice_automation"
      featureName="Invoice Automation"
      featureDesc="Configure expense rules and profit allocation."
    >
      <InvoiceAutomationContent />
    </PremiumGuard>
  )
}