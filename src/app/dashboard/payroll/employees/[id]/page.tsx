"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch employee
        supabase
          .from("employees")
          .select("*")
          .eq("id", employeeId)
          .eq("company_id", cid)
          .single()
          .then(({ data }) => {
            if (data) setEmployee(data)
          })

        // Fetch revisions with structure name
        supabase
          .from("employee_salary_revisions")
          .select("*, salary_structures(name)")
          .eq("employee_id", employeeId)
          .order("effective_date", { ascending: false })
          .then(({ data: revs }) => {
            setRevisions(revs || [])
            setLoading(false)
          })
      }
    })
  }, [employeeId])

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
  if (!employee) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Employee not found.</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .value { font-size: 14px; font-weight: 500; }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-back { padding: 6px 12px; }
        .table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/employees")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>👤 {employee.full_name}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Employee Profile</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push(`/dashboard/payroll/employees/${employeeId}/revisions/new`)}>
            <Plus size={16} /> Add Revision
          </button>
        )}
      </div>

      {/* Employee Details */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Employee Details</h2>
        <div className="grid">
          <div><span className="label">Code</span><div className="value">{employee.employee_code}</div></div>
          <div><span className="label">Type</span><div className="value" style={{ textTransform: "capitalize" }}>{employee.employment_type}</div></div>
          <div><span className="label">Status</span><div className="value" style={{ textTransform: "capitalize" }}>{employee.status}</div></div>
          <div><span className="label">Joining Date</span><div className="value">{employee.joining_date}</div></div>
          <div><span className="label">CNIC</span><div className="value">{employee.cnic || "—"}</div></div>
          <div><span className="label">Email</span><div className="value">{employee.email || "—"}</div></div>
          <div><span className="label">Mobile</span><div className="value">{employee.mobile || "—"}</div></div>
          <div><span className="label">Payment Method</span><div className="value" style={{ textTransform: "capitalize" }}>{employee.payment_method}</div></div>
          <div><span className="label">Bank Account</span><div className="value">{employee.bank_account_no || "—"}</div></div>
          <div><span className="label">Tax Status</span><div className="value">{employee.tax_status || "—"}</div></div>
        </div>
      </div>

      {/* Salary Revisions */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Salary Revisions</h2>
        {revisions.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No salary revisions recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Effective Date</th>
                <th>Basic Salary</th>
                <th>Structure</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.effective_date}</td>
                  <td style={{ fontWeight: 600 }}>{Number(r.basic_salary).toLocaleString()}</td>
                  <td>{r.salary_structures?.name || "—"}</td>
                  <td>{r.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}