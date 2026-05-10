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
  lines?: any[]      // fetched on demand
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

  // Fetch journal entries with aggregated Dr/Cr
  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("journal_entries")
      .select("id, entry_no, date, description")
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) {
          // For each entry fetch total debit/credit from lines (one‑time) to show summary
          Promise.all(data.map(async (je) => {
            const { data: lines } = await supabase
              .from("journal_lines")
              .select("debit, credit")
              .eq("entry_id", je.id)
            const total_debit = lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0
            const total_credit = lines?.reduce((s, l) => s + (l.credit || 0), 0) || 0
            return { ...je, total_debit, total_credit }
          })).then(enriched => {
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
    ? entries.filter(e =>
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
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{`
          .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .input { height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #1D4ED8; color: white; }
          .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
          .row { display: grid; grid-template-columns: 40px 120px 100px 1fr 90px 90px 60px; padding: 12px 16px; border-bottom: 1px solid #F1F5F9; font-size: 13px; align-items: center; }
          .row:hover { background: #FAFBFF; }
          .row-header { display: grid; grid-template-columns: 40px 120px 100px 1fr 90px 90px 60px; padding: 10px 16px; background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .line-row { display: grid; grid-template-columns: 1fr 80px 80px; padding: 6px 16px; font-size: 12px; background: #F9FAFB; border-bottom: 1px solid #F1F5F9; }
          @media (max-width: 700px) {
            .row, .row-header { grid-template-columns: 30px 100px 1fr 70px 70px 40px; }
            .hide-mobile { display: none; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📓 Journal Entries</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>{canEdit ? "Manage double‑entry transactions" : "View journal entries"}</p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => router.push("/dashboard/journal/new")}>
              <Plus size={16} /> New Entry
            </button>
          )}
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Entries</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{entries.length}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Debits</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#EF4444" }}>
              PKR {entries.reduce((s, e) => s + (e.total_debit || 0), 0).toLocaleString()}
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Credits</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#10B981" }}>
              PKR {entries.reduce((s, e) => s + (e.total_credit || 0), 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ maxWidth: 320, marginBottom: 16 }}>
          <input className="input" style={{ width: "100%" }} placeholder="Search by entry number or description..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No journal entries found. {canEdit && 'Click "New Entry" to create one.'}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <div className="row-header">
              <span></span>
              <span>Entry No</span>
              <span className="hide-mobile">Date</span>
              <span>Description</span>
              <span style={{ textAlign: "right", color: "#EF4444" }}>Debit</span>
              <span style={{ textAlign: "right", color: "#10B981" }}>Credit</span>
              <span></span>
            </div>
            {filtered.map((je) => (
              <div key={je.id}>
                <div className="row" onClick={() => toggleExpand(je.id)} style={{ cursor: "pointer" }}>
                  <span style={{ color: "#64748B" }}>
                    {expandedId === je.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{je.entry_no}</span>
                  <span className="hide-mobile" style={{ color: "#64748B" }}>{new Date(je.date).toLocaleDateString()}</span>
                  <span>{je.description || "—"}</span>
                  <span style={{ textAlign: "right", fontWeight: 600, color: "#EF4444" }}>
                    {(je.total_debit ?? 0) > 0 ? `PKR ${(je.total_debit ?? 0).toLocaleString()}` : "—"}
                  </span>
                  <span style={{ textAlign: "right", fontWeight: 600, color: "#10B981" }}>
                    {(je.total_credit ?? 0) > 0 ? `PKR ${(je.total_credit ?? 0).toLocaleString()}` : "—"}
                  </span>
                  <span>
                    <button className="btn btn-outline" style={{ padding: 4 }} onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/journal/${je.id}`) }}>
                      <Eye size={14} />
                    </button>
                  </span>
                </div>
                {/* Expanded lines */}
                {expandedId === je.id && (
                  <div>
                    <div className="line-row" style={{ fontWeight: 600, color: "#475569", fontSize: 10 }}>
                      <span>Account</span><span style={{ textAlign: "right" }}>Debit</span><span style={{ textAlign: "right" }}>Credit</span>
                    </div>
                    {loadingLines ? (
                      <div className="line-row"><span>Loading...</span></div>
                    ) : expandedLines.length === 0 ? (
                      <div className="line-row"><span>No lines found.</span></div>
                    ) : (
                      expandedLines.map((l, idx) => (
                        <div key={idx} className="line-row">
                          <span>{l.accounts?.code} – {l.accounts?.name}</span>
                          <span style={{ textAlign: "right", color: "#EF4444" }}>{l.debit > 0 ? `PKR ${l.debit.toLocaleString()}` : "—"}</span>
                          <span style={{ textAlign: "right", color: "#10B981" }}>{l.credit > 0 ? `PKR ${l.credit.toLocaleString()}` : "—"}</span>
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