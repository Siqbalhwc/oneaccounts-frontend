"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

// ── Status colour map (consistent across entire Payroll module) ──
const statusColors: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#3b82f6",
  approved: "#f59e0b",
  posted: "#22c55e",
  locked: "#8b5cf6",
  reversed: "#ef4444",
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] || "#6b7280"
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "100px",
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "capitalize",
        background: `${color}22`,
        color: color,
        border: `1px solid ${color}44`,
      }}
    >
      {status}
    </span>
  )
}

function formatPKR(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}PKR ${(abs / 1_000).toLocaleString()}`
  return `${sign}PKR ${abs.toLocaleString()}`
}

const PER_PAGE = 10

export default function PayrollRunsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortField, setSortField] = useState<"month" | "status" | "generated_at">("generated_at")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [companyId, setCompanyId] = useState("")

  // Aggregated data per run (employee count, net pay)
  const [runAggregates, setRunAggregates] = useState<
    Record<number, { employees: number; netPay: number }>
  >({})

  const [page, setPage] = useState(1)

  // ── Fetch company ID ─────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── Fetch runs and their line aggregates ─────────────────
  useEffect(() => {
    if (!role || !canView || !companyId) return
    setLoading(true)

    Promise.all([
      supabase
        .from("payroll_runs")
        .select("*")
        .eq("company_id", companyId)
        .order(sortField, { ascending: sortDir === "asc" }),
      supabase
        .from("payroll_run_lines")
        .select("payroll_run_id, employee_id, net_amount")
        .eq("company_id", companyId),
    ]).then(([runsRes, linesRes]) => {
      const runsList = runsRes.data || []
      const lines = linesRes.data || []

      // Aggregate lines per run
      const agg: Record<number, { employees: number; netPay: number }> = {}
      const employeeSet: Record<number, Set<number>> = {}

      lines.forEach((l: any) => {
        const rid = l.payroll_run_id
        if (!agg[rid]) {
          agg[rid] = { employees: 0, netPay: 0 }
          employeeSet[rid] = new Set()
        }
        agg[rid].netPay += l.net_amount || 0
        if (l.employee_id) employeeSet[rid].add(l.employee_id)
      })

      // count unique employees per run
      Object.keys(employeeSet).forEach(rid => {
        agg[Number(rid)].employees = employeeSet[Number(rid)].size
      })

      setRuns(runsList)
      setRunAggregates(agg)
      setLoading(false)
    })
  }, [role, canView, companyId, sortField, sortDir])

  // ── Derived data (filter / search / paginate) ────────────
  const filtered = useMemo(() => {
    let list = runs

    // search by month or employee name (via run aggregates? limited)
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(run => {
        const monthStr = run.month?.toString() || ""
        const monthLabel = new Date(run.month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" }).toLowerCase()
        return monthStr.includes(s) || monthLabel.includes(s) || run.status?.toLowerCase().includes(s)
      })
    }

    // status filter
    if (statusFilter !== "all") {
      if (statusFilter === "awaiting_approval") {
        list = list.filter(run => run.status === "submitted")
      } else {
        list = list.filter(run => run.status === statusFilter)
      }
    }

    return list
  }, [runs, search, statusFilter])

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filtered, page]
  )
  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, statusFilter])

  // ── KPI counts ────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = runs.length
    const draft = runs.filter(r => r.status === "draft").length
    const submitted = runs.filter(r => r.status === "submitted").length
    const approved = runs.filter(r => r.status === "approved").length
    const posted = runs.filter(r => r.status === "posted").length
    const locked = runs.filter(r => r.status === "locked").length
    // Total net payroll across all runs
    const totalNetPay = runs.reduce((sum, r) => sum + (runAggregates[r.id]?.netPay || 0), 0)
    return { total, draft, submitted, approved, posted, locked, totalNetPay }
  }, [runs, runAggregates])

  // ── Sort helpers ──────────────────────────────────────────
  const handleSort = (field: "month" | "status" | "generated_at") => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: "month" | "status" | "generated_at") => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // ── Access control (PayrollLayout already handles feature/plan guards) ──
  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .run-table { width: 100%; border-collapse: collapse; }
        .run-table tbody tr:last-child td { border-bottom: none; }
        .run-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          transition: all 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary {
          background: var(--primary); color: var(--primary-text); border-color: var(--primary);
        }
        .btn-ghost {
          border: none; background: transparent; color: var(--text-muted);
        }
        .btn-ghost:hover { background: var(--card-hover); }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .filter-select {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; background: var(--card); color: var(--text);
          cursor: pointer; outline: none;
        }
        .filter-select:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .run-table { min-width: 700px; }
        .empty-state {
          padding: 40px 20px;
          text-align: center;
          color: var(--text-muted);
        }
        @media (max-width: 480px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📅 Payroll Runs</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>
            {canEdit ? "Generate and manage payroll runs" : "View payroll runs"}
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/payroll/runs/new")}>
            <Plus size={16} /> New Run
          </button>
        )}
      </div>

      {/* ── KPI cards ────────────────────────────────────── */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Runs</div>
          <div className="summary-value">{kpis.total}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Draft</div>
          <div className="summary-value" style={{ color: statusColors.draft }}>{kpis.draft}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Awaiting Approval</div>
          <div className="summary-value" style={{ color: statusColors.submitted }}>{kpis.submitted}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Posted</div>
          <div className="summary-value" style={{ color: statusColors.posted }}>{kpis.posted}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Locked</div>
          <div className="summary-value" style={{ color: statusColors.locked }}>{kpis.locked}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Net Payroll</div>
          <div className="summary-value" style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text)" }}>
            {formatPKR(kpis.totalNetPay)}
          </div>
        </div>
      </div>

      {/* ── Search + Filters ────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="search-input"
            placeholder="Search by month or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="posted">Posted</option>
          <option value="locked">Locked</option>
          <option value="reversed">Reversed</option>
        </select>

        {(search || statusFilter !== "all") && (
          <button
            className="btn btn-ghost"
            onClick={() => { setSearch(""); setStatusFilter("all"); }}
            style={{ padding: "6px 12px" }}
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────── */}
      <div className="card">
        <div className="table-scroll">
          <table className="run-table">
            <thead>
              <tr>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", cursor: "pointer" }} onClick={() => handleSort("month")}>
                  Month {getSortIcon("month")}
                </th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center", cursor: "pointer" }} onClick={() => handleSort("status")}>
                  Status {getSortIcon("status")}
                </th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>
                  Employees
                </th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "right" }}>
                  Net Pay
                </th>
                <th style={{ padding: "12px 16px", background: "var(--card-hover)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "center" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} style={{ padding: "12px 16px" }}>
                        <div style={{ width: `${60 + j * 10}%`, height: 12, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    {search || statusFilter !== "all" ? (
                      <>No payroll runs match your filters.</>
                    ) : (
                      <div>
                        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>📅 No Payroll Runs</p>
                        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                          Generate your first payroll run to calculate employee salaries.
                        </p>
                        {canEdit && (
                          <button className="btn btn-primary" onClick={() => router.push("/dashboard/payroll/runs/new")}>
                            <Plus size={16} /> Generate Payroll
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => router.push(`/dashboard/payroll/runs/${run.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600 }}>
                      {new Date(run.month + "T00:00:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" })}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                      <StatusBadge status={run.status} />
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center", fontSize: 13 }}>
                      {runAggregates[run.id]?.employees ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                      {runAggregates[run.id]?.netPay ? formatPKR(runAggregates[run.id].netPay) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                      <button
                        className="btn btn-ghost"
                        onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/payroll/runs/${run.id}`) }}
                        title="View Details"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
            <button className="btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Page {page} of {totalPages}</span>
            <button className="btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}