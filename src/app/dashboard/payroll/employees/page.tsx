"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Search, Plus, Eye, MoreHorizontal } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

const EMPLOYMENT_TYPES = ["permanent", "contract", "daily_wage", "consultant"]

export default function EmployeesPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [departments, setDepartments] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("departments")
          .select("id, name")
          .eq("company_id", cid)
          .order("name")
          .then(({ data }) => setDepartments(data || []))
      }
    })
  }, [])

  useEffect(() => {
    if (!role || !canView || !companyId) return
    setLoading(true)

    let query = supabase
      .from("employees")
      .select(`
        id,
        employee_code,
        full_name,
        joining_date,
        employment_type,
        status,
        salary_structure_id,
        bank_account_no,
        department_id,
        designation_id,
        departments ( name ),
        designations ( name ),
        salary_structures ( name )
      `)
      .eq("company_id", companyId)
      .order("full_name")

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }
    if (typeFilter !== "all") {
      query = query.eq("employment_type", typeFilter)
    }
    if (departmentFilter !== "all") {
      query = query.eq("department_id", parseInt(departmentFilter))
    }

    query.then(({ data }) => {
      setEmployees(data || [])
      setLoading(false)
    })
  }, [role, canView, companyId, statusFilter, typeFilter, departmentFilter])

  // Stats
  const typeCounts = EMPLOYMENT_TYPES.reduce((acc, type) => {
    acc[type] = employees.filter(e => e.employment_type === type).length
    return acc
  }, {} as Record<string, number>)
  const activeCount = employees.filter(e => e.status === "active").length

  const filteredEmployees = search.trim()
    ? employees.filter(emp =>
        emp.employee_code?.toLowerCase().includes(search.toLowerCase()) ||
        emp.full_name?.toLowerCase().includes(search.toLowerCase())
      )
    : employees

  // Mask bank account for display
  const maskAccount = (accountNo: string | null) => {
    if (!accountNo) return "—"
    if (accountNo.length <= 4) return accountNo
    return `••••${accountNo.slice(-4)}`
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  return (
    <div style={{ padding: "24px 32px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .filter-chip {
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          transition: all 0.2s;
        }
        .filter-chip:hover { background: var(--card-hover); }
        .filter-chip.active {
          background: var(--primary);
          color: var(--primary-text);
          border-color: var(--primary);
        }
        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: capitalize;
        }
        .btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
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
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Eye size={24} style={{ color: "var(--primary)" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: 0 }}>Employees</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            {canEdit ? "Manage your employee records" : "View employee directory"}
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/payroll/employees/new")}>
            <Plus size={16} /> New Employee
          </button>
        )}
      </div>

      {/* Quick stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 20px", minWidth: 120 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Employees</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{employees.length}</div>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 20px", minWidth: 120 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#10B981" }}>{activeCount}</div>
        </div>
        {EMPLOYMENT_TYPES.map(type => (
          <div key={type} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 20px", minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>{type.replace("_", " ")}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{typeCounts[type] || 0}</div>
          </div>
        ))}
      </div>

      {/* Search and filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 8,
              padding: "0 12px 0 36px", fontSize: 13, background: "var(--card)", color: "var(--text)",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["all", "active", "on_leave", "draft"].map(s => (
            <div
              key={s}
              className={`filter-chip ${statusFilter === s ? "active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All Status" : s.replace("_", " ")}
            </div>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px",
            fontSize: 12, background: "var(--card)", color: "var(--text)", outline: "none",
          }}
        >
          <option value="all">All Types</option>
          {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        <select
          value={departmentFilter}
          onChange={e => setDepartmentFilter(e.target.value)}
          style={{
            height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px",
            fontSize: 12, background: "var(--card)", color: "var(--text)", outline: "none",
          }}
        >
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <colgroup>
            <col style={{ width: 140 }} />
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Code</th>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Department</th>
              <th style={thStyle}>Structure</th>
              <th style={thStyle}>Bank Account</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                  Loading employees…
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                  No employees found.
                </td>
              </tr>
            ) : (
              filteredEmployees.map(emp => (
                <tr key={emp.id} style={{ transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--card-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ ...tdStyle, fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>{emp.employee_code}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{emp.full_name}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {emp.designations?.name && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{emp.designations.name}</span>}
                      <span
                        className="status-badge"
                        style={{
                          background: emp.status === "active" ? "#065F46" :
                                       emp.status === "on_leave" ? "#7F1D1D" :
                                       emp.status === "draft" ? "#374151" : "#1E293B",
                          color: "#E2E8F0",
                        }}
                      >
                        {emp.status}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                        {emp.employment_type?.replace("_", " ")}
                      </span>
                    </div>
                  </td>
                  <td style={tdStyle}>{emp.departments?.name || "—"}</td>
                  <td style={tdStyle}>{emp.salary_structures?.name || "—"}</td>
                  <td style={tdStyle}>{maskAccount(emp.bank_account_no)}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button
                        style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: 5, cursor: "pointer", color: "var(--text-muted)" }}
                        onClick={() => router.push(`/dashboard/payroll/employees/${emp.id}`)}
                        title="View Profile"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: 5, cursor: "pointer", color: "var(--text-muted)" }}
                        onClick={() => {}}
                        title="More actions"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}