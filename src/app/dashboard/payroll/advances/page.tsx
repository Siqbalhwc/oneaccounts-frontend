"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Plus, Search, X, Check, Eye, RotateCcw,
  TrendingUp, DollarSign, Calculator, Wallet,
  MoreVertical, Edit, XCircle
} from "lucide-react"
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
  const [statusFilter, setStatusFilter] = useState("all")

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<any>(null)
  const [deductionHistory, setDeductionHistory] = useState<any[]>([])

  // Form modal
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

  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)

  // Fetch employees and advances
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch employees without join
        supabase
          .from("employees")
          .select("id, employee_code, full_name, department_id, departments(name)")
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
      .select("*, employees!inner(full_name, employee_code, department_id, departments(name))")
      .order("created_at", { ascending: false })
    if (statusFilter !== "all") query = query.eq("status", statusFilter)
    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((adv: any) => {
          const emp = adv.employees
          return emp?.full_name?.toLowerCase().includes(q) || emp?.employee_code?.toLowerCase().includes(q)
        })
      }
      setAdvances(filtered)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchAdvances()
  }, [role, canView, companyId, statusFilter, search])

  // KPIs
  const activeAdvances = advances.filter(a => a.status === "active")
  const totalOutstanding = activeAdvances.reduce((s, a) => s + Number(a.balance || 0), 0)
  const totalMonthlyRecovery = activeAdvances.reduce((s, a) => s + Number(a.monthly_recovery || 0), 0)
  const recoveredThisMonth = 0 // placeholder; could compute from deduction history

  // Helpers
  const getAdvanceNumber = (id: number) => `ADV-${String(id).padStart(4, "0")}`
  const getRecovered = (adv: any) => Number(adv.advance_amount || 0) - Number(adv.balance || 0)
  const getProgressPercent = (adv: any) => {
    const amount = Number(adv.advance_amount || 0)
    if (amount === 0) return 0
    return Math.min(100, Math.round((getRecovered(adv) / amount) * 100))
  }
  const getRemainingMonths = (adv: any) => {
    const recovery = Number(adv.monthly_recovery || 0)
    if (recovery <= 0) return "—"
    const remaining = Math.ceil(Number(adv.balance || 0) / recovery)
    return `${remaining} month${remaining !== 1 ? "s" : ""}`
  }

  const openDrawer = async (adv: any) => {
    setDrawerRecord(adv)
    supabase
      .from("payroll_run_line_components")
      .select("amount, payroll_run_lines!inner(payroll_run_id, payroll_runs!inner(month))")
      .eq("source_type", "advance")
      .eq("source_id", adv.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const history = data ? data.map((d: any) => {
          const runLine = Array.isArray(d.payroll_run_lines) ? d.payroll_run_lines[0] : d.payroll_run_lines
          const run = Array.isArray(runLine?.payroll_runs) ? runLine.payroll_runs[0] : runLine?.payroll_runs
          return { month: run?.month || "N/A", amount: d.amount }
        }) : []
        setDeductionHistory(history)
      })
    setDrawerOpen(true)
  }

  const openNewForm = () => {
    setEditingId(null)
    setFormEmployeeId(null)
    setFormAdvance("")
    setFormRecovery("")
    setFormStartDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
    setError("")
  }

  const openEditForm = (adv: any) => {
    setEditingId(adv.id)
    setFormEmployeeId(adv.employee_id)
    setFormAdvance(String(adv.advance_amount))
    setFormRecovery(String(adv.monthly_recovery))
    setFormStartDate(adv.start_date)
    setShowForm(true)
    setError("")
  }

  const handleSave = async () => {
    if (!formEmployeeId) { setError("Select an employee"); return }
    if (!formAdvance || isNaN(Number(formAdvance))) { setError("Valid advance amount required"); return }
    if (!formRecovery || isNaN(Number(formRecovery))) { setError("Valid monthly recovery required"); return }

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
      setFlash("Advance updated")
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
      setFlash("Advance created")
    }

    setSaving(false)
    setShowForm(false)
    fetchAdvances()
  }

  const handleClose = async (id: number) => {
    if (!confirm("Close this advance? The remaining balance will be written off.")) return
    await supabase.from("salary_advances").update({ status: "closed" }).eq("id", id)
    fetchAdvances()
    setFlash("Advance closed")
    setMenuOpenId(null)
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
    <div style={{ padding: "24px 32px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", position: "relative" }}>
      <style>{`
        .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; }
        .kpi-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .kpi-value { font-size: 28px; font-weight: 800; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .progress-bar { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
        .btn { padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); transition: all 0.2s; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-success { background: #10B981; color: white; border-color: #10B981; }
        .btn-danger { background: #EF4444; color: white; border-color: #EF4444; }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .menu-popup { position: absolute; right: 0; top: 100%; background: var(--card); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10; min-width: 140px; }
        .menu-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; font-size: 13px; transition: background 0.15s; }
        .menu-item:hover { background: var(--card-hover); }
        .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000; display: flex; justify-content: flex-end; }
        .drawer-panel { background: var(--card); width: 420px; max-width: 90vw; height: 100%; overflow-y: auto; padding: 24px; border-left: 1px solid var(--border); box-shadow: -4px 0 20px rgba(0,0,0,0.1); animation: slideIn 0.2s ease-out; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .modal-panel { background: var(--card); border-radius: 12px; padding: 24px; width: 560px; max-width: 90vw; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .input, .select { width: 100%; height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; font-family: inherit; }
        .input:focus, .select:focus { border-color: var(--primary); }
        .filter-input { height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--card); color: var(--text); outline: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Wallet size={24} style={{ color: "var(--primary)" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Salary Advances</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Manage salary advances and their payroll recovery
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNewForm}>
            <Plus size={16} /> New Advance
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{flash}</div>}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Active Advances</div>
          <div className="kpi-value">{activeAdvances.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><DollarSign size={12} /> Outstanding</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>PKR {totalOutstanding.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Calculator size={12} /> Monthly Recovery</div>
          <div className="kpi-value" style={{ color: "#1D4ED8" }}>PKR {totalMonthlyRecovery.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><TrendingUp size={12} /> Recovered This Month</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>PKR {recoveredThisMonth.toLocaleString()}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="filter-input" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: "100%" }} />
        </div>
        <select className="filter-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 140 }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
        <button className="btn btn-outline" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Advance #</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Employee</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Advance</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Recovered</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Balance</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Monthly Recovery</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Remaining</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Status</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</td></tr>
            ) : advances.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 16, marginBottom: 8 }}>No advances found</div>
                  {canEdit && <button className="btn btn-primary" onClick={openNewForm}><Plus size={16} /> Create first advance</button>}
                </td>
              </tr>
            ) : (
              advances.map(adv => {
                const emp = adv.employees
                const recovered = getRecovered(adv)
                const progress = getProgressPercent(adv)
                const remainingMonths = getRemainingMonths(adv)
                return (
                  <tr key={adv.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--card-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => openDrawer(adv)}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--primary)" }}>{getAdvanceNumber(adv.id)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{emp?.full_name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{emp?.employee_code} · {emp?.departments?.name || "—"}</div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600 }}>PKR {Number(adv.advance_amount).toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, color: "#10B981" }}>PKR {recovered.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ fontWeight: 600 }}>PKR {Number(adv.balance).toLocaleString()}</div>
                      <div className="progress-bar" style={{ marginTop: 4, width: 80, margin: "4px auto" }}>
                        <div className="progress-fill" style={{ width: `${progress}%`, background: progress > 80 ? "#10B981" : progress > 40 ? "#F59E0B" : "#EF4444" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{progress}%</div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600 }}>PKR {Number(adv.monthly_recovery).toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13 }}>{remainingMonths}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span className="badge" style={{ background: adv.status === "active" ? "#DCFCE7" : "#F3F4F6", color: adv.status === "active" ? "#166534" : "#6B7280" }}>
                        {adv.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", position: "relative" }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => setMenuOpenId(menuOpenId === adv.id ? null : adv.id)}>
                        <MoreVertical size={14} />
                      </button>
                      {menuOpenId === adv.id && (
                        <div className="menu-popup" style={{ right: 0 }}>
                          <div className="menu-item" onClick={() => { setMenuOpenId(null); openDrawer(adv); }}>
                            <Eye size={14} /> View Details
                          </div>
                          <div className="menu-item" onClick={() => { setMenuOpenId(null); openEditForm(adv); }}>
                            <Edit size={14} /> Edit
                          </div>
                          {adv.status === "active" && (
                            <div className="menu-item" onClick={() => handleClose(adv.id)} style={{ color: "#EF4444" }}>
                              <XCircle size={14} /> Close
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {drawerOpen && drawerRecord && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Advance Details</h2>
              <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => setDrawerOpen(false)}><X size={16} /></button>
            </div>

            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{drawerRecord.employees?.full_name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              {drawerRecord.employees?.employee_code} · {drawerRecord.employees?.departments?.name || "—"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><div className="kpi-label">Advance #</div><div>{getAdvanceNumber(drawerRecord.id)}</div></div>
              <div><div className="kpi-label">Status</div><span className="badge" style={{ background: drawerRecord.status === "active" ? "#DCFCE7" : "#F3F4F6", color: drawerRecord.status === "active" ? "#166534" : "#6B7280" }}>{drawerRecord.status}</span></div>
              <div><div className="kpi-label">Advance Amount</div><div>PKR {Number(drawerRecord.advance_amount).toLocaleString()}</div></div>
              <div><div className="kpi-label">Recovered</div><div style={{ color: "#10B981" }}>PKR {getRecovered(drawerRecord).toLocaleString()}</div></div>
              <div><div className="kpi-label">Balance</div><div style={{ fontWeight: 600 }}>PKR {Number(drawerRecord.balance).toLocaleString()}</div></div>
              <div><div className="kpi-label">Monthly Recovery</div><div>PKR {Number(drawerRecord.monthly_recovery).toLocaleString()}</div></div>
              <div><div className="kpi-label">Start Date</div><div>{drawerRecord.start_date}</div></div>
              <div><div className="kpi-label">Remaining</div><div>{getRemainingMonths(drawerRecord)}</div></div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="kpi-label" style={{ marginBottom: 8 }}>Recovery History</div>
              {deductionHistory.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No recoveries recorded yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 12 }}>Month</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 12 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductionHistory.map((entry, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: "6px 8px", fontSize: 13 }}>{new Date(entry.month + "T00:00:00").toLocaleDateString("en-PK", { month: "short", year: "numeric" })}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 13 }}>PKR {Number(entry.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button className="btn btn-primary" onClick={() => { setDrawerOpen(false); openEditForm(drawerRecord); }}>
                <Edit size={16} /> Edit
              </button>
              {drawerRecord.status === "active" && (
                <button className="btn btn-danger" onClick={() => { handleClose(drawerRecord.id); setDrawerOpen(false); }}>
                  <XCircle size={16} /> Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{editingId ? "Edit Advance" : "New Advance"}</h2>
            <div style={{ marginBottom: 12 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Employee *</label>
              <select className="select" value={formEmployeeId ?? ""} onChange={e => setFormEmployeeId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select employee…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.full_name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Advance Amount *</label>
                <input className="input" type="number" value={formAdvance} onChange={e => setFormAdvance(e.target.value)} placeholder="e.g. 25000" />
              </div>
              <div>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Monthly Recovery *</label>
                <input className="input" type="number" value={formRecovery} onChange={e => setFormRecovery(e.target.value)} placeholder="e.g. 5000" />
              </div>
            </div>
            {formAdvance && formRecovery && Number(formRecovery) > 0 && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                Estimated duration: {Math.ceil(Number(formAdvance) / Number(formRecovery))} months
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Start Date *</label>
              <input className="input" type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}><X size={16} /> Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Check size={16} /> {saving ? "Saving..." : "Save Advance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}