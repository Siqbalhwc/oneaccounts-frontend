"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, Search, Check, X } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

export default function AttendanceVerificationPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchRecords = () => {
    if (!companyId) return
    setLoading(true)
    let query = supabase
      .from("attendance_records")
      .select("id, employee_id, date, raw_status, check_in, check_out, employees!inner(full_name, employee_code)")
      .eq("company_id", companyId)
      .eq("verified_status", "pending")
      .order("date", { ascending: false })

    if (dateFrom) query = query.gte("date", dateFrom)
    if (dateTo) query = query.lte("date", dateTo)

    query.then(({ data }) => {
      let filtered = data || []
      if (search.trim()) {
        const q = search.toLowerCase()
        filtered = filtered.filter((r: any) =>
          r.employees?.full_name?.toLowerCase().includes(q) ||
          r.employees?.employee_code?.toLowerCase().includes(q)
        )
      }
      setRecords(filtered)
      setSelectedIds(new Set())   // clear selection on refresh
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!role || !canView || !companyId) return
    fetchRecords()
  }, [role, canView, companyId, dateFrom, dateTo, search])

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map(r => r.id)))
    }
  }

  const handleApprove = async () => {
    if (selectedIds.size === 0) {
      setError("No records selected")
      return
    }
    setProcessing(true)
    setError("")
    const { data: { user } } = await supabase.auth.getUser()
    const ids = Array.from(selectedIds)
    const { error: updateErr } = await supabase
      .from("attendance_records")
      .update({
        verified_status: "approved",
        verified_by: user?.id,
        verified_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("company_id", companyId)

    if (updateErr) {
      setError(updateErr.message)
      setProcessing(false)
      return
    }

    setFlash(`✅ Approved ${ids.length} records`)
    setProcessing(false)
    fetchRecords()
  }

  if (planLoading || loading) {
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

  const totalPending = records.length

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-success { background: #10B981; }
        .btn-success:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-back { background: transparent; border: 1.5px solid var(--border); color: var(--text-muted); padding: 8px 14px; }
        .search-input, .date-input {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .search-input:focus, .date-input:focus { border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table tr:hover td { background: var(--card-hover); }
        .filter-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
        .summary { margin-bottom: 12px; font-size: 13px; color: var(--text-muted); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/payroll/attendance")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>✅ Verify Attendance</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Approve pending attendance records before they are used in payroll</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <div className="summary">
        <strong>{totalPending}</strong> pending records
      </div>

      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: "100%" }} />
        </div>
        <input type="date" className="date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" style={{ width: 150 }} />
        <input type="date" className="date-input" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" style={{ width: 150 }} />
        {canEdit && (
          <button className="btn btn-success" onClick={handleApprove} disabled={processing || selectedIds.size === 0}>
            <Check size={16} /> Approve {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </button>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  onChange={selectAll}
                  checked={records.length > 0 && selectedIds.size === records.length}
                />
              </th>
              <th>Employee</th>
              <th>Date</th>
              <th>Status</th>
              <th>Check In</th>
              <th>Check Out</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No pending records found.</td></tr>
            ) : (
              records.map(rec => (
                <tr key={rec.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(rec.id)}
                      onChange={() => toggleSelect(rec.id)}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {rec.employees?.full_name}<br />
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{rec.employees?.employee_code}</span>
                  </td>
                  <td>{rec.date}</td>
                  <td style={{ textTransform: "capitalize" }}>{rec.raw_status?.replace("_", " ")}</td>
                  <td>{rec.check_in || "—"}</td>
                  <td>{rec.check_out || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}