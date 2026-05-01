"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus } from "lucide-react"

export default function PaymentsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("journal_entries").select("id,entry_no,date,description").like("entry_no", "PAY-%").order("date", { ascending: false }).limit(30).then(async r => {
      if (r.data) {
        const enriched = await Promise.all(r.data.map(async (je: any) => {
          const { data: lines } = await supabase.from("journal_lines").select("debit").eq("entry_id", je.id)
          const amount = lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) || 0
          return { ...je, amount }
        }))
        setEntries(enriched)
      }
      setLoading(false)
    })
  }, [])

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>💳 Payments</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Supplier payment history</p>
        </div>
        <button onClick={() => router.push("/dashboard/payments/new")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "linear-gradient(135deg, #1740C8, #071352)", color: "white" }}>
          <Plus size={16} /> New Payment
        </button>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
        entries.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", background: "white", borderRadius: 10 }}>No payments recorded yet</div> :
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < entries.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 13 }}>
              <div>
                <strong style={{ color: "#1E3A8A" }}>{e.entry_no}</strong>
                <span style={{ color: "#64748B", marginLeft: 12 }}>{e.date}</span>
                <span style={{ color: "#94A3B8", marginLeft: 12 }}>{e.description}</span>
              </div>
              <span style={{ fontWeight: 700, color: "#EF4444" }}>PKR {(e.amount || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      }
    </div>
  )
}