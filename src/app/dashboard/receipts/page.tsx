"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus } from "lucide-react"

interface ReceiptItem {
  id: number
  entry_no: string
  date: string
  description: string
  amount: number
}

export default function ReceiptsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [entries, setEntries] = useState<ReceiptItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("journal_entries")
      .select("id, entry_no, date, description")
      .like("entry_no", "RCP-%")
      .order("date", { ascending: false })
      .limit(50)
      .then(async r => {
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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>💰 Receipts</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Customer payment history</p>
        </div>
        <button onClick={() => router.push("/dashboard/receipts/new")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: "linear-gradient(135deg, #1740C8, #071352)", color: "white" }}>
          <Plus size={16} /> New Receipt
        </button>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
        entries.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", background: "white", borderRadius: 10 }}>No receipts recorded yet</div> :
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 100px 1fr 100px", padding: "10px 16px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
            <span>Receipt No</span><span>Date</span><span>Description</span><span>Amount</span>
          </div>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "110px 100px 1fr 100px", padding: "12px 16px", borderBottom: i < entries.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{e.entry_no}</span>
              <span style={{ color: "#64748B" }}>{e.date}</span>
              <span style={{ color: "#64748B" }}>{e.description}</span>
              <span style={{ fontWeight: 700, color: "#10B981" }}>PKR {(e.amount || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      }
    </div>
  )
}