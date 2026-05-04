"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"

interface JournalLine {
  id: number
  account_id: number
  debit: number
  credit: number
  account?: { code: string; name: string }
}

interface Entry {
  id: number
  entry_no: string
  date: string
  description: string
  lines?: JournalLine[]
}

export default function JournalDetailPage() {
  const router = useRouter()
  const params = useParams()
  const entryId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entryId) return
    supabase
      .from("journal_entries")
      .select("*")
      .eq("id", entryId)
      .single()
      .then(
        ({ data }) => {
          if (data) {
            setEntry(data)
            supabase
              .from("journal_lines")
              .select("*, account:accounts(code, name)")
              .eq("entry_id", data.id)
              .then(({ data: lines }) => {
                setEntry(prev => prev ? { ...prev, lines: lines || [] } : null)
                setLoading(false)
              })
          } else {
            setError("Journal entry not found")
            setLoading(false)
          }
        },
        () => {
          setError("Failed to load entry")
          setLoading(false)
        }
      )
  }, [entryId])

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (error) return <div style={{ padding: 24, textAlign: "center" }}><h2>Error</h2><p>{error}</p></div>
  if (!entry) return <div style={{ padding: 24, textAlign: "center" }}>Entry not found</div>

  const totalDebit = entry.lines?.reduce((s, l) => s + l.debit, 0) || 0
  const totalCredit = entry.lines?.reduce((s, l) => s + l.credit, 0) || 0

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .jd-card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 20px; margin-bottom: 16px; }
          .jd-row { display: flex; margin-bottom: 8px; font-size: 13px; }
          .jd-label { width: 120px; color: #64748B; font-weight: 600; }
          .jd-value { color: #1E293B; }
          .jd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .jd-table th { text-align: left; padding: 8px 12px; border-bottom: 1px solid #E2E8F0; background: #F8FAFC; font-weight: 600; color: #475569; }
          .jd-table td { padding: 8px 12px; border-bottom: 1px solid #F1F5F9; }
          .jd-total { font-weight: 700; }
        `}</style>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="inv-btn inv-btn-outline" onClick={() => router.push("/dashboard/journal")}>
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>Journal Entry Detail</h1>
        </div>

        <div className="jd-card">
          <div className="jd-row"><span className="jd-label">Entry No</span><span className="jd-value">{entry.entry_no}</span></div>
          <div className="jd-row"><span className="jd-label">Date</span><span className="jd-value">{new Date(entry.date).toLocaleDateString()}</span></div>
          <div className="jd-row"><span className="jd-label">Description</span><span className="jd-value">{entry.description || "—"}</span></div>
        </div>

        <div className="jd-card">
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16, fontWeight: 700 }}>Lines</h3>
          {entry.lines && entry.lines.length > 0 ? (
            <table className="jd-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.account?.code} – {line.account?.name}</td>
                    <td style={{ textAlign: "right" }}>{line.debit > 0 ? line.debit.toLocaleString() : ""}</td>
                    <td style={{ textAlign: "right" }}>{line.credit > 0 ? line.credit.toLocaleString() : ""}</td>
                  </tr>
                ))}
                <tr className="jd-total">
                  <td>Total</td>
                  <td style={{ textAlign: "right" }}>{totalDebit.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{totalCredit.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#94A3B8" }}>No lines found for this entry.</p>
          )}
        </div>
      </div>
    </RoleGuard>
  )
}