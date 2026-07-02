"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import EntityPicker from "@/components/entity-picker/EntityPicker"

const EMPLOYMENT_TYPES = ["permanent", "contract", "daily_wage", "consultant"]
const PAYMENT_METHODS = ["bank", "cash"]
const EMPLOYEE_STATUSES = ["draft", "active", "on_leave", "resigned", "terminated", "retired"]

export default function NewEmployeePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
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
  const [employeeCode, setEmployeeCode] = useState("")
  const [fullName, setFullName] = useState("")
  const [cnic, setCnic] = useState("")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split("T")[0])
  const [employmentType, setEmploymentType] = useState("permanent")
  const [paymentMethod, setPaymentMethod] = useState("bank")
  const [bankAccountNo, setBankAccountNo] = useState("")
  const [taxStatus, setTaxStatus] = useState("")
  const [status, setStatus] = useState("active")
  const [salaryStructureId, setSalaryStructureId] = useState<number | null>(null)
  const [selectedSalaryStructure, setSelectedSalaryStructure] = useState<any>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Auto‑generate employee code
        supabase
          .from("employees")
          .select("employee_code")
          .eq("company_id", cid)
          .order("employee_code", { ascending: false })
          .limit(1)
          .then(({ data }) => {
            let nextNum = 1
            if (data && data.length > 0) {
              const match = data[0].employee_code?.match(/EMP-(\d+)/)
              if (match) nextNum = parseInt(match[1], 10) + 1
            }
            setEmployeeCode(`EMP-${String(nextNum).padStart(4, "0")}`)
          })
      }
    })
  }, [])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!fullName.trim()) { setError("Employee name is required"); return }
    setLoading(true)
    setError("")

    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || "system"

    const payload = {
      company_id: companyId,
      employee_code: employeeCode,
      full_name: fullName.trim(),
      cnic: cnic.trim() || null,
      email: email.trim() || null,
      mobile: mobile.trim() || null,
      joining_date: joiningDate,
      employment_type: employmentType,
      salary_structure_id: salaryStructureId,
      payment_method: paymentMethod,
      bank_account_no: bankAccountNo.trim() || null,
      tax_status: taxStatus.trim() || null,
      status: status,
      created_by: userEmail,
      updated_by: userEmail,
    }

    const { data, error: insertErr } = await supabase
      .from("employees")
      .insert(payload)
      .select("id, employee_code, full_name")
      .single()

    if (insertErr) {
      if (insertErr.message?.includes("duplicate key")) {
        setError("This employee code already exists. Please refresh to regenerate.")
      } else {
        setError(insertErr.message)
      }
      setLoading(false)
      return
    }

    setFlash(`✅ Employee ${data.employee_code} – ${data.full_name} created!`)
    setFullName("")
    setCnic("")
    setEmail("")
    setMobile("")
    setJoiningDate(new Date().toISOString().split("T")[0])
    setEmploymentType("permanent")
    setPaymentMethod("bank")
    setBankAccountNo("")
    setTaxStatus("")
    setStatus("active")
    setSalaryStructureId(null)
    setSelectedSalaryStructure(null)
    setLoading(false)
    setTimeout(() => router.push("/dashboard/payroll/employees"), 1500)
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
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-submit { width: 100%; justify-content: center; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }

        @media (max-width: 900px) {
          .header-grid { grid-template-columns: 1fr; }
          .summary-side { order: -1; }
        }
        @media (max-width: 600px) {
          .inline-group { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/employees")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>➕ New Employee</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Add a new employee to the payroll system</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="header-grid">
          {/* Left: Form fields */}
          <div className="card">
            <div style={{ marginBottom: 16 }}>
              <label className="label">Employee Code</label>
              <input className="input" value={employeeCode} disabled />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Full Name *</label>
              <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Muhammad Ali" />
            </div>

            <div className="inline-group" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">CNIC</label>
                <input className="input" value={cnic} onChange={e => setCnic(e.target.value)} placeholder="00000-0000000-0" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ali@example.com" />
              </div>
            </div>

            <div className="inline-group" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Mobile</label>
                <input className="input" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="0300-1234567" />
              </div>
              <div>
                <label className="label">Joining Date</label>
                <input className="input" type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} />
              </div>
            </div>

            <div className="inline-group" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Employment Type</label>
                <select className="select" value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
                  {EMPLOYEE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Salary Structure</label>
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

            <div className="inline-group" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Payment Method</label>
                <select className="select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Bank Account No</label>
                <input className="input" value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} placeholder="Bank account number" />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Tax Status</label>
              <input className="input" value={taxStatus} onChange={e => setTaxStatus(e.target.value)} placeholder="e.g. Taxable, Non‑Taxable" />
            </div>
          </div>

          {/* Right: Save button card */}
          <div className="summary-side" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card" style={{ padding: "16px" }}>
              <button className="btn btn-submit" type="submit" disabled={loading}>
                {loading ? "Saving..." : <><Plus size={16} /> Create Employee</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}