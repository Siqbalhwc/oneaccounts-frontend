"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

const AVAILABLE_ROLES = ["admin", "accountant"]   // match your user_roles table

export default function ApprovalWorkflowPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
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
    setFlash("✅ Approval workflow saved")
    setSaving(false)
  }

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
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const showSubmit = approvalLevels === "3"
  const showApprove = approvalLevels === "2" || approvalLevels === "3"

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .select { width: 220px; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--bg); color: var(--text); }
        .step-box { border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
        .step-title { font-weight: 700; font-size: 15px; margin-bottom: 8px; }
        .role-chip { display: inline-block; padding: 4px 12px; margin: 4px 6px 4px 0; border-radius: 20px; font-size: 12px; cursor: pointer; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
        .role-chip.selected { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/runs")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>⚙️ Approval Workflow</h1>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}><CheckCircle size={16} /> {flash}</div>}

      <div className="card">
        <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 12, display: "block" }}>Number of Approval Stages</label>
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
            <span
              key={r}
              className={`role-chip ${submitRoles.includes(r) ? "selected" : ""}`}
              onClick={() => toggleRole(r, submitRoles, setSubmitRoles)}
            >
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Approve step */}
      {showApprove && (
        <div className="card step-box">
          <div className="step-title">✅ Approve</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Who can approve a submitted or draft run?</p>
          {AVAILABLE_ROLES.map(r => (
            <span
              key={r}
              className={`role-chip ${approveRoles.includes(r) ? "selected" : ""}`}
              onClick={() => toggleRole(r, approveRoles, setApproveRoles)}
            >
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Post step – always visible (even Level 1) because posting always needs a role */}
      <div className="card step-box">
        <div className="step-title">📦 Post</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Who can finalize and post the payroll?</p>
        {AVAILABLE_ROLES.map(r => (
          <span
            key={r}
            className={`role-chip ${postRoles.includes(r) ? "selected" : ""}`}
            onClick={() => toggleRole(r, postRoles, setPostRoles)}
          >
            {r}
          </span>
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
