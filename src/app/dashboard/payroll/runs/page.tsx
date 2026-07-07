"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

type SortField = "month" | "status" | "generated_at"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 70, 40, 50, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function PayrollRunsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("generated_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!role || !canView || !companyId) return
    setLoading(true)
    supabase
      .from("payroll_runs")
      .select("*")
      .eq("company_id", companyId)
      .order(sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setRuns(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir])

  const filtered = search.trim()
    ? runs.filter(run =>
        run.month?.includes(search) ||
        run.status?.toLowerCase().includes(search.toLowerCase())
      )
    : runs

  const totalRuns = runs.length
  const draftRuns = runs.filter(r => r.status === "draft").length
  const postedRuns = runs.filter(r => r.status === "posted" || r.status === "locked").length

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

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
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .run-table { width: 100%; border-collapse: collapse; }
        .run-table tbody tr:last-child td { border-bottom: none; }
        .run-table tbody tr:hover td { background: var(--card-hover); }
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

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📅 Payroll Runs</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Generate and process payroll runs" : "View payroll runs"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/payroll/runs/new")}>
            <Plus size={16} /> New Run
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Runs</div><div className="summary-value">{totalRuns}</div></div>
        <div className="summary-item"><div className="summary-label">Draft</div><div className="summary-value" style={{ color: "#F59E0B" }}>{draftRuns}</div></div>
        <div className="summary-item"><div className="summary-label">Posted / Locked</div><div className="summary-value" style={{ color: "#10B981" }}>{postedRuns}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by month or status..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="run-table">
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh field="month">Month</SortTh>
                <SortTh field="status" style={{ textAlign: "center" }}>Status</SortTh>
                <SortTh field="generated_at" style={{ textAlign: "center" }}>Generated</SortTh>
                <SortTh field="generated_at" style={{ textAlign: "center" }}>Posted</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No payroll runs found. {canEdit && 'Click "New Run" to generate one.'}
                  </td>
                </tr>
              ) : (
                filtered.map((run) => (
                  <tr key={run.id}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: "var(--primary)" }}>
                        {new Date(run.month + "T00:00:00").toLocaleDateString("en-PK", { month: "short", year: "numeric" })}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "20px",
                        fontSize: "10px",
                        fontWeight: 600,
                        background: run.status === "posted" || run.status === "locked" ? "#065F46"
                                   : run.status === "draft" ? "#F59E0B"
                                   : "#6B7280",
                        color: "#E2E8F0",
                      }}>
                        {run.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>
                      {run.generated_at ? new Date(run.generated_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>
                      {run.posted_at ? new Date(run.posted_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/payroll/runs/${run.id}`)} title="View run">
                          <Eye size={13} />
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
    </div>
  )
}
