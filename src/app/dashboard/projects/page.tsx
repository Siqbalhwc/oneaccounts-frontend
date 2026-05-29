"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, FileText, Check, X } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"
import { generateProjectPDF } from "@/lib/pdf/projectPDF"

type SortField = "name" | "code" | "status" | "approved" | "budget" | "donor"
type SortDir = "asc" | "desc"

function fmt(n: number) {
  return "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ProjectsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { companyName, companyTagline, logoUrl } = useCompany()
  const { theme: themeMode } = useTheme()

  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  useEffect(() => {
    fetchProjects()
  }, [showInactive])

  const fetchProjects = async () => {
    setLoading(true)
    let query = supabase
      .from("projects")
      .select("*, donors(name)")
      .order("name")
    if (!showInactive) {
      query = query.is("deleted_at", null)
    }
    const { data } = await query
    if (data) {
      const enriched = await Promise.all(
        data.map(async (p: any) => {
          const { data: budgets } = await supabase
            .from("budgets")
            .select("budgeted_amount")
            .eq("project_id", p.id)
            .is("month", null)
          const totalBudget = budgets?.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0) || 0
          return { ...p, totalBudget }
        })
      )
      setProjects(enriched)
    }
    setLoading(false)
  }

  const handleGeneratePDF = async (project: any) => {
    const res = await fetch(`/api/projects/report?projectId=${project.id}`)
    const reportData = await res.json()

    const pdfData = {
      companyName: companyName || "OneAccounts",
      companyTagline: companyTagline || "",
      logoUrl: logoUrl || null,
      projectName: project.name,
      projectCode: project.code || "",
      projectDescription: project.description || "",
      donorName: project.donors?.name || "—",
      projectStatus: project.deleted_at ? "Inactive" : "Active",
      isApproved: project.is_approved,
      totalBudgeted: project.totalBudget || 0,
      accountGroups: reportData.accountGroups || [],
      monthlyTotals: reportData.monthlyTotals || [],
    }

    const doc = await generateProjectPDF(pdfData)
    doc.save(`Project_${project.name.replace(/\s+/g, '_')}.pdf`)
  }

  const toggleApproval = async (project: any) => {
    const newApproved = !project.is_approved
    await supabase
      .from("projects")
      .update({ is_approved: newApproved })
      .eq("id", project.id)
    setProjects(prev =>
      prev.map(p => (p.id === project.id ? { ...p, is_approved: newApproved } : p))
    )
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => (prev === "asc" ? "desc" : "asc"))
    else {
      setSortField(field)
      setSortDir("asc")
    }
  }
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.7 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const sorted = [...projects].sort((a, b) => {
    let valA: any, valB: any
    switch (sortField) {
      case "budget":
        valA = a.totalBudget || 0
        valB = b.totalBudget || 0
        break
      case "approved":
        valA = a.is_approved ? 1 : 0
        valB = b.is_approved ? 1 : 0
        break
      case "status":
        valA = a.deleted_at ? "inactive" : "active"
        valB = b.deleted_at ? "inactive" : "active"
        break
      case "donor":
        valA = (a.donors?.name || "").toLowerCase()
        valB = (b.donors?.name || "").toLowerCase()
        break
      default:
        valA = (a[sortField] || "").toString().toLowerCase()
        valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const isLightStyle = themeMode === "light" || themeMode === "oneaccounts"
  const rowLight = isLightStyle ? "#FFFFFF" : "#1E293B"
  const rowDark  = isLightStyle ? "#F8F9FC" : "#111827"
  const headerBg = isLightStyle ? "#07085B" : "#000000"

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
        .page-title { font-size: 24px; font-weight: 800; color: var(--text); }
        .page-subtitle { font-size: 13px; color: var(--text-muted); }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .table-wrap {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .table-header {
          display: grid;
          grid-template-columns: minmax(200px, 2fr) minmax(100px, 1fr) minmax(80px, 100px) minmax(70px, 90px) 180px 80px 60px;
          padding: 14px 24px;
          color: white;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .table-row {
          display: grid;
          grid-template-columns: minmax(200px, 2fr) minmax(100px, 1fr) minmax(80px, 100px) minmax(70px, 90px) 180px 80px 60px;
          padding: 12px 24px;
          font-size: 13px;
          align-items: center;
          border-bottom: 1px solid var(--border);
          transition: background 0.15s;
        }
        .table-row:hover { background: var(--card-hover); }
        .sort-btn {
          background: none; border: none; cursor: pointer;
          font: inherit; color: white;
          display: inline-flex; align-items: center; gap: 4px;
          padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .status-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 600;
        }
        .status-active { background: #DCFCE7; color: #166534; }
        .status-inactive { background: #FEF2F2; color: #B91C1C; }
        .approved-icon { color: #10B981; cursor: pointer; }
        .not-approved-icon { color: #CBD5E1; cursor: pointer; }

        @media (max-width: 900px) {
          .table-wrap { overflow-x: auto; }
          .table-header, .table-row {
            grid-template-columns: 160px 90px 80px 70px 140px 60px 50px;
            padding: 10px 12px;
            font-size: 11px;
          }
        }
      `}</style>

      <div className="page-header">
        <button className="btn btn-outline" onClick={() => router.push("/dashboard")}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">📁 Projects</h1>
          <p className="page-subtitle">All projects with budget, donor, and approval status</p>
        </div>
      </div>

      <div className="filter-bar">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive projects
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading projects…</div>
      ) : sorted.length === 0 ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No projects found.
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-header" style={{ background: headerBg }}>
            <button className="sort-btn" onClick={() => handleSort("name")}>Project Name {getSortIcon("name")}</button>
            <button className="sort-btn" onClick={() => handleSort("donor")}>Donor {getSortIcon("donor")}</button>
            <button className="sort-btn" onClick={() => handleSort("status")}>Status {getSortIcon("status")}</button>
            <button className="sort-btn" onClick={() => handleSort("approved")}>Approved {getSortIcon("approved")}</button>
            <button className="sort-btn" onClick={() => handleSort("budget")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Budget {getSortIcon("budget")}</button>
            <span style={{ textAlign: "center" }}>PDF</span>
            <span></span>
          </div>
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className="table-row"
              style={{ background: i % 2 === 0 ? rowLight : rowDark }}
            >
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
              <span style={{ fontSize: 13, color: "var(--text)" }}>{p.donors?.name || "—"}</span>
              <span>
                <span className={`status-badge ${p.deleted_at ? "status-inactive" : "status-active"}`}>
                  {p.deleted_at ? "Inactive" : "Active"}
                </span>
              </span>
              <span style={{ textAlign: "center", cursor: "pointer" }} onClick={() => toggleApproval(p)}>
                {p.is_approved ? (
                  <Check size={18} className="approved-icon" />
                ) : (
                  <X size={18} className="not-approved-icon" />
                )}
              </span>
              <span style={{ textAlign: "right", fontWeight: 500, whiteSpace: "nowrap" }}>{fmt(p.totalBudget || 0)}</span>
              <span style={{ textAlign: "center" }}>
                <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => handleGeneratePDF(p)}>
                  <FileText size={12} /> PDF
                </button>
              </span>
              <span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}