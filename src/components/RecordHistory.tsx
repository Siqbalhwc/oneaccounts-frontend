"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

async function resolveUserEmail(userId: string): Promise<string> {
  if (userId.includes("@")) return userId
  try {
    const res = await fetch("/api/admin/user-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()
    return data.email || userId
  } catch {
    return userId
  }
}

export default function RecordHistory({
  tableName,
  recordId,
}: {
  tableName: string
  recordId: string
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userNames, setUserNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!tableName || !recordId) return
    setLoading(true)

    // Get user's company_id first
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) {
        setLoading(false)
        return
      }

      supabase
        .from("data_change_logs")
        .select("*")
        .eq("table_name", tableName)
        .eq("record_id", recordId)
        .eq("company_id", cid)                     // ← required for RLS
        .order("changed_at", { ascending: false })
        .then(async ({ data }: { data: any[] | null }) => {
          const logs = data || []
          setLogs(logs)

          const ids = [...new Set(logs.map(l => l.changed_by).filter(Boolean))]
          const resolved: Record<string, string> = {}
          for (const id of ids) {
            resolved[id] = await resolveUserEmail(id)
          }
          setUserNames(resolved)
          setLoading(false)
        })
    })
  }, [tableName, recordId])

  if (loading) return <p style={{ padding: 12, color: "#94A3B8" }}>Loading history…</p>
  if (logs.length === 0)
    return <p style={{ padding: 12, color: "#94A3B8" }}>No changes recorded yet.</p>

  return (
    <div style={{ fontSize: 13 }}>
      {logs.map((log) => {
        const who = userNames[log.changed_by] || log.changed_by || "System"
        return (
          <div key={log.id} style={{
            borderBottom: "1px solid #1E293B",
            padding: "10px 0",
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: 12,
            alignItems: "start",
          }}>
            <div>
              <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 2 }}>
                {new Date(log.changed_at).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "#64748B" }}>by {who}</div>
              <div style={{
                fontWeight: 600, fontSize: 11, marginTop: 4,
                color: log.action === "INSERT" ? "#10B981" : log.action === "DELETE" ? "#EF4444" : "#F59E0B",
              }}>{log.action}</div>
            </div>
            <div>
              {log.action === "UPDATE" ? (
                <DiffViewer old={log.old_values} new={log.new_values} />
              ) : log.action === "INSERT" ? (
                <FieldValues values={log.new_values} />
              ) : (
                <FieldValues values={log.old_values} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FieldValues({ values }: { values: any }) {
  if (!values) return <span>—</span>
  const obj = typeof values === "string" ? JSON.parse(values) : values
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {Object.entries(obj)
        .filter(([key]) => !["id","company_id","deleted_at","updated_at","created_at"].includes(key))
        .map(([key, value]) => (
          <span key={key} style={{ background: "#0F172A", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "#E2E8F0" }}>
            <strong>{key}:</strong> {String(value)}
          </span>
        ))}
    </div>
  )
}

function DiffViewer({ old, new: newVals }: { old: any; new: any }) {
  if (!old || !newVals) return <span>—</span>
  const oldObj = typeof old === "string" ? JSON.parse(old) : old
  const newObj = typeof newVals === "string" ? JSON.parse(newVals) : newVals

  const changes = Object.keys(newObj).filter((key) => {
    if (["updated_at","created_at","id","company_id","deleted_at"].includes(key)) return false
    return JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])
  })
  if (changes.length === 0) return <span>No visible changes</span>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {changes.map((key) => (
        <div key={key} style={{ fontSize: 11 }}>
          <strong style={{ color: "#E2E8F0" }}>{key}:</strong>{" "}
          <span style={{ color: "#EF4444", textDecoration: "line-through" }}>{String(oldObj[key] ?? "—")}</span>{" "}
          → <span style={{ color: "#10B981" }}>{String(newObj[key] ?? "—")}</span>
        </div>
      ))}
    </div>
  )
}