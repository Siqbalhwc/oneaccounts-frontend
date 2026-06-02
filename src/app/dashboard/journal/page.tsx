"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, ChevronDown, ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

interface JournalEntry {
  id: number
  entry_no: string
  date: string
  description: string
  lines?: any[]
  total_debit?: number
  total_credit?: number
  source?: string
}

type SortField = "entry_no" | "date" | "description" | "source" | "total_debit" | "total_credit"
type SortDir = "asc" | "desc"

// Map a reference prefix to a friendly source name
function getSourceFromReference(ref?: string | null): string {
  if (!ref) return "Manual"
  const parts = ref.split("-")
  const prefix = parts[0]?.toUpperCase() || ""
  switch (prefix) {
    case "INV": return "Sales Invoice"
    case "BILL": return "Purchase Bill"
    case "REC": return "Receipt"
    case "PAY": return "Payment"
    case "INV-ADJ": return "Inventory Adjustment"
    default: return ref
  }
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
  const [companyId, setCompanyId] = useState("")

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // Grab companyId from JWT
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Fetch journal entries (exclude soft-deleted) and their lines – scoped to company
  useEffect(() => {
    if (!role) return
    if (!canView || !companyId) {
      setLoading(false)
      return
    }
    supabase
      .from("journal_entries")
      .select("id, entry_no, date, description, reference")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .then(async ({ data }) => {
        if (data) {
          const enriched = await Promise.all(
            data.map(async (je) => {
              const { data: lines } = await supabase
                .from("journal_lines")
                .select("debit, credit, source_type, source_id")
                .eq("entry_id", je.id)
              const total_debit = lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0
              const total_credit = lines?.reduce((s, l) => s + (l.credit || 0), 0) || 0
              // Determine source from reference or lines
              let source = getSourceFromReference(je.reference)
              // Fallback: if reference doesn't give a clear source, use the first line's source_type
              if (source === je.reference || !je.reference) {
                const firstLine = lines?.find(l => l.source_type)
                if (firstLine) {
                  switch (firstLine.source_type) {
                    case "sale_invoice": source = "Sales Invoice"; break
                    case "purchase_bill": source = "Purchase Bill"; break
                    case "receipt": source = "Receipt"; break
                    case "payment": source = "Payment"; break
                    case "inventory_adjustment": source = "Inventory Adjustment"; break
                    default: source = firstLine.source_type
                  }
                } else {
                  source = "Manual"
                }
              }
              return { ...je, total_debit, total_credit, source }
            })
          )
          setEntries(enriched)
          setLoading(false)
        } else {
          setEntries([])
          setLoading(false)
        }
      })
  }, [role, canView, companyId])

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
          e.description?.toLowerCase().includes(search.toLowerCase()) ||
          e.source?.toLowerCase().includes(search.toLowerCase())
      )
    : entries

  // Client-side sort
  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "total_debit" || sortField === "total_credit") {
      valA = a[sortField] ?? 0
      valB = b[sortField] ?? 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // Summary
  const totalDebits = entries.reduce((s, e) => s + (e.total_debit || 0), 0)
  const totalCredits = entries.reduce((s, e) => s + (e.total_credit || 0), 0)

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .input { height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; box-sizing: border-box; background: var(--card); color: var(--text); }
        .input:focus { border-color: var(--primary); }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          padding: 6px; border-radius: 8px; cursor: pointer;
        }
        .btn-icon:hover { background: var(--card-hover); }

        .journal-header,
        .journal-row {
          display: grid;
          grid-template-columns: 32px 105px 165px 1fr 130px 125px 125px 40px;
          column-gap: 12px;
          padding: 12px 24px;
          align-items: center;
        }
        .journal-header {
          background: var(--card);
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          padding-top: 14px; padding-bottom: 14px;
        }
        .journal-row {
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          transition: background 0.15s;
          cursor: pointer;
        }
        .journal-row:hover { background: var(--card-hover); }
        .journal-row:last-child { border-bottom: none; }

        .sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .sort-btn:hover { color: var(--primary); }

        .entry-no-cell {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
          color: var(--primary);
        }

        .desc-cell {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          display: block; cursor: default;
        }

        .lines-container {
          background: var(--card); border-left: 3px solid var(--primary);
          margin: 0 16px 8px; border-radius: 0 8px 8px 0; overflow: hidden;
        }
        .lines-header {
          display: grid; grid-template-columns: 1fr 80px 80px;
          padding: 8px 16px; font-size: 9px; font-weight: 700;
          text-transform: uppercase; color: var(--text-muted); background: var(--card-hover);
        }
        .line-item {
          display: grid; grid-template-columns: 1fr 80px 80px;
          padding: 6px 16px; font-size: 12px; border-bottom: 1px solid var(--border);
        }
        .line-item:last-child { border-bottom: none; }

        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }

        @media (max-width: 900px) {
          .journal-header,
          .journal-row {
            grid-template-columns: 28px 95px 150px 1fr 110px 105px 105px 36px;
            column-gap: 8px;
            padding-left: 16px; padding-right: 16px;
          }
        }

        @media (max-width: 700px) {
          .journal-header,
          .journal-row {
            grid-template-columns: 28px 90px 140px 1fr 100px 100px 32px;
            column-gap: 6px;
            padding-left: 12px; padding-right: 12px;
          }
          .hide-sm { display: none; }
        }

        @media (max-width: 480px) {
          .journal-header,
          .journal-row {
            grid-template-columns: 24px 80px 110px 1fr 80px 28px;
            column-gap: 4px;
            padding-left: 10px; padding-right: 10px;
            font-size: 11px;
          }
          .hide-mobile { display: none; }
          .summary-value { font-size: 17px; }
        }
      `}</style>

      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📓 Journal Entries</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Manage double‑entry transactions" : "View journal entries"}</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/journal/new")}>
            <Plus size={16} /> New Entry
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Entries</div>
          <div className="summary-value">{entries.length}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Debits</div>
          <div className="summary-value" style={{ color: "#EF4444" }}>PKR {totalDebits.toLocaleString()}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Credits</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalCredits.toLocaleString()}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          style={{ width: "100%" }}
          placeholder="Search by entry number, description, or source..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Main list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : sortedFiltered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No journal entries found. {canEdit && 'Click "New Entry" to create one.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          {/* Header */}
          <div className="journal-header">
            <span></span>
            <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
            <button className="sort-btn" onClick={() => handleSort("entry_no")}>Entry # {getSortIcon("entry_no")}</button>
            <button className="sort-btn" onClick={() => handleSort("description")}>Description {getSortIcon("description")}</button>
            <button className="sort-btn hide-sm" onClick={() => handleSort("source")}>Source {getSortIcon("source")}</button>
            <button className="sort-btn hide-mobile" onClick={() => handleSort("total_debit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Debit {getSortIcon("total_debit")}</button>
            <button className="sort-btn hide-mobile" onClick={() => handleSort("total_credit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Credit {getSortIcon("total_credit")}</button>
            <span></span>
          </div>

          {sortedFiltered.map((je) => (
            <div key={je.id}>
              <div className="journal-row" onClick={() => toggleExpand(je.id)}>
                {/* Chevron */}
                <span style={{ color: "var(--text-muted)" }}>
                  {expandedId === je.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>

                {/* Date */}
                <span style={{ fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap" }}>{je.date}</span>

                {/* Entry # — nowrap + ellipsis so it never bleeds into description */}
                <span className="entry-no-cell" title={je.entry_no}>{je.entry_no}</span>

                {/* Description */}
                <span className="desc-cell" title={je.description || ""}>{je.description || "—"}</span>

                {/* Source — hidden on small screens */}
                <span className="hide-sm" style={{ color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{je.source || "—"}</span>

                {/* Debit — hidden on mobile */}
                <span className="hide-mobile" style={{ textAlign: "right", fontWeight: 600, color: "#EF4444" }}>
                  {(je.total_debit ?? 0) > 0 ? `PKR ${(je.total_debit ?? 0).toLocaleString()}` : "—"}
                </span>

                {/* Credit — hidden on mobile */}
                <span className="hide-mobile" style={{ textAlign: "right", fontWeight: 600, color: "#10B981" }}>
                  {(je.total_credit ?? 0) > 0 ? `PKR ${(je.total_credit ?? 0).toLocaleString()}` : "—"}
                </span>

                {/* Eye / view button */}
                <button
                  className="btn-icon"
                  style={{ justifySelf: "center" }}
                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/journal/${je.id}`) }}
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
                    <div className="line-item"><span style={{ color: "var(--text-muted)" }}>Loading…</span></div>
                  ) : expandedLines.length === 0 ? (
                    <div className="line-item"><span style={{ color: "var(--text-muted)" }}>No lines found.</span></div>
                  ) : (
                    expandedLines.map((l, idx) => (
                      <div key={idx} className="line-item">
                        <span style={{ color: "var(--text)" }}>{l.accounts?.code} – {l.accounts?.name}</span>
                        <span style={{ textAlign: "right", color: l.debit > 0 ? "#EF4444" : "var(--text-muted)", fontWeight: l.debit > 0 ? 600 : 400 }}>
                          {l.debit > 0 ? `PKR ${l.debit.toLocaleString()}` : "—"}
                        </span>
                        <span style={{ textAlign: "right", color: l.credit > 0 ? "#10B981" : "var(--text-muted)", fontWeight: l.credit > 0 ? 600 : 400 }}>
                          {l.credit > 0 ? `PKR ${l.credit.toLocaleString()}` : "—"}
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
  )
}