"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import * as XLSX from "xlsx"

export default function BudgetReportPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [businessType, setBusinessType] = useState<string>("")
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])

  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")
  const [selectedActivityId, setSelectedActivityId] = useState<string>("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())

  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Load master data
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)
      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(r => r.data && setBusinessType(r.data.business_type || ""))
      supabase.from("projects").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("donors").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setDonors(r.data))
      supabase.from("activities").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setActivities(r.data))
      supabase.from("locations").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
      supabase.from("accounts").select("id,code,name").eq("company_id", cid).eq("type","Expense").order("code")
        .then(r => r.data && setAccounts(r.data))
    })
  }, [])

  // Fetch budget rows when filters change
  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    let query = supabase.from("budgets")
      .select("*, projects(name), donors(name), activities(name), locations(name), accounts(code,name)")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .is("month", null)
      .not("activity_id", "is", null)   // only rows with activity

    if (selectedProjectId) query = query.eq("project_id", selectedProjectId)
    if (businessType === "ngo" && selectedDonorId) query = query.eq("donor_id", selectedDonorId)
    if (selectedActivityId) query = query.eq("activity_id", selectedActivityId)
    if (selectedLocationId) query = query.eq("location_id", selectedLocationId)

    query.then(({ data }) => {
      if (data) {
        setRows(data.map((r: any) => ({
          ...r,
          project_name: r.projects?.name,
          donor_name: r.donors?.name,
          activity_name: r.activities?.name,
          location_name: r.locations?.name,
          account_code: r.accounts?.code,
          account_name: r.accounts?.name,
        })))
      } else setRows([])
      setLoading(false)
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, selectedActivityId, selectedLocationId, businessType])

  // Excel export
  const handleExport = () => {
    const exportData = rows.map(r => ({
      Project: r.project_name,
      Donor: r.donor_name,
      Activity: r.activity_name,
      Location: r.location_name,
      "Account Code": r.account_code,
      "Account Name": r.account_name,
      Budget: r.budgeted_amount,
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Budget Report")
    XLSX.writeFile(wb, "budget_report.xlsx")
  }

  if (!canView) return <div style={{ padding: 24 }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B" }}>📊 Budget Report</h2>
      <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 16 }}>
        All budget lines with activity assigned. GL codes without activity are hidden to save space.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} style={{ padding: "6px 12px" }}>
          {[2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} style={{ padding: "6px 12px" }}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {businessType === "ngo" && (
          <select value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)} style={{ padding: "6px 12px" }}>
            <option value="">All Donors</option>
            {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <select value={selectedActivityId} onChange={e => setSelectedActivityId(e.target.value)} style={{ padding: "6px 12px" }}>
          <option value="">All Activities</option>
          {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)} style={{ padding: "6px 12px" }}>
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button onClick={handleExport} style={{ padding: "8px 16px", background: "#059669", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
          📥 Export Excel
        </button>
      </div>

      {loading ? <p>Loading...</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "white" }}>
          <thead>
            <tr style={{ background: "#F1F5F9", fontWeight: 700 }}>
              <th style={{ border: "1px solid #ddd", padding: 6 }}>Project</th>
              <th style={{ border: "1px solid #ddd", padding: 6 }}>Donor</th>
              <th style={{ border: "1px solid #ddd", padding: 6 }}>Activity</th>
              <th style={{ border: "1px solid #ddd", padding: 6 }}>Location</th>
              <th style={{ border: "1px solid #ddd", padding: 6 }}>Account Code</th>
              <th style={{ border: "1px solid #ddd", padding: 6 }}>Account Name</th>
              <th style={{ border: "1px solid #ddd", padding: 6 }}>Budget (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td style={{ border: "1px solid #eee", padding: 4 }}>{row.project_name}</td>
                <td style={{ border: "1px solid #eee", padding: 4 }}>{row.donor_name}</td>
                <td style={{ border: "1px solid #eee", padding: 4 }}>{row.activity_name}</td>
                <td style={{ border: "1px solid #eee", padding: 4 }}>{row.location_name}</td>
                <td style={{ border: "1px solid #eee", padding: 4 }}>{row.account_code}</td>
                <td style={{ border: "1px solid #eee", padding: 4 }}>{row.account_name}</td>
                <td style={{ border: "1px solid #eee", padding: 4, textAlign: "right" }}>{row.budgeted_amount?.toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>No budget rows found with activity assigned.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}