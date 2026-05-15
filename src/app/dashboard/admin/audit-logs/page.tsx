"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

export default function AuditLogsPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [tab, setTab] = useState<"activity" | "login" | "data">("data")
  const [activityLogs, setActivityLogs] = useState<any[]>([])
  const [loginLogs, setLoginLogs] = useState<any[]>([])
  const [dataLogs, setDataLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const fetchLogs = async () => {
    setLoading(true)
    setError("")
    try {
      if (tab === "activity") {
        const { data, error: err } = await supabase
          .from("activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
        if (err) throw err
        setActivityLogs(data || [])
      } else if (tab === "login") {
        const { data, error: err } = await supabase
          .from("login_logs")
          .select("*")
          .order("logged_in_at", { ascending: false })
          .limit(100)
        if (err) throw err
        setLoginLogs(data || [])
      } else {
        const { data, error: err } = await supabase
          .from("data_change_logs")
          .select("*")
          .order("changed_at", { ascending: false })
          .limit(200)
        if (err) throw err
        setDataLogs(data || [])
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
  }, [tab])

  // Helper: extract a friendly summary from the new_data JSON
  const summarize = (log: any) => {
    // Pick the correct column (old_data / old_values)
    let newObj: any = log.new_data || log.new_values || {}
    if (typeof newObj === "string") {
      try { newObj = JSON.parse(newObj) } catch {}
    }
    if (!newObj || Object.keys(newObj).length === 0) return "—"
    // Show up to 4 key: value pills
    const entries = Object.entries(newObj).filter(
      ([k]) => !["id","company_id","created_at","updated_at","deleted_at","changed_at","changed_by"].includes(k)
    )
    if (entries.length === 0) return "—"
    return entries.slice(0, 4).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")
  }

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .log-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
        .log-tab { padding: 8px 16px; border-radius: 8px; border: 1px solid #334155; background: #1E293B; color: #94A3B8; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .log-tab.active { background: #1E3A8A; color: white; border-color: #1E3A8A; }
        .log-table { background: #111827; border-radius: 10px; border: 1px solid #1E293B; overflow: hidden; }
        .log-row-header { background: #1E293B; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
        .log-row { display: grid; padding: 10px 16px; border-bottom: 1px solid #1E293B; font-size: 12px; align-items: center; }
        .log-row:last-child { border-bottom: none; }
        .log-row:hover { background: #1E293B; }
        .activity-row { grid-template-columns: 160px 200px 1fr 180px; }
        .login-row { grid-template-columns: 1fr 180px 200px; }
        .data-row { grid-template-columns: 120px 80px 100px 1fr 180px; }
        .badge-action {
          padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; text-transform: uppercase;
        }
        .badge-insert { background: #064E3B; color: #6EE7B7; }
        .badge-update { background: #1E293B; color: #FCD34D; }
        .badge-delete { background: #1E293B; color: #FCA5A5; }
        @media (max-width: 800px) {
          .data-row { grid-template-columns: 100px 60px 1fr; }
          .data-row span:nth-child(4), .data-row span:nth-child(2) { display: none; }
        }
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", marginBottom: 4 }}>📋 Audit Logs</h1>
      <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>Track all system activity</p>

      {error && <div style={{ background: "#1E293B", color: "#FCA5A5", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div className="log-tabs">
        {["activity", "login", "data"].map(t => (
          <button key={t} className={`log-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t as any)}>
            {t === "activity" ? "Activity" : t === "login" ? "Logins" : "Data Changes"}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
      ) : tab === "activity" ? (
        <div className="log-table">
          <div className="log-row log-row-header activity-row">
            <span>User</span><span>Action</span><span>Details</span><span>Time</span>
          </div>
          {activityLogs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>No activity logged yet.</div>
          ) : (
            activityLogs.map(log => (
              <div key={log.id} className="log-row activity-row">
                <span style={{ fontWeight: 600, color: "#93C5FD" }}>{log.user_id?.slice(0, 8) ?? "System"}</span>
                <span>{log.action}</span>
                <span style={{ color: "#94A3B8", fontSize: 11 }}>{JSON.stringify(log.details)}</span>
                <span style={{ color: "#94A3B8" }}>{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      ) : tab === "login" ? (
        <div className="log-table">
          <div className="log-row log-row-header login-row">
            <span>Email</span><span>Time</span><span>IP / User Agent</span>
          </div>
          {loginLogs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>No login records.</div>
          ) : (
            loginLogs.map(log => (
              <div key={log.id} className="log-row login-row">
                <span>{log.email}</span>
                <span style={{ color: "#94A3B8" }}>{new Date(log.logged_in_at).toLocaleString()}</span>
                <span style={{ color: "#94A3B8", fontSize: 10 }}>{log.ip_address ?? "—"} / {log.user_agent ?? "—"}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="log-table">
          <div className="log-row log-row-header data-row">
            <span>Table</span>
            <span>Action</span>
            <span>Who</span>
            <span>What changed</span>
            <span>Time</span>
          </div>
          {dataLogs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>No data changes recorded.</div>
          ) : (
            dataLogs.map(log => {
              const summary = summarize(log)
              return (
                <div key={log.id} className="log-row data-row">
                  <span style={{ fontWeight: 600 }}>{log.table_name}</span>
                  <span className={`badge-action badge-${log.action?.toLowerCase() || "update"}`}>{log.action}</span>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{log.changed_by || "—"}</span>
                  <span style={{ fontSize: 11, color: "#E2E8F0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={summary}>{summary}</span>
                  <span style={{ color: "#94A3B8" }}>{new Date(log.changed_at).toLocaleString()}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}