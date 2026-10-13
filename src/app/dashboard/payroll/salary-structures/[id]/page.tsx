"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import SalaryPreview from "@/components/payroll/SalaryPreview"
import { describeCalc, normalizeCalcType, computeSalary, type StructureLine } from "@/lib/payrollCalc"

type ComponentRecord = {
  id: number
  salary_structure_id: number
  salary_component_id: number
  calculation_type: string
  value: number
  component_name?: string
  component_type?: string
  component_is_basic?: boolean
}

export default function SalaryStructureDetailPage() {
  const params = useParams()
  const structureId = Number(params.id)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [structure, setStructure] = useState<any>(null)
  const [name, setName] = useState("")
  const [components, setComponents] = useState<ComponentRecord[]>([])
  const [availableComponents, setAvailableComponents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")
  const [employeeCount, setEmployeeCount] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)

  // Removal confirmation
  const [removeTarget, setRemoveTarget] = useState<ComponentRecord | null>(null)

  // New component form
  const [newComponentId, setNewComponentId] = useState<number | null>(null)
  const [newCalcType, setNewCalcType] = useState<string>("fixed")
  const [newValue, setNewValue] = useState("")
  const [editingLineId, setEditingLineId] = useState<number | null>(null)
  const [salaryBasis, setSalaryBasis] = useState<"gross" | "basic">("gross")
  const [sampleAmount, setSampleAmount] = useState("100000")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase.from("salary_structures").select("*").eq("id", structureId).eq("company_id", cid).single()
          .then(({ data }) => {
            if (data) {
              setStructure(data)
              setName(data.name)
              setSalaryBasis(data.salary_basis === "basic" ? "basic" : "gross")
            }
          })
        supabase.from("salary_structure_components").select("*, salary_components!inner(name, type, is_basic)").eq("salary_structure_id", structureId)
          .then(({ data: comps }) => {
            const mapped = (comps || []).map((c: any) => ({
              ...c,
              component_name: c.salary_components?.name,
              component_type: c.salary_components?.type,
              component_is_basic: !!c.salary_components?.is_basic,
            }))
            setComponents(mapped)
          })
        supabase.from("salary_components").select("id, name, type, is_basic").eq("company_id", cid).eq("is_active", true).order("name")
          .then(({ data: available }) => setAvailableComponents(available || []))

        // Employee count for this structure (latest revisions)
        supabase.from("employee_salary_revisions").select("employee_id, effective_date, salary_structure_id")
          .order("effective_date", { ascending: false })
          .then(({ data: revs }) => {
            if (revs) {
              const latest: Record<number, string> = {}
              revs.forEach(r => {
                if (!latest[r.employee_id] || r.effective_date > latest[r.employee_id]) {
                  latest[r.employee_id] = r.effective_date
                }
              })
              const count = revs.filter(r => r.salary_structure_id === structureId && r.effective_date === latest[r.employee_id]).length
              setEmployeeCount(count)
            }
          })

        setLoading(false)
      }
    })
  }, [structureId])

  // Auto-dismiss flash
  useEffect(() => {
    if (flash) {
      const t = setTimeout(() => setFlash(""), 3500)
      return () => clearTimeout(t)
    }
  }, [flash])

  const handleSaveName = async () => {
    if (!name.trim()) { setError("Name cannot be empty"); return }
    setSaving(true)
    setError("")
    const { error: updateErr } = await supabase
      .from("salary_structures")
      .update({ name: name.trim(), salary_basis: salaryBasis, updated_at: new Date().toISOString() })
      .eq("id", structureId)
      .eq("company_id", companyId)
    if (updateErr) setError(updateErr.message)
    else {
      setFlash("Structure saved")
      setStructure({ ...structure, name: name.trim(), salary_basis: salaryBasis })
    }
    setSaving(false)
  }

  const resetLineForm = () => {
    setEditingLineId(null)
    setNewComponentId(null)
    setNewCalcType("fixed")
    setNewValue("")
  }

  const startEditLine = (c: ComponentRecord) => {
    setEditingLineId(c.id)
    setNewComponentId(c.salary_component_id)
    setNewCalcType(normalizeCalcType(c.calculation_type))
    setNewValue(String(c.value))
    setShowAddForm(true)
  }

  const reloadLines = async () => {
    const { data: comps } = await supabase
      .from("salary_structure_components")
      .select("*, salary_components!inner(name, type, is_basic)")
      .eq("salary_structure_id", structureId)
    const mapped = (comps || []).map((c: any) => ({
      ...c,
      component_name: c.salary_components?.name,
      component_type: c.salary_components?.type,
      component_is_basic: !!c.salary_components?.is_basic,
    }))
    setComponents(mapped)
  }

  const handleAddComponent = async () => {
    if (!newComponentId || newValue === "") { setError("Select a component and enter a value"); return }
    if (Number(newValue) < 0) { setError("The value cannot be negative"); return }
    const picked = availableComponents.find(a => a.id === newComponentId)
    if (newCalcType === "percentage_gross" && picked?.type === "earning" && salaryBasis === "basic") {
      setError('"% of Gross" earnings need a structure where the salary is entered as Gross. Change "Employee salary is entered as" to Gross first.')
      return
    }
    if (newCalcType !== "fixed" && Number(newValue) > 100) { setError("A percentage cannot be more than 100"); return }
    setError("")
    if (editingLineId) {
      const { error: updErr } = await supabase
        .from("salary_structure_components")
        .update({ calculation_type: newCalcType, value: Number(newValue) })
        .eq("id", editingLineId)
      if (updErr) { setError(updErr.message); return }
      setFlash("Line updated")
    } else {
      if (components.some(c => c.salary_component_id === newComponentId)) {
        setError("This component is already in the structure. Edit its line instead.")
        return
      }
      const { error: insertErr } = await supabase
        .from("salary_structure_components")
        .insert({
          salary_structure_id: structureId,
          salary_component_id: newComponentId,
          calculation_type: newCalcType,
          value: Number(newValue),
        })
      if (insertErr) { setError(insertErr.message); return }
      setFlash("Component added")
    }
    await reloadLines()
    resetLineForm()
    setShowAddForm(false)
  }

  // Pre-fill the form with the Basic Salary component (one click)
  const prefillBasic = () => {
    const basic = availableComponents.find(a => a.is_basic)
    if (!basic) { setError("No component is marked as the Basic Salary yet. Open Salary Components and tick \"This is the Basic Salary\" on one earning."); return }
    setEditingLineId(null)
    setNewComponentId(basic.id)
    if (salaryBasis === "gross") { setNewCalcType("percentage_gross"); setNewValue("60") }
    else { setNewCalcType("percentage_basic"); setNewValue("100") }
    setShowAddForm(true)
  }

  const confirmRemoveComponent = async () => {
    if (!removeTarget) return
    const { error: deleteErr } = await supabase
      .from("salary_structure_components")
      .delete()
      .eq("id", removeTarget.id)
    if (deleteErr) { setError(deleteErr.message) }
    else {
      setComponents(prev => prev.filter(c => c.id !== removeTarget.id))
      setFlash("Component removed")
    }
    setRemoveTarget(null)
  }

  const lineDefs: StructureLine[] = components.map(c => ({
    key: c.salary_component_id,
    name: c.component_name || "Component",
    type: c.component_type === "earning" ? "earning" : "deduction",
    isBasic: !!c.component_is_basic,
    calcType: c.calculation_type,
    value: Number(c.value),
  }))
  const check = computeSalary(lineDefs, salaryBasis, Number(sampleAmount) || 100000)
  const hasBasicLine = components.some(c => c.component_is_basic)

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>
  if (!structure) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Structure not found.</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; font-family: inherit; background: var(--bg); color: var(--text); outline: none; }
        .input:focus, .select:focus { border-color: var(--primary); }
        .btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text-muted); transition: 0.2s; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { opacity: 0.9; }
        .btn-danger { color: #EF4444; border-color: #EF4444; }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; color: white; font-weight: 500; z-index: 2000; animation: slideIn 0.3s; }
        .toast-success { background: #16a34a; }
        .toast-error { background: #dc2626; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--card); border-radius: 12px; padding: 24px; width: 90%; max-width: 400px; }
      `}</style>

      {/* Toast */}
      {flash && <div className="toast toast-success">{flash}</div>}
      {error && <div className="toast toast-error">{error}</div>}

      {/* Remove confirmation modal */}
      {removeTarget && (
        <div className="modal-overlay" onClick={() => setRemoveTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}><AlertTriangle size={20} style={{ marginRight: 8, color: "#f59e0b", verticalAlign: "middle" }} /> Remove Component</h3>
            <p style={{ margin: "12px 0", color: "var(--text-muted)" }}>Remove <strong>{removeTarget.component_name}</strong> from this structure?</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setRemoveTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmRemoveComponent}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        <button className="btn btn-ghost" style={{ padding: 0, background: "transparent", border: "none", color: "var(--text-muted)", textDecoration: "underline", cursor: "pointer" }} onClick={() => router.push("/dashboard/payroll/salary-structures")}>
          Salary Structures
        </button>
        <span style={{ margin: "0 8px" }}>/</span>
        <span style={{ color: "var(--text)" }}>{structure.name}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/salary-structures")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📊 {structure.name}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Edit structure details and components · {employeeCount} employees assigned</p>
        </div>
      </div>

      {/* Name and how the employee's salary figure is entered */}
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Structure Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="label">Employee salary is entered as</label>
            <select className="select" value={salaryBasis} onChange={e => setSalaryBasis(e.target.value as any)} disabled={!canEdit}>
              <option value="gross">Gross salary (the system splits it)</option>
              <option value="basic">Basic salary (allowances are added on top)</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleSaveName} disabled={saving || !canEdit}>
            <Save size={16} /> {saving ? "Saving..." : "Save"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "10px 0 0" }}>
          {salaryBasis === "gross"
            ? "Example: you enter Gross 100,000. Basic is 60% of Gross, House Rent 30% of Gross, and so on. Provident Fund can be a % of Basic."
            : "Example: you enter Basic 50,000. House Rent is 40% of Basic, and so on. Deductions can be a % of Basic or of the Gross total."}
        </p>
      </div>

      {/* Components list */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Components ({components.length})</h2>
          {canEdit && (
            <button className="btn" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={16} /> Add Component
              {showAddForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>

        {canEdit && !hasBasicLine && (
          <div style={{ background: "var(--card-hover)", border: "1px solid #F59E0B", borderRadius: 8, padding: "10px 12px", fontSize: 12, marginBottom: 12 }}>
            <strong>Basic Salary line missing.</strong>{" "}
            {salaryBasis === "basic"
              ? "Without it the basic salary itself is NOT paid - only the allowances."
              : 'Without it every "% of Basic" amount will be 0.'}{" "}
            <button className="btn" style={{ padding: "3px 10px", marginLeft: 6 }} onClick={prefillBasic}>Add Basic Salary line</button>
          </div>
        )}
        {components.length === 0 && !showAddForm ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No components added yet. Click "Add Component" to get started.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Type</th>
                <th>How it is calculated</th>
                <th style={{ textAlign: "right" }}>Sample amount</th>
                {canEdit && <th style={{ width: 80 }}></th>}
              </tr>
            </thead>
            <tbody>
              {components.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.component_name || `ID ${c.salary_component_id}`}{c.component_is_basic ? " (Basic)" : ""}</td>
                  <td style={{ textTransform: "capitalize" }}>{c.component_type || "-"}</td>
                  <td>{describeCalc(c.calculation_type, Number(c.value))}</td>
                  <td style={{ textAlign: "right" }}>{(check.lines.find(l => l.key === c.salary_component_id)?.amount ?? 0).toLocaleString()}</td>
                  {canEdit && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: "4px 8px", marginRight: 4 }} onClick={() => startEditLine(c)}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: "4px 8px" }} onClick={() => setRemoveTarget(c)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add Component Form (collapsible) */}
        {canEdit && showAddForm && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="label">Component</label>
              <select className="select" value={newComponentId ?? ""} disabled={!!editingLineId} onChange={e => setNewComponentId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select…</option>
                {availableComponents.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
            <div style={{ width: 200 }}>
              <label className="label">How it is calculated</label>
              <select className="select" value={newCalcType} onChange={e => setNewCalcType(e.target.value)}>
                <option value="fixed">Fixed amount</option>
                <option value="percentage_gross">% of Gross</option>
                <option value="percentage_basic">% of Basic</option>
              </select>
            </div>
            <div style={{ width: 110 }}>
              <label className="label">{newCalcType === "fixed" ? "Amount" : "Percent (%)"}</label>
              <input className="input" type="number" step="any" value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="0" />
            </div>
            <button className="btn btn-primary" onClick={handleAddComponent}><Plus size={16} /> {editingLineId ? "Update" : "Add"}</button>
            {editingLineId && <button className="btn" onClick={() => { resetLineForm(); setShowAddForm(false) }}>Cancel</button>}
          </div>
        )}
      </div>

      {/* Live example */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Try it with a sample salary</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          This shows exactly what an employee on this structure would get. Change the figure to test.
        </p>
        <SalaryPreview structureId={structureId} amount={sampleAmount} onAmountChange={setSampleAmount} refreshKey={components.length + ":" + components.map(c => c.calculation_type + c.value).join(",") + salaryBasis} title="Sample payslip" />
      </div>
    </div>
  )
}
