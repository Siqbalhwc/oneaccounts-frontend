"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"

export default function NewJournalPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [accounts, setAccounts] = useState<any[]>([])
  const [entryNo, setEntryNo] = useState("")
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")
  const [lines, setLines] = useState<any[]>([{ account_id: null, debit: 0, credit: 0 }, { account_id: null, debit: 0, credit: 0 }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.from("accounts").select("id,code,name,type").order("code").then(r => r.data && setAccounts(r.data))
    supabase.from("journal_entries").select("entry_no").order("entry_no", { ascending: false }).limit(1).then(r => {
      if (r.data && r.data.length > 0) {
        const parts = r.data[0].entry_no.split("-")
        const num = parseInt(parts[parts.length - 1]) || 0
        setEntryNo(`JE-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${String(num + 1).padStart(3, "0")}`)
      } else setEntryNo(`JE-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-001`)
    })
  }, [])

  const addLine = () => setLines([...lines, { account_id: null, debit: 0, credit: 0 }])
  const removeLine = (i: number) => lines.length > 2 && setLines(lines.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lines]
    updated[i] = { ...updated[i], [field]: field === "debit" || field === "credit" ? Number(value) : value }
    if (field === "debit" && updated[i].debit > 0) updated[i].credit = 0
    if (field === "credit" && updated[i].credit > 0) updated[i].debit = 0
    setLines(updated)
  }

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const handleSubmit = async () => {
    if (!entryNo || !description) { setError("Entry No and Description required"); return }
    if (!isBalanced) { setError("Debits must equal Credits"); return }
    setLoading(true); setError("")

    const { data: je } = await supabase.from("journal_entries").insert({
      entry_no: entryNo, date: entryDate, description
    }).select("id").single()

    if (je) {
      const validLines = lines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0))
      await supabase.from("journal_lines").insert(
        validLines.map(l => ({ entry_id: je.id, account_id: l.account_id, debit: l.debit, credit: l.credit }))
      )
      // Update account balances
      for (const l of validLines) {
        const { data: acc } = await supabase.from("accounts").select("balance").eq("id", l.account_id).single()
        if (acc) {
          const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
          await supabase.from("accounts").update({ balance: newBal }).eq("id", l.account_id)
        }
      }
      router.push("/dashboard/journal")
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.push("/dashboard/journal")}
            style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📓 New Journal Entry</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Debits must equal Credits</p>
          </div>
        </div>

        {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Entry No *</label>
              <input value={entryNo} onChange={e => setEntryNo(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Date *</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Description *</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Office rent"
                style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Journal Lines</span>
            <button onClick={addLine}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              <Plus size={14} /> Add Line
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 40px", gap: 8, fontSize: 10, fontWeight: 700, color: "#94A3B8", padding: "0 0 8px" }}>
            <span>Account</span><span style={{ textAlign: "right" }}>Debit</span><span style={{ textAlign: "right" }}>Credit</span><span></span>
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 40px", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <select value={l.account_id || ""} onChange={e => updateLine(i, "account_id", e.target.value)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12 }}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
              <input type="number" value={l.debit || ""} onChange={e => updateLine(i, "debit", e.target.value)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "right" }} />
              <input type="number" value={l.credit || ""} onChange={e => updateLine(i, "credit", e.target.value)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "right" }} />
              <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }}><Trash2 size={14} /></button>
            </div>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ textAlign: "right" }}>PKR {totalDebit.toLocaleString()}</span>
            <span style={{ textAlign: "right" }}>PKR {totalCredit.toLocaleString()}</span>
          </div>

          {!isBalanced && totalDebit > 0 && (
            <div style={{ color: "#EF4444", fontSize: 13, marginTop: 8 }}>⚠️ Difference: PKR {Math.abs(totalDebit - totalCredit).toLocaleString()}</div>
          )}
          {isBalanced && <div style={{ color: "#10B981", fontSize: 13, marginTop: 8 }}>✅ Balanced!</div>}
        </div>

        <button onClick={handleSubmit} disabled={loading || !isBalanced}
          style={{ width: "100%", padding: 14, background: isBalanced ? "#1D4ED8" : "#94A3B8", color: "white", border: "none", borderRadius: 9, fontSize: 15, fontWeight: 600, cursor: isBalanced ? "pointer" : "not-allowed" }}>
          {loading ? "Posting..." : "💾 POST JOURNAL ENTRY"}
        </button>
      </div>
    </div>
  )
}