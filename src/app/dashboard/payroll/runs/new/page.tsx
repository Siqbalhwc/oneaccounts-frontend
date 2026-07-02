"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

export default function NewPayrollRunPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  const [companyId, setCompanyId] = useState("")
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [departmentId, setDepartmentId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const handleGenerate = async () => {
    if (!companyId || !month) { setError("Month is required"); return }
    setLoading(true)
    setError("")
    setFlash("")

    try {
      const res = await fetch("/api/payroll/runs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          department_id: departmentId || null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.run_id) {
          // Run already exists – redirect to that run
          setFlash("A run already exists for this month. Redirecting...")
          setTimeout(() => router.push(`/dashboard/payroll/runs/${data.run_id}`), 1500)
          return
        }
        setError(data.error || "Generation failed")
        setLoading(false)
        return
      }

      if (data.success && data.run_id) {
        setFlash("✅ Payroll run generated successfully!")
        setLoading(false)
        setTimeout(() => router.push(`/dashboard/payroll/runs/${data.run_id}`), 1500)
      } else {
        setError(data.error || "Unexpected error")
        setLoading(false)
      }
    } catch (err: any) {
      setError(err.message || "Network error")
      setLoading(false)
    }
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
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/runs")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📅 New Payroll Run</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Generate payroll for a specific month and department</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <label className="label">Month *</label>
          <input className="input" type="date" value={month} onChange={e => setMonth(e.target.value)} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label">Department (optional)</label>
          <input className="input" placeholder="Department ID (leave blank for all)" value={departmentId} onChange={e => setDepartmentId(e.target.value)} />
        </div>

        <button className="btn btn-submit" onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating..." : "Generate Payroll"}
        </button>
      </div>
    </div>
  )
}