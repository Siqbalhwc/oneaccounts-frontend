"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

const AVAILABLE_ROLES = ["admin", "accountant"]   // match your user_roles table

export default function ApprovalWorkflowPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin"

  const [companyId, setCompanyId] = useState("")
  const [approvalLevels, setApprovalLevels] = useState("1")
  const [submitRoles, setSubmitRoles] = useState<string[]>([])
  const [approveRoles, setApproveRoles] = useState<string[]>([])
  const [postRoles, setPostRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

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

  const toggleRole = (role: string, list: string[], setter: (v: string[]) => void) => {
    if (list.includes(role)) setter(list.filter(r => r !== role))
    else setter([...list, role])
  }

  const handleSave = async () => {
    setSaving(true)
    setError("")
    const { error: upsertErr } = await supabase
      .from("payroll_approval_settings")
      .upsert({
        company_id: companyId,
        approval_levels: approvalLevels,
        submit_roles: submitRoles,
        approve_roles: approveRoles,
        post_roles: postRoles,
      })
    if (upsertErr) { setError(upsertErr.message); setSaving(false); return }
    setFlash("Approval workflow saved successfully")
    setSaving(false)
    setTimeout(() => setFlash(""), 3000)
  }

  // Access control – PayrollLayout handles feature gate
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const showSubmit = approvalLevels === "3"
  const showApprove = approvalLevels === "2" || approvalLevels === "3"

  const workflowSteps = [
    { key: "draft", label: "Draft", icon: "📝", alwaysVisible: true },
    { key: "submit", label: "Submit", icon: "📤", visible: showSubmit },
    { key: "approve", label: "Approve", icon: "✅", visible: showApprove },
    { key: "post", label: "Post", icon: "📦", alwaysVisible: true },
  ].filter(step => step.visible !== false)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary {
          background: var(--primary); color: var(--primary-text); border-color: var(--primary);
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .select {
          width: 100%; max-width: 320px; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text);
        }
        .step-box {
          border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 12px;
        }
        .step-title {
          font-weight: 700; font-size: 15px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;
        }
        .checkbox-label {
          display: flex; align-items: center; gap: 8px; margin: 6px 0; cursor: pointer; font-size: 13px;
          color: var(--text); user-select: none;
        }
        .checkbox-label input[type="checkbox"] {
          accent-color: var(--primary); width: 16px; height: 16px;
        }
        .workflow-summary {
          background: var(--bg-soft); border-radius: 10px; padding: 12px 16px;
          margin-bottom: 16px; font-size: 13px;
        }
        .workflow-summary strong { color: var(--primary); }
        .toast {
          position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px;
          color: white; font-weight: 500; z-index: 2000; animation: slideIn 0.3s;
        }
        .toast-success { background: #16a34a; }
        .toast-error { background: #dc2626; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Toast notifications */}
      {error && <div className="toast toast-error">{error}</div>}
      {flash && <div className="toast toast-success">{flash}</div>}

      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        <button
          className="btn"
          style={{ padding: 0, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--text-muted)" }}
          onClick={() => router.push("/dashboard/payroll/runs")}
        >
          Payroll Runs
        </button>
        <span style={{ margin: "0 8px" }}>/</span>
        <span style={{ color: "var(--text)" }}>Approval Workflow</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/runs")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>⚙️ Approval Workflow</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Define who can submit, approve, and post payroll runs</p>
        </div>
      </div>

      {/* Workflow summary */}
      <div className="workflow-summary">
        <strong>Current Workflow:</strong>{" "}
        {workflowSteps.map((step, idx) => (
          <span key={step.key}>
            {step.icon} {step.label}
            {idx < workflowSteps.length - 1 && " → "}
          </span>
        ))}
      </div>

      {/* Number of stages */}
      <div className="card">
        <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 12, display: "block" }}>
          Number of Approval Stages
        </label>
        <select className="select" value={approvalLevels} onChange={e => setApprovalLevels(e.target.value)}>
          <option value="1">1 – Direct Post (no extra stages)</option>
          <option value="2">2 – Draft → Approve → Post</option>
          <option value="3">3 – Draft → Submit → Approve → Post</option>
        </select>
      </div>

      {/* Submit step */}
      {showSubmit && (
        <div className="card step-box">
          <div className="step-title">📤 Submit</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Who can submit a draft for approval?</p>
          {AVAILABLE_ROLES.map(r => (
            <label key={r} className="checkbox-label">
              <input
                type="checkbox"
                checked={submitRoles.includes(r)}
                onChange={() => toggleRole(r, submitRoles, setSubmitRoles)}
              />
              <span style={{ textTransform: "capitalize" }}>{r}</span>
            </label>
          ))}
        </div>
      )}

      {/* Approve step */}
      {showApprove && (
        <div className="card step-box">
          <div className="step-title">✅ Approve</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Who can approve a submitted or draft run?</p>
          {AVAILABLE_ROLES.map(r => (
            <label key={r} className="checkbox-label">
              <input
                type="checkbox"
                checked={approveRoles.includes(r)}
                onChange={() => toggleRole(r, approveRoles, setApproveRoles)}
              />
              <span style={{ textTransform: "capitalize" }}>{r}</span>
            </label>
          ))}
        </div>
      )}

      {/* Post step – always visible */}
      <div className="card step-box">
        <div className="step-title">📦 Post</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Who can finalize and post the payroll?</p>
        {AVAILABLE_ROLES.map(r => (
          <label key={r} className="checkbox-label">
            <input
              type="checkbox"
              checked={postRoles.includes(r)}
              onChange={() => toggleRole(r, postRoles, setPostRoles)}
            />
            <span style={{ textTransform: "capitalize" }}>{r}</span>
          </label>
        ))}
      </div>

      {canEdit && (
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
        </button>
      )}
    </div>
  )
}