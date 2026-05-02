"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, ChevronDown, ChevronUp } from "lucide-react"
import PremiumGuard from "@/components/PremiumGuard"

function JournalPageContent() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    supabase.from("journal_entries").select("*").order("date", { ascending: false }).limit(50).then(r => {
      if (r.data) setEntries(r.data)
      setLoading(false)
    })
  }, [])

  const toggleExpand = async (id: number) => {
    if (expanded === id) { setExpanded(null); return }
    const { data: lines } = await supabase.from("journal_lines").select("*, accounts(code,name)").eq("entry_id", id)
    const entry = entries.find(e => e.id === id)
    if (entry) entry.lines = lines || []
    setExpanded(id)
  }

  const filtered = entries.filter(e => e.entry_no?.toLowerCase().includes(search.toLowerCase()) || e.description?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📓 Journal Entries</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Double-entry bookkeeping</p>
        </div>
        <button onClick={() => router.push("/dashboard/journal/new")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "linear-gradient(135deg, #1740C8, #071352)", color: "white" }}>
          <Plus size={16} /> New Entry
        </button>
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
        <input placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", maxWidth: 300, height: 40, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px 0 36px", fontSize: 13, outline: "none" }} />
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
        filtered.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", background: "white", borderRadius: 10 }}>No journal entries found</div> :
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          {filtered.map((e, i) => (
            <div key={e.id}>
              <div onClick={() => toggleExpand(e.id)}
                style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 60px", padding: "12px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, alignItems: "center", cursor: "pointer", background: expanded === e.id ? "#FAFBFF" : "white" }}>
                <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{e.entry_no}</span>
                <span>{e.description || "-"}</span>
                <span style={{ color: "#64748B" }}>{e.date}</span>
                <span style={{ textAlign: "right" }}>{expanded === e.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
              </div>
              {expanded === e.id && e.lines && (
                <div style={{ padding: "10px 16px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 8, fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 6 }}>
                    <span>Account</span><span style={{ textAlign: "right" }}>Debit</span><span style={{ textAlign: "right" }}>Credit</span>
                  </div>
                  {e.lines.map((l: any, j: number) => (
                    <div key={j} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 8, fontSize: 12, padding: "3px 0" }}>
                      <span>{l.accounts?.code} - {l.accounts?.name}</span>
                      <span style={{ textAlign: "right", color: "#EF4444" }}>{l.debit > 0 ? `PKR ${l.debit.toLocaleString()}` : "-"}</span>
                      <span style={{ textAlign: "right", color: "#10B981" }}>{l.credit > 0 ? `PKR ${l.credit.toLocaleString()}` : "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      }
    </div>
  )
}

export default function JournalPage() {
  return (
    <PremiumGuard
      featureCode="journal_entries"
      featureName="Journal Entries"
      featureDesc="Record manual double‑entry journal entries for adjustments and corrections."
    >
      <JournalPageContent />
    </PremiumGuard>
  )
}