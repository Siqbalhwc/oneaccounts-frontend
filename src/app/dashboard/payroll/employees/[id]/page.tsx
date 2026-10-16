"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, Pencil, Save, LogOut, UserCheck } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import SalaryPreview from "@/components/payroll/SalaryPreview"

const EMPLOYMENT_TYPES = ["permanent", "contract", "daily_wage", "consultant"]
const PAYMENT_METHODS = ["bank", "cash"]

const statusLabel: Record<string, string> = {
  active: "Active", on_leave: "On leave", draft: "Draft", resigned: "Resigned", terminated: "Terminated",
}
const statusColor: Record<string, string> = {
  active: "#16a34a", on_leave: "#d97706", draft: "#64748b", resigned: "#7c3aed", terminated: "#dc2626",
}

export default function EmployeeProfilePage() {
  const params = useParams()
  const employeeId = Number(params.id)
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
  const [employee, setEmployee] = useState<any>(null)
  const [revisions, setRevisions] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [designations, setDesignations] = useState<any[]>([])
  const [owed, setOwed] = useState({ loans: 0, advances: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // edit mode
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({})

  // status modal
  const [showStatus, setShowStatus] = useState(false)
  const [newStatus, setNewStatus] = useState("resigned")
  const [exitDate, setExitDate] = useState("")
  const [exitReason, setExitReason] = useState("")

  const load = useCallback(async (cid: string) => {
    const { data: emp } = await supabase.from("employees").select("*").eq("id", employeeId).eq("company_id", cid).single()
    if (emp) setEmployee(emp)
    const { data: revs } = await supabase
      .from("employee_salary_revisions")
      .select("*, salary_structures(name)")
      .eq("employee_id", employeeId)
      .order("effective_date", { ascending: false })
    setRevisions(revs || [])
    const { data: loans } = await supabase.from("employee_loans").select("balance").eq("employee_id", employeeId).eq("status", "active")
    const { data: advs } = await supabase.from("salary_advances").select("balance").eq("employee_id", employeeId).eq("status", "active")
    setOwed({
      loans: (loans || []).reduce((s: number, r: any) => s + Number(r.balance || 0), 0),
      advances: (advs || []).reduce((s: number, r: any) => s + Number(r.balance || 0), 0),
    })
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      load(cid)
      supabase.from("departments").select("id, name").eq("company_id", cid).order("name").then(({ data }) => setDepartments(data || []))
      supabase.from("designations").select("id, name").eq("company_id", cid).order("name").then(({ data }) => setDesignations(data || []))
    })
  }, [employeeId, load])

  useEffect(() => {
    if (flash) { const t = setTimeout(() => setFlash(""), 3500); return () => clearTimeout(t) }
  }, [flash])

  const startEdit = () => {
    setError("")
    setForm({
      full_name: employee.full_name || "",
      cnic: employee.cnic || "",
      email: employee.email || "",
      mobile: employee.mobile || "",
      employment_type: employee.employment_type || "permanent",
      payment_method: employee.payment_method || "bank",
      bank_account_no: employee.bank_account_no || "",
      tax_status: employee.tax_status || "",
      department_id: employee.department_id ? String(employee.department_id) : "",
      designation_id: employee.designation_id ? String(employee.designation_id) : "",
      joining_date: employee.joining_date || "",
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    setError("")
    setSaving(true)
    const res = await fetch(`/api/payroll/employees/${employeeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", data: form }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j.error || "Could not save"); return }
    setEditing(false)
    setFlash("Employee details saved")
    load(companyId)
  }

  const openStatus = (target: string) => {
    setError("")
    setNewStatus(target)
    setExitDate(new Date().toISOString().split("T")[0])
    setExitReason("")
    setShowStatus(true)
  }

  const saveStatus = async () => {
    setError("")
    setSaving(true)
    const res = await fetch(`/api/payroll/employees/${employeeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: newStatus, exit_date: exitDate, exit_reason: exitReason }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j.error || "Could not change the status"); return }
    setShowStatus(false)
    setFlash(newStatus === "active" ? "Employee re-activated" : "Employee marked as " + newStatus)
    load(companyId)
  }

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }))

  if (planLoading || loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  }
  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>
  if (!employee) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Employee not found.</div>

  const exited = employee.status === "resigned" || employee.status === "terminated"
  const deptName = departments.find(d => d.id === employee.department_id)?.name
  const desigName = designations.find(d => d.id === employee.designation_id)?.name
  const today = new Date().toISOString().split("T")[0]
  const current = revisions.find(r => r.effective_date <= today) || revisions[0]

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .value { font-size: 14px; font-weight: 500; word-break: break-word; }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); transition: 0.2s; }
        .btn:hover { background: var(--card-hover); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-danger { background: #dc2626; color: white; border-color: #dc2626; }
        .btn-back { padding: 6px 12px; }
        .input, .select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; background: var(--bg); color: var(--text); }
        .table-wrap { overflow-x: auto; }
        .table { width: 100%; border-collapse: collapse; margin-top: 12px; min-width: 520px; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-content { background: var(--card); border-radius: 12px; padding: 24px; width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; }
      `}</style>

      {flash && <div style={{ position: "fixed", bottom: 24, right: 24, background: "#16a34a", color: "white", padding: "12px 20px", borderRadius: 8, zIndex: 2000, fontWeight: 600 }}>{flash}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/employees")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>{employee.full_name}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "2px 0 0" }}>
            {employee.employee_code}
            {deptName ? ` | ${deptName}` : ""}{desigName ? ` | ${desigName}` : ""}
            {" | "}
            <span style={{ color: statusColor[employee.status] || "var(--text-muted)", fontWeight: 700 }}>{statusLabel[employee.status] || employee.status}</span>
          </p>
        </div>
        {canEdit && !editing && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={startEdit}><Pencil size={14} /> Edit Details</button>
            {exited ? (
              <button className="btn" onClick={() => openStatus("active")}><UserCheck size={14} /> Re-activate</button>
            ) : (
              <button className="btn" onClick={() => openStatus("resigned")}><LogOut size={14} /> Resign / Terminate</button>
            )}
            <button className="btn btn-primary" onClick={() => router.push(`/dashboard/payroll/employees/${employeeId}/revisions/new`)}>
              <Plus size={16} /> Change Salary
            </button>
          </div>
        )}
      </div>

      {error && !showStatus && (
        <div style={{ background: "var(--card)", border: "1px solid #dc2626", color: "var(--text)", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>
      )}

      {exited && (
        <div style={{ background: "var(--card-hover)", border: `1px solid ${statusColor[employee.status]}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
          <strong>{statusLabel[employee.status]}</strong>
          {employee.exit_date ? ` - last working day ${employee.exit_date}` : ""}
          {employee.exit_reason ? ` - ${employee.exit_reason}` : ""}.
          {" "}Payroll pays this employee up to the last working day, and not after.
        </div>
      )}

      {/* Details */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Employee Details</h2>
        {!editing ? (
          <div className="grid">
            <div><span className="label">Code</span><div className="value">{employee.employee_code}</div></div>
            <div><span className="label">Type</span><div className="value" style={{ textTransform: "capitalize" }}>{String(employee.employment_type || "").replace("_", " ")}</div></div>
            <div><span className="label">Status</span><div className="value">{statusLabel[employee.status] || employee.status}</div></div>
            <div><span className="label">Joining Date</span><div className="value">{employee.joining_date}</div></div>
            <div><span className="label">Department</span><div className="value">{deptName || "-"}</div></div>
            <div><span className="label">Designation</span><div className="value">{desigName || "-"}</div></div>
            <div><span className="label">CNIC</span><div className="value">{employee.cnic || "-"}</div></div>
            <div><span className="label">Email</span><div className="value">{employee.email || "-"}</div></div>
            <div><span className="label">Mobile</span><div className="value">{employee.mobile || "-"}</div></div>
            <div><span className="label">Payment Method</span><div className="value" style={{ textTransform: "capitalize" }}>{employee.payment_method}</div></div>
            <div><span className="label">Bank Account</span><div className="value">{employee.bank_account_no || "-"}</div></div>
            <div><span className="label">Tax Status</span><div className="value">{employee.tax_status || "-"}</div></div>
          </div>
        ) : (
          <>
            <div className="grid">
              <div><span className="label">Full Name *</span><input className="input" value={form.full_name} onChange={e => set("full_name", e.target.value)} /></div>
              <div><span className="label">Joining Date *</span><input className="input" type="date" value={form.joining_date} onChange={e => set("joining_date", e.target.value)} /></div>
              <div>
                <span className="label">Employment Type</span>
                <select className="select" value={form.employment_type} onChange={e => set("employment_type", e.target.value)}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </div>
              <div>
                <span className="label">Department</span>
                <select className="select" value={form.department_id} onChange={e => set("department_id", e.target.value)}>
                  <option value="">None</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <span className="label">Designation</span>
                <select className="select" value={form.designation_id} onChange={e => set("designation_id", e.target.value)}>
                  <option value="">None</option>
                  {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div><span className="label">CNIC</span><input className="input" value={form.cnic} onChange={e => set("cnic", e.target.value)} placeholder="00000-0000000-0" /></div>
              <div><span className="label">Mobile</span><input className="input" value={form.mobile} onChange={e => set("mobile", e.target.value)} placeholder="0300-1234567" /></div>
              <div><span className="label">Email</span><input className="input" value={form.email} onChange={e => set("email", e.target.value)} /></div>
              <div>
                <span className="label">Payment Method</span>
                <select className="select" value={form.payment_method} onChange={e => set("payment_method", e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><span className="label">Bank Account / IBAN{form.payment_method === "bank" ? " *" : ""}</span><input className="input" value={form.bank_account_no} onChange={e => set("bank_account_no", e.target.value)} /></div>
              <div><span className="label">Tax Status</span><input className="input" value={form.tax_status} onChange={e => set("tax_status", e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}><Save size={14} /> {saving ? "Saving..." : "Save"}</button>
              <button className="btn" onClick={() => { setEditing(false); setError("") }} disabled={saving}>Cancel</button>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
              The employee code cannot be changed. The salary is changed with the Change Salary button, so the history is kept.
            </p>
          </>
        )}
      </div>

      {/* Current pay */}
      {current && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Current Pay</h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
            From {current.effective_date}: {Number(current.basic_salary).toLocaleString()} on structure {current.salary_structures?.name || "-"}.
          </p>
          <SalaryPreview structureId={current.salary_structure_id} amount={String(current.basic_salary)} title="How the current salary is split" />
        </div>
      )}

      {/* Salary history */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Salary History</h2>
        {revisions.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No salary recorded yet. Use Change Salary to set one - without it this employee gets no pay in a payroll run.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Effective Date</th>
                  <th>Salary</th>
                  <th>Structure</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((r: any, idx: number) => (
                  <tr key={r.id}>
                    <td>{r.effective_date}</td>
                    <td style={{ fontWeight: 600 }}>{Number(r.basic_salary).toLocaleString()}</td>
                    <td>{r.salary_structures?.name || "-"}</td>
                    <td>{idx === revisions.length - 1 ? "Opening salary" + (r.reason && r.reason !== "Initial salary" ? " - " + r.reason : "") : (r.reason || "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status modal */}
      {showStatus && (
        <div className="modal-overlay" onClick={() => !saving && setShowStatus(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {newStatus === "active" ? (
              <>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Re-activate {employee.full_name}?</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>The last working day is cleared and the employee is included in payroll again.</p>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Employee leaves the company</h3>
                <div style={{ marginTop: 12 }}>
                  <span className="label">What happened</span>
                  <select className="select" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                    <option value="resigned">Resigned</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
                <div style={{ marginTop: 12 }}>
                  <span className="label">Last working day *</span>
                  <input className="input" type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <span className="label">Reason (optional)</span>
                  <input className="input" value={exitReason} onChange={e => setExitReason(e.target.value)} />
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
                  Payroll pays up to the last working day (a part month is paid for the days worked) and does not include this employee afterwards.
                </p>
                {(owed.loans > 0 || owed.advances > 0) && (
                  <div style={{ background: "var(--card-hover)", border: "1px solid #F59E0B", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginTop: 8 }}>
                    Still owed by this employee: {owed.loans > 0 ? `loans ${owed.loans.toLocaleString()}` : ""}{owed.loans > 0 && owed.advances > 0 ? ", " : ""}{owed.advances > 0 ? `advances ${owed.advances.toLocaleString()}` : ""}.
                    The final payroll recovers one installment at most. Settle the rest separately.
                  </div>
                )}
              </>
            )}
            {error && <div style={{ background: "var(--card)", border: "1px solid #dc2626", color: "var(--text)", padding: "8px 12px", borderRadius: 8, marginTop: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn" onClick={() => setShowStatus(false)} disabled={saving}>Cancel</button>
              <button className={`btn ${newStatus === "active" ? "btn-primary" : "btn-danger"}`} onClick={saveStatus} disabled={saving}>
                {saving ? "Saving..." : newStatus === "active" ? "Re-activate" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
