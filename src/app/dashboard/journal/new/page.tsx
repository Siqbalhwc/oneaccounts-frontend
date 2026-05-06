"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, CheckCircle } from "lucide-react"

export default function NewJournalPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [companyId, setCompanyId] = useState<string>("")

  const [entryNo, setEntryNo] = useState("")
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")

  // Each line now has optional project_id, location_id, activity_id
  const [lines, setLines] = useState<any[]>([
    { account_id: null, debit: 0, credit: 0, project_id: null, location_id: null, activity_id: null },
    { account_id: null, debit: 0, credit: 0, project_id: null, location_id: null, activity_id: null },
  ])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // ── Load accounts, lookup lists, and next entry number ─────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      supabase.from("accounts").select("id,code,name,type,default_project_id,default_location_id,default_activity_id")
        .eq("company_id", cid).order("code")
        .then(r => r.data && setAccounts(r.data))

      supabase.from("projects").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("locations").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
      supabase.from("activities").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setActivities(r.data))
    })

    supabase.from("journal_entries").select("entry_no").order("entry_no", { ascending: false }).limit(1).then(r => {
      if (r.data && r.data.length > 0) {
        const parts = r.data[0].entry_no.split("-")
        const num = parseInt(parts[parts.length - 1]) || 0
        setEntryNo(`JE-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${String(num + 1).padStart(3, "0")}`)
      } else setEntryNo(`JE-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-001`)
    })
  }, [])

  const addLine = () => setLines([...lines, { account_id: null, debit: 0, credit: 0, project_id: null, location_id: null, activity_id: null }])
  const removeLine = (i: number) => lines.length > 2 && setLines(lines.filter((_, idx) => idx !== i))

  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lines]
    updated[i] = { ...updated[i], [field]: field === "debit" || field === "credit" ? Number(value) : value }

    // If account changed, auto‑fill its default tags
    if (field === "account_id" && value) {
      const acc = accounts.find(a => a.id == value)
      if (acc) {
        updated[i].project_id = acc.default_project_id || null
        updated[i].location_id = acc.default_location_id || null
        updated[i].activity_id = acc.default_activity_id || null
      }
    }

    // Debit / Credit mutual exclusion
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
      company_id: companyId,
      entry_no: entryNo, date: entryDate, description
    }).select("id").single()

    if (je) {
      const validLines = lines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0))
      await supabase.from("journal_lines").insert(
        validLines.map(l => ({
          company_id: companyId,
          entry_id: je.id,
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          project_id: l.project_id || null,
          location_id: l.location_id || null,
          activity_id: l.activity_id || null,
        }))
      )

      // Update account balances (scoped to company)
      for (const l of validLines) {
        const { data: acc } = await supabase.from("accounts")
          .select("balance").eq("id", l.account_id).eq("company_id", companyId).single()
        if (acc) {
          const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
          await supabase.from("accounts").update({ balance: newBal }).eq("id", l.account_id).eq("company_id", companyId)
        }
      }

      setFlash(`✅ Journal Entry ${entryNo} posted!`)
      setTimeout(() => router.push("/dashboard/journal"), 1500)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
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
        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        {/* Header fields */}
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

        {/* Journal Lines */}
        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Journal Lines</span>
            <button onClick={addLine}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              <Plus size={14} /> Add Line
            </button>
          </div>

          {/* Column header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px 100px 100px 40px", gap: 8, fontSize: 10, fontWeight: 700, color: "#94A3B8", padding: "0 0 8px" }}>
            <span>Account</span><span style={{ textAlign: "right" }}>Debit</span><span style={{ textAlign: "right" }}>Credit</span>
            <span>Project</span><span>Location</span><span>Activity</span>
            <span></span>
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px 100px 100px 40px", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <select value={l.account_id || ""} onChange={e => updateLine(i, "account_id", e.target.value)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12 }}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
              <input type="number" value={l.debit || ""} onChange={e => updateLine(i, "debit", e.target.value)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "right" }} />
              <input type="number" value={l.credit || ""} onChange={e => updateLine(i, "credit", e.target.value)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "right" }} />
              <select value={l.project_id || ""} onChange={e => updateLine(i, "project_id", e.target.value ? Number(e.target.value) : null)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 4px", fontSize: 11 }}>
                <option value="">—</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={l.location_id || ""} onChange={e => updateLine(i, "location_id", e.target.value ? Number(e.target.value) : null)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 4px", fontSize: 11 }}>
                <option value="">—</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
              <select value={l.activity_id || ""} onChange={e => updateLine(i, "activity_id", e.target.value ? Number(e.target.value) : null)}
                style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 4px", fontSize: 11 }}>
                <option value="">—</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Totals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
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