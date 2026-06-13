"use client"

import { useState, useEffect } from "react"
import React from "react"
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

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 70, 60, 50, 60, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
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

  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

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
              let source = getSourceFromReference(je.reference)
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

  const filtered = search.trim()
    ? entries.filter(
        (e) =>
          e.entry_no.toLowerCase().includes(search.toLowerCase()) ||
          e.description?.toLowerCase().includes(search.toLowerCase()) ||
          e.source?.toLowerCase().includes(search.toLowerCase())
      )
    : entries

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

  const totalEntries = entries.length
  const totalDebits = entries.reduce((s, e) => s + (e.total_debit || 0), 0)
  const totalCredits = entries.reduce((s, e) => s + (e.total_credit || 0), 0)

  // Shared th/td styles
  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

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
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .journal-table { width: 100%; border-collapse: collapse; }
        .journal-table tbody tr:last-child td { border-bottom: none; }
        .journal-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .journal-table { min-width: 800px; }

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .lines-container {
          background: var(--bg-soft);
          margin: 0 16px 8px;
          border-radius: 8px;
          overflow: hidden;
        }
        .lines-header {
          display: grid; grid-template-columns: 1fr 100px 100px;
          padding: 8px 16px; font-size: 9px; font-weight: 700;
          text-transform: uppercase; color: var(--text-muted); background: var(--card-hover);
        }
        .line-item {
          display: grid; grid-template-columns: 1fr 100px 100px;
          padding: 6px 16px; font-size: 12px; border-bottom: 1px solid var(--border);
        }
        .line-item:last-child { border-bottom: none; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📓 Journal Entries</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Manage double‑entry transactions" : "View journal entries"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/journal/new")}>
            <Plus size={16} /> New Entry
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Entries</div><div className="summary-value">{totalEntries}</div></div>
        <div className="summary-item"><div className="summary-label">Total Debits</div><div className="summary-value" style={{ color: "#EF4444" }}>PKR {totalDebits.toLocaleString()}</div></div>
        <div className="summary-item"><div className="summary-label">Total Credits</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {totalCredits.toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by entry number, description, or source..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="journal-table">
            <colgroup>
              <col style={{ width: 30 }} />   {/* Chevron */}
              <col style={{ width: 100 }} />  {/* Date */}
              <col style={{ width: 120 }} />  {/* Entry # */}
              <col />                         {/* Description */}
              <col style={{ width: 130 }} />  {/* Source */}
              <col style={{ width: 110 }} />  {/* Debit */}
              <col style={{ width: 110 }} />  {/* Credit */}
              <col style={{ width: 50 }} />   {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}></th>
                <SortTh field="date">Date</SortTh>
                <SortTh field="entry_no">Entry #</SortTh>
                <SortTh field="description" style={{ textAlign: "left" }}>Description</SortTh>
                <SortTh field="source" style={{ textAlign: "left" }}>Source</SortTh>
                <SortTh field="total_debit" style={{ textAlign: "right" }}>Debit</SortTh>
                <SortTh field="total_credit" style={{ textAlign: "right" }}>Credit</SortTh>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No journal entries found. {canEdit && 'Click "New Entry" to create one.'}
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((je) => {
                  const isExpanded = expandedId === je.id
                  return (
                    <React.Fragment key={je.id}>
                      <tr onClick={() => toggleExpand(je.id)} style={{ cursor: "pointer" }}>
                        <td style={tdStyle}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{je.date}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "var(--primary)" }}>{je.entry_no}</td>
                        <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{je.description || "—"}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{je.source || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#EF4444", fontWeight: 600 }}>
                          {(je.total_debit ?? 0) > 0 ? `PKR ${(je.total_debit ?? 0).toLocaleString()}` : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#10B981", fontWeight: 600 }}>
                          {(je.total_credit ?? 0) > 0 ? `PKR ${(je.total_credit ?? 0).toLocaleString()}` : "—"}
                        </td>
                        <td style={tdStyle}>
                          <button
                            className="btn-icon"
                            onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/journal/${je.id}`) }}
                            title="View details"
                          >
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>
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
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}