"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Pencil, Search, CheckCircle, X } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

export default function SalaryAdvancesPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [advances, setAdvances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [formEmployeeId, setFormEmployeeId] = useState<number | null>(null)
  const [formAdvance, setFormAdvance] = useState("")
  const [formRecovery, setFormRecovery] = useState("")
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split("T")[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("employees")
          .select("id, employee_code, full_name")
          .eq("company_id", cid)
          .eq("status", "active")
          .order("full_name")
          .then(({ data }) => setEmployees(data || []))
      }
    })
  }, [])

  const fetchAdvances = () => {
    if (!companyId) return
    setLoading(true)
    let query = supabase
      .from("salary_advances")
      .select("*, employees!inner(full_name, employee_code)")
      .order("created_at", { ascending: false })
    if (filter !== "all") query = query.eq("status", filter)
    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((a: any) =>
          a.employees?.full_name?.toLowerCase().includes(q) ||
          a.employees?.employee_code?.toLowerCase().includes(q)
        )
      }
      setAdvances(filtered)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchAdvances()
  }, [role, canView, companyId, filter, search])

  const openNewForm = () => {
    setEditingId(null)
    setFormEmployeeId(null)
    setFormAdvance("")
    setFormRecovery("")
    setFormStartDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
    setError("")
    setFlash("")
  }

  const openEditForm = (adv: any) => {
    setEditingId(adv.id)
    setFormEmployeeId(adv.employee_id)
    setFormAdvance(String(adv.advance_amount))
    setFormRecovery(String(adv.monthly_recovery))
    setFormStartDate(adv.start_date)
    setShowForm(true)
    setError("")
    setFlash("")
  }

  const handleSave = async () => {
    if (!formEmployeeId) { setError("Select an employee"); return }
    if (!formAdvance || isNaN(Number(formAdvance))) { setError("Valid advance amount is required"); return }
    if (!formRecovery || isNaN(Number(formRecovery))) { setError("Valid monthly recovery is required"); return }

    setSaving(true)
    setError("")
    const { data: { user } } = await supabase.auth.getUser()

    if (editingId) {
      const { error: updateErr } = await supabase
        .from("salary_advances")
        .update({
          advance_amount: Number(formAdvance),
          monthly_recovery: Number(formRecovery),
          start_date: formStartDate,
          balance: Number(formAdvance),
        })
        .eq("id", editingId)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      setFlash("✅ Advance updated")
    } else {
      const { error: insertErr } = await supabase
        .from("salary_advances")
        .insert({
          employee_id: formEmployeeId,
          advance_amount: Number(formAdvance),
          monthly_recovery: Number(formRecovery),
          balance: Number(formAdvance),
          start_date: formStartDate,
          status: "active",
          created_by: user?.id,
        })
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      setFlash("✅ Advance created")
    }

    setSaving(false)
    setShowForm(false)
    fetchAdvances()
  }

  const handleClose = async (id: number) => {
    if (!confirm("Mark this advance as closed?")) return
    await supabase.from("salary_advances").update({ status: "closed" }).eq("id", id)
    fetchAdvances()
    setFlash("✅ Advance closed")
  }

  if (planLoading || loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #1740C8 0%, #071352 100%); color: white; border: none; transition: all 0.2s; }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-icon { background: transparent; border: 1.5px solid var(--border); color: var(--text-muted); padding: 5px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; line-height: 1; }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input, .select, .input { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; font-family: inherit; background: var(--bg); color: var(--text); outline: none; }
        .search-input:focus, .select:focus, .input:focus { border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table tr:hover td { background: var(--card-hover); }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .modal-panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; width: 90%; max-width: 480px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); max-height: 80vh; overflow-y: auto; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💸 Salary Advances</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Manage salary advances and monthly recovery" : "View salary advances"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={openNewForm}>
            <Plus size={16} /> New Advance
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <select className="select" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 120 }}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Advance</th>
              <th>Recovery</th>
              <th>Balance</th>
              <th>Start Date</th>
              <th>Status</th>
              {canEdit && <th style={{ textAlign: "center", width: 100 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: "center", padding: 20 }}>Loading…</td></tr>
            ) : advances.length === 0 ? (
              <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No advances found.</td></tr>
            ) : (
              advances.map(adv => (
                <tr key={adv.id}>
                  <td style={{ fontWeight: 600 }}>{adv.employees?.full_name}<br /><span style={{ fontSize: 10, color: "var(--text-muted)" }}>{adv.employees?.employee_code}</span></td>
                  <td>PKR {Number(adv.advance_amount).toLocaleString()}</td>
                  <td>PKR {Number(adv.monthly_recovery).toLocaleString()}</td>
                  <td>PKR {Number(adv.balance).toLocaleString()}</td>
                  <td>{adv.start_date}</td>
                  <td>
                    <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: 10, fontWeight: 600, background: adv.status === "active" ? "#F59E0B" : "#6B7280", color: "#E2E8F0" }}>
                      {adv.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn-icon" onClick={() => openEditForm(adv)} title="Edit"><Pencil size={13} /></button>
                        {adv.status === "active" && (
                          <button className="btn-icon" style={{ color: "#10B981" }} onClick={() => handleClose(adv.id)} title="Close"><CheckCircle size={13} /></button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-panel">
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>{editingId ? "Edit Advance" : "New Advance"}</h2>

            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Employee *</label>
              <select className="select" value={formEmployeeId ?? ""} onChange={e => setFormEmployeeId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select employee…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.full_name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Advance Amount *</label>
              <input type="number" className="input" value={formAdvance} onChange={e => setFormAdvance(e.target.value)} placeholder="e.g. 25000" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Monthly Recovery *</label>
              <input type="number" className="input" value={formRecovery} onChange={e => setFormRecovery(e.target.value)} placeholder="e.g. 2500" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label" style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Start Date *</label>
              <input type="date" className="input" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn-icon" style={{ padding: "8px 16px", border: "1.5px solid var(--border)", color: "var(--text-muted)" }} onClick={() => setShowForm(false)}><X size={16} /> Cancel</button>
              <button className="btn" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : <><CheckCircle size={16} /> Save</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}