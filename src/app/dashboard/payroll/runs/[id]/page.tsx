"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, Send, ThumbsUp } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

interface RunLine {
  id: number
  employee_id: number
  employee_name: string
  gross_amount: number
  total_deductions: number
  net_amount: number
  salary_structure_snapshot: any
  dimensions_snapshot: any
  components: any[]
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
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  if (planLoading) {
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

  const [companyId, setCompanyId] = useState("")
  const [approvalLevels, setApprovalLevels] = useState<string>("1")
  const [run, setRun] = useState<any>(null)
  const [lines, setLines] = useState<RunLine[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState("")   // 'submit', 'approve', 'post'
  const [flash, setFlash] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch approval settings
        supabase
          .from("payroll_approval_settings")
          .select("approval_levels")
          .eq("company_id", cid)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setApprovalLevels(data.approval_levels)
          })
      }
    })
  }, [])

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
            }
            setLoading(false)
          })
      })
  }, [companyId, runId])

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

  // Workflow actions
  const handleSubmit = async () => {
    setActionLoading("submit")
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/submit`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Submit failed"); setActionLoading(""); return }
      setRun((prev: any) => ({ ...prev, status: "submitted", submitted_at: new Date().toISOString() }))
      setFlash("✅ Run submitted for approval")
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
      setFlash("✅ Run approved")
    } catch (err: any) { setError(err.message) }
    setActionLoading("")
  }

  const handlePost = async () => {
    if (!confirm("Post this payroll run? This will create a journal entry and lock the run permanently.")) return
    setActionLoading("post")
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/post`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Posting failed"); setActionLoading(""); return }
      setFlash("✅ Payroll posted successfully")
      setRun((prev: any) => ({ ...prev, status: "posted", posted_at: new Date().toISOString(), locked_at: new Date().toISOString() }))
    } catch (err: any) { setError(err.message) }
    setActionLoading("")
  }

  // Determine which buttons to show based on approval levels and current status
  const canSubmit = canEdit && run && (run.status === "draft") && (approvalLevels === "3")
  const canApprove = canEdit && run && (run.status === "draft" || run.status === "submitted") && (approvalLevels === "2" || approvalLevels === "3")
  const canPost = canEdit && run && (
    // Level 1: draft -> post (no approval required)
    (approvalLevels === "1" && run.status === "draft") ||
    // Level 2: approved -> post
    (approvalLevels === "2" && run.status === "approved") ||
    // Level 3: approved -> post
    (approvalLevels === "3" && run.status === "approved")
  )

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; box-shadow: var(--shadow-sm); margin-bottom: 16px;
        }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-submit { background: #2563EB; color: white; border-color: #2563EB; }
        .btn-approve { background: #059669; color: white; border-color: #059669; }
        .btn-post { background: #7C3AED; color: white; border-color: #7C3AED; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px; text-align: center;
        }
        .summary-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; font-weight: 700; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }

        .line-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          padding: 14px 18px; margin-bottom: 10px;
        }
        .line-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 8px; font-weight: 700; color: var(--text); font-size: 14px;
        }
        .line-components {
          font-size: 12px; color: var(--text-muted);
          display: flex; flex-direction: column; gap: 4px;
        }
        .component-row {
          display: flex; justify-content: space-between; max-width: 400px;
        }

        @media (max-width: 640px) {
          .summary-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/runs")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            📋 Payroll Run — {run ? new Date(run.month + "T00:00:00").toLocaleDateString("en-PK", { month: "short", year: "numeric" }) : "…"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Status: <strong>{run?.status || "…"}</strong>
          </p>
        </div>

        {/* Dynamic workflow buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          {canSubmit && (
            <button className="btn btn-submit" onClick={handleSubmit} disabled={actionLoading !== ""}>
              <Send size={16} /> {actionLoading === "submit" ? "Submitting..." : "Submit"}
            </button>
          )}
          {canApprove && (
            <button className="btn btn-approve" onClick={handleApprove} disabled={actionLoading !== ""}>
              <ThumbsUp size={16} /> {actionLoading === "approve" ? "Approving..." : "Approve"}
            </button>
          )}
          {canPost && (
            <button className="btn btn-post" onClick={handlePost} disabled={actionLoading !== ""}>
              <CheckCircle size={16} /> {actionLoading === "post" ? "Posting..." : "Post Payroll"}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Gross Pay</div>
          <div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totals.gross.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Deductions</div>
          <div className="summary-value" style={{ color: "#EF4444" }}>PKR {totals.deductions.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Net Payable</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totals.net.toLocaleString()}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading employees…</div>
      ) : lines.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
          No employee lines found for this run.
        </div>
      ) : (
        lines.map(line => (
          <div key={line.id} className="line-card">
            <div className="line-header">
              <span>{line.employee_name}</span>
              <span style={{ color: "#10B981" }}>Net: PKR {line.net_amount.toLocaleString()}</span>
            </div>
            <div className="line-components">
              {line.salary_structure_snapshot?.components?.map((c: any, i: number) => (
                <div key={i} className="component-row">
                  <span>{c.name} ({c.type})</span>
                  <span style={{ fontWeight: 600, color: c.type === "earning" ? "#059669" : "#DC2626" }}>
                    {c.type === "earning" ? "+" : "-"} PKR {c.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
              Gross: PKR {line.gross_amount.toLocaleString()} | Deductions: PKR {line.total_deductions.toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  )
}