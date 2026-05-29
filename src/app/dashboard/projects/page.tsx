"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, X, FileText, Calendar, DollarSign } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"
import { generateProjectPDF } from "@/lib/pdf/projectPDF"

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
          const totalBudget = budgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0
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
      donorName: project.donors?.name || "—",
      projectStatus: project.deleted_at ? "Inactive" : "Active",
      isApproved: project.is_approved,
      totalBudgeted: project.totalBudget || 0,
      startDate: project.start_date,
      endDate: project.end_date,
      amountFC: project.amount_fc,
      amountPKR: project.amount_pkr,
      activityBreakdown: reportData.activityBreakdown || [],
      monthlyBreakdown: reportData.monthlyBreakdown || [],
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

  const isLightStyle = themeMode === "light" || themeMode === "oneaccounts"
  const cardBg = isLightStyle ? "#FFFFFF" : "#1E293B"
  const headerBg = isLightStyle ? "#07085B" : "#000000"
  const border = isLightStyle ? "#E2E8F0" : "#334155"

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
        .page-title { font-size: 24px; font-weight: 800; color: var(--text); }
        .page-subtitle { font-size: 13px; color: var(--text-muted); }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
        .project-card { background: ${cardBg}; border: 1px solid ${border}; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); }
        .project-card h3 { font-size: 16px; font-weight: 700; margin: 0 0 12px; color: var(--text); }
        .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 16px; font-size: 13px; color: var(--text); margin-bottom: 12px; }
        .detail-item { }
        .detail-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); }
        .detail-value { font-weight: 500; margin-top: 2px; }
        .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .status-active { background: #DCFCE7; color: #166534; }
        .status-inactive { background: #FEF2F2; color: #B91C1C; }
        .approval-row { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid ${border}; }
        .approved-icon { color: #10B981; cursor: pointer; }
        .not-approved-icon { color: #CBD5E1; cursor: pointer; }
      `}</style>

      <div className="page-header">
        <button className="btn btn-outline" onClick={() => router.push("/dashboard")}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">📁 Projects</h1>
          <p className="page-subtitle">Budget details, approval status, and project reports</p>
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
      ) : projects.length === 0 ? (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No projects found.
        </div>
      ) : (
        <div className="project-grid">
          {projects.map(p => (
            <div key={p.id} className="project-card">
              <h3>{p.name}</h3>

              {/* 3‑column detail layout */}
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">Donor</div>
                  <div className="detail-value">{p.donors?.name || "—"}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Duration</div>
                  <div className="detail-value">
                    {p.start_date && p.end_date
                      ? `${new Date(p.start_date).toLocaleDateString("en-PK", { month: "short", day: "numeric" })} – ${new Date(p.end_date).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" })}`
                      : "—"}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Status</div>
                  <div className="detail-value">
                    <span className={`status-badge ${p.deleted_at ? "status-inactive" : "status-active"}`}>
                      {p.deleted_at ? "Inactive" : "Active"}
                    </span>
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Start Date</div>
                  <div className="detail-value">{p.start_date ? new Date(p.start_date).toLocaleDateString("en-PK") : "—"}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">End Date</div>
                  <div className="detail-value">{p.end_date ? new Date(p.end_date).toLocaleDateString("en-PK") : "—"}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Amount (FC)</div>
                  <div className="detail-value">{p.amount_fc ? p.amount_fc.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "—"}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Amount (PKR)</div>
                  <div className="detail-value">{p.amount_pkr ? `PKR ${p.amount_pkr.toLocaleString("en-PK", { minimumFractionDigits: 2 })}` : "—"}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Budget</div>
                  <div className="detail-value">{fmt(p.totalBudget || 0)}</div>
                </div>
              </div>

              {/* Approval toggle + PDF button */}
              <div className="approval-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => toggleApproval(p)}>
                  {p.is_approved ? (
                    <Check size={18} className="approved-icon" />
                  ) : (
                    <X size={18} className="not-approved-icon" />
                  )}
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>
                    {p.is_approved ? "Approved" : "Not Approved"}
                  </span>
                </div>
                <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={() => handleGeneratePDF(p)}>
                  <FileText size={14} /> Project PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}