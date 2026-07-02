"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight } from "lucide-react"
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
  const [search, setSearch] = useState("")
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchComponents = () => {
    if (!companyId) return
    setLoading(true)
    supabase
      .from("salary_components")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => {
        setComponents(data || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchComponents()
  }, [role, canView, companyId])

  const filtered = search.trim()
    ? components.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()))
    : components

  const toggleActive = async (id: number, current: boolean) => {
    await supabase
      .from("salary_components")
      .update({ is_active: !current })
      .eq("id", id)
      .eq("company_id", companyId)
    setComponents(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c))
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this salary component?")) return
    await supabase
      .from("salary_components")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
    setComponents(prev => prev.filter(c => c.id !== id))
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
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm);
        }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td {
          padding: 10px 14px; border-bottom: 1px solid var(--border);
          text-align: left; font-size: 13px;
        }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table tr:hover td { background: var(--card-hover); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💰 Salary Components</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Manage salary components (earnings & deductions)" : "View salary components"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/payroll/salary-components/new")}>
            <Plus size={16} /> New Component
          </button>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Taxable</th>
              <th>Active</th>
              {canEdit && <th style={{ textAlign: "center", width: 80 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 5 : 4} style={{ textAlign: "center", padding: 20 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={canEdit ? 5 : 4} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No salary components found.</td></tr>
            ) : (
              filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{c.name}</td>
                  <td style={{ textTransform: "capitalize" }}>{c.type}</td>
                  <td>{c.is_taxable ? "Yes" : "No"}</td>
                  <td>
                    {canEdit ? (
                      <button
                        onClick={() => toggleActive(c.id, c.is_active)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: c.is_active ? "#10B981" : "#9CA3AF", padding: 0 }}
                        title={c.is_active ? "Deactivate" : "Activate"}
                      >
                        {c.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                    ) : (
                      c.is_active ? "Yes" : "No"
                    )}
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/payroll/salary-components/${c.id}`)} title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button className="btn-icon" style={{ color: "#EF4444" }} onClick={() => handleDelete(c.id)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}