"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { X, ExternalLink } from "lucide-react"

interface JournalEntryDrawerProps {
  entryId: number
  onClose: () => void
}

export default function JournalEntryDrawer({ entryId, onClose }: JournalEntryDrawerProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [entry, setEntry] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEntry = async () => {
      setLoading(true)
      // Header
      const { data: header } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("id", entryId)
        .single()

      // Lines with account names and source info
      const { data: lineData } = await supabase
        .from("journal_lines")
        .select("*, accounts(code, name)")
        .eq("entry_id", entryId)
        .order("id")

      setEntry(header)
      setLines(lineData || [])
      setLoading(false)
    }

    fetchEntry()
  }, [entryId])

  // Helper to build source URL
  const getSourceLink = (line: any) => {
    if (!line.source_type || !line.source_id) return null
    const type = line.source_type
    const id = line.source_id
    switch (type) {
      case "sale_invoice":
        return `/dashboard/invoices/${id}`
      case "purchase_bill":
        return `/dashboard/bills/${id}`
      case "receipt":
        return `/dashboard/receipts/${id}`
      case "payment":
        return `/dashboard/payments/${id}`
      case "inventory_adj":
        return `/dashboard/inventory/adjustments`
      default:
        return null
    }
  }

  // Compute totals
  const totalDr = lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCr = lines.reduce((s, l) => s + (l.credit || 0), 0)

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          zIndex: 100,
        }}
      />
      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "480px",
          maxWidth: "95vw",
          height: "100vh",
          background: "white",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.1)",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: 24,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E293B" }}>
            📓 Journal Entry
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading...</div>
        ) : !entry ? (
          <div style={{ textAlign: "center", padding: 40, color: "#B91C1C" }}>Entry not found.</div>
        ) : (
          <>
            {/* Entry header info */}
            <div style={{ background: "#F8FAFC", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{entry.entry_no}</span>
                <span style={{ color: "#64748B", fontSize: 13 }}>{entry.date}</span>
              </div>
              <div style={{ fontSize: 13, color: "#334155", marginBottom: 4 }}>{entry.description || "—"}</div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>Reference: {entry.reference || "—"}</div>
            </div>

            {/* Lines table */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 40px", padding: "8px 10px", background: "#F1F5F9", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#64748B", borderRadius: "8px 8px 0 0" }}>
                <span>Account</span>
                <span style={{ textAlign: "right" }}>Debit</span>
                <span style={{ textAlign: "right" }}>Credit</span>
                <span></span>
              </div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 40px", padding: "6px 10px", borderBottom: "1px solid #F1F5F9", fontSize: 12, alignItems: "center" }}>
                  <span style={{ color: "#334155" }}>{l.accounts?.code} – {l.accounts?.name}</span>
                  <span style={{ textAlign: "right", color: l.debit > 0 ? "#EF4444" : "#94A3B8" }}>{l.debit > 0 ? `PKR ${l.debit.toLocaleString()}` : "-"}</span>
                  <span style={{ textAlign: "right", color: l.credit > 0 ? "#10B981" : "#94A3B8" }}>{l.credit > 0 ? `PKR ${l.credit.toLocaleString()}` : "-"}</span>
                  <span style={{ textAlign: "center" }}>
                    {getSourceLink(l) ? (
                      <a href={getSourceLink(l)!} target="_blank" rel="noopener noreferrer" title="Open source" style={{ color: "#1D4ED8" }}>
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </span>
                </div>
              ))}
              {/* Totals */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 40px", padding: "8px 10px", borderTop: "2px solid #E2E8F0", fontWeight: 600, fontSize: 13 }}>
                <span>Total</span>
                <span style={{ textAlign: "right", color: "#EF4444" }}>PKR {totalDr.toLocaleString()}</span>
                <span style={{ textAlign: "right", color: "#10B981" }}>PKR {totalCr.toLocaleString()}</span>
                <span></span>
              </div>
            </div>

            {/* Source note if all lines have same source */}
            {lines.length > 0 && lines[0].source_type && lines.every(l => l.source_type === lines[0].source_type && l.source_id === lines[0].source_id) && (
              <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "8px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#065F46" }}>📎 Source: <strong>{lines[0].source_type.replace("_", " ")}</strong></span>
                <a href={getSourceLink(lines[0]) || "#"} style={{ color: "#1D4ED8", marginLeft: "auto" }}>Open <ExternalLink size={12} /></a>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}