"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

type ComponentRecord = {
  id: number
  salary_structure_id: number
  salary_component_id: number
  calculation_type: "percentage" | "fixed"
  value: number
  component_name?: string
  component_type?: string
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
  const [newCalcType, setNewCalcType] = useState<"percentage" | "fixed">("fixed")
  const [newValue, setNewValue] = useState("")

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
            }
          })
        supabase.from("salary_structure_components").select("*, salary_components!inner(name, type)").eq("salary_structure_id", structureId)
          .then(({ data: comps }) => {
            const mapped = (comps || []).map((c: any) => ({
              ...c,
              component_name: c.salary_components?.name,
              component_type: c.salary_components?.type,
            }))
            setComponents(mapped)
          })
        supabase.from("salary_components").select("id, name, type").eq("company_id", cid).eq("is_active", true).order("name")
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
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", structureId)
      .eq("company_id", companyId)
    if (updateErr) setError(updateErr.message)
    else {
      setFlash("Structure name updated")
      setStructure({ ...structure, name: name.trim() })
    }
    setSaving(false)
  }

  const handleAddComponent = async () => {
    if (!newComponentId || !newValue) { setError("Select a component and enter a value"); return }
    setError("")
    const { error: insertErr } = await supabase
      .from("salary_structure_components")
      .insert({
        salary_structure_id: structureId,
        salary_component_id: newComponentId,
        calculation_type: newCalcType,
        value: Number(newValue),
      })
    if (insertErr) { setError(insertErr.message); return }
    const { data: comps } = await supabase
      .from("salary_structure_components")
      .select("*, salary_components!inner(name, type)")
      .eq("salary_structure_id", structureId)
    const mapped = (comps || []).map((c: any) => ({
      ...c,
      component_name: c.salary_components?.name,
      component_type: c.salary_components?.type,
    }))
    setComponents(mapped)
    setNewComponentId(null)
    setNewValue("")
    setShowAddForm(false)
    setFlash("Component added")
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

      {/* Name Edit */}
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="label">Structure Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleSaveName} disabled={saving}>
            <Save size={16} /> {saving ? "Saving..." : "Save Name"}
          </button>
        </div>
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

        {components.length === 0 && !showAddForm ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No components added yet. Click "Add Component" to get started.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Type</th>
                <th>Calc</th>
                <th>Value</th>
                {canEdit && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {components.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.component_name || `ID ${c.salary_component_id}`}</td>
                  <td style={{ textTransform: "capitalize" }}>{c.component_type || "—"}</td>
                  <td style={{ textTransform: "capitalize" }}>{c.calculation_type}</td>
                  <td>{c.calculation_type === "percentage" ? `${c.value}%` : c.value}</td>
                  {canEdit && (
                    <td>
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
              <select className="select" value={newComponentId ?? ""} onChange={e => setNewComponentId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select…</option>
                {availableComponents.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
            <div style={{ width: 120 }}>
              <label className="label">Type</label>
              <select className="select" value={newCalcType} onChange={e => setNewCalcType(e.target.value as any)}>
                <option value="fixed">Fixed</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
            <div style={{ width: 100 }}>
              <label className="label">Value</label>
              <input className="input" type="number" step="any" value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="0" />
            </div>
            <button className="btn btn-primary" onClick={handleAddComponent}><Plus size={16} /> Add</button>
          </div>
        )}
      </div>
    </div>
  )
}