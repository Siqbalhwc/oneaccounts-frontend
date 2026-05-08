"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import * as XLSX from "xlsx"

export default function ProjectProfitLossPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState<string>("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    const startDate = `${fiscalYear}-01-01`
    const endDate = `${fiscalYear}-12-31`

    // Fetch expense accounts
    supabase.from("accounts")
      .select("id, code, name")
      .eq("company_id", companyId)
      .eq("type", "Expense")
      .order("code")
      .then(({ data: accounts }) => {
        if (!accounts || accounts.length === 0) {
          setLoading(false)
          return
        }

        // Fetch actuals grouped by project and account
        supabase.from("journal_lines")
          .select("project_id, account_id, debit, credit, journal_entries(date)")
          .eq("company_id", companyId)
          .gte("journal_entries.date", startDate)
          .lte("journal_entries.date", endDate)
          .in("account_id", accounts.map(a => a.id))
          .then(({ data: lines }) => {
            // Group by project
            const projectMap: Record<string, Record<string, number>> = {}
            lines?.forEach(line => {
              const pid = line.project_id || "no_project"
              const aid = line.account_id
              const net = (line.debit || 0) - (line.credit || 0)
              if (!projectMap[pid]) projectMap[pid] = {}
              projectMap[pid][aid] = (projectMap[pid][aid] || 0) + net
            })

            // Fetch project names
            const projectIds = Object.keys(projectMap).filter(id => id !== "no_project")
            if (projectIds.length > 0) {
              supabase.from("projects").select("id, name").in("id", projectIds).eq("company_id", companyId)
                .then(({ data: projects }) => {
                  const projectNameMap = new Map(projects?.map(p => [p.id, p.name]) || [])
                  const rows = Object.entries(projectMap).map(([pid, accMap]) => {
                    const projectName = pid === "no_project" ? "No Project" : projectNameMap.get(pid) || pid
                    const total = Object.values(accMap).reduce((s, v) => s + v, 0)
                    return { project: projectName, total, ...Object.fromEntries(accounts.map(acc => [acc.code, accMap[acc.id] || 0])) }
                  })
                  setData(rows)
                  setLoading(false)
                })
            } else {
              setData([])
              setLoading(false)
            }
          })
      })
  }, [companyId, fiscalYear])

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Project P&L")
    XLSX.writeFile(wb, `project_pl_${fiscalYear}.xlsx`)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company…</div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>📊 Project‑wise Profit & Loss</h2>
      <p style={{ fontSize: 13, color: "#64748B" }}>Expense totals by project for FY {fiscalYear}</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <select style={{ padding: 6, borderRadius: 6 }} value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
          {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={exportExcel} style={{ padding: "8px 16px", background: "#059669", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
          📥 Export Excel
        </button>
      </div>

      {loading ? <p>Loading...</p> : data.length === 0 ? (
        <p style={{ color: "#94A3B8" }}>No expense data for this fiscal year.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: 8 }}>
            <thead>
              <tr style={{ background: "#F1F5F9" }}>
                <th style={{ padding: 8 }}>Project</th>
                <th style={{ padding: 8, textAlign: "right" }}>Total Expenses</th>
                {Object.keys(data[0] || {}).filter(k => k !== "project" && k !== "total").map(code => (
                  <th key={code} style={{ padding: 8, textAlign: "right" }}>{code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{row.project}</td>
                  <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>{row.total.toLocaleString()}</td>
                  {Object.keys(row).filter(k => k !== "project" && k !== "total").map(code => (
                    <td key={code} style={{ padding: 8, textAlign: "right" }}>{row[code].toLocaleString()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}