"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, ChevronDown, ChevronRight } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface JournalEntry {
  id: number
  entry_no: string
  date: string
  description: string
  lines?: any[]
  total_debit?: number
  total_credit?: number
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
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [expandedLines, setExpandedLines] = useState<any[]>([])
  const [loadingLines, setLoadingLines] = useState(false)

  // Fetch journal entries – now excludes soft‑deleted rows
  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("journal_entries")
      .select("id, entry_no, date, description")
      .is("deleted_at", null)                   // ← filter soft‑deletes
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) {
          Promise.all(
            data.map(async (je) => {
              const { data: lines } = await supabase
                .from("journal_lines")
                .select("debit, credit")
                .eq("entry_id", je.id)
              const total_debit = lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0
              const total_credit = lines?.reduce((s, l) => s + (l.credit || 0), 0) || 0
              return { ...je, total_debit, total_credit }
            })
          ).then((enriched) => {
            setEntries(enriched)
            setLoading(false)
          })
        } else {
          setEntries([])
          setLoading(false)
        }
      })
  }, [role, canView])

  // Toggle expand – fetch lines when opening
  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedLines([])
      return
    }
    setExpandedId(id)
    setLoadingLines(true)
    const { data } = await supabase
      .from("journal_lines")
      .select("debit, credit, accounts(code, name)")
      .eq("entry_id", id)
      .order("id")
    setExpandedLines(data || [])
    setLoadingLines(false)
  }

  // Filter by search
  const filtered = search.trim()
    ? entries.filter(
        (e) =>
          e.entry_no.toLowerCase().includes(search.toLowerCase()) ||
          e.description?.toLowerCase().includes(search.toLowerCase())
      )
    : entries

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
      <div
        style={{
          padding: 24,
          background: "#0B1120",
          minHeight: "100vh",
          fontFamily: "'Inter', sans-serif",
          color: "#E2E8F0",
        }}
      >
        <style>{`
          .card { background: #111827; border-radius: 12px; border: 1px solid #1E293B; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
          .input { height: 38px; border: 1px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; background: #1E293B; color: #F1F5F9; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #2563EB; color: white; }
          .btn-outline { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }

          .journal-row {
            display: grid;
            grid-template-columns: 32px 1fr 1.5fr 100px 100px 40px;
            padding: 12px 16px;
            border-bottom: 1px solid #1E293B;
            font-size: 13px;
            align-items: center;
            transition: background 0.15s;
            cursor: pointer;
          }
          .journal-row:hover { background: #1E293B; }

          .journal-header {
            display: grid;
            grid-template-columns: 32px 1fr 1.5fr 100px 100px 40px;
            padding: 10px 16px;
            background: #111827;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: #94A3B8;
            border-bottom: 1px solid #1E293B;
          }

          .desc-cell {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 260px;
            display: block;
            cursor: default;
          }

          .lines-container {
            background: #0B1120;
            border-left: 3px solid #2563EB;
            margin: 0 16px 8px;
            border-radius: 0 8px 8px 0;
            overflow: hidden;
          }
          .lines-header {
            display: grid;
            grid-template-columns: 1fr 80px 80px;
            padding: 8px 16px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748B;
            background: #1E293B;
          }
          .line-item {
            display: grid;
            grid-template-columns: 1fr 80px 80px;
            padding: 6px 16px;
            font-size: 12px;
            border-bottom: 1px solid #1E293B;
          }
          .line-item:last-child { border-bottom: none; }

          @media (max-width: 768px) {
            .journal-row, .journal-header {
              grid-template-columns: 30px 1fr 1fr 70px 70px 40px;
              font-size: 12px;
            }
            .desc-cell { max-width: 140px; }
          }
          @media (max-width: 480px) {
            .journal-row, .journal-header {
              grid-template-columns: 24px 1fr 70px 70px 32px;
            }
            .desc-cell { max-width: 100px; }
            .hide-mobile { display: none; }
          }
        `}</style>

        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>
              📓 Journal Entries
            </h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>
              {canEdit ? "Manage double‑entry transactions" : "View journal entries"}
            </p>
          </div>
          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => router.push("/dashboard/journal/new")}
            >
              <Plus size={16} /> New Entry
            </button>
          )}
        </div>

        {/* Summary Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div className="card">
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#94A3B8",
                marginBottom: 4,
              }}
            >
              Total Entries
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#F1F5F9" }}>{entries.length}</div>
          </div>
          <div className="card">
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#94A3B8",
                marginBottom: 4,
              }}
            >
              Total Debits
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#EF4444" }}>
              PKR{" "}
              {entries
                .reduce((s, e) => s + (e.total_debit || 0), 0)
                .toLocaleString()}
            </div>
          </div>
          <div className="card">
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#94A3B8",
                marginBottom: 4,
              }}
            >
              Total Credits
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#10B981" }}>
              PKR{" "}
              {entries
                .reduce((s, e) => s + (e.total_credit || 0), 0)
                .toLocaleString()}
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ maxWidth: 320, marginBottom: 16 }}>
          <input
            className="input"
            style={{ width: "100%" }}
            placeholder="Search by entry number or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Main list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="card"
            style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}
          >
            No journal entries found. {canEdit && 'Click "New Entry" to create one.'}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            {/* Header */}
            <div className="journal-header">
              <span></span>
              <span>Entry No</span>
              <span>Description</span>
              <span style={{ textAlign: "right", color: "#EF4444" }}>Debit</span>
              <span style={{ textAlign: "right", color: "#10B981" }}>Credit</span>
              <span></span>
            </div>

            {filtered.map((je) => (
              <div key={je.id}>
                <div
                  className="journal-row"
                  onClick={() => toggleExpand(je.id)}
                  style={{ cursor: "pointer" }}
                >
                  <span style={{ color: "#64748B" }}>
                    {expandedId === je.id ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </span>
                  <span style={{ fontWeight: 600, color: "#93C5FD" }}>
                    {je.entry_no}
                  </span>
                  <span
                    className="desc-cell"
                    title={je.description || ""}
                    style={{ color: "#E2E8F0" }}
                  >
                    {je.description || "—"}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color: "#EF4444",
                    }}
                  >
                    {(je.total_debit ?? 0) > 0
                      ? `PKR ${(je.total_debit ?? 0).toLocaleString()}`
                      : "—"}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color: "#10B981",
                    }}
                  >
                    {(je.total_credit ?? 0) > 0
                      ? `PKR ${(je.total_credit ?? 0).toLocaleString()}`
                      : "—"}
                  </span>
                  <button
                    className="btn btn-outline"
                    style={{ padding: 4, justifySelf: "center" }}
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/dashboard/journal/${je.id}`)
                    }}
                    title="View details"
                  >
                    <Eye size={14} />
                  </button>
                </div>

                {/* Expanded lines */}
                {expandedId === je.id && (
                  <div className="lines-container">
                    <div className="lines-header">
                      <span>Account</span>
                      <span style={{ textAlign: "right" }}>Debit</span>
                      <span style={{ textAlign: "right" }}>Credit</span>
                    </div>
                    {loadingLines ? (
                      <div className="line-item">
                        <span style={{ color: "#94A3B8" }}>Loading…</span>
                      </div>
                    ) : expandedLines.length === 0 ? (
                      <div className="line-item">
                        <span style={{ color: "#94A3B8" }}>No lines found.</span>
                      </div>
                    ) : (
                      expandedLines.map((l, idx) => (
                        <div key={idx} className="line-item">
                          <span style={{ color: "#E2E8F0" }}>
                            {l.accounts?.code} – {l.accounts?.name}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              color: l.debit > 0 ? "#EF4444" : "#94A3B8",
                              fontWeight: l.debit > 0 ? 600 : 400,
                            }}
                          >
                            {l.debit > 0
                              ? `PKR ${l.debit.toLocaleString()}`
                              : "—"}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              color: l.credit > 0 ? "#10B981" : "#94A3B8",
                              fontWeight: l.credit > 0 ? 600 : 400,
                            }}
                          >
                            {l.credit > 0
                              ? `PKR ${l.credit.toLocaleString()}`
                              : "—"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}