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

  // ── Generate entry number ──
  const generateEntryNo = async (): Promise<string> => {
    const datePrefix = new Date().toISOString().split("T")[0].replace(/-/g, "")

    const { data } = await supabase
      .from("journal_entries")
      .select("entry_no")
      .ilike("entry_no", `JE-${datePrefix}-%`)
      .order("entry_no", { ascending: false })
      .limit(1)

    let maxNum = 0
    if (data && data.length > 0) {
      const match = data[0].entry_no?.match(
        new RegExp(`JE-${datePrefix}-(\\d+)$`)
      )
      if (match) {
        maxNum = parseInt(match[1], 10) || 0
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

      return {
        project_id: proj.id,
        project_name: proj.name,
        donor_id: don.id,
        donor_name: don.name,
      }
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
    let je: any = null
    let headerErr: any = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        entryNo = await generateEntryNo()
      } catch (e: any) {
        setError("Failed to generate entry number. Please try again.")
        setLoading(false)
        return
      }

      const result = await supabase
        .from("journal_entries")
        .insert({
          company_id: companyId,
          entry_no: entryNo,
          date: entryDate,
          description,
        })
        .select("id")
        .single()

      headerErr = result.error
      je = result.data

      if (!headerErr) break

      if (headerErr.message?.includes("duplicate key") && attempt < 2) {
        continue
      }

      setError(headerErr?.message || "Failed to create journal entry")
      setLoading(false)
      return
    }

    if (!je) {
      setError("Failed to create journal entry after multiple attempts.")
      setLoading(false)
      return
    }

    const entryId = je.id

    const validLines = lines.filter(
      (l) => l.account_id && (l.debit > 0 || l.credit > 0)
    )
    if (validLines.length === 0) {
      await supabase.from("journal_entries").delete().eq("id", entryId)
      setError("At least one line with an account and amount is required")
      setLoading(false)
      return
    }

    const { error: linesErr } = await supabase.from("journal_lines").insert(
      validLines.map((l) => ({
        company_id: companyId,
        entry_id: entryId,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        narration: l.narration || null,
        location_id: l.location_id || null,
        activity_id: l.activity_id || null,
        project_id: l.project_id || null,
        donor_id: l.donor_id || null,
        source_type: "manual_journal",
        source_id: entryId,
      }))
    )
    if (linesErr) {
      await supabase.from("journal_entries").delete().eq("id", entryId)
      setError("Failed to save lines: " + linesErr.message)
      setLoading(false)
      return
    }

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
          if (updateErr)
            throw new Error(`Balance update failed: ${updateErr.message}`)
        }
      }
    } catch (balErr: any) {
      await supabase.from("journal_lines").delete().eq("entry_id", entryId)
      await supabase.from("journal_entries").delete().eq("id", entryId)
      setError("Error updating accounts, rolled back: " + balErr.message)
      setLoading(false)
      return
    }

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
          source_type: "manual_journal",
          source_id: entryId,
        })),
      },
      changed_by: user?.id || null,
      changed_at: new Date().toISOString(),
    }
    await supabase.from("data_change_logs").insert(auditPayload)

    setFlash(`✅ Journal Entry ${entryNo} posted!`)
    setTimeout(() => router.push("/dashboard/journal"), 1500)
    setLoading(false)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .form-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 24px; margin-bottom: 16px;
        }
        .label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text);
        }
        .input:focus, .select:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
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

        .lines-header {
          display: grid;
          grid-template-columns: 1fr 90px 90px 1fr 110px 110px 40px;
          gap: 8px; font-size: 10px; font-weight: 700; color: var(--text-muted);
          padding-bottom: 8px; align-items: end;
        }
        .line-row {
          display: grid;
          grid-template-columns: 1fr 90px 90px 1fr 110px 110px 40px;
          gap: 8px; align-items: start; margin-bottom: 8px;
        }

        @media (max-width: 900px) {
          .lines-header, .line-row {
            grid-template-columns: 1fr 70px 70px 1fr 90px 90px 35px;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/journal")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📓 New Journal Entry</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Debits must equal Credits</p>
          </div>
        </div>

        {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        {/* Header card */}
        <div className="form-card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label className="label">Entry No</label>
              <input className="input" value="Auto‑generated" disabled />
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Office rent" />
            </div>
          </div>
        </div>

        {/* Lines card */}
        <div className="form-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Journal Lines</span>
            <button className="btn btn-outline" onClick={addLine} style={{ padding: "6px 12px", fontSize: 12 }}><Plus size={14} /> Add Line</button>
          </div>

          <div className="lines-header">
            <span>Account</span>
            <span style={{ textAlign: "right" }}>Debit</span>
            <span style={{ textAlign: "right" }}>Credit</span>
            <span>Narration</span>
            <span>Location</span>
            <span>Activity</span>
            <span></span>
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div className="line-row">
                <select
                  className="select"
                  value={l.account_id || ""}
                  onChange={(e) => updateLine(i, "account_id", e.target.value)}
                >
                  <option value="">Select account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  value={l.debit || ""}
                  onChange={(e) => updateLine(i, "debit", e.target.value)}
                  style={{ textAlign: "right" }}
                />
                <input
                  className="input"
                  type="number"
                  value={l.credit || ""}
                  onChange={(e) => updateLine(i, "credit", e.target.value)}
                  style={{ textAlign: "right" }}
                />
                <input
                  className="input"
                  type="text"
                  value={l.narration || ""}
                  onChange={(e) => updateLine(i, "narration", e.target.value)}
                  placeholder="Line narration"
                />
                <select
                  className="select"
                  value={l.location_id || ""}
                  onChange={(e) => updateLine(i, "location_id", e.target.value ? Number(e.target.value) : null)}
                  style={{ fontSize: 11 }}
                >
                  <option value="">—</option>
                  {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
                <select
                  className="select"
                  value={l.activity_id || ""}
                  onChange={(e) => updateLine(i, "activity_id", e.target.value ? Number(e.target.value) : null)}
                  style={{ fontSize: 11 }}
                >
                  <option value="">—</option>
                  {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", height: 38 }}>
                  <Trash2 size={14} />
                </button>
              </div>
              {l.activity_id && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 16, paddingLeft: 8, marginTop: 2 }}>
                  <span>Project: <strong>{l.project_name || "—"}</strong></span>
                  <span>Donor: <strong>{l.donor_name || "—"}</strong></span>
                </div>
              )}
            </div>
          ))}

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px 90px 1fr 110px 110px 40px",
            gap: 8, marginTop: 12, paddingTop: 12, borderTop: "2px solid var(--border)",
            fontWeight: 700, fontSize: 14
          }}>
            <span>Total</span>
            <span style={{ textAlign: "right" }}>PKR {totalDebit.toLocaleString()}</span>
            <span style={{ textAlign: "right" }}>PKR {totalCredit.toLocaleString()}</span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>

          {!isBalanced && totalDebit > 0 && (
            <div style={{ color: "#EF4444", fontSize: 13, marginTop: 8 }}>
              ⚠️ Difference: PKR {Math.abs(totalDebit - totalCredit).toLocaleString()}
            </div>
          )}
          {isBalanced && (
            <div style={{ color: "#10B981", fontSize: 13, marginTop: 8 }}>✅ Balanced!</div>
          )}
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: 14 }}
          onClick={handleSubmit}
          disabled={loading || !isBalanced}
        >
          {loading ? "Posting..." : "💾 POST JOURNAL ENTRY"}
        </button>
      </div>
    </div>
  )
}