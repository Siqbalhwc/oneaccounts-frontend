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

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading…</div>
  if (error) return <div style={{ padding: 24, textAlign: "center", color: "#FCA5A5", background: "var(--bg)", minHeight: "100vh" }}>{error}</div>
  if (!entry) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Entry not found</div>

  // Find the first line that has a source
  const sourceLine = entry.lines?.find(l => l.source_type && l.source_id)
  const sourceLink = sourceLine ? getSourceLink(sourceLine.source_type!, sourceLine.source_id!) : ""

  const totalDebit = entry.lines?.reduce((s, l) => s + l.debit, 0) || 0
  const totalCredit = entry.lines?.reduce((s, l) => s + l.credit, 0) || 0

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
          .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
          .label { width: 120px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
          .value { color: var(--text); font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
          td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
          tr:hover td { background: var(--card-hover); }
          .btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
            cursor: pointer; border: 1.5px solid var(--border); background: transparent;
            color: var(--text-muted); font-family: inherit; transition: all 0.15s;
            text-decoration: none;
          }
          .btn:hover { background: var(--card-hover); }
          .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
          .btn-primary:hover { background: var(--primary-hover); }
          .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        `}</style>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => router.push("/dashboard/journal")}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Journal Entry Detail</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{entry.entry_no}</p>
          </div>
          {sourceLink && (
            <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="btn">
              <ExternalLink size={14} /> View Source Document
            </a>
          )}
        </div>

        <div className="card">
          <div className="row"><span className="label">Entry No</span><span className="value">{entry.entry_no}</span></div>
          <div className="row"><span className="label">Date</span><span className="value">{new Date(entry.date).toLocaleDateString()}</span></div>
          <div className="row"><span className="label">Description</span><span className="value">{entry.description || "—"}</span></div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Lines</h3>
          {entry.lines && entry.lines.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th style={{ textAlign: "right" }}>Debit (PKR)</th>
                  <th style={{ textAlign: "right" }}>Credit (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.account?.code} – {line.account?.name}</td>
                    <td style={{ textAlign: "right", color: line.debit > 0 ? "#F87171" : "var(--text-muted)" }}>
                      {line.debit > 0 ? line.debit.toLocaleString() : "–"}
                    </td>
                    <td style={{ textAlign: "right", color: line.credit > 0 ? "#2DD4BF" : "var(--text-muted)" }}>
                      {line.credit > 0 ? line.credit.toLocaleString() : "–"}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "var(--card-hover)" }}>
                  <td>Total</td>
                  <td style={{ textAlign: "right", color: "#F87171" }}>{totalDebit.toLocaleString()}</td>
                  <td style={{ textAlign: "right", color: "#2DD4BF" }}>{totalCredit.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>No lines found for this entry.</p>
          )}
        </div>

        {/* Change History */}
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <div className="record-history">
            <RecordHistory tableName="journal_entries" recordId={String(entry.id)} />
          </div>
        </div>
      </div>
    </RoleGuard>
  )
}