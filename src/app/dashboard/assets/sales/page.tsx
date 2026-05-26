"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function SaleHistoryPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase.from("asset_sales")
          .select("*, assets(name, asset_no)")
          .eq("company_id", cid)
          .order("sale_date", { ascending: false })
          .then(({ data }) => {
            setSales(data || [])
            setLoading(false)
          })
      }
    })
  }, [])

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(14)
    doc.text("Asset Sale History", 14, 20)
    const head = [["Asset", "Sale Date", "Sale Amount", "Gain/Loss"]]
    const body = sales.map(s => [
      `${s.assets?.name} (${s.assets?.asset_no})`,
      s.sale_date,
      s.sale_amount?.toLocaleString(),
      "—"   // Gain/loss not directly stored; you may later compute it, for now just show amount
    ])
    autoTable(doc, { head, body, startY: 30, styles: { fontSize: 9 } })
    doc.save("sale_history.pdf")
  }

  if (loading) return <div style={{ padding:24, textAlign:"center", color:"var(--text-muted)", background:"var(--bg)", minHeight:"100vh" }}>Loading…</div>

  return (
    <div style={{ padding:24, background:"var(--bg)", minHeight:"100vh", fontFamily:"'Inter', sans-serif", color:"var(--text)" }}>
      <style>{`
        .btn { display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:transparent;color:var(--text-muted);font-family:inherit; }
        .btn:hover { background:var(--card-hover); }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--border); }
        th { color:var(--text-muted); font-size:10px; text-transform:uppercase; }
      `}</style>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/assets")}><ArrowLeft size={16} /></button>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>💰 Sale History</h1>
        </div>
        <button className="btn" onClick={exportPDF}><Download size={14} /> PDF</button>
      </div>

      {sales.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>No sales recorded yet.</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Sale Date</th>
                <th>Sale Amount</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id}>
                  <td>{s.assets?.name} ({s.assets?.asset_no})</td>
                  <td>{s.sale_date}</td>
                  <td>PKR {s.sale_amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}