"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, FileText, Check, X, Settings2 } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"
import { generateProjectPDF } from "@/lib/pdf/projectPDF"

type SortField = "name" | "status" | "approved" | "budget" | "actual" | "balance" | "donor"
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

  const [visibleColumns, setVisibleColumns] = useState({
    budget: true,
    actual: true,
    balance: true,
  })
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const columnPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  useEffect(() => {
    fetchProjects()
  }, [showInactive])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/projects")
      const data = await res.json()
      if (!Array.isArray(data)) { setLoading(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      const companyId = (user?.app_metadata as any)?.company_id
      if (!companyId) { setLoading(false); return }

      // 1. Get all expense + fixed asset account IDs
      const { data: expenseAccounts } = await supabase
        .from("accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("type", "Expense")

      const { data: assetAccounts } = await supabase
        .from("accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("type", "Asset")
        .gte("code", "1400")
        .lte("code", "1499")

      const relevantIds = [
        ...(expenseAccounts || []).map(a => a.id),
        ...(assetAccounts || []).map(a => a.id),
      ]

      if (relevantIds.length === 0) {
        // No expense/fixed asset accounts – set actuals to 0
        const enriched = data.map((p: any) => ({ ...p, actualSpent: 0 }))
        const filtered = showInactive ? enriched : enriched.filter((p: any) => !p.deleted_at)
        setProjects(filtered)
        setLoading(false)
        return
      }

      // 2. Fetch journal lines ONLY for those accounts
      const { data: actualRows, error } = await supabase
        .from("journal_lines")
        .select("project_id, debit, credit")
        .eq("company_id", companyId)
        .in("account_id", relevantIds)
        .not("project_id", "is", null)

      let actualsMap: Record<number, number> = {}
      if (!error && actualRows) {
        for (const row of actualRows) {
          const pid = row.project_id
          const net = (row.debit || 0) - (row.credit || 0)
          actualsMap[pid] = (actualsMap[pid] || 0) + net
        }
      }

      const enriched = data.map((p: any) => ({
        ...p,
        actualSpent: actualsMap[p.id] || 0,
      }))

      const filtered = showInactive ? enriched : enriched.filter((p: any) => !p.deleted_at)
      setProjects(filtered)
    } catch (e) {
      console.error(e)
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
      columns: reportData.columns || [],
      rows: reportData.rows || [],
      columnTotals: reportData.columnTotals || {},
      grandTotal: reportData.grandTotal || 0,
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

  const toggleColumn = (col: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))
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
      case "budget": valA = a.totalBudget || 0; valB = b.totalBudget || 0; break
      case "actual": valA = a.actualSpent || 0; valB = b.actualSpent || 0; break
      case "balance": valA = (a.totalBudget || 0) - (a.actualSpent || 0); valB = (b.totalBudget || 0) - (b.actualSpent || 0); break
      case "approved": valA = a.is_approved ? 1 : 0; valB = b.is_approved ? 1 : 0; break
      case "status": valA = a.deleted_at ? "inactive" : "active"; valB = b.deleted_at ? "inactive" : "active"; break
      case "donor": valA = (a.donors?.name || "").toLowerCase(); valB = (b.donors?.name || "").toLowerCase(); break
      default: valA = (a[sortField] || "").toString().toLowerCase(); valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const isLightStyle = themeMode === "light" || themeMode === "oneaccounts"
  const rowLight = isLightStyle ? "#FFFFFF" : "#1E293B"
  const rowDark  = isLightStyle ? "#F8F9FC" : "#111827"
  const headerBg = isLightStyle ? "#07085B" : "#000000"

  const baseCols = "minmax(200px, 2fr) minmax(100px, 1fr) 100px 90px"
  const budgetCol = " 1fr"
  const actualCol = " 1fr"
  const balanceCol = " 1fr"
  const pdfCol = " 80px 60px"

  let gridCols = baseCols
  if (visibleColumns.budget) gridCols += budgetCol
  if (visibleColumns.actual) gridCols += actualCol
  if (visibleColumns.balance) gridCols += balanceCol
  gridCols += pdfCol

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
        .page-title { font-size: 24px; font-weight: 800; color: var(--text); }
        .page-subtitle { font-size: 13px; color: var(--text-muted); }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
        .table-wrap {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .table-header {
          display: grid;
          padding: 14px 24px;
          color: white;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          background: ${headerBg};
          column-gap: 2px;
        }
        .table-row {
          display: grid;
          padding: 12px 24px;
          font-size: 13px;
          align-items: center;
          border-bottom: 1px solid var(--border);
          transition: background 0.15s;
          column-gap: 2px;
        }
        .table-row:hover { background: var(--card-hover); }
        .sort-btn {
          background: none; border: none; cursor: pointer;
          font: inherit; color: white;
          display: inline-flex; align-items: center; gap: 4px;
          padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .status-col { display: flex; justify-content: center; align-items: center; }
        .status-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 600;
        }
        .status-active { background: #DCFCE7; color: #166534; }
        .status-inactive { background: #FEF2F2; color: #B91C1C; }
        .approved-icon { color: #10B981; cursor: pointer; }
        .not-approved-icon { color: #CBD5E1; cursor: pointer; }

        .column-picker {
          position: absolute;
          top: 100%;
          right: 0;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 8px;
          z-index: 50;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 160px;
        }
        .column-picker label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text);
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .table-wrap { overflow-x: auto; }
          .table-header, .table-row {
            grid-template-columns: 160px 90px 80px 70px ${visibleColumns.budget ? "100px" : ""} ${visibleColumns.actual ? "100px" : ""} ${visibleColumns.balance ? "100px" : ""} 60px 50px;
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
          <p className="page-subtitle">All projects with budget, actual spending, and balance</p>
        </div>
      </div>

      <div className="filter-bar">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive projects
        </label>

        <div style={{ marginLeft: "auto", position: "relative" }} ref={columnPickerRef}>
          <button className="btn btn-outline" onClick={() => setShowColumnPicker(!showColumnPicker)}>
            <Settings2 size={14} /> Columns
          </button>
          {showColumnPicker && (
            <div className="column-picker">
              <label>
                <input type="checkbox" checked={visibleColumns.budget} onChange={() => toggleColumn("budget")} />
                Budget
              </label>
              <label>
                <input type="checkbox" checked={visibleColumns.actual} onChange={() => toggleColumn("actual")} />
                Actual
              </label>
              <label>
                <input type="checkbox" checked={visibleColumns.balance} onChange={() => toggleColumn("balance")} />
                Balance
              </label>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading projects…</div>
      ) : sorted.length === 0 ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No projects found.
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-header" style={{ gridTemplateColumns: gridCols }}>
            <button className="sort-btn" onClick={() => handleSort("name")}>Project Name {getSortIcon("name")}</button>
            <button className="sort-btn" onClick={() => handleSort("donor")}>Donor {getSortIcon("donor")}</button>
            <div className="sort-btn" style={{ justifyContent: "center", cursor: "default", color: "white" }}>Status</div>
            <button className="sort-btn" onClick={() => handleSort("approved")}>Approved {getSortIcon("approved")}</button>
            {visibleColumns.budget && (
              <button className="sort-btn" onClick={() => handleSort("budget")} style={{ justifyContent: "flex-end" }}>Budget {getSortIcon("budget")}</button>
            )}
            {visibleColumns.actual && (
              <button className="sort-btn" onClick={() => handleSort("actual")} style={{ justifyContent: "flex-end" }}>Actual {getSortIcon("actual")}</button>
            )}
            {visibleColumns.balance && (
              <button className="sort-btn" onClick={() => handleSort("balance")} style={{ justifyContent: "flex-end" }}>Balance {getSortIcon("balance")}</button>
            )}
            <span style={{ textAlign: "center" }}>PDF</span>
            <span></span>
          </div>
          {sorted.map((p, i) => {
            const balance = (p.totalBudget || 0) - (p.actualSpent || 0)
            return (
              <div
                key={p.id}
                className="table-row"
                style={{ background: i % 2 === 0 ? rowLight : rowDark, gridTemplateColumns: gridCols }}
              >
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                <span style={{ fontSize: 13, color: "var(--text)" }}>{p.donors?.name || "—"}</span>
                <div className="status-col">
                  <span className={`status-badge ${p.deleted_at ? "status-inactive" : "status-active"}`}>
                    {p.deleted_at ? "Inactive" : "Active"}
                  </span>
                </div>
                <span style={{ textAlign: "center", cursor: "pointer" }} onClick={() => toggleApproval(p)}>
                  {p.is_approved ? (
                    <Check size={18} className="approved-icon" />
                  ) : (
                    <X size={18} className="not-approved-icon" />
                  )}
                </span>
                {visibleColumns.budget && (
                  <span style={{ textAlign: "right", fontWeight: 500, whiteSpace: "nowrap" }}>{fmt(p.totalBudget || 0)}</span>
                )}
                {visibleColumns.actual && (
                  <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(p.actualSpent || 0)}</span>
                )}
                {visibleColumns.balance && (
                  <span style={{
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    color: balance < 0 ? "#EF4444" : "#10B981"
                  }}>{fmt(balance)}</span>
                )}
                <span style={{ textAlign: "center" }}>
                  <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => handleGeneratePDF(p)}>
                    <FileText size={12} /> PDF
                  </button>
                </span>
                <span></span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}