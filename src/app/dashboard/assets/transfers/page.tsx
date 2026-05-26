"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function TransferHistoryPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [transfers, setTransfers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase.from("asset_transfers")
          .select("*, assets(name, asset_no), from_location:from_location_id(name), to_location:to_location_id(name)")
          .eq("company_id", cid)
          .order("transfer_date", { ascending: false })
          .then(({ data }) => {
            setTransfers(data || [])
            setLoading(false)
          })
      }
    })
  }, [])

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(14)
    doc.text("Asset Transfer History", 14, 20)
    const head = [["Asset", "Transfer Date", "From Location", "To Location"]]
    const body = transfers.map(t => [
      `${t.assets?.name} (${t.assets?.asset_no})`,
      t.transfer_date,
      t.from_location?.name || "—",
      t.to_location?.name || "—",
    ])
    autoTable(doc, { head, body, startY: 30, styles: { fontSize: 9 } })
    doc.save("transfer_history.pdf")
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
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>🚛 Transfer History</h1>
        </div>
        <button className="btn" onClick={exportPDF}><Download size={14} /> PDF</button>
      </div>

      {transfers.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>No transfers recorded yet.</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Transfer Date</th>
                <th>From Location</th>
                <th>To Location</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.id}>
                  <td>{t.assets?.name} ({t.assets?.asset_no})</td>
                  <td>{t.transfer_date}</td>
                  <td>{t.from_location?.name || "—"}</td>
                  <td>{t.to_location?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}