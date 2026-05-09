"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"

export default function ManagementDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  // Filters
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedDonorId, setSelectedDonorId] = useState<string>("")

  // Master data
  const [projects, setProjects] = useState<any[]>([])
  const [donors, setDonors] = useState<any[]>([])

  // Dashboard data
  const [donorBalances, setDonorBalances] = useState<any[]>([])
  const [projectRows, setProjectRows] = useState<any[]>([])
  const [totalBudget, setTotalBudget] = useState(0)
  const [totalSpent, setTotalSpent] = useState(0)
  const [overspentCount, setOverspentCount] = useState(0)

  // Quick stats
  const [unpaidInvoices, setUnpaidInvoices] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)

  // ── Fetch company ID and master data ────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase.from("projects").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setProjects(r.data))
    supabase.from("donors").select("id, name").eq("company_id", companyId).order("name")
      .then(r => r.data && setDonors(r.data))
  }, [companyId])

  // ── Fetch dashboard data ─────────────────────────────
  useEffect(() => {
    if (!companyId) return

    const fetchData = async () => {
      setLoading(true)

      // Total Budget
      const { data: budgets } = await supabase
        .from("budgets")
        .select("budgeted_amount")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .is("month", null)
        .not("activity_id", "is", null)
      const totalBudgetVal = budgets?.reduce((s, b) => s + (b.budgeted_amount || 0), 0) || 0
      setTotalBudget(totalBudgetVal)

      // Total Spent (RPC)
      const { data: spentData } = await supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear })
      const totalSpentVal = spentData?.[0]?.total || 0
      setTotalSpent(totalSpentVal)

      // Donor Balances (RPC)
      const { data: donorData } = await supabase.rpc("dashboard_donor_balances", { cid: companyId, fy: fiscalYear })
      const donorRows = donorData?.map((d: any) => ({
        donor_id: d.donor_id,
        name: d.donor_name,
        budget: d.budget,
        actual: d.actual_spent,
        remaining: (d.budget || 0) - (d.actual_spent || 0),
        pct: d.budget ? Math.round(((d.actual_spent || 0) / d.budget) * 100) : 0,
        overspent: (d.actual_spent || 0) > (d.budget || 0),
      })) || []
      setDonorBalances(donorRows)

      // Project Utilization (RPC – FIXED PARAMETER NAMES)
      const { data: projData } = await supabase.rpc("dashboard_project_utilization", {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
      })
      const projectsArr = projData?.map((p: any) => ({
        id: p.project_id,
        name: p.project_name,
        budget: p.budget || 0,
        actual: p.actual || 0,
        pct: p.budget ? Math.round(((p.actual || 0) / p.budget) * 100) : (p.actual > 0 ? 100 : 0),
      })) || []
      setProjectRows(projectsArr.sort((a: any, b: any) => b.pct - a.pct))
      setOverspentCount(projectsArr.filter((p: any) => p.actual > p.budget).length)

      // Quick stats
      const { count: unpaidCount } = await supabase.from("invoices")
        .select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "Unpaid")
      setUnpaidInvoices(unpaidCount || 0)

      const { data: custBals } = await supabase.from("customers").select("balance").eq("company_id", companyId)
      setTotalReceivables(custBals?.reduce((s, c) => s + (c.balance || 0), 0) || 0)

      const { data: suppBals } = await supabase.from("suppliers").select("balance").eq("company_id", companyId)
      setTotalPayables(suppBals?.reduce((s, s2) => s + (s2.balance || 0), 0) || 0)

      setLoading(false)
    }

    fetchData()
  }, [companyId, fiscalYear])

  // ── Filtered data ─────────────────────────────────────
  const filteredDonorBalances = donorBalances.filter(d => {
    if (selectedDonorId && d.donor_id != selectedDonorId) return false
    return true
  })

  const filteredProjectRows = projectRows.filter(p => {
    if (selectedProjectId && p.id != selectedProjectId) return false
    return true
  })

  const filteredTotalBudget = selectedProjectId
    ? filteredProjectRows.reduce((s, p) => s + p.budget, 0)
    : totalBudget

  const filteredTotalSpent = selectedProjectId
    ? filteredProjectRows.reduce((s, p) => s + p.actual, 0)
    : totalSpent

  const filteredOverspentCount = selectedProjectId
    ? filteredProjectRows.filter(p => p.actual > p.budget).length
    : overspentCount

  const remainingFunds = filteredTotalBudget - filteredTotalSpent
  const spentPct = filteredTotalBudget ? Math.round((filteredTotalSpent / filteredTotalBudget) * 100) : 0

  // Format large numbers
  const formatPKR = (v: number) =>
    v >= 1_000_000 ? `PKR ${(v / 1_000_000).toFixed(1)}M` : `PKR ${v.toLocaleString()}`

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500 text-xl">Loading dashboard…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* Since the sidebar is provided by the app layout, we only render the main area */}
      <main className="p-4 md:p-6 lg:p-8">
        {/* Header & Filters */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6 mb-8">
          <div>
            <h2 className="text-4xl font-black text-slate-900">Management Dashboard</h2>
            <p className="text-slate-500 mt-2 text-lg">NGO Budget, Donor & Project Intelligence Center</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm"
              value={fiscalYear}
              onChange={e => setFiscalYear(Number(e.target.value))}
            >
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm"
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm"
              value={selectedDonorId}
              onChange={e => setSelectedDonorId(e.target.value)}
            >
              <option value="">All Donors</option>
              {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        {/* KPI Cards – template style with live data */}
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-6 mb-8">
          <button
            className="group relative overflow-hidden bg-white rounded-[28px] p-6 text-left shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-slate-100"
            onClick={() => router.push("/dashboard/reports/budget-summary")}
          >
            <div className="absolute top-0 left-0 h-2 w-full bg-gradient-to-r from-blue-500 to-cyan-500"></div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">Total Budget</p>
                <h3 className="text-4xl font-black text-slate-900">{formatPKR(filteredTotalBudget)}</h3>
              </div>
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 opacity-90"></div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 font-bold text-sm">{filteredProjectRows.length} projects</p>
              </div>
              <span className="text-sm font-semibold text-slate-900 group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </button>

          <button
            className="group relative overflow-hidden bg-white rounded-[28px] p-6 text-left shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-slate-100"
            onClick={() => router.push("/dashboard/reports/spending-detail")}
          >
            <div className="absolute top-0 left-0 h-2 w-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">Total Spent</p>
                <h3 className="text-4xl font-black text-slate-900">{formatPKR(filteredTotalSpent)}</h3>
              </div>
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-400 opacity-90"></div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 font-bold text-sm">{spentPct}% of budget</p>
              </div>
              <span className="text-sm font-semibold text-slate-900 group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </button>

          <button
            className="group relative overflow-hidden bg-white rounded-[28px] p-6 text-left shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-slate-100"
            onClick={() => router.push("/dashboard/reports/remaining-funds")}
          >
            <div className="absolute top-0 left-0 h-2 w-full bg-gradient-to-r from-orange-500 to-amber-500"></div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">Remaining</p>
                <h3 className="text-4xl font-black text-slate-900">{formatPKR(remainingFunds)}</h3>
              </div>
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 opacity-90"></div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 font-bold text-sm">{filteredTotalBudget ? Math.round((remainingFunds / filteredTotalBudget) * 100) : 0}% unspent</p>
              </div>
              <span className="text-sm font-semibold text-slate-900 group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </button>

          <button
            className="group relative overflow-hidden bg-white rounded-[28px] p-6 text-left shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-slate-100"
            onClick={() => router.push("/dashboard/reports/overspent")}
          >
            <div className="absolute top-0 left-0 h-2 w-full bg-gradient-to-r from-red-500 to-pink-500"></div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">Overspent</p>
                <h3 className="text-4xl font-black text-slate-900">{filteredOverspentCount}</h3>
              </div>
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-red-500 to-pink-400 opacity-90"></div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-600 font-bold text-sm">Attention</p>
              </div>
              <span className="text-sm font-semibold text-slate-900 group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </button>
        </div>

        {/* Quick Stats – lower cards */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          <button
            className="bg-white rounded-[30px] p-6 shadow-sm border border-slate-100 hover:shadow-xl transition cursor-pointer text-left"
            onClick={() => router.push("/dashboard/invoices")}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="uppercase text-xs tracking-widest text-slate-400 font-black mb-2">Unpaid Invoices</p>
                <h3 className="text-4xl font-black text-slate-900">{unpaidInvoices}</h3>
              </div>
              <div className="h-16 w-16 rounded-3xl bg-blue-100"></div>
            </div>
            <p className="text-slate-500 leading-relaxed">Pending invoices requiring payment.</p>
          </button>

          <button
            className="bg-white rounded-[30px] p-6 shadow-sm border border-slate-100 hover:shadow-xl transition cursor-pointer text-left"
            onClick={() => router.push("/dashboard/customers")}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="uppercase text-xs tracking-widest text-slate-400 font-black mb-2">Total Receivables</p>
                <h3 className="text-4xl font-black text-slate-900">{formatPKR(totalReceivables)}</h3>
              </div>
              <div className="h-16 w-16 rounded-3xl bg-green-100"></div>
            </div>
            <p className="text-slate-500 leading-relaxed">Outstanding customer receivables.</p>
          </button>

          <button
            className="bg-white rounded-[30px] p-6 shadow-sm border border-slate-100 hover:shadow-xl transition cursor-pointer text-left"
            onClick={() => router.push("/dashboard/suppliers")}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="uppercase text-xs tracking-widest text-slate-400 font-black mb-2">Total Payables</p>
                <h3 className="text-4xl font-black text-slate-900">{formatPKR(totalPayables)}</h3>
              </div>
              <div className="h-16 w-16 rounded-3xl bg-orange-100"></div>
            </div>
            <p className="text-slate-500 leading-relaxed">Vendor liabilities and pending payments.</p>
          </button>
        </div>

        {/* Project Utilization & Donor Balances */}
        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6 mb-8">
          <div className="2xl:col-span-2 bg-white rounded-[30px] p-6 md:p-8 shadow-sm border border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Project Utilization</h3>
                <p className="text-slate-500 mt-1">Real‑time budget monitoring and burn rate analysis</p>
              </div>
              <button
                className="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 transition font-semibold"
                onClick={() => router.push("/dashboard/reports/budget-vs-actual")}
              >
                Open Full Analytics
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase text-xs tracking-widest">
                    <th className="text-left pb-5">Project</th>
                    <th className="text-left pb-5">Budget</th>
                    <th className="text-left pb-5">Spent</th>
                    <th className="text-left pb-5">Utilization</th>
                    <th className="text-right pb-5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjectRows.map((p, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer"
                      onClick={() => router.push(`/dashboard/settings/budgets?project=${p.id}`)}
                    >
                      <td className="py-6">
                        <div>
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-sm text-slate-500 mt-1">Click to open project center</div>
                        </div>
                      </td>
                      <td className="py-6 font-semibold text-slate-700">{formatPKR(p.budget)}</td>
                      <td className="py-6 font-black text-slate-900">{formatPKR(p.actual)}</td>
                      <td className="py-6 w-72">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                p.pct > 100 ? 'bg-red-500' : p.pct > 80 ? 'bg-orange-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(p.pct, 100)}%` }}
                            ></div>
                          </div>
                          <div
                            className={`font-black text-sm ${
                              p.pct > 100 ? 'text-red-500' : p.pct > 80 ? 'text-orange-500' : 'text-green-600'
                            }`}
                          >
                            {p.pct}%
                          </div>
                        </div>
                      </td>
                      <td className="py-6 text-right">
                        <span
                          className={`inline-flex px-4 py-2 rounded-full text-xs font-black ${
                            p.pct > 100 ? 'bg-red-100 text-red-700' : p.pct > 80 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review" : "On Track"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredProjectRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-400">No projects found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-[30px] p-6 md:p-8 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Donor Balances</h3>
                <p className="text-slate-500 mt-1">Funding utilization overview</p>
              </div>
            </div>
            <div className="space-y-6">
              {filteredDonorBalances.map((d, idx) => (
                <button
                  key={idx}
                  className="w-full text-left p-5 rounded-3xl hover:bg-slate-50 transition border border-slate-100"
                  onClick={() => router.push(`/dashboard/settings/budgets?donor=${d.donor_id}`)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-black text-slate-900 text-lg">{d.name}</div>
                      <div className="text-sm text-slate-500 mt-1">Click to view donor projects</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-xl text-slate-900">{formatPKR(d.remaining)}</div>
                      <div className="text-sm text-slate-500">Remaining</div>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        d.pct > 90 ? 'bg-red-500' : d.pct > 80 ? 'bg-orange-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(d.pct, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-sm">
                    <span className="text-slate-500">Utilization</span>
                    <span className="font-black text-slate-900">{d.pct}%</span>
                  </div>
                </button>
              ))}
              {filteredDonorBalances.length === 0 && (
                <p className="text-slate-400 text-center py-6">No donor data available.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white rounded-[30px] px-6 py-5 border border-slate-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_0_6px_rgba(34,197,94,0.15)]"></div>
              <span className="text-slate-500">
                Portfolio Status:
                <strong className="text-slate-900 ml-1">
                  {filteredOverspentCount > 0 ? "Needs Attention" : "Healthy"}
                </strong>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-slate-500">
            <span>Total Budget:<strong className="text-slate-900 ml-1">{formatPKR(filteredTotalBudget)}</strong></span>
            <span>Utilized:<strong className="text-slate-900 ml-1">{spentPct}%</strong></span>
            <span>Projects:<strong className="text-slate-900 ml-1">{filteredProjectRows.length}</strong></span>
          </div>
        </div>
      </main>
    </div>
  )
}