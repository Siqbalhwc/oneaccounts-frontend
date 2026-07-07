"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Search, Pencil, Trash2, ToggleLeft, ToggleRight, RotateCcw, Filter, ChevronRight } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

export default function SalaryComponentsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [components, setComponents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")

  // Filters
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [taxableFilter, setTaxableFilter] = useState("all")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchComponents = () => {
    if (!companyId) return
    setLoading(true)
    let query = supabase
      .from("salary_components")
      .select("id, name, type, is_taxable, is_active")
      .eq("company_id", companyId)
      .order("name")

    if (typeFilter !== "all") query = query.eq("type", typeFilter)
    if (statusFilter !== "all") query = query.eq("is_active", statusFilter === "active")
    if (taxableFilter !== "all") query = query.eq("is_taxable", taxableFilter === "taxable")

    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter(c => c.name?.toLowerCase().includes(q))
      }
      setComponents(filtered)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchComponents()
  }, [role, canView, companyId, typeFilter, statusFilter, taxableFilter, search])

  // Toggle active/inactive (soft delete)
  const toggleActive = async (id: number, current: boolean) => {
    // Optimistic update
    setComponents(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c))
    const { error } = await supabase
      .from("salary_components")
      .update({ is_active: !current })
      .eq("id", id)
      .eq("company_id", companyId)
    if (error) {
      // Rollback
      setComponents(prev => prev.map(c => c.id === id ? { ...c, is_active: current } : c))
    }
  }

  // KPIs
  const totalCount = components.length
  const earningCount = components.filter(c => c.type === "earning").length
  const deductionCount = components.filter(c => c.type === "deduction").length
  const activeCount = components.filter(c => c.is_active).length

  const resetFilters = () => {
    setSearch("")
    setTypeFilter("all")
    setStatusFilter("all")
    setTaxableFilter("all")
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
    <div style={{ padding: "24px 32px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .kpi-card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px; text-align: center;
        }
        .kpi-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .kpi-value { font-size: 28px; font-weight: 800; }
        .badge {
          display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
        }
        .btn {
          padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 13px;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--border); background: transparent; color: var(--text-muted);
          transition: all 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { filter: brightness(0.95); }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
        .btn-outline:hover { background: var(--card-hover); }
        .table-row { transition: background 0.15s; cursor: pointer; }
        .table-row:hover { background: var(--card-hover); }
        .filter-select { height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; background: var(--card); color: var(--text); outline: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>💰</span>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Salary Components</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Configure earnings and deductions used in payroll
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/payroll/salary-components/new")}>
            <Plus size={16} /> New Component
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Components</div>
          <div className="kpi-value">{totalCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label" style={{ color: "#059669" }}>Earnings</div>
          <div className="kpi-value" style={{ color: "#059669" }}>{earningCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label" style={{ color: "#DC2626" }}>Deductions</div>
          <div className="kpi-value" style={{ color: "#DC2626" }}>{deductionCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active</div>
          <div className="kpi-value" style={{ color: "#1D4ED8" }}>{activeCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Search components..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px 0 36px", fontSize: 13, background: "var(--card)", color: "var(--text)", outline: "none" }}
          />
        </div>
        <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 150 }}>
          <option value="all">All Types</option>
          <option value="earning">Earning</option>
          <option value="deduction">Deduction</option>
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 140 }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className="filter-select" value={taxableFilter} onChange={e => setTaxableFilter(e.target.value)} style={{ width: 150 }}>
          <option value="all">All Tax Status</option>
          <option value="taxable">Taxable</option>
          <option value="nontaxable">Non‑Taxable</option>
        </select>
        <button className="btn btn-outline" onClick={resetFilters}>
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <colgroup>
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Name</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left" }}>Type</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Taxable</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Status</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Active</th>
              <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{ height: 12, width: `${60 + i*10}%`, background: "var(--bg-soft)", borderRadius: 4, margin: "8px auto", animation: "shimmer 1.5s ease-in-out infinite" }} />
                  ))}
                </td>
              </tr>
            ) : components.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 16, marginBottom: 8 }}>No salary components yet</div>
                  <p style={{ fontSize: 13, marginBottom: 16 }}>
                    Salary components define the earnings and deductions used when calculating payroll.
                  </p>
                  {canEdit && (
                    <button className="btn btn-primary" onClick={() => router.push("/dashboard/payroll/salary-components/new")}>
                      <Plus size={16} /> Create First Component
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              components.map(c => (
                <tr key={c.id} className="table-row" onClick={() => router.push(`/dashboard/payroll/salary-components/${c.id}`)}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className="badge" style={{ background: c.type === "earning" ? "#DCFCE7" : "#FEE2E2", color: c.type === "earning" ? "#166534" : "#991B1B", textTransform: "capitalize" }}>
                      {c.type}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <span className="badge" style={{ background: c.is_taxable ? "#FEF3C7" : "#F3F4F6", color: c.is_taxable ? "#92400E" : "#6B7280" }}>
                      {c.is_taxable ? "Taxable" : "Non‑Taxable"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <span className="badge" style={{ background: c.is_active ? "#DCFCE7" : "#F3F4F6", color: c.is_active ? "#166534" : "#6B7280" }}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleActive(c.id, c.is_active)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: c.is_active ? "#10B981" : "#9CA3AF", padding: 0 }}
                      title={c.is_active ? "Deactivate" : "Activate"}
                    >
                      {c.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "4px 8px" }}
                        onClick={() => router.push(`/dashboard/payroll/salary-components/${c.id}`)}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.4; }
          50% { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}