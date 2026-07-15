"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, DollarSign, X, CheckCircle } from "lucide-react"

export default function InvestorCapitalPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")

  const [allDonors, setAllDonors] = useState<any[]>([])
  const [projectInvestors, setProjectInvestors] = useState<any[]>([])
  const [loadingInvestors, setLoadingInvestors] = useState(false)

  const [banks, setBanks] = useState<any[]>([])

  const [showAddForm, setShowAddForm] = useState(false)
  const [newDonorId, setNewDonorId] = useState<string>("")
  const [newPercentage, setNewPercentage] = useState<number>(0)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState("")

  const [contributingFor, setContributingFor] = useState<any | null>(null)
  const [contribAmount, setContribAmount] = useState<number>(0)
  const [contribDate, setContribDate] = useState(new Date().toISOString().split("T")[0])
  const [contribBankId, setContribBankId] = useState<number | null>(null)
  const [contribReference, setContribReference] = useState("")
  const [contribNotes, setContribNotes] = useState("")
  const [contribSaving, setContribSaving] = useState(false)
  const [contribError, setContribError] = useState("")

  const [flash, setFlash] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      supabase.from("projects").select("id, name").eq("company_id", cid).order("name")
        .then(r => { if (r.data) setProjects(r.data) })

      supabase.from("donors").select("id, name, code").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => { if (r.data) setAllDonors(r.data) })

      supabase.from("bank_accounts").select("id, bank_name, accounts(code)")
        .eq("company_id", cid).order("bank_name")
        .then(r => {
          if (r.data) setBanks(r.data.map((b: any) => ({ id: b.id, name: b.bank_name, glCode: b.accounts?.code })))
        })

      setLoading(false)
    })
  }, [])

  const fetchProjectInvestors = () => {
    if (!selectedProjectId || !companyId) { setProjectInvestors([]); return }
    setLoadingInvestors(true)
    supabase.from("project_investors")
      .select("id, donor_id, profit_share_percentage, capital_contributed, donors(name, code)")
      .eq("project_id", selectedProjectId)
      .eq("company_id", companyId)
      .order("created_at")
      .then(r => {
        setProjectInvestors(r.data || [])
        setLoadingInvestors(false)
      })
  }

  useEffect(() => { fetchProjectInvestors() }, [selectedProjectId, companyId])

  const availableDonors = allDonors.filter(d => !projectInvestors.some(pi => pi.donor_id === d.id))
  const totalPercentage = projectInvestors.reduce((s, pi) => s + (pi.profit_share_percentage || 0), 0)
  const totalCapital = projectInvestors.reduce((s, pi) => s + (pi.capital_contributed || 0), 0)

  const handleAddInvestor = async () => {
    if (!newDonorId || newPercentage <= 0) { setAddError("Select an investor and a valid %"); return }
    setAddSaving(true); setAddError("")
    const { error } = await supabase.from("project_investors").insert({
      company_id: companyId,
      project_id: Number(selectedProjectId),
      donor_id: Number(newDonorId),
      profit_share_percentage: newPercentage,
      capital_contributed: 0,
    })
    if (error) {
      setAddError(error.message)
      setAddSaving(false)
      return
    }
    setFlash("Investor added to this site.")
    setNewDonorId(""); setNewPercentage(0); setShowAddForm(false); setAddSaving(false)
    fetchProjectInvestors()
    setTimeout(() => setFlash(""), 3000)
  }

  const openContributeForm = (pi: any) => {
    setContributingFor(pi)
    setContribAmount(0)
    setContribDate(new Date().toISOString().split("T")[0])
    setContribBankId(null)
    setContribReference("")
    setContribNotes("")
    setContribError("")
  }

  const handleRecordContribution = async () => {
    if (!contributingFor || contribAmount <= 0 || !contribBankId) {
      setContribError("Enter a valid amount and select a bank account")
      return
    }
    setContribSaving(true); setContribError("")
    try {
      const res = await fetch("/api/construction/investors/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: Number(selectedProjectId),
          donor_id: contributingFor.donor_id,
          amount: contribAmount,
          contribution_date: contribDate,
          bank_account_id: contribBankId,
          reference: contribReference,
          notes: contribNotes,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setContribError(data.error || "Failed to record contribution")
        setContribSaving(false)
        return
      }
      setFlash(`Contribution of PKR ${contribAmount.toLocaleString()} recorded.`)
      setContributingFor(null)
      setContribSaving(false)
      fetchProjectInvestors()
      setTimeout(() => setFlash(""), 4000)
    } catch (err: any) {
      setContribError(err.message || "Network error")
      setContribSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading…</div>
  }

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { max-width: 900px; margin: 0 auto; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px; }
        .inv-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; min-width: 0; }
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; }
        .inv-btn:hover { background: var(--card-hover); }
        .inv-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--border); }
        td { padding: 10px 6px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .pct-warn { color: #F59E0B; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: var(--card); border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 440px; }
        .modal-header { padding: 18px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
        .modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
        @media (max-width: 640px) { .inv-row { grid-template-columns: 1fr; } }
      `}</style>

      <div className="inv-shell">
        <div style={{ marginBottom: 16 }}>
          <div className="inv-title">💼 Investor Capital</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Assign investors to a site with a profit-share %, and track capital contributed</div>
        </div>

        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
          </div>
        )}

        <div className="inv-card">
          <label className="inv-label">Site</label>
          <select className="inv-select" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
            <option value="">— Select Site —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {selectedProjectId && (
          <div className="inv-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Investors</h3>
              {availableDonors.length > 0 && (
                <button className="inv-btn" onClick={() => setShowAddForm(v => !v)}><Plus size={14} /> Add Investor</button>
              )}
            </div>

            {showAddForm && (
              <div style={{ background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                {addError && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{addError}</div>}
                <div className="inv-row">
                  <div>
                    <label className="inv-label">Investor</label>
                    <select className="inv-select" value={newDonorId} onChange={e => setNewDonorId(e.target.value)}>
                      <option value="">— Select Investor —</option>
                      {availableDonors.map(d => <option key={d.id} value={d.id}>{d.code ? `${d.code} — ` : ""}{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="inv-label">Profit Share %</label>
                    <input className="inv-input" type="number" min="0" max="100" value={newPercentage || ""} onChange={e => setNewPercentage(Number(e.target.value))} placeholder="e.g. 30" />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="inv-btn inv-btn-primary" onClick={handleAddInvestor} disabled={addSaving}>{addSaving ? "Saving…" : "Save"}</button>
                  <button className="inv-btn" onClick={() => setShowAddForm(false)}>Cancel</button>
                </div>
              </div>
            )}

            {loadingInvestors ? (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
            ) : projectInvestors.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No investors assigned to this site yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th style={{ textAlign: "right" }}>Profit Share</th>
                    <th style={{ textAlign: "right" }}>Capital Contributed</th>
                    <th style={{ textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {projectInvestors.map(pi => (
                    <tr key={pi.id}>
                      <td>{pi.donors?.code ? `${pi.donors.code} — ` : ""}{pi.donors?.name}</td>
                      <td style={{ textAlign: "right" }}>{pi.profit_share_percentage}%</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {(pi.capital_contributed || 0).toLocaleString()}</td>
                      <td style={{ textAlign: "center" }}>
                        <button className="inv-btn" style={{ padding: "6px 10px" }} onClick={() => openContributeForm(pi)}>
                          <DollarSign size={13} /> Contribute
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700 }}>Total</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }} className={totalPercentage > 100 ? "pct-warn" : undefined}>
                      {totalPercentage}%{totalPercentage > 100 && " ⚠️"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>PKR {totalCapital.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
            {totalPercentage > 100 && (
              <p style={{ fontSize: 11, color: "#F59E0B", marginTop: 8 }}>⚠️ Total profit share exceeds 100% — double check these percentages.</p>
            )}
          </div>
        )}
      </div>

      {contributingFor && (
        <div className="modal-overlay" onClick={() => setContributingFor(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Record Contribution — {contributingFor.donors?.name}</h3>
              <button className="inv-btn" style={{ padding: 6, border: "none" }} onClick={() => setContributingFor(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {contribError && <div style={{ color: "#FCA5A5", fontSize: 12 }}>{contribError}</div>}
              <div>
                <label className="inv-label">Amount (PKR) *</label>
                <input className="inv-input" type="number" value={contribAmount || ""} onChange={e => setContribAmount(Number(e.target.value))} placeholder="0" />
              </div>
              <div>
                <label className="inv-label">Date</label>
                <input className="inv-input" type="date" value={contribDate} onChange={e => setContribDate(e.target.value)} />
              </div>
              <div>
                <label className="inv-label">Received Into *</label>
                <select className="inv-select" value={contribBankId ?? ""} onChange={e => setContribBankId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Select Bank —</option>
                  {banks.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="inv-label">Reference</label>
                <input className="inv-input" value={contribReference} onChange={e => setContribReference(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="inv-label">Notes</label>
                <input className="inv-input" value={contribNotes} onChange={e => setContribNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="inv-btn" onClick={() => setContributingFor(null)}>Cancel</button>
              <button className="inv-btn inv-btn-primary" onClick={handleRecordContribution} disabled={contribSaving}>
                {contribSaving ? "Recording…" : "Record Contribution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}