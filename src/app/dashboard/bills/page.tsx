"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Send } from "lucide-react"

export default function BillsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [bills, setBills] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("invoices").select("*, suppliers(name,phone)").eq("type", "purchase").order("date", { ascending: false }).then(r => {
      if (r.data) setBills(r.data)
      setLoading(false)
    })
  }, [])

  const filtered = bills.filter(b => b.invoice_no?.toLowerCase().includes(search.toLowerCase()) || (b.suppliers?.name || "").toLowerCase().includes(search.toLowerCase()))

  const statusStyle = (s: string) => {
    if (s === "Paid") return { bg: "#D1FAE5", color: "#065F46" }
    if (s === "Partial") return { bg: "#FEF3C7", color: "#92400E" }
    return { bg: "#FEE2E2", color: "#991B1B" }
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📦 Purchase Bills</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>View and manage all purchase bills</p>
        </div>
        <button onClick={() => router.push("/dashboard/bills/new")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "linear-gradient(135deg, #1740C8, #071352)", color: "white" }}>
          <Plus size={16} /> New Bill
        </button>
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
        <input placeholder="Search bills..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", maxWidth: 300, height: 40, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px 0 36px", fontSize: 13, outline: "none" }} />
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
        filtered.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", background: "white", borderRadius: 10 }}>No bills found</div> :
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 100px 90px 90px 90px", padding: "10px 16px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
            <span>Bill No</span><span>Supplier</span><span>Date</span><span>Due Date</span><span>Total</span><span>Status</span>
          </div>
          {filtered.map((b, i) => {
            const st = statusStyle(b.status)
            return (
              <div key={b.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr 100px 90px 90px 90px", padding: "10px 16px", borderBottom: i < filtered.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 13, alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{b.invoice_no}</span>
                <span>{b.suppliers?.name || "-"}</span>
                <span style={{ color: "#64748B" }}>{b.date}</span>
                <span style={{ color: "#64748B" }}>{b.due_date}</span>
                <span style={{ fontWeight: 600 }}>PKR {(b.total || 0).toLocaleString()}</span>
                <span><span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{b.status}</span></span>
              </div>
            )
          })}
        </div>
      }
    </div>
  )
}