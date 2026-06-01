"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ExternalLink } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import RecordHistory from "@/components/RecordHistory"

interface JournalLine {
  id: number
  account_id: number
  debit: number
  credit: number
  source_type?: string
  source_id?: number
  account?: { code: string; name: string }
}

interface Entry {
  id: number
  entry_no: string
  date: string
  description: string
  lines?: JournalLine[]
}

// Map source_type to a route
function getSourceLink(sourceType: string, sourceId: number): string {
  switch (sourceType) {
    case "sale_invoice":
    case "invoice":
      return `/dashboard/invoices/${sourceId}`
    case "purchase_bill":
    case "bill":
      return `/dashboard/bills/${sourceId}`
    case "receipt":
      return `/dashboard/receipts/${sourceId}`
    case "payment":
      return `/dashboard/payments/${sourceId}`
    case "bank_transfer":
      return `/dashboard/banking/bank-transfers`
    case "inventory_adjustment":
      return `/dashboard/inventory/adjustments`
    default:
      return ""
  }
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
    async function loadEntry() {
      if (!entryId) return
      try {
        const { data, error: entryErr } = await supabase
          .from("journal_entries")
          .select("*")
          .eq("id", entryId)
          .single()

        if (entryErr || !data) {
          setError("Journal entry not found")
          setLoading(false)
          return
        }

        setEntry(data)

        const { data: lines, error: linesErr } = await supabase
          .from("journal_lines")
          .select("*, account:accounts(code, name), source_type, source_id")
          .eq("entry_id", data.id)

        if (linesErr) {
          setError("Failed to load lines")
          setLoading(false)
          return
        }

        setEntry(prev => prev ? { ...prev, lines: lines || [] } : null)
        setLoading(false)
      } catch {
        setError("Failed to load entry")
        setLoading(false)
      }
    }

    loadEntry()
  }, [entryId])

  if (loading) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (error) return <div style={{ padding: 24, textAlign: "center" }}><h2>Error</h2><p>{error}</p></div>
  if (!entry) return <div style={{ padding: 24, textAlign: "center" }}>Entry not found</div>

  // Find the first line that has a source
  const sourceLine = entry.lines?.find(l => l.source_type && l.source_id)
  const sourceLink = sourceLine ? getSourceLink(sourceLine.source_type!, sourceLine.source_id!) : ""

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
          .btn-outline {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 6px 12px; border-radius: 6px; border: 1px solid #D1D5DB;
            background: white; color: #1F2937; font-size: 12px; font-weight: 600;
            cursor: pointer; text-decoration: none;
          }
          .btn-outline:hover { background: #F3F4F6; }
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
          {sourceLink && (
            <div style={{ marginTop: 10 }}>
              <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="btn-outline">
                <ExternalLink size={14} /> View Source Document
              </a>
            </div>
          )}
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

        {/* Change History */}
        <div className="jd-card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "#1E293B", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <RecordHistory tableName="journal_entries" recordId={String(entry.id)} />
        </div>
      </div>
    </RoleGuard>
  )
}