"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Trash2, CheckCircle } from "lucide-react"

export default function NewJournalPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [accounts, setAccounts] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [companyId, setCompanyId] = useState<string>("")

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")

  const [lines, setLines] = useState<any[]>([
    {
      account_id: null,
      debit: 0,
      credit: 0,
      narration: "",
      location_id: null,
      activity_id: null,
      project_id: null,
      project_name: "",
      donor_id: null,
      donor_name: "",
    },
    {
      account_id: null,
      debit: 0,
      credit: 0,
      narration: "",
      location_id: null,
      activity_id: null,
      project_id: null,
      project_name: "",
      donor_id: null,
      donor_name: "",
    },
  ])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // ── Load master data ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid =
        (user?.app_metadata as any)?.company_id ||
        "00000000-0000-0000-0000-000000000001"
      setCompanyId(cid)

      supabase
        .from("accounts")
        .select("id,code,name,type,default_location_id,default_activity_id")
        .eq("company_id", cid)
        .order("code")
        .then((r) => r.data && setAccounts(r.data))

      supabase
        .from("locations")
        .select("id,name")
        .eq("company_id", cid)
        .order("name")
        .then((r) => r.data && setLocations(r.data))
      supabase
        .from("activities")
        .select("id,name")
        .eq("company_id", cid)
        .order("name")
        .then((r) => r.data && setActivities(r.data))
    })
  }, [])

  // ── Generate a unique entry number ──
  const generateEntryNo = async (): Promise<string> => {
    const datePrefix = new Date().toISOString().split("T")[0].replace(/-/g, "")
    const { data } = await supabase
      .from("journal_entries")
      .select("entry_no")
      .order("entry_no", { ascending: false })
      .limit(5)

    let maxNum = 0
    if (data) {
      for (const row of data) {
        const match = row.entry_no?.match(new RegExp(`JE-${datePrefix}-(\\d+)`))
        if (match) {
          const num = parseInt(match[1], 10)
          if (!isNaN(num) && num > maxNum) maxNum = num
        }
      }
    }
    const nextNum = maxNum + 1
    return `JE-${datePrefix}-${String(nextNum).padStart(3, "0")}`
  }

  const addLine = () =>
    setLines([
      ...lines,
      {
        account_id: null,
        debit: 0,
        credit: 0,
        narration: "",
        location_id: null,
        activity_id: null,
        project_id: null,
        project_name: "",
        donor_id: null,
        donor_name: "",
      },
    ])

  const removeLine = (i: number) =>
    lines.length > 2 && setLines(lines.filter((_, idx) => idx !== i))

  // ── Fetch project & donor when activity changes ──
  const fetchActivityDetails = async (activityId: number) => {
    try {
      const { data: actData } = await supabase
        .from("activities")
        .select("project_id, projects(name)")
        .eq("id", activityId)
        .single()
      const proj = {
        id: actData?.project_id ?? null,
        name: (actData?.projects as any)?.name || "",
      }

      const { data: donorData } = await supabase
        .from("budgets")
        .select("donor_id, donors(name)")
        .eq("company_id", companyId)
        .eq("activity_id", activityId)
        .eq("fiscal_year", new Date().getFullYear())
        .is("month", null)
        .order("budgeted_amount", { ascending: false })
        .limit(1)
      const don = {
        id: donorData?.[0]?.donor_id ?? null,
        name: (donorData?.[0]?.donors as any)?.name || "",
      }

      return { project_id: proj.id, project_name: proj.name, donor_id: don.id, donor_name: don.name }
    } catch {
      return { project_id: null, project_name: "", donor_id: null, donor_name: "" }
    }
  }

  const updateLine = async (i: number, field: string, value: any) => {
    const updated = [...lines]
    updated[i] = {
      ...updated[i],
      [field]: field === "debit" || field === "credit" ? Number(value) : value,
    }

    if (field === "account_id" && value) {
      const acc = accounts.find((a) => a.id == value)
      if (acc) {
        updated[i].location_id = acc.default_location_id || null
        updated[i].activity_id = acc.default_activity_id || null
      }
    }

    if (field === "activity_id" && value) {
      const { project_id, project_name, donor_id, donor_name } =
        await fetchActivityDetails(Number(value))
      updated[i].project_id = project_id
      updated[i].project_name = project_name
      updated[i].donor_id = donor_id
      updated[i].donor_name = donor_name
    }

    if (field === "debit" && updated[i].debit > 0) updated[i].credit = 0
    if (field === "credit" && updated[i].credit > 0) updated[i].debit = 0

    setLines(updated)
  }

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const handleSubmit = async () => {
    if (!isBalanced) {
      setError("Debits must equal Credits")
      return
    }
    if (!companyId) {
      setError("Company not found. Please reload.")
      return
    }

    setLoading(true)
    setError("")

    let entryNo = ""
    try {
      entryNo = await generateEntryNo()
    } catch (e: any) {
      setError("Failed to generate entry number. Please try again.")
      setLoading(false)
      return
    }

    // 1. Insert the header
    const { data: je, error: headerErr } = await supabase
      .from("journal_entries")
      .insert({
        company_id: companyId,
        entry_no: entryNo,
        date: entryDate,
        description,
      })
      .select("id")
      .single()

    if (headerErr || !je) {
      setError(headerErr?.message || "Failed to create journal entry")
      setLoading(false)
      return
    }
    const entryId = je.id

    // 2. Prepare valid lines
    const validLines = lines.filter(
      (l) => l.account_id && (l.debit > 0 || l.credit > 0)
    )
    if (validLines.length === 0) {
      await supabase.from("journal_entries").delete().eq("id", entryId)
      setError("At least one line with an account and amount is required")
      setLoading(false)
      return
    }

    // 3. Insert lines (using "narration" column, and including donor_id)
    const { error: linesErr } = await supabase.from("journal_lines").insert(
      validLines.map((l) => ({
        company_id: companyId,
        entry_id: entryId,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        narration: l.narration || null,          // ✅ correct column
        location_id: l.location_id || null,
        activity_id: l.activity_id || null,
        project_id: l.project_id || null,
        donor_id: l.donor_id || null,           // ✅ new
      }))
    )
    if (linesErr) {
      await supabase.from("journal_entries").delete().eq("id", entryId)
      setError("Failed to save lines: " + linesErr.message)
      setLoading(false)
      return
    }

    // 4. Update account balances (with full rollback)
    try {
      for (const l of validLines) {
        const { data: acc, error: accErr } = await supabase
          .from("accounts")
          .select("balance")
          .eq("id", l.account_id)
          .eq("company_id", companyId)
          .single()
        if (accErr) throw new Error(`Account not found: ${l.account_id}`)
        if (acc) {
          const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
          const { error: updateErr } = await supabase
            .from("accounts")
            .update({ balance: newBal })
            .eq("id", l.account_id)
            .eq("company_id", companyId)
          if (updateErr) throw new Error(`Balance update failed: ${updateErr.message}`)
        }
      }
    } catch (balErr: any) {
      // Rollback everything on failure
      await supabase.from("journal_lines").delete().eq("entry_id", entryId)
      await supabase.from("journal_entries").delete().eq("id", entryId)
      setError("Error updating accounts, rolled back: " + balErr.message)
      setLoading(false)
      return
    }

    // 5. Audit log – insert directly into data_change_logs (browser client)
    const { data: { user } } = await supabase.auth.getUser()
    const auditPayload = {
      table_name: "journal_entries",
      record_id: String(entryId),
      action: "INSERT",
      old_data: null,
      new_data: {
        id: entryId,
        company_id: companyId,
        entry_no: entryNo,
        date: entryDate,
        description,
        lines: validLines.map((l) => ({
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          narration: l.narration,
          location_id: l.location_id,
          activity_id: l.activity_id,
          project_id: l.project_id,
          donor_id: l.donor_id,
        })),
      },
      changed_by: user?.id || null,
      changed_at: new Date().toISOString(),
    }
    await supabase.from("data_change_logs").insert(auditPayload)

    // 6. Success
    setFlash(`✅ Journal Entry ${entryNo} posted!`)
    setTimeout(() => router.push("/dashboard/journal"), 1500)
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => router.push("/dashboard/journal")}
            style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📓 New Journal Entry</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Debits must equal Credits</p>
          </div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: 12, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {flash && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        {/* Header card */}
        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Entry No</label>
              <input value="Auto‑generated" disabled style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "#F8FAFC", color: "#94A3B8", cursor: "not-allowed" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Date *</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Office rent" style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }} />
            </div>
          </div>
        </div>

        {/* Lines card */}
        <div style={{ background: "white", borderRadius: 12, padding: 24, border: "1px solid #E2E8F0", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Journal Lines</span>
            <button onClick={addLine} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              <Plus size={14} /> Add Line
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 1fr 110px 110px 40px", gap: 8, fontSize: 10, fontWeight: 700, color: "#94A3B8", padding: "0 0 8px", alignItems: "end" }}>
            <span>Account</span>
            <span style={{ textAlign: "right", paddingRight: 8 }}>Debit</span>
            <span style={{ textAlign: "right", paddingRight: 8 }}>Credit</span>
            <span>Narration</span>
            <span>Location</span>
            <span>Activity</span>
            <span></span>
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 1fr 110px 110px 40px", gap: 8, alignItems: "start" }}>
                <select value={l.account_id || ""} onChange={e => updateLine(i, "account_id", e.target.value)} style={{ height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, width: "100%" }}>
                  <option value="">Select account...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                </select>
                <input type="number" value={l.debit || ""} onChange={e => updateLine(i, "debit", e.target.value)} style={{ width: "100%", height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "right" }} />
                <input type="number" value={l.credit || ""} onChange={e => updateLine(i, "credit", e.target.value)} style={{ width: "100%", height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12, textAlign: "right" }} />
                <input type="text" value={l.narration || ""} onChange={e => updateLine(i, "narration", e.target.value)} placeholder="Line narration" style={{ width: "100%", height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 8px", fontSize: 12 }} />
                <select value={l.location_id || ""} onChange={e => updateLine(i, "location_id", e.target.value ? Number(e.target.value) : null)} style={{ width: "100%", height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 4px", fontSize: 11 }}>
                  <option value="">—</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
                <select value={l.activity_id || ""} onChange={e => updateLine(i, "activity_id", e.target.value ? Number(e.target.value) : null)} style={{ width: "100%", height: 38, border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "0 4px", fontSize: 11 }}>
                  <option value="">—</option>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", height: 38 }}><Trash2 size={14} /></button>
              </div>
              {l.activity_id && (
                <div style={{ fontSize: 11, color: "#64748B", display: "flex", gap: 16, paddingLeft: 8, marginTop: 2 }}>
                  <span>Project: <strong>{l.project_name || "—"}</strong></span>
                  <span>Donor: <strong>{l.donor_name || "—"}</strong></span>
                </div>
              )}
            </div>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 1fr 110px 110px 40px", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "2px solid #E2E8F0", fontWeight: 700, fontSize: 14 }}>
            <span>Total</span>
            <span style={{ textAlign: "right", paddingRight: 8 }}>PKR {totalDebit.toLocaleString()}</span>
            <span style={{ textAlign: "right", paddingRight: 8 }}>PKR {totalCredit.toLocaleString()}</span>
            <span></span><span></span><span></span><span></span>
          </div>

          {!isBalanced && totalDebit > 0 && (
            <div style={{ color: "#EF4444", fontSize: 13, marginTop: 8 }}>⚠️ Difference: PKR {Math.abs(totalDebit - totalCredit).toLocaleString()}</div>
          )}
          {isBalanced && <div style={{ color: "#10B981", fontSize: 13, marginTop: 8 }}>✅ Balanced!</div>}
        </div>

        <button onClick={handleSubmit} disabled={loading || !isBalanced} style={{ width: "100%", padding: 14, background: isBalanced ? "#1D4ED8" : "#94A3B8", color: "white", border: "none", borderRadius: 9, fontSize: 15, fontWeight: 600, cursor: isBalanced ? "pointer" : "not-allowed" }}>
          {loading ? "Posting..." : "💾 POST JOURNAL ENTRY"}
        </button>
      </div>
    </div>
  )
}