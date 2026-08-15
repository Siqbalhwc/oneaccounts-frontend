"use client"

import { useState, useEffect } from "react"
import { useCompany } from "@/contexts/CompanyContext"

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

interface BudgetHistoryProps {
  recordId: string
  activities: { id: number; name: string }[]
  locations: { id: number; name: string }[]
  accounts: { id: number; code: string; name: string }[]
}

export default function BudgetHistory({ recordId, activities, locations, accounts }: BudgetHistoryProps) {
  const { companyId } = useCompany()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!recordId || !companyId) return
    setLoading(true)
    fetch(`/api/audit-logs?tableName=budgets&recordId=${encodeURIComponent(recordId)}&companyId=${encodeURIComponent(companyId)}`)
      .then(res => res.json())
      .then(async (data) => {
        const logs = Array.isArray(data) ? data : []
        setLogs(logs)
        const ids = [...new Set(logs.map(l => l.changed_by).filter(Boolean))]
        const resolved: Record<string, string> = {}
        for (const id of ids) {
          resolved[id] = await resolveUserEmail(id)
        }
        setUserNames(resolved)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [recordId, companyId])

  const nameFor = {
    activity: (id: number) => activities.find(a => a.id === id)?.name || `Activity ${id}`,
    location: (id: number) => locations.find(l => l.id === id)?.name || `Location ${id}`,
    account: (id: number) => {
      const acc = accounts.find(a => a.id === id)
      return acc ? `${acc.code} - ${acc.name}` : `Account ${id}`
    },
  }

  if (loading) return <p style={{ padding: 12, color: "var(--text-muted)", fontSize: 13 }}>Loading history...</p>
  if (logs.length === 0)
    return <p style={{ padding: 12, color: "var(--text-muted)", fontSize: 13 }}>No changes recorded yet.</p>

  return (
    <div style={{ fontSize: 13 }}>
      {logs.map((log) => {
        const who = userNames[log.changed_by] || log.changed_by || "System"
        let rows: any[] = []
        try {
          const parsed = typeof log.new_values === "string" ? JSON.parse(log.new_values) : log.new_values
          rows = Array.isArray(parsed) ? parsed : []
        } catch { rows = [] }
        const isOpen = !!expanded[log.id]

        return (
          <div key={log.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {new Date(log.changed_at).toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>by {who}</div>
              </div>
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [log.id]: !prev[log.id] }))}
                style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 6,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-muted)", cursor: "pointer",
                }}
              >
                {rows.length} budget line{rows.length !== 1 ? "s" : ""} saved {isOpen ? "(hide)" : "(view)"}
              </button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {rows.map((r, i) => (
                  <div key={i} style={{
                    fontSize: 11, background: "var(--card-hover)", borderRadius: 4,
                    padding: "4px 8px", color: "var(--text)",
                  }}>
                    <strong>{nameFor.activity(r.activity_id)}</strong> / {nameFor.location(r.location_id)} / {nameFor.account(r.account_id)}
                    {" - "}
                    <span style={{ fontWeight: 600 }}>
                      {Number(r.budgeted_amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}