"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface JournalEntry {
  id: number
  entry_no: string
  date: string
  description: string
}

export default function JournalPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("journal_entries")
      .select("*")
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) setEntries(data)
        setLoading(false)
      })
  }, [role, canView])

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .je-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .je-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .je-subtitle { font-size: 13px; color: #94A3B8; }
          .je-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
          .je-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
          .je-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .je-table-header, .je-table-row { display: grid; grid-template-columns: 120px 120px 1fr 80px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .je-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .je-table-row:hover { background: #FAFBFF; }
          @media (max-width: 768px) {
            .je-table-header, .je-table-row { grid-template-columns: 100px 1fr 80px; }
            .je-hide-mobile { display: none; }
          }
        `}</style>

        <div className="je-header">
          <div>
            <div className="je-title">📓 Journal Entries</div>
            <div className="je-subtitle">{canEdit ? "Manage double‑entry transactions" : "View journal entries"}</div>
          </div>
          {canEdit && (
            <button className="je-btn je-btn-primary" onClick={() => router.push("/dashboard/journal/new")}>
              <Plus size={16} /> New Entry
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading journal...</div>
        ) : entries.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No journal entries yet. {canEdit && 'Click "New Entry" to create one.'}
          </div>
        ) : (
          <div className="je-table">
            <div className="je-table-header">
              <span>Entry No</span>
              <span className="je-hide-mobile">Date</span>
              <span>Description</span>
              <span></span>
            </div>
            {entries.map((je) => (
              <div key={je.id} className="je-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{je.entry_no}</span>
                <span className="je-hide-mobile" style={{ color: "#64748B" }}>{new Date(je.date).toLocaleDateString()}</span>
                <span>{je.description || "—"}</span>
                <span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={() => router.push(`/dashboard/journal/${je.id}`)}>
                    <Eye size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}