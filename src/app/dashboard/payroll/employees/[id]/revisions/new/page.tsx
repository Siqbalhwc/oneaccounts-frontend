"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import EntityPicker from "@/components/entity-picker/EntityPicker"

export default function NewSalaryRevisionPage() {
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
  const [employeeName, setEmployeeName] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0])
  const [basicSalary, setBasicSalary] = useState("")
  const [salaryStructureId, setSalaryStructureId] = useState<number | null>(null)
  const [selectedSalaryStructure, setSelectedSalaryStructure] = useState<any>(null)
  const [reason, setReason] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch employee name for display
        supabase
          .from("employees")
          .select("full_name")
          .eq("id", employeeId)
          .eq("company_id", cid)
          .single()
          .then(({ data }) => {
            if (data) setEmployeeName(data.full_name)
          })
      }
    })
  }, [employeeId])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!basicSalary || isNaN(Number(basicSalary))) { setError("Basic salary is required"); return }
    if (!salaryStructureId) { setError("Salary structure is required"); return }

    setLoading(true)
    setError("")

    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || null

    const payload = {
      employee_id: employeeId,
      salary_structure_id: salaryStructureId,
      basic_salary: Number(basicSalary),
      effective_date: effectiveDate,
      reason: reason.trim() || null,
      created_by: userId,
    }

    const { error: insertErr } = await supabase
      .from("employee_salary_revisions")
      .insert(payload)

    if (insertErr) {
      setError(insertErr.message)
      setLoading(false)
      return
    }

    setFlash("✅ Salary revision added!")
    setLoading(false)
    setTimeout(() => router.push(`/dashboard/payroll/employees/${employeeId}`), 1500)
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

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .input:focus, .select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-submit { width: 100%; justify-content: center; background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push(`/dashboard/payroll/employees/${employeeId}`)}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💰 New Salary Revision</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{employeeName ? `For ${employeeName}` : "Set new basic salary"}</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <label className="label">Effective Date *</label>
            <input className="input" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Basic Salary *</label>
            <input className="input" type="number" step="any" value={basicSalary} onChange={e => setBasicSalary(e.target.value)} placeholder="e.g. 50000" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Salary Structure *</label>
            <EntityPicker
              entityType="salary_structure"
              value={selectedSalaryStructure}
              onChange={(record) => {
                setSalaryStructureId(record ? Number(record.id) : null)
                setSelectedSalaryStructure(record)
              }}
              placeholder="Select salary structure…"
              label=""
              allowCreate={false}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Reason (optional)</label>
            <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Annual increment" />
          </div>

          <button className="btn btn-submit" type="submit" disabled={loading}>
            {loading ? "Saving..." : <><Plus size={16} /> Save Revision</>}
          </button>
        </div>
      </form>
    </div>
  )
}