"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, Lock } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"

export default function PeriodSettingsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { companyId } = useCompany()
  const isAdmin = role === "admin"

  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [bulkCloseMonth, setBulkCloseMonth] = useState("")
  const [txCounts, setTxCounts] = useState<Record<string, number>>({})

  const fetchPeriods = async () => {
    if (!companyId) return
    setLoading(true)
    const [periodsRes, countsRes] = await Promise.all([
      supabase.from("accounting_periods").select("*").eq("company_id", companyId).order("start_date"),
      supabase.rpc('get_period_transaction_counts', { p_company_id: companyId }),
    ])
    if (periodsRes.data) setPeriods(periodsRes.data)
    if (countsRes.data) {
      const map: Record<string, number> = {}
      countsRes.data.forEach((row: any) => { map[row.period_start] = row.tx_count })
      setTxCounts(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPeriods()
  }, [companyId])

  const changeStatus = async (startDate: string, newStatus: string) => {
    if (!companyId) return
    const txCount = txCounts[startDate] || 0
    if (newStatus === 'Closed' && txCount > 0) {
      if (!window.confirm(`This period contains ${txCount} posted transactions. Are you sure you want to close it?`)) return
    }
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.rpc('set_period_status', {
      p_company_id: companyId,
      p_start_date: startDate,
      p_new_status: newStatus,
      p_user_id: user?.id || null,
    })
    if (error) setMessage("Error: " + error.message)
    else setMessage(`Period ${startDate} set to ${newStatus}`)
    setTimeout(() => setMessage(""), 3000)
    fetchPeriods()
  }

  const handleBulkClose = async () => {
    if (!bulkCloseMonth) return
    const [year, month] = bulkCloseMonth.split("-")
    const lastDay = new Date(Number(year), Number(month), 0).toISOString().split("T")[0]
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.rpc('close_periods_upto', {
      p_company_id: companyId,
      p_end_date: lastDay,
      p_user_id: user?.id || null,
    })
    if (error) setMessage("Error: " + error.message)
    else setMessage(`All periods up to ${bulkCloseMonth} closed.`)
    setTimeout(() => setMessage(""), 3000)
    fetchPeriods()
  }

  if (!isAdmin) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}>Access Denied – Admins only</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; transition: all 0.15s; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .status-badge { padding: 2px 10px; border-radius: 100px; font-size: 11px; font-weight: 600; display: inline-block; }
        .badge-open { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
        .badge-soft { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); }
        .badge-closed { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; text-align: left; }
        th { background: var(--card-hover); font-weight: 700; color: var(--text-muted); text-transform: uppercase; font-size: 10px; }
        select { height: 32px; border: 1px solid var(--border); border-radius: 6px; padding: 0 8px; font-size: 12px; background: var(--bg); color: var(--text); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/settings")}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📅 Fiscal Periods</h1>
      </div>

      {message && <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: "var(--card)", border: "1px solid var(--border)", fontSize: 13 }}>{message}</div>}

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Close all periods up to:</span>
        <input type="month" style={{ height: 34, border: "1px solid var(--border)", borderRadius: 6, padding: "0 10px", fontSize: 13 }} value={bulkCloseMonth} onChange={e => setBulkCloseMonth(e.target.value)} />
        <button className="btn btn-primary" onClick={handleBulkClose}><Lock size={14} /> Close Periods</button>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading…</div>
        ) : periods.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No periods defined. Use the "Close up to…" option to create them automatically.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th>Transactions</th>
                <th>Last Changed</th>
                <th>Changed By</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.id}>
                  <td>{p.start_date} – {p.end_date}</td>
                  <td>
                    <span className={`status-badge ${p.status === 'Open' ? 'badge-open' : p.status === 'Soft Closed' ? 'badge-soft' : 'badge-closed'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>{txCounts[p.start_date] ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.closed_at ? new Date(p.closed_at).toLocaleDateString() : "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.closed_by_user_id || "—"}</td>
                  <td style={{ fontSize: 12 }}>{p.notes || "—"}</td>
                  <td>
                    <select value={p.status} onChange={e => changeStatus(p.start_date, e.target.value)}>
                      <option value="Open">Open</option>
                      <option value="Soft Closed">Soft Closed</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}