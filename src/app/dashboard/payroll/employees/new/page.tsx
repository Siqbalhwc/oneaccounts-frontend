"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, UserPlus, CheckCircle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import EntityPicker from "@/components/entity-picker/EntityPicker"

const EMPLOYMENT_TYPES = ["permanent", "contract", "daily_wage", "consultant"]
const PAYMENT_METHODS = ["bank", "cash"]

const CNIC_REGEX = /^\d{5}-\d{7}-\d$/
const MOBILE_REGEX = /^03\d{2}-\d{7}$/

export default function NewEmployeePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

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
  const [salaryStructureId, setSalaryStructureId] = useState<number | null>(null)
  const [selectedSalaryStructure, setSelectedSalaryStructure] = useState<any>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Optional department / designation (future)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [designationId, setDesignationId] = useState<number | null>(null)
  const [departments, setDepartments] = useState<any[]>([])
  const [designations, setDesignations] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Generate employee code
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
        supabase.from("departments").select("id, name").eq("company_id", cid).order("name").then(({ data }) => setDepartments(data || []))
        supabase.from("designations").select("id, name").eq("company_id", cid).order("name").then(({ data }) => setDesignations(data || []))
      }
    })
  }, [])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!fullName.trim()) { setError("Full name is required"); return }

    if (cnic.trim() && !CNIC_REGEX.test(cnic.trim())) {
      setError("CNIC format must be 00000-0000000-0")
      return
    }
    if (mobile.trim() && !MOBILE_REGEX.test(mobile.trim())) {
      setError("Mobile format must be 03XX-XXXXXXX")
      return
    }

    setLoading(true)
    setError("")

    const payload = {
      company_id: companyId,
      employee_code: employeeCode,
      full_name: fullName.trim(),
      cnic: cnic.trim() || null,
      email: email.trim() || null,
      mobile: mobile.trim() || null,
      joining_date: joiningDate,
      employment_type: employmentType,
      status: "active",          // new employees are always active
      payment_method: paymentMethod,
      bank_account_no: bankAccountNo.trim() || null,
      tax_status: taxStatus.trim() || null,
      salary_structure_id: salaryStructureId,
      department_id: departmentId,
      designation_id: designationId,
    }

    const { data, error: insertErr } = await supabase
      .from("employees")
      .insert(payload)
      .select("id, employee_code, full_name")
      .single()

    if (insertErr) {
      if (insertErr.message?.includes("duplicate key")) {
        setError("This employee code already exists. Please refresh.")
      } else {
        setError(insertErr.message)
      }
      setLoading(false)
      return
    }

    setFlash(`Employee ${data.employee_code} created successfully`)
    setLoading(false)
    setTimeout(() => router.push("/dashboard/payroll/employees"), 1500)
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const summary = {
    code: employeeCode,
    name: fullName,
    type: employmentType,
    salaryStructure: selectedSalaryStructure?.name || "None",
    paymentMethod,
    bankAccount: bankAccountNo,
  }

  return (
    <div style={{ padding: "24px 32px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
          box-shadow: var(--shadow-sm);
        }
        .section-title {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 6px;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .section-subtitle {
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 18px;
          font-weight: 400;
        }
        .label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 6px;
          display: block;
        }
        .input, .select {
          width: 100%;
          height: 42px;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0 14px;
          font-size: 14px;
          background: var(--bg);
          color: var(--text);
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
        }
        .input:focus, .select:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
        }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
          transition: all 0.2s;
        }
        .btn-primary { background: var(--primary); color: var(--primary-text); }
        .btn-primary:hover { filter: brightness(0.95); }
        .btn-outline {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
        }
        .btn-outline:hover { background: var(--card-hover); }
        .inline-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 24px;
          align-items: start;
        }
        .summary-panel .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }
        .summary-panel .summary-label {
          color: var(--text-muted);
        }
        .summary-panel .summary-value {
          font-weight: 600;
        }
        @media (max-width: 1000px) {
          .layout { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/payroll/employees")}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <UserPlus size={22} style={{ color: "var(--primary)" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>New Employee</h1>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "12px 18px", borderRadius: 8, marginBottom: 16, fontSize: 14, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "12px 18px", borderRadius: 8, marginBottom: 16, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div className="layout">
        {/* Left form sections */}
        <div>
          {/* 1. Identity */}
          <div className="card">
            <div className="section-title">1. Identity</div>
            <div className="section-subtitle">Employee personal information</div>
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
                <label className="label">CNIC (optional)</label>
                <input className="input" value={cnic} onChange={e => setCnic(e.target.value)} placeholder="00000-0000000-0" />
              </div>
              <div>
                <label className="label">Email (optional)</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ali@example.com" />
              </div>
            </div>
            <div>
              <label className="label">Mobile (optional)</label>
              <input className="input" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="0300-1234567" />
            </div>
          </div>

          {/* 2. Employment */}
          <div className="card">
            <div className="section-title">2. Employment</div>
            <div className="section-subtitle">Role and department assignment</div>
            <div className="inline-group" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Joining Date</label>
                <input className="input" type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Employment Type</label>
                <select className="select" value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </div>
            </div>
            <div className="inline-group">
              <div>
                <label className="label">Department</label>
                <select className="select" value={departmentId ?? ""} onChange={e => setDepartmentId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select department…</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Designation</label>
                <select className="select" value={designationId ?? ""} onChange={e => setDesignationId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select designation…</option>
                  {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 3. Payroll */}
          <div className="card">
            <div className="section-title">3. Payroll</div>
            <div className="section-subtitle">Salary and payment details</div>
            <div style={{ marginBottom: 16 }}>
              <label className="label">Salary Structure</label>
              <EntityPicker
                entityType="salary_structure"
                value={selectedSalaryStructure}
                onChange={(record) => {
                  setSalaryStructureId(record ? Number(record.id) : null)
                  setSelectedSalaryStructure(record)
                }}
                placeholder="Select structure…"
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
                <label className="label">Bank Account No (optional)</label>
                <input className="input" value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} placeholder="Account number" />
              </div>
            </div>
            <div>
              <label className="label">Tax Status (optional)</label>
              <input className="input" value={taxStatus} onChange={e => setTaxStatus(e.target.value)} placeholder="e.g. Taxable, Non‑Taxable" />
            </div>
          </div>
        </div>

        {/* Right Summary Panel */}
        <div className="card" style={{ position: "sticky", top: 24 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Summary</div>
          <div className="summary-panel">
            <div className="summary-row">
              <span className="summary-label">Code</span>
              <span className="summary-value">{summary.code || "—"}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Name</span>
              <span className="summary-value">{summary.name || "—"}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Type</span>
              <span className="summary-value" style={{ textTransform: "capitalize" }}>{summary.type.replace("_", " ")}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Salary Structure</span>
              <span className="summary-value">{summary.salaryStructure}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Payment Method</span>
              <span className="summary-value" style={{ textTransform: "capitalize" }}>{summary.paymentMethod}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Bank Account</span>
              <span className="summary-value">{summary.bankAccount || "—"}</span>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 20, justifyContent: "center" }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Creating..." : <>Create Employee</>}
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 10 }}>
            Employee will become available immediately
          </div>
        </div>
      </div>
    </div>
  )
}