"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, FileText, CheckCircle, XCircle } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"
import { generateProjectPDF } from "@/lib/pdf/projectPDF"

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
    let query = supabase.from("projects").select("*").order("name")
    if (!showInactive) {
      query = query.is("deleted_at", null) // active projects only
    }
    const { data } = await query
    if (data) setProjects(data)
    setLoading(false)
  }

  const handleGeneratePDF = async (project: any) => {
    // Fetch budgets for this project
    const { data: budgets } = await supabase
      .from("budgets")
      .select("*")
      .eq("project_id", project.id)
      .is("month", null) // annual budgets, not monthly

    // Calculate total budgeted amount
    const totalBudgeted = budgets?.reduce((sum, b) => sum + (b.budgeted_amount || 0), 0) || 0

    // Fetch actual spent (from journal_lines or we can compute via the dashboard_rpc)
    const { data: spentData } = await supabase
      .rpc("total_spent", { cid: project.company_id, fy: new Date().getFullYear() }) // approximate; better to filter by project
    // Since total_spent is per company per fiscal year, we need a more specific query.
    // For now, we'll just pass the budgets array and let the PDF show planned vs actual if available,
    // or we can skip actuals for simplicity.

    const pdfData = {
      companyName: companyName || "OneAccounts",
      companyTagline: companyTagline || "",
      logoUrl: logoUrl || null,
      projectName: project.name,
      projectStatus: project.deleted_at ? "Inactive" : "Active",
      projectCode: project.code || "",
      projectDescription: project.description || "",
      totalBudgeted,
      // You can add more fields if needed
    }

    const doc = await generateProjectPDF(pdfData)
    doc.save(`Project_${project.name.replace(/\s+/g, '_')}.pdf`)
  }

  const isDark = themeMode === "dark" || themeMode === "system"
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
        .filter-toggle { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; color: var(--text-muted); }
        .project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
        .project-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); }
        .project-card h3 { font-size: 16px; font-weight: 700; margin: 0 0 8px; color: var(--text); }
        .project-card p { font-size: 13px; color: var(--text-muted); margin: 4px 0; }
        .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .status-active { background: #DCFCE7; color: #166534; }
        .status-inactive { background: #FEF2F2; color: #B91C1C; }
      `}</style>

      <div className="page-header">
        <button className="btn btn-outline" onClick={() => router.push("/dashboard")}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">📁 Projects</h1>
          <p className="page-subtitle">View and manage all projects</p>
        </div>
      </div>

      <div className="filter-toggle">
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive projects
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading projects…</div>
      ) : projects.length === 0 ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No projects found.
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project, i) => (
            <div
              key={project.id}
              className="project-card"
              style={{ background: i % 2 === 0 ? rowLight : rowDark }}
            >
              <h3>{project.name}</h3>
              {project.code && <p style={{ fontWeight: 600, color: "var(--primary)" }}>{project.code}</p>}
              {project.description && <p>{project.description}</p>}
              <div style={{ marginTop: 12 }}>
                <span className={`status-badge ${project.deleted_at ? "status-inactive" : "status-active"}`}>
                  {project.deleted_at ? (
                    <><XCircle size={12} /> Inactive</>
                  ) : (
                    <><CheckCircle size={12} /> Active</>
                  )}
                </span>
              </div>
              <button
                className="btn btn-outline"
                style={{ marginTop: 16, width: "100%" }}
                onClick={() => handleGeneratePDF(project)}
              >
                <FileText size={14} /> View Project Report (PDF)
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}