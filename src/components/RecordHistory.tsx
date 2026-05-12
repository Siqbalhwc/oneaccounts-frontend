"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export default function RecordHistory({
  tableName,
  recordId,
}: {
  tableName: string
  recordId: string
}) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tableName || !recordId) return
    setLoading(true)
    supabase
      .from("data_change_logs")
      .select("*")
      .eq("table_name", tableName)
      .eq("record_id", recordId)
      .order("changed_at", { ascending: false })
      .then(({ data }: { data: any[] | null }) => {
        setLogs(data || [])
        setLoading(false)
      })
  }, [tableName, recordId])

  if (loading) return <p style={{ padding: 12, color: "#94A3B8" }}>Loading history…</p>
  if (logs.length === 0)
    return (
      <p style={{ padding: 12, color: "#94A3B8" }}>
        No changes recorded yet.
      </p>
    )

  return (
    <div style={{ fontSize: 13 }}>
      {logs.map((log) => (
        <div
          key={log.id}
          style={{
            borderBottom: "1px solid #E2E8F0",
            padding: "10px 0",
            display: "grid",
            gridTemplateColumns: "140px 80px 1fr",
            gap: 12,
          }}
        >
          <div style={{ color: "#64748B" }}>
            {new Date(log.changed_at).toLocaleString()}
          </div>
          <div
            style={{
              fontWeight: 600,
              color:
                log.action === "INSERT"
                  ? "#10B981"
                  : log.action === "DELETE"
                  ? "#EF4444"
                  : "#F59E0B",
            }}
          >
            {log.action}
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
      ))}
    </div>
  )
}

function FieldValues({ values }: { values: any }) {
  if (!values) return <span>—</span>
  const obj = typeof values === "string" ? JSON.parse(values) : values
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {Object.entries(obj)
        .filter(([key]) => !["id", "company_id", "deleted_at", "updated_at", "created_at"].includes(key))
        .map(([key, value]) => (
          <span key={key} style={{ background: "#F1F5F9", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>
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
    if (["updated_at", "created_at", "id", "company_id", "deleted_at"].includes(key)) return false
    return JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])
  })

  if (changes.length === 0) return <span>No visible changes</span>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {changes.map((key) => (
        <div key={key} style={{ fontSize: 11 }}>
          <strong>{key}:</strong>{" "}
          <span style={{ color: "#EF4444", textDecoration: "line-through" }}>
            {String(oldObj[key] ?? "—")}
          </span>{" "}
          →{" "}
          <span style={{ color: "#10B981" }}>
            {String(newObj[key] ?? "—")}
          </span>
        </div>
      ))}
    </div>
  )
}