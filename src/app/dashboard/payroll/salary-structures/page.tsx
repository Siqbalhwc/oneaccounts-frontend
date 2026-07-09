"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Copy,
  Archive,
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

export default function SalaryStructuresPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [structures, setStructures] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [companyId, setCompanyId] = useState("")

  // KPI
  const [totalStructures, setTotalStructures] = useState(0)
  const [activeStructures, setActiveStructures] = useState(0)
  const [inactiveStructures, setInactiveStructures] = useState(0)
  const [employeesAssigned, setEmployeesAssigned] = useState(0)

  // Table enrichments
  const [componentCounts, setComponentCounts] = useState<Record<number, number>>({})
  const [employeeCounts, setEmployeeCounts] = useState<Record<number, number>>({})

  // UI state
  const [sortKey, setSortKey] = useState<"name" | "employees" | "updated" | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const perPage = 10

  // Modals
  const [archiveTarget, setArchiveTarget] = useState<any>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<any>(null)
  const [duplicateName, setDuplicateName] = useState("")
  const [modalError, setModalError] = useState("")

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Get company_id once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Fetch all data
  useEffect(() => {
    if (!role || !canView || !companyId) return
    setLoading(true)

    Promise.all([
      // Structures
      supabase.from("salary_structures").select("*").eq("company_id", companyId).order("name"),
      // Component counts
      supabase.from("salary_structure_components").select("salary_structure_id"),
      // Latest employee revisions for counts
      supabase.from("employee_salary_revisions").select("employee_id, effective_date, salary_structure_id").order("effective_date", { ascending: false }),
    ]).then(([structRes, compRes, revRes]) => {
      const structs = structRes.data || []
      setStructures(structs)

      // KPI counts
      setTotalStructures(structs.length)
      setActiveStructures(structs.filter(s => s.is_active).length)
      setInactiveStructures(structs.filter(s => !s.is_active).length)

      // Component counts
      const compMap: Record<number, number> = {}
      ;(compRes.data || []).forEach((c: any) => {
        const sid = c.salary_structure_id
        compMap[sid] = (compMap[sid] || 0) + 1
      })
      setComponentCounts(compMap)

      // Employee counts (latest revision per employee)
      const revs = revRes.data || []
      const latestPerEmployee: Record<number, { effective_date: string; salary_structure_id: number }> = {}
      revs.forEach((r: any) => {
        if (!latestPerEmployee[r.employee_id] || r.effective_date > latestPerEmployee[r.employee_id].effective_date) {
          latestPerEmployee[r.employee_id] = { effective_date: r.effective_date, salary_structure_id: r.salary_structure_id }
        }
      })
      const empMap: Record<number, number> = {}
      let totalAssigned = 0
      Object.values(latestPerEmployee).forEach(v => {
        empMap[v.salary_structure_id] = (empMap[v.salary_structure_id] || 0) + 1
        totalAssigned++
      })
      setEmployeeCounts(empMap)
      setEmployeesAssigned(totalAssigned)

      setLoading(false)
    })
  }, [role, canView, companyId])

  // Derived: enriched structures
  const enriched = useMemo(() => {
    return structures.map(s => ({
      ...s,
      compCount: componentCounts[s.id] || 0,
      empCount: employeeCounts[s.id] || 0,
      grossType: s.gross_type || "Fixed", // we don't have column yet, default Fixed; later we can compute from components
    }))
  }, [structures, componentCounts, employeeCounts])

  // Search filter
  const searchLower = search.toLowerCase()
  const filtered = useMemo(() => {
    if (!search.trim()) return enriched
    return enriched.filter(s => {
      const nameMatch = s.name?.toLowerCase().includes(searchLower)
      // For employee name/code we would need additional data, skip for now
      return nameMatch
    })
  }, [enriched, searchLower])

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (!sortKey) return arr
    arr.sort((a, b) => {
      let va: any, vb: any
      if (sortKey === "name") { va = (a.name || "").toLowerCase(); vb = (b.name || "").toLowerCase() }
      else if (sortKey === "employees") { va = a.empCount; vb = b.empCount }
      else if (sortKey === "updated") { va = a.updated_at || ""; vb = b.updated_at || "" }
      else return 0
      if (va < vb) return sortDir === "asc" ? -1 : 1
      if (va > vb) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // Pagination
  const totalPages = Math.ceil(sorted.length / perPage)
  const paged = sorted.slice((page - 1) * perPage, page * perPage)
  useEffect(() => { if (page > totalPages && totalPages > 0) setPage(totalPages) }, [totalPages, page])

  const handleSort = (key: "name" | "employees" | "updated") => {
    if (sortKey === key) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const toggleActive = async (structure: any) => {
    const newVal = !structure.is_active
    const { error } = await supabase
      .from("salary_structures")
      .update({ is_active: newVal, updated_at: new Date().toISOString() })
      .eq("id", structure.id)
      .eq("company_id", companyId)
    if (error) {
      showToast("Failed to update status", "error")
    } else {
      setStructures(prev => prev.map(s => s.id === structure.id ? { ...s, is_active: newVal } : s))
      showToast(newVal ? "Structure activated" : "Structure archived", "success")
    }
  }

  const handleArchiveClick = (structure: any) => {
    const empCount = employeeCounts[structure.id] || 0
    if (empCount > 0 && structure.is_active) {
      setArchiveTarget(structure)
    } else {
      toggleActive(structure)
    }
  }

  const confirmArchive = () => {
    if (archiveTarget) {
      toggleActive(archiveTarget)
      setArchiveTarget(null)
    }
  }

  const openDuplicateModal = (structure: any) => {
    setDuplicateTarget(structure)
    setDuplicateName(`${structure.name} - Copy`)
    setModalError("")
  }

  const handleDuplicate = async () => {
    if (!duplicateTarget || !duplicateName.trim()) {
      setModalError("Name is required")
      return
    }
    setModalError("")
    const { error } = await supabase.functions.invoke("duplicate-salary-structure", {
      body: { id: duplicateTarget.id, name: duplicateName.trim() },
    }) // We'll use a serverless function? Better to call an API route. We'll create the route, but for now we'll do a direct POST.
    // I'll implement duplication via fetch to our new API route.
    try {
      const res = await fetch(`/api/payroll/salary-structures/${duplicateTarget.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: duplicateName.trim() }),
      })
      if (!res.ok) throw new Error("Duplication failed")
      showToast("Structure duplicated", "success")
      setDuplicateTarget(null)
      // Refresh list
      const { data } = await supabase.from("salary_structures").select("*").eq("company_id", companyId).order("name")
      if (data) {
        setStructures(data)
        // Recompute counts will happen via useEffect trigger if we set a flag, easiest is to set a dummy state to force refetch? We'll just trigger a reload.
        // To keep it simple, I'll cause useEffect to re-run by triggering a state update.
        setLoading(true) // will refetch
      }
    } catch (e: any) {
      showToast(e.message || "Duplication failed", "error")
    }
  }

  // Re-fetch data when needed
  useEffect(() => {
    if (loading && companyId && role && canView) {
      // Re-run the fetch logic
      Promise.all([
        supabase.from("salary_structures").select("*").eq("company_id", companyId).order("name"),
        supabase.from("salary_structure_components").select("salary_structure_id"),
        supabase.from("employee_salary_revisions").select("employee_id, effective_date, salary_structure_id").order("effective_date", { ascending: false }),
      ]).then(([structRes, compRes, revRes]) => {
        const structs = structRes.data || []
        setStructures(structs)
        setTotalStructures(structs.length)
        setActiveStructures(structs.filter(s => s.is_active).length)
        setInactiveStructures(structs.filter(s => !s.is_active).length)
        const compMap: Record<number, number> = {}
        ;(compRes.data || []).forEach((c: any) => { compMap[c.salary_structure_id] = (compMap[c.salary_structure_id] || 0) + 1 })
        setComponentCounts(compMap)
        const revs = revRes.data || []
        const latestPerEmployee: Record<number, any> = {}
        revs.forEach((r: any) => {
          if (!latestPerEmployee[r.employee_id] || r.effective_date > latestPerEmployee[r.employee_id].effective_date) {
            latestPerEmployee[r.employee_id] = { effective_date: r.effective_date, salary_structure_id: r.salary_structure_id }
          }
        })
        const empMap: Record<number, number> = {}
        let total = 0
        Object.values(latestPerEmployee).forEach(v => { empMap[v.salary_structure_id] = (empMap[v.salary_structure_id] || 0) + 1; total++ })
        setEmployeeCounts(empMap)
        setEmployeesAssigned(total)
        setLoading(false)
      })
    }
  }, [loading])

  // Access control (no plan/role duplicate guards – layout handles it)
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .ss-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); }
        .ss-kpi { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1.5px solid var(--border); color: var(--text-muted); transition: 0.2s; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { opacity: 0.9; }
        .btn-ghost { border: none; background: transparent; }
        .search-input { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; background: var(--card); color: var(--text); outline: none; box-sizing: border-box; }
        .search-input:focus { border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 12px 16px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); cursor: pointer; user-select: none; }
        .table th:hover { color: var(--text); }
        .table tr:hover td { background: var(--card-hover); }
        .badge { padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; display: inline-block; }
        .badge-active { background: rgba(34,197,94,0.15); color: #22c55e; }
        .badge-inactive { background: rgba(148,163,184,0.15); color: #94a3b8; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--card); border-radius: 12px; padding: 24px; width: 90%; max-width: 420px; }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; color: white; font-weight: 500; z-index: 2000; animation: slideIn 0.3s; }
        .toast-success { background: #16a34a; }
        .toast-error { background: #dc2626; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
          {toast.message}
        </div>
      )}

      {/* Archive confirmation modal */}
      {archiveTarget && (
        <div className="modal-overlay" onClick={() => setArchiveTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}><AlertTriangle size={20} style={{ marginRight: 8, color: "#f59e0b", verticalAlign: "middle" }} /> Archive Structure</h3>
            <p style={{ margin: "12px 0", color: "var(--text-muted)" }}>
              This structure is assigned to <strong>{employeeCounts[archiveTarget.id] || 0} employees</strong>. Archiving will deactivate it.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setArchiveTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmArchive}>Archive Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate modal */}
      {duplicateTarget && (
        <div className="modal-overlay" onClick={() => setDuplicateTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Duplicate Structure</h3>
            <label className="label" style={{ marginTop: 16 }}>New Name</label>
            <input className="search-input" style={{ paddingLeft: 12, marginTop: 4 }} value={duplicateName} onChange={e => { setDuplicateName(e.target.value); setModalError("") }} />
            {modalError && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{modalError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn" onClick={() => setDuplicateTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDuplicate}>Duplicate</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📊 Salary Structures</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Create reusable salary templates by combining earnings and deductions. Assign them to employees to simplify payroll processing.
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/payroll/salary-structures/new")}>
            <Plus size={16} /> New Structure
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="ss-kpi">
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{totalStructures}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total Structures</div>
          </div>
        </div>
        <div className="ss-kpi">
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{employeesAssigned}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Employees Assigned</div>
          </div>
        </div>
        <div className="ss-kpi">
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{activeStructures}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Active</div>
          </div>
        </div>
        <div className="ss-kpi">
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{inactiveStructures}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Inactive</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 360 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by name, employee name or code..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {/* Table */}
      <div className="ss-card">
        <table className="table">
          <thead>
            <tr>
              <th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
                Structure Name {sortKey === "name" && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
              </th>
              <th>Components</th>
              <th onClick={() => handleSort("employees")} style={{ cursor: "pointer" }}>
                Employees {sortKey === "employees" && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
              </th>
              <th>Gross Formula</th>
              <th onClick={() => handleSort("updated")} style={{ cursor: "pointer" }}>
                Last Updated {sortKey === "updated" && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
              </th>
              <th>Status</th>
              {canEdit && <th style={{ width: 140 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  {[...Array(canEdit ? 7 : 6)].map((_, j) => (
                    <td key={j}><div style={{ height: 14, background: "var(--card-hover)", borderRadius: 4, width: "80%" }} /></td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                  {search ? (
                    <>No results for "<strong>{search}</strong>". <button className="btn btn-ghost" onClick={() => setSearch("")} style={{ padding: 0, textDecoration: "underline", color: "var(--primary)" }}>Clear search</button></>
                  ) : (
                    <div>
                      <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>No Salary Structures</p>
                      <p style={{ margin: 0, fontSize: 13 }}>Create reusable salary templates for your employees.</p>
                      {canEdit && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push("/dashboard/payroll/salary-structures/new")}><Plus size={16} /> Create First Structure</button>}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              paged.map(s => (
                <tr key={s.id} onClick={() => router.push(`/dashboard/payroll/salary-structures/${s.id}`)} style={{ cursor: "pointer" }}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.compCount} components</td>
                  <td>{s.empCount} employees</td>
                  <td>{s.grossType}</td>
                  <td>
                    {s.updated_at
                      ? new Date(s.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  <td>
                    <span className={`badge ${s.is_active ? "badge-active" : "badge-inactive"}`}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canEdit && (
                    <td onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost" title="View" onClick={() => router.push(`/dashboard/payroll/salary-structures/${s.id}`)}><Eye size={14} /></button>
                      <button className="btn btn-ghost" title="Edit" onClick={() => router.push(`/dashboard/payroll/salary-structures/${s.id}`)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost" title="Duplicate" onClick={() => openDuplicateModal(s)}><Copy size={14} /></button>
                      <button className="btn btn-ghost" title={s.is_active ? "Archive" : "Activate"} onClick={() => handleArchiveClick(s)}>
                        {s.is_active ? <Archive size={14} /> : <X size={14} />}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button className="btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ padding: "8px 0", fontSize: 13, color: "var(--text-muted)" }}>Page {page} of {totalPages}</span>
          <button className="btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}