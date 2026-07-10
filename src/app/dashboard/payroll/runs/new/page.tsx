"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2 } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

const DEPT_PLACEHOLDER = "All Departments"

export default function NewPayrollRunPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")

  // ── Form state ───────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })

  const [departmentId, setDepartmentId] = useState<string>("")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  // Department list
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([])

  // Preview data – simplified (no is_active)
  const [preview, setPreview] = useState<{
    totalEmployees: number
    missingStructure: number
    activeLoans: number
    activeAdvances: number
    warnings: string[]
  } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // ── Fetch company ID and departments (graceful) ──────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      try {
        const { data: deptData } = await supabase
          .from("departments")
          .select("id, name")
          .eq("company_id", cid)
          .order("name")
        setDepartments(deptData || [])
      } catch {
        setDepartments([])
      }
    })
  }, [])

  // ── Preview effect (no is_active) ────────────────────────
  useEffect(() => {
    if (!companyId) return
    setLoadingPreview(true)
    setError("")

    async function loadPreview() {
      try {
        // 1. Count all employees (no is_active filter)
        let employeeQuery = supabase
          .from("employees")
          .select("id")
          .eq("company_id", companyId)

        if (departmentId) {
          employeeQuery = employeeQuery.eq("department_id", departmentId)
        }

        const { data: employees, error: empErr } = await employeeQuery
        if (empErr) {
          setError("Failed to load employee data: " + empErr.message)
          setLoadingPreview(false)
          return
        }

        const allEmployees = employees || []
        const totalEmployees = allEmployees.length

        // 2. Missing salary structure – using employee_salary_revisions
        let missingStructureCount = 0
        if (totalEmployees > 0) {
          const { data: revisions } = await supabase
            .from("employee_salary_revisions")
            .select("employee_id, effective_date")
            .eq("company_id", companyId)
            .order("effective_date", { ascending: false })

          if (revisions) {
            const latestRevMap: Record<number, string> = {}
            revisions.forEach(rev => {
              if (!latestRevMap[rev.employee_id] || rev.effective_date > latestRevMap[rev.employee_id]) {
                latestRevMap[rev.employee_id] = rev.effective_date
              }
            })
            missingStructureCount = allEmployees.filter(e => !latestRevMap[e.id]).length
          } else {
            // If revisions table empty, all employees lack a structure
            missingStructureCount = totalEmployees
          }
        }

        // 3. Active loans
        let { count: loansCount } = await supabase
          .from("employee_loans")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "active")
        loansCount = loansCount || 0

        // 4. Active advances
        let { count: advancesCount } = await supabase
          .from("salary_advances")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "active")
        advancesCount = advancesCount || 0

        const warnings: string[] = []
        if (missingStructureCount > 0) {
          warnings.push(`${missingStructureCount} employee(s) have no salary structure assigned.`)
        }

        setPreview({
          totalEmployees,
          missingStructure: missingStructureCount,
          activeLoans: loansCount,
          activeAdvances: advancesCount,
          warnings,
        })
      } catch (err: any) {
        setError(err.message || "Preview load failed")
      } finally {
        setLoadingPreview(false)
      }
    }

    loadPreview()
  }, [companyId, selectedMonth, departmentId])

  // ── Generate run ─────────────────────────────────────────
  const handleGenerate = async () => {
    if (!companyId || !selectedMonth) {
      setError("Month is required")
      return
    }
    setGenerating(true)
    setError("")
    setFlash("")

    const monthDate = `${selectedMonth}-01`

    try {
      const res = await fetch("/api/payroll/runs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: monthDate,
          department_id: departmentId || null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.run_id) {
          setFlash("A run already exists for this month. Redirecting...")
          setTimeout(() => router.push(`/dashboard/payroll/runs/${data.run_id}`), 1500)
          return
        }
        setError(data.error || "Generation failed")
        setGenerating(false)
        return
      }

      if (data.success && data.run_id) {
        setFlash("✅ Payroll run generated successfully!")
        setGenerating(false)
        setTimeout(() => router.push(`/dashboard/payroll/runs/${data.run_id}`), 1500)
      } else {
        setError(data.error || "Unexpected error")
        setGenerating(false)
      }
    } catch (err: any) {
      setError(err.message || "Network error")
      setGenerating(false)
    }
  }

  // ── Access control ───────────────────────────────────────
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const todayStr = new Date().toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .label {
          font-size: 10px; font-weight: 600; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;
        }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .input:focus, .select:focus { border-color: var(--primary); }
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
        .preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }
        .preview-item {
          background: var(--bg-soft); border-radius: 10px; padding: 12px; text-align: center;
        }
        .preview-value { font-size: 20px; font-weight: 800; color: var(--text); }
        .preview-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-top: 4px; }
        .warning-list {
          list-style: none; padding: 0; margin: 8px 0 0; font-size: 12px; color: #F59E0B;
        }
        .warning-list li {
          display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
        }
        .toast {
          position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px;
          color: white; font-weight: 500; z-index: 2000; animation: slideIn 0.3s;
        }
        .toast-success { background: #16a34a; }
        .toast-error { background: #dc2626; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        <button className="btn" style={{ padding: 0, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--text-muted)" }} onClick={() => router.push("/dashboard/payroll/runs")}>
          Payroll Runs
        </button>
        <span style={{ margin: "0 8px" }}>/</span>
        <span style={{ color: "var(--text)" }}>New Run</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/runs")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📅 New Payroll Run</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Select payroll month and review details</p>
        </div>
      </div>

      {error && <div className="toast toast-error">{error}</div>}
      {flash && <div className="toast toast-success">{flash}</div>}

      {/* 1. Payroll Period */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>1️⃣ Payroll Period</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "end" }}>
          <div>
            <label className="label">Payroll Month *</label>
            <input
              className="input"
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Run Date</label>
            <div style={{ height: 38, display: "flex", alignItems: "center", fontSize: 13, color: "var(--text)", paddingLeft: 4 }}>
              {todayStr}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="label">Department</label>
          <select className="select" value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">{DEPT_PLACEHOLDER}</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Preview */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          2️⃣ Preview {loadingPreview && <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginLeft: 8 }} />}
        </h2>

        {loadingPreview ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 12, height: 60 }} />
            ))}
          </div>
        ) : preview ? (
          <>
            <div className="preview-grid">
              <div className="preview-item">
                <div className="preview-value">{preview.totalEmployees}</div>
                <div className="preview-label">Employees</div>
              </div>
              <div className="preview-item">
                <div className="preview-value" style={{ color: preview.missingStructure > 0 ? "#EF4444" : "#10B981" }}>
                  {preview.missingStructure}
                </div>
                <div className="preview-label">Missing Structure</div>
              </div>
              <div className="preview-item">
                <div className="preview-value">{preview.activeLoans}</div>
                <div className="preview-label">Active Loans</div>
              </div>
              <div className="preview-item">
                <div className="preview-value">{preview.activeAdvances}</div>
                <div className="preview-label">Active Advances</div>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <ul className="warning-list">
                {preview.warnings.map((w, i) => (
                  <li key={i}><AlertTriangle size={12} color="#F59E0B" /> {w}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Could not load preview.</p>
        )}
      </div>

      {/* 3. Generate */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>3️⃣ Generate Payroll</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
          {preview
            ? `This will create a payroll run for ${preview.totalEmployees} employee(s).`
            : "Please wait for the preview to finish."}
        </p>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating || loadingPreview}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {generating ? (
            <>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating...
            </>
          ) : (
            "Generate Payroll"
          )}
        </button>
      </div>
    </div>
  )
}