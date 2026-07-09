"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import {
  ArrowLeft,
  CheckCircle,
  Send,
  ThumbsUp,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  X,
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

interface RunLine {
  id: number
  employee_id: number
  employee_name: string
  gross_amount: number
  total_deductions: number
  net_amount: number
  salary_structure_snapshot: any
  dimensions_snapshot: any
}

interface EmployeeInfo {
  id: number
  full_name: string
  is_active: boolean
  bank_account_no?: string | null
}

// Status colours for badges and stepper
const statusColors: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#3b82f6",
  approved: "#f59e0b",
  posted: "#22c55e",
  locked: "#8b5cf6",
  reversed: "#ef4444",
}

export default function PayrollRunDetailPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const params = useParams()
  const runId = parseInt(params.id as string, 10)
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"

  // Data states
  const [companyId, setCompanyId] = useState("")
  const [run, setRun] = useState<any>(null)
  const [lines, setLines] = useState<RunLine[]>([])
  const [employees, setEmployees] = useState<EmployeeInfo[]>([])
  const [approvalLevels, setApprovalLevels] = useState<string>("1")
  const [submitRoles, setSubmitRoles] = useState<string[]>([])
  const [approveRoles, setApproveRoles] = useState<string[]>([])
  const [postRoles, setPostRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState("")

  // UI states
  const [flash, setFlash] = useState("")
  const [error, setError] = useState("")
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)
  const [employeePage, setEmployeePage] = useState(1)
  const perPage = 20

  // Modal states
  const [showPostModal, setShowPostModal] = useState(false)
  const [showReverseModal, setShowReverseModal] = useState(false)
  const [reverseReason, setReverseReason] = useState("")

  // Toast
  const showToast = (message: string, type: "success" | "error") => {
    setFlash(message)
    setTimeout(() => setFlash(""), 4000)
  }

  // Fetch company ID and approval settings
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("payroll_approval_settings")
          .select("*")
          .eq("company_id", cid)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setApprovalLevels(data.approval_levels)
              setSubmitRoles(data.submit_roles || [])
              setApproveRoles(data.approve_roles || [])
              setPostRoles(data.post_roles || [])
            }
          })
      }
    })
  }, [])

  // Fetch run and lines
  useEffect(() => {
    if (!companyId || !runId) return
    setLoading(true)
    supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", runId)
      .eq("company_id", companyId)
      .single()
      .then(({ data: runData }) => {
        if (!runData) {
          setError("Payroll run not found")
          setLoading(false)
          return
        }
        setRun(runData)

        supabase
          .from("payroll_run_lines")
          .select("*, employees!inner(full_name)")
          .eq("payroll_run_id", runId)
          .order("id")
          .then(({ data: lineData }) => {
            if (lineData) {
              const enriched = lineData.map((line: any) => ({
                ...line,
                employee_name: line.employees?.full_name || "Unknown",
              }))
              setLines(enriched)
              // Fetch employee details for validation
              const empIds = enriched.map((l: any) => l.employee_id)
              if (empIds.length > 0) {
                supabase
                  .from("employees")
                  .select("id, full_name, is_active, bank_account_no")
                  .in("id", empIds)
                  .eq("company_id", companyId)
                  .then(({ data: empData }) => {
                    setEmployees(empData || [])
                  })
              }
            }
            setLoading(false)
          })
      })
  }, [companyId, runId])

  // Aggregated values
  const totals = useMemo(() => {
    return lines.reduce(
      (acc, l) => ({
        gross: acc.gross + (l.gross_amount || 0),
        deductions: acc.deductions + (l.total_deductions || 0),
        net: acc.net + (l.net_amount || 0),
      }),
      { gross: 0, deductions: 0, net: 0 }
    )
  }, [lines])

  const averageSalary = lines.length > 0 ? totals.gross / lines.length : 0

  // ---------- Journal Preview ----------
  const journalPreview = useMemo(() => {
    const earnings: { account: string; amount: number }[] = []
    const deductions: { account: string; amount: number }[] = []
    lines.forEach(line => {
      const comps = line.salary_structure_snapshot?.components || []
      comps.forEach((c: any) => {
        const account = c.gl_account_name || c.name || "Unknown"
        if (c.type === "earning") {
          const exist = earnings.find(e => e.account === account)
          if (exist) exist.amount += c.amount
          else earnings.push({ account, amount: c.amount })
        } else {
          const exist = deductions.find(d => d.account === account)
          if (exist) exist.amount += c.amount
          else deductions.push({ account, amount: c.amount })
        }
      })
    })
    // Total earnings = Dr Salary Expense
    // Deductions + net payable = Cr
    const netPayable = totals.net
    const creditEntries = [...deductions, { account: "Salary Payable", amount: netPayable }]
    return { earnings, creditEntries }
  }, [lines, totals.net])

  // ---------- Validation Summary ----------
  const validation = useMemo(() => {
    const checks: { label: string; passed: boolean; message?: string }[] = []
    // Employees active
    const inactiveEmps = employees.filter(e => !e.is_active)
    checks.push({
      label: "All employees active",
      passed: inactiveEmps.length === 0,
      message: inactiveEmps.length > 0 ? `${inactiveEmps.map(e => e.full_name).join(", ")} inactive` : undefined,
    })
    // All have salary structure (snapshot present)
    const missingStructure = lines.filter(l => !l.salary_structure_snapshot?.components?.length)
    checks.push({
      label: "Salary structure assigned",
      passed: missingStructure.length === 0,
      message: missingStructure.length > 0 ? `${missingStructure.map(l => l.employee_name).join(", ")} missing` : undefined,
    })
    // Bank account (optional warning)
    const noBank = employees.filter(e => !e.bank_account_no)
    checks.push({
      label: "Bank account present",
      passed: noBank.length === 0,
      message: noBank.length > 0 ? `${noBank.map(e => e.full_name).join(", ")} no bank account` : undefined,
    })
    // Journal balanced (from preview)
    const totalDr = journalPreview.earnings.reduce((s, e) => s + e.amount, 0)
    const totalCr = journalPreview.creditEntries.reduce((s, e) => s + e.amount, 0)
    checks.push({
      label: "Journal balanced",
      passed: Math.abs(totalDr - totalCr) < 1,
      message: "Debits and credits do not match",
    })
    return checks
  }, [employees, lines, journalPreview])

  const allValidationPassed = validation.every(c => c.passed)

  // ---------- Audit Timeline ----------
  const auditTimeline = useMemo(() => {
    const events: { action: string; timestamp: string | null; performed_by?: string }[] = []
    if (run?.generated_at) events.push({ action: "Generated", timestamp: run.generated_at })
    if (run?.submitted_at) events.push({ action: "Submitted", timestamp: run.submitted_at })
    if (run?.approved_at) events.push({ action: "Approved", timestamp: run.approved_at })
    if (run?.posted_at) events.push({ action: "Posted", timestamp: run.posted_at })
    if (run?.status === "reversed") events.push({ action: "Reversed", timestamp: run.locked_at, performed_by: run.reversal_reason ? `Reason: ${run.reversal_reason}` : undefined })
    return events
  }, [run])

  // ---------- Approval Stepper ----------
  const steps = ["draft", "submitted", "approved", "posted"]
  const currentStepIndex = steps.indexOf(run?.status)

  // ---------- Role‑based buttons ----------
  const canSubmit = run?.status === "draft" && approvalLevels === "3" && submitRoles.includes(role ?? "")
  const canApprove = run && (run.status === "draft" || run.status === "submitted") &&
    (approvalLevels === "2" || approvalLevels === "3") && approveRoles.includes(role ?? "")
  const canPost = run && (
    (approvalLevels === "1" && run.status === "draft" && postRoles.includes(role ?? "")) ||
    (approvalLevels === "2" && run.status === "approved" && postRoles.includes(role ?? "")) ||
    (approvalLevels === "3" && run.status === "approved" && postRoles.includes(role ?? ""))
  )
  const canReverse = run && (run.status === "posted" || run.status === "locked") && postRoles.includes(role ?? "")

  // ---------- Action handlers ----------
  const handleSubmit = async () => {
    setActionLoading("submit")
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/submit`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Submit failed"); setActionLoading(""); return }
      setRun((prev: any) => ({ ...prev, status: "submitted", submitted_at: new Date().toISOString() }))
      showToast("Run submitted for approval", "success")
    } catch (err: any) { setError(err.message) }
    setActionLoading("")
  }

  const handleApprove = async () => {
    setActionLoading("approve")
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/approve`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Approve failed"); setActionLoading(""); return }
      setRun((prev: any) => ({ ...prev, status: "approved", approved_at: new Date().toISOString() }))
      showToast("Run approved", "success")
    } catch (err: any) { setError(err.message) }
    setActionLoading("")
  }

  const handlePost = async () => {
    if (!allValidationPassed) {
      setError("Validation failed – fix issues before posting")
      return
    }
    setActionLoading("post")
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/post`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Posting failed"); setActionLoading(""); return }
      showToast("Payroll posted successfully", "success")
      setRun((prev: any) => ({ ...prev, status: "posted", posted_at: new Date().toISOString(), locked_at: new Date().toISOString() }))
      setShowPostModal(false)
    } catch (err: any) { setError(err.message) }
    setActionLoading("")
  }

  const handleReverse = async () => {
    if (!reverseReason.trim()) {
      setError("Please enter a reason for reversal")
      return
    }
    setActionLoading("reverse")
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reverseReason }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Reversal failed"); setActionLoading(""); return }
      showToast("Payroll reversed", "success")
      setRun((prev: any) => ({ ...prev, status: "reversed", reversal_reason: reverseReason }))
      setShowReverseModal(false)
      setReverseReason("")
    } catch (err: any) { setError(err.message) }
    setActionLoading("")
  }

  // ---------- Employee table pagination ----------
  const totalEmployeePages = Math.ceil(lines.length / perPage)
  const pagedLines = lines.slice((employeePage - 1) * perPage, employeePage * perPage)
  useEffect(() => { if (employeePage > totalEmployeePages && totalEmployeePages > 0) setEmployeePage(totalEmployeePages) }, [totalEmployeePages, employeePage])

  // ---------- Guard (no plan/feature duplicates) ----------
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); margin-bottom: 16px; }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); transition: 0.2s; }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-danger { background: #dc2626; color: white; border-color: #dc2626; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; }
        .summary-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; font-weight: 700; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }

        /* Stepper */
        .stepper { display: flex; align-items: flex-start; gap: 0; margin-bottom: 24px; overflow-x: auto; }
        .step { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 70px; }
        .step-circle { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; border: 2px solid var(--border); background: var(--card); }
        .step.active .step-circle { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
        .step.completed .step-circle { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
        .step-label { font-size: 10px; margin-top: 4px; text-transform: uppercase; color: var(--text-muted); }
        .step.active .step-label { color: var(--primary); font-weight: 700; }
        .step-line { flex: 1; height: 2px; background: var(--border); margin: 0 -4px; align-self: center; }
        .step.active .step-line, .step.completed .step-line { background: var(--primary); }

        /* Table */
        .emp-table { width: 100%; border-collapse: collapse; }
        .emp-table th, .emp-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .emp-table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .emp-table tr:hover td { background: var(--card-hover); }
        .expand-row { cursor: pointer; }
        .component-breakdown { padding: 12px 16px; background: var(--bg); font-size: 12px; }

        /* Modal */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--card); border-radius: 12px; padding: 24px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; }

        /* Toast */
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; color: white; font-weight: 500; z-index: 2000; animation: slideIn 0.3s; }
        .toast-success { background: #16a34a; }
        .toast-error { background: #dc2626; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Toast */}
      {flash && <div className={`toast ${flash.includes("✅") ? "toast-success" : "toast-error"}`}>{flash}</div>}

      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        <button className="btn btn-back" style={{ padding: 0, background: "none", border: "none", color: "var(--text-muted)", textDecoration: "underline", cursor: "pointer" }} onClick={() => router.push("/dashboard/payroll/runs")}>
          Payroll Runs
        </button>
        <span style={{ margin: "0 8px" }}>/</span>
        <span style={{ color: "var(--text)" }}>
          {run ? new Date(run.month + "T00:00:00").toLocaleDateString("en-PK", { month: "short", year: "numeric" }) : "…"}
        </span>
      </div>

      {/* Header & action buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            📋 Payroll Run — {run ? new Date(run.month + "T00:00:00").toLocaleDateString("en-PK", { month: "short", year: "numeric" }) : "…"}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canSubmit && (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={actionLoading !== ""}>
              <Send size={16} /> {actionLoading === "submit" ? "Submitting..." : "Submit"}
            </button>
          )}
          {canApprove && (
            <button className="btn btn-primary" onClick={handleApprove} disabled={actionLoading !== ""}>
              <ThumbsUp size={16} /> {actionLoading === "approve" ? "Approving..." : "Approve"}
            </button>
          )}
          {canPost && (
            <button className="btn btn-primary" onClick={() => setShowPostModal(true)} disabled={actionLoading !== ""}>
              <CheckCircle size={16} /> Post Payroll
            </button>
          )}
          {canReverse && (
            <button className="btn btn-danger" onClick={() => setShowReverseModal(true)} disabled={actionLoading !== ""}>
              ↩️ Reverse Payroll
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}

      {/* KPI Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Employees</div>
          <div className="summary-value">{lines.length}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Gross Pay</div>
          <div className="summary-value" style={{ color: "#f59e0b" }}>PKR {totals.gross.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Deductions</div>
          <div className="summary-value" style={{ color: "#ef4444" }}>PKR {totals.deductions.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Net Payable</div>
          <div className="summary-value" style={{ color: "#22c55e" }}>PKR {totals.net.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Average Salary</div>
          <div className="summary-value" style={{ color: "#3b82f6" }}>PKR {averageSalary.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Journal Status</div>
          <div className="summary-value" style={{ fontSize: 16, color: run?.status === "posted" || run?.status === "locked" ? "#22c55e" : "#f59e0b" }}>
            {run?.status === "posted" || run?.status === "locked" ? "Posted" : "Pending"}
          </div>
        </div>
      </div>

      {/* Approval Stepper */}
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Approval Progress</h3>
        <div className="stepper">
          {steps.map((step, idx) => (
            <div key={step} className={`step ${idx < currentStepIndex ? "completed" : idx === currentStepIndex ? "active" : ""}`}>
              <div className="step-circle">{idx < currentStepIndex ? "✓" : idx + 1}</div>
              <span className="step-label">{step}</span>
              {idx < steps.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>
      </div>

      {/* Employee Expandable Table */}
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Employees ({lines.length})</h3>
        {lines.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No employee data.</p>
        ) : (
          <>
            <table className="emp-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Employee</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {pagedLines.map(line => (
                  <>
                    <tr
                      key={line.id}
                      className="expand-row"
                      onClick={() => setExpandedRowId(expandedRowId === line.id ? null : line.id)}
                    >
                      <td>{expandedRowId === line.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td style={{ fontWeight: 600 }}>{line.employee_name}</td>
                      <td>PKR {line.gross_amount.toLocaleString()}</td>
                      <td>PKR {line.total_deductions.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: "#22c55e" }}>PKR {line.net_amount.toLocaleString()}</td>
                    </tr>
                    {expandedRowId === line.id && (
                      <tr>
                        <td colSpan={5} className="component-breakdown">
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <strong style={{ color: "#22c55e" }}>Earnings</strong>
                              {(line.salary_structure_snapshot?.components || [])
                                .filter((c: any) => c.type === "earning")
                                .map((c: any, i: number) => (
                                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                                    <span>{c.name}</span>
                                    <span>+ PKR {c.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                            </div>
                            <div>
                              <strong style={{ color: "#ef4444" }}>Deductions</strong>
                              {(line.salary_structure_snapshot?.components || [])
                                .filter((c: any) => c.type !== "earning")
                                .map((c: any, i: number) => (
                                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                                    <span>{c.name}</span>
                                    <span>- PKR {c.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            {totalEmployeePages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                <button className="btn" disabled={employeePage === 1} onClick={() => setEmployeePage(p => p - 1)}>Previous</button>
                <span style={{ padding: "8px 0", fontSize: 13, color: "var(--text-muted)" }}>Page {employeePage} of {totalEmployeePages}</span>
                <button className="btn" disabled={employeePage === totalEmployeePages} onClick={() => setEmployeePage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Journal Preview (only if not posted/reversed) */}
      {run && !["posted", "locked", "reversed"].includes(run.status) && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📒 Journal Preview</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <h4 style={{ color: "#22c55e", margin: "0 0 8px" }}>Debit</h4>
              {journalPreview.earnings.map((e, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{e.account}</span>
                  <span>PKR {e.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: "#ef4444", margin: "0 0 8px" }}>Credit</h4>
              {journalPreview.creditEntries.map((e, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{e.account}</span>
                  <span>PKR {e.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Validation Summary (visible before posting) */}
      {run && !["posted", "locked", "reversed"].includes(run.status) && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>✅ Validation</h3>
          {validation.map((v, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13 }}>
              {v.passed ? <CheckCircle size={14} color="#22c55e" /> : <AlertTriangle size={14} color="#f59e0b" />}
              <span>{v.label}</span>
              {v.message && <span style={{ color: "var(--text-muted)" }}>— {v.message}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Audit Timeline */}
      {auditTimeline.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📅 Activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auditTimeline.map((event, i) => (
              <div key={i} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                <div style={{ width: 80, color: "var(--text-muted)" }}>
                  {event.timestamp ? new Date(event.timestamp).toLocaleDateString("en-PK", { month: "short", day: "numeric" }) : "—"}
                </div>
                <div style={{ fontWeight: 600 }}>{event.action}</div>
                {event.performed_by && <div style={{ color: "var(--text-muted)" }}>{event.performed_by}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Post Confirmation Modal */}
      {showPostModal && (
        <div className="modal-overlay" onClick={() => setShowPostModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Post Payroll</h3>
            <p style={{ margin: "12px 0", color: "var(--text-muted)" }}>
              This will create the journal entry and lock the run permanently.
            </p>
            <div style={{ background: "var(--bg)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <strong>Validation Summary</strong>
              {validation.map((v, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 13 }}>
                  {v.passed ? <CheckCircle size={12} color="#22c55e" /> : <AlertTriangle size={12} color="#f59e0b" />}
                  {v.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowPostModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePost} disabled={!allValidationPassed || actionLoading !== ""}>
                {actionLoading === "post" ? "Posting..." : "Confirm Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Modal */}
      {showReverseModal && (
        <div className="modal-overlay" onClick={() => setShowReverseModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Reverse Payroll</h3>
            <p style={{ margin: "12px 0", color: "var(--text-muted)" }}>
              This will create offsetting journal entries. This action cannot be undone.
            </p>
            <textarea
              style={{ width: "100%", height: 80, borderRadius: 8, border: "1.5px solid var(--border)", padding: 10, fontSize: 13, background: "var(--bg)", color: "var(--text)", marginBottom: 12 }}
              placeholder="Enter reversal reason..."
              value={reverseReason}
              onChange={e => setReverseReason(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowReverseModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReverse} disabled={actionLoading !== ""}>
                {actionLoading === "reverse" ? "Reversing..." : "Reverse Payroll"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}