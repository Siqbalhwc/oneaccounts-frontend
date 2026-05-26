"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function DepreciationSchedulePage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [schedule, setSchedule] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase.from("asset_depreciation_schedule")
          .select("*, assets(name, asset_no)")
          .eq("company_id", cid)
          .order("period", { ascending: false })
          .then(({ data }) => {
            setSchedule(data || [])
            setLoading(false)
          })
      }
    })
  }, [])

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text("Depreciation Schedule", 14, 20)
    const head = [["Asset", "Period", "Amount", "Posted"]]
    const body = schedule.map(row => [
      `${row.assets?.name} (${row.assets?.asset_no})`,
      row.period,
      row.depreciation_amount?.toLocaleString(),
      row.posted ? "Yes" : "No",
    ])
    autoTable(doc, { head, body, startY: 30, styles: { fontSize: 9 } })
    doc.save("depreciation_schedule.pdf")
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
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>📅 Depreciation Schedule</h1>
        </div>
        <button className="btn" onClick={exportPDF}><Download size={14} /> PDF</button>
      </div>

      {schedule.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>No depreciation posted yet.</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Posted</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map(row => (
                <tr key={row.id}>
                  <td>{row.assets?.name} ({row.assets?.asset_no})</td>
                  <td>{row.period}</td>
                  <td>PKR {row.depreciation_amount?.toLocaleString()}</td>
                  <td style={{ color: row.posted ? "#10B981" : "#F59E0B", fontWeight:600 }}>{row.posted ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}