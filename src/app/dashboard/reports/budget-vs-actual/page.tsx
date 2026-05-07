"use client"

import { useState, useEffect, Fragment } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import * as XLSX from "xlsx"

export default function BudgetVsActualReportPage() {
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

  const [data, setData] = useState<Record<string, Record<string, Record<string, { budget: number; actual: number }>>>>({})
  const [loading, setLoading] = useState(false)

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

  useEffect(() => {
    if (!companyId || !selectedProjectId) { setData({}); setLoading(false); return }
    if (businessType === "ngo" && !selectedDonorId) { setData({}); setLoading(false); return }
    setLoading(true)

    let budgetQuery = supabase.from("budgets")
      .select("*")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .eq("project_id", selectedProjectId)
      .is("month", null)
    if (businessType === "ngo") budgetQuery = budgetQuery.eq("donor_id", selectedDonorId)
    if (selectedActivityId) budgetQuery = budgetQuery.eq("activity_id", selectedActivityId)
    if (selectedLocationId) budgetQuery = budgetQuery.eq("location_id", selectedLocationId)

    budgetQuery.then(({ data: budgetRows }) => {
      const startDate = `${fiscalYear}-01-01`
      const endDate = `${fiscalYear}-12-31`
      let actualQuery = supabase.from("journal_lines")
        .select("account_id, activity_id, location_id, debit, credit, journal_entries!inner(date)")
        .eq("company_id", companyId)
        .eq("project_id", selectedProjectId)
        .gte("journal_entries.date", startDate)
        .lte("journal_entries.date", endDate)
      if (businessType === "ngo") actualQuery = actualQuery.eq("donor_id", selectedDonorId)
      if (selectedActivityId) actualQuery = actualQuery.eq("activity_id", selectedActivityId)
      if (selectedLocationId) actualQuery = actualQuery.eq("location_id", selectedLocationId)

      actualQuery.then(({ data: actualRows }) => {
        const newData: Record<string, Record<string, Record<string, { budget: number; actual: number }>>> = {}
        budgetRows?.forEach((b: any) => {
          const { activity_id, location_id, account_id, budgeted_amount } = b
          if (!activity_id || !location_id || !account_id) return
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          if (!newData[activity_id][location_id][account_id]) newData[activity_id][location_id][account_id] = { budget: 0, actual: 0 }
          newData[activity_id][location_id][account_id].budget += budgeted_amount || 0
        })
        actualRows?.forEach((line: any) => {
          const { account_id, activity_id, location_id, debit, credit } = line
          if (!activity_id || !location_id || !account_id) return
          const net = (debit || 0) - (credit || 0)
          if (!newData[activity_id]) newData[activity_id] = {}
          if (!newData[activity_id][location_id]) newData[activity_id][location_id] = {}
          if (!newData[activity_id][location_id][account_id]) newData[activity_id][location_id][account_id] = { budget: 0, actual: 0 }
          newData[activity_id][location_id][account_id].actual += net
        })
        setData(newData)
        setLoading(false)
      })
    })
  }, [companyId, fiscalYear, selectedProjectId, selectedDonorId, selectedActivityId, selectedLocationId, businessType])

  const handleExport = () => {
    const exportRows: any[] = []
    const usedActivities = Object.keys(data)
    usedActivities.forEach(actId => {
      const actName = activities.find(a => a.id == actId)?.name || actId
      const locData = data[actId] || {}
      const locIds = Object.keys(locData)
      locIds.forEach(locId => {
        const locName = locations.find(l => l.id == locId)?.name || locId
        const accData = locData[locId] || {}
        Object.keys(accData).forEach(accId => {
          const acc = accounts.find(a => a.id == accId)
          const { budget, actual } = accData[accId]
          exportRows.push({
            Activity: actName,
            Location: locName,
            "Account Code": acc?.code,
            "Account Name": acc?.name,
            Budget: budget,
            Actual: actual,
            Variance: actual - budget,
          })
        })
      })
    })
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Budget vs Actual")
    XLSX.writeFile(wb, "budget_vs_actual_report.xlsx")
  }

  if (!canView) return <div style={{ padding: 24 }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B" }}>📉 Budget vs Actual Report</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, marginTop: 8 }}>
        <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} style={{ padding: "6px 12px" }}>
          {[2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} style={{ padding: "6px 12px" }}>
          <option value="">-- Select Project --</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {businessType === "ngo" && (
          <select value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)} style={{ padding: "6px 12px" }}>
            <option value="">-- Select Donor --</option>
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

      {!selectedProjectId ? (
        <p style={{ color: "#94A3B8" }}>Please select a project.</p>
      ) : loading ? <p>Loading...</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, background: "white" }}>
          <thead>
            <tr style={{ background: "#F1F5F9" }}>
              <th style={{ border: "1px solid #ddd", padding: 4 }}>Activity</th>
              <th style={{ border: "1px solid #ddd", padding: 4 }}>Location</th>
              <th style={{ border: "1px solid #ddd", padding: 4 }}>Account Code</th>
              <th style={{ border: "1px solid #ddd", padding: 4 }}>Account Name</th>
              <th style={{ border: "1px solid #ddd", padding: 4 }}>Budget</th>
              <th style={{ border: "1px solid #ddd", padding: 4 }}>Actual</th>
              <th style={{ border: "1px solid #ddd", padding: 4 }}>Variance</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(data).length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>No data found for selected filters.</td></tr>
            ) : (
              Object.keys(data).flatMap(actId => {
                const actName = activities.find(a => a.id == actId)?.name || actId
                return Object.keys(data[actId]).flatMap(locId => {
                  const locName = locations.find(l => l.id == locId)?.name || locId
                  return Object.keys(data[actId][locId]).map(accId => {
                    const acc = accounts.find(a => a.id == accId)
                    const { budget, actual } = data[actId][locId][accId]
                    const variance = actual - budget
                    return (
                      <tr key={`${actId}_${locId}_${accId}`}>
                        <td style={{ border: "1px solid #eee", padding: 4 }}>{actName}</td>
                        <td style={{ border: "1px solid #eee", padding: 4 }}>{locName}</td>
                        <td style={{ border: "1px solid #eee", padding: 4 }}>{acc?.code}</td>
                        <td style={{ border: "1px solid #eee", padding: 4 }}>{acc?.name}</td>
                        <td style={{ border: "1px solid #eee", padding: 4, textAlign: "right" }}>{budget.toLocaleString()}</td>
                        <td style={{ border: "1px solid #eee", padding: 4, textAlign: "right" }}>{actual.toLocaleString()}</td>
                        <td style={{ border: "1px solid #eee", padding: 4, textAlign: "right", color: variance < 0 ? "#EF4444" : "#10B981" }}>
                          {variance === 0 ? "—" : (variance > 0 ? "+" : "") + variance.toLocaleString()}
                        </td>
                      </tr>
                    )
                  })
                })
              })
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}