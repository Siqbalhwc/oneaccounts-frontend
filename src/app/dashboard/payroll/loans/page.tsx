"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  Plus, Search, X, Check, Eye, RotateCcw,
  Landmark, Calculator, TrendingUp, DollarSign,
  MoreVertical, Edit, Trash2, History, XCircle
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

export default function EmployeeLoansPage() {
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
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<any>(null)
  const [deductionHistory, setDeductionHistory] = useState<any[]>([])

  // Form modal
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [formEmployeeId, setFormEmployeeId] = useState<number | null>(null)
  const [formPrincipal, setFormPrincipal] = useState("")
  const [formInstallment, setFormInstallment] = useState("")
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split("T")[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Menu state
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)

  // Fetch initial data
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)

        // Fetch departments and employees (without join, then merge)
        supabase
          .from("departments")
          .select("id, name")
          .eq("company_id", cid)
          .order("name")
          .then(({ data: depts }) => {
            const deptList = depts || []
            setDepartments(deptList)

            return supabase
              .from("employees")
              .select("id, employee_code, full_name, department_id")
              .eq("company_id", cid)
              .eq("status", "active")
              .order("full_name")
          })
          .then(({ data: emps }) => {
            if (emps) {
              const enriched = emps.map((emp: any) => ({
                ...emp,
                departments: departments.find(d => d.id === emp.department_id) || null,
              }))
              setEmployees(enriched)
            } else {
              setEmployees([])
            }
          })
      }
    })
  }, [])

  const fetchLoans = () => {
    if (!companyId) return
    setLoading(true)

    let query = supabase
      .from("employee_loans")
      .select("*, employees!inner(full_name, employee_code, department_id, departments(name))")
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") query = query.eq("status", statusFilter)

    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((loan: any) => {
          const emp = loan.employees
          return emp?.full_name?.toLowerCase().includes(q) || emp?.employee_code?.toLowerCase().includes(q)
        })
      }
      setLoans(filtered)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchLoans()
  }, [role, canView, companyId, statusFilter, search])

  // KPIs
  const activeLoans = loans.filter(l => l.status === "active")
  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.balance || 0), 0)
  const totalMonthlyRecovery = activeLoans.reduce((s, l) => s + Number(l.monthly_installment || 0), 0)
  const closingThisMonth = activeLoans.filter(l => {
    if (!l.balance || !l.monthly_installment) return false
    return l.balance <= l.monthly_installment
  }).length

  // Helpers
  const getLoanNumber = (id: number) => `LN-${String(id).padStart(4, "0")}`
  const getRecovered = (loan: any) => Number(loan.principal_amount || 0) - Number(loan.balance || 0)
  const getProgressPercent = (loan: any) => {
    const principal = Number(loan.principal_amount || 0)
    if (principal === 0) return 0
    return Math.min(100, Math.round((getRecovered(loan) / principal) * 100))
  }
  const getRemainingMonths = (loan: any) => {
    const installment = Number(loan.monthly_installment || 0)
    if (installment <= 0) return "—"
    const remaining = Math.ceil(Number(loan.balance || 0) / installment)
    return `${remaining} month${remaining !== 1 ? "s" : ""}`
  }

  // Drawer open
  const openDrawer = async (loan: any) => {
    setDrawerRecord(loan)
    // Fetch deduction history
    supabase
      .from("payroll_run_line_components")
      .select("amount, payroll_run_lines!inner(payroll_run_id, payroll_runs!inner(month))")
      .eq("source_type", "loan")
      .eq("source_id", loan.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const history = data ? data.map((d: any) => {
          const runLine = Array.isArray(d.payroll_run_lines) ? d.payroll_run_lines[0] : d.payroll_run_lines
          const run = Array.isArray(runLine?.payroll_runs) ? runLine.payroll_runs[0] : runLine?.payroll_runs
          return {
            month: run?.month || "N/A",
            amount: d.amount,
          }
        }) : []
        setDeductionHistory(history)
      })
    setDrawerOpen(true)
  }

  // Form handlers
  const openNewForm = () => {
    setEditingId(null)
    setFormEmployeeId(null)
    setFormPrincipal("")
    setFormInstallment("")
    setFormStartDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
    setError("")
  }

  const openEditForm = (loan: any) => {
    setEditingId(loan.id)
    setFormEmployeeId(loan.employee_id)
    setFormPrincipal(String(loan.principal_amount))
    setFormInstallment(String(loan.monthly_installment))
    setFormStartDate(loan.start_date)
    setShowForm(true)
    setError("")
  }

  const handleSave = async () => {
    if (!formEmployeeId) { setError("Select an employee"); return }
    if (!formPrincipal || isNaN(Number(formPrincipal))) { setError("Valid principal amount required"); return }
    if (!formInstallment || isNaN(Number(formInstallment))) { setError("Valid installment required"); return }

    setSaving(true)
    setError("")
    const { data: { user } } = await supabase.auth.getUser()

    if (editingId) {
      // Update
      const { error: updateErr } = await supabase
        .from("employee_loans")
        .update({
          principal_amount: Number(formPrincipal),
          monthly_installment: Number(formInstallment),
          start_date: formStartDate,
          balance: Number(formPrincipal),   // reset balance on edit
        })
        .eq("id", editingId)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      setFlash("Loan updated")
    } else {
      // Insert
      const { error: insertErr } = await supabase
        .from("employee_loans")
        .insert({
          employee_id: formEmployeeId,
          principal_amount: Number(formPrincipal),
          monthly_installment: Number(formInstallment),
          balance: Number(formPrincipal),
          start_date: formStartDate,
          status: "active",
          created_by: user?.id,
        })
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      setFlash("Loan created")
    }

    setSaving(false)
    setShowForm(false)
    fetchLoans()
  }

  const handleClose = async (id: number) => {
    if (!confirm("Close this loan? The remaining balance will be written off.")) return
    await supabase.from("employee_loans").update({ status: "closed" }).eq("id", id)
    fetchLoans()
    setFlash("Loan closed")
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
        .input, .select, textarea { width: 100%; height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; font-family: inherit; }
        textarea { height: auto; padding: 8px 12px; resize: vertical; }
        .input:focus, .select:focus, textarea:focus { border-color: var(--primary); }
        .filter-input { height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--card); color: var(--text); outline: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Landmark size={24} style={{ color: "var(--primary)" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Employee Loans</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Manage employee loans and their payroll deductions
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNewForm}>
            <Plus size={16} /> New Loan
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{flash}</div>}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Active Loans</div>
          <div className="kpi-value">{activeLoans.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><DollarSign size={12} style={{ marginRight: 4 }} /> Outstanding</div>
          <div className="kpi-value" style={{ color: "#F59E0B" }}>PKR {totalOutstanding.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Calculator size={12} style={{ marginRight: 4 }} /> Monthly Recovery</div>
          <div className="kpi-value" style={{ color: "#1D4ED8" }}>PKR {totalMonthlyRecovery.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><TrendingUp size={12} style={{ marginRight: 4 }} /> Closing This Month</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>{closingThisMonth}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="filter-input" placeholder="Search employee..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} style={{ paddingLeft: 36, width: "100%" }} />
        </div>
        <select className="filter-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }} style={{ width: 140 }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
        <button className="btn btn-outline" onClick={() => { setSearch(""); setStatusFilter("all"); setCurrentPage(1); }}>
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Loan #</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Employee</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Principal</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Recovered</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Balance</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Monthly Deduction</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Remaining</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Status</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</td></tr>
            ) : loans.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 16, marginBottom: 8 }}>No loans found</div>
                  {canEdit && <button className="btn btn-primary" onClick={openNewForm}><Plus size={16} /> Create first loan</button>}
                </td>
              </tr>
            ) : (
              loans.map(loan => {
                const emp = loan.employees
                const recovered = getRecovered(loan)
                const progress = getProgressPercent(loan)
                const remainingMonths = getRemainingMonths(loan)
                return (
                  <tr key={loan.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--card-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => openDrawer(loan)}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--primary)" }}>{getLoanNumber(loan.id)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{emp?.full_name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{emp?.employee_code} · {emp?.departments?.name || "—"}</div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600 }}>PKR {Number(loan.principal_amount).toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, color: "#10B981" }}>PKR {recovered.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ fontWeight: 600 }}>PKR {Number(loan.balance).toLocaleString()}</div>
                      <div className="progress-bar" style={{ marginTop: 4, width: 80, margin: "4px auto" }}>
                        <div className="progress-fill" style={{ width: `${progress}%`, background: progress > 80 ? "#10B981" : progress > 40 ? "#F59E0B" : "#EF4444" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{progress}%</div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600 }}>PKR {Number(loan.monthly_installment).toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13 }}>{remainingMonths}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span className="badge" style={{ background: loan.status === "active" ? "#DCFCE7" : "#F3F4F6", color: loan.status === "active" ? "#166534" : "#6B7280" }}>
                        {loan.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", position: "relative" }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => setMenuOpenId(menuOpenId === loan.id ? null : loan.id)}>
                        <MoreVertical size={14} />
                      </button>
                      {menuOpenId === loan.id && (
                        <div className="menu-popup" style={{ right: 0 }}>
                          <div className="menu-item" onClick={() => { setMenuOpenId(null); openDrawer(loan); }}>
                            <Eye size={14} /> View Details
                          </div>
                          <div className="menu-item" onClick={() => { setMenuOpenId(null); openEditForm(loan); }}>
                            <Edit size={14} /> Edit
                          </div>
                          {loan.status === "active" && (
                            <div className="menu-item" onClick={() => handleClose(loan.id)} style={{ color: "#EF4444" }}>
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
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Loan Details</h2>
              <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => setDrawerOpen(false)}><X size={16} /></button>
            </div>

            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{drawerRecord.employees?.full_name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              {drawerRecord.employees?.employee_code} · {drawerRecord.employees?.departments?.name || "—"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><div className="kpi-label">Loan #</div><div>{getLoanNumber(drawerRecord.id)}</div></div>
              <div><div className="kpi-label">Status</div><span className="badge" style={{ background: drawerRecord.status === "active" ? "#DCFCE7" : "#F3F4F6", color: drawerRecord.status === "active" ? "#166534" : "#6B7280" }}>{drawerRecord.status}</span></div>
              <div><div className="kpi-label">Principal</div><div>PKR {Number(drawerRecord.principal_amount).toLocaleString()}</div></div>
              <div><div className="kpi-label">Recovered</div><div style={{ color: "#10B981" }}>PKR {getRecovered(drawerRecord).toLocaleString()}</div></div>
              <div><div className="kpi-label">Balance</div><div style={{ fontWeight: 600 }}>PKR {Number(drawerRecord.balance).toLocaleString()}</div></div>
              <div><div className="kpi-label">Monthly Deduction</div><div>PKR {Number(drawerRecord.monthly_installment).toLocaleString()}</div></div>
              <div><div className="kpi-label">Start Date</div><div>{drawerRecord.start_date}</div></div>
              <div><div className="kpi-label">Remaining</div><div>{getRemainingMonths(drawerRecord)}</div></div>
            </div>

            {/* Deduction History */}
            <div style={{ marginTop: 16 }}>
              <div className="kpi-label" style={{ marginBottom: 8 }}>Deduction History</div>
              {deductionHistory.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No deductions recorded yet.</div>
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
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{editingId ? "Edit Loan" : "New Loan"}</h2>
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
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Principal Amount *</label>
                <input className="input" type="number" value={formPrincipal} onChange={e => setFormPrincipal(e.target.value)} placeholder="e.g. 100000" />
              </div>
              <div>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Monthly Installment *</label>
                <input className="input" type="number" value={formInstallment} onChange={e => setFormInstallment(e.target.value)} placeholder="e.g. 5000" />
              </div>
            </div>
            {formPrincipal && formInstallment && Number(formInstallment) > 0 && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                Estimated duration: {Math.ceil(Number(formPrincipal) / Number(formInstallment))} months
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Start Date *</label>
              <input className="input" type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}><X size={16} /> Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Check size={16} /> {saving ? "Saving..." : "Save Loan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
