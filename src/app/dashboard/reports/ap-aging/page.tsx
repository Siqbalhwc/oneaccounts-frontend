"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRouter } from "next/navigation"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export default function APAgingPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from("invoices")
      .select("*, suppliers!party_id(name)")
      .eq("type", "purchase")
      .neq("status", "Paid")
      .order("due_date")
      .then(r => {
        if (r.data) {
          const today = new Date()
          const enriched = r.data.map((inv: any) => {
            const due = new Date(inv.due_date)
            const days = Math.floor((today.getTime() - due.getTime()) / 86400000)
            const bal = (inv.total || 0) - (inv.paid || 0)
            let bucket = "Current"
            if (days > 90) bucket = ">90 days"
            else if (days > 60) bucket = "61-90 days"
            else if (days > 30) bucket = "31-60 days"
            else if (days > 0) bucket = "1-30 days"
            return {
              ...inv,
              days_overdue: days,
              balance: bal,
              bucket,
              supplier_name: inv.suppliers?.name || "Unknown",
            }
          })
          setData(enriched)
        }
        setLoading(false)
      })
  }, [])

  const buckets = ["Current", "1-30 days", "31-60 days", "61-90 days", ">90 days"]
  const totals = buckets.reduce((acc, b) => ({
    ...acc,
    [b]: data.filter(d => d.bucket === b).reduce((s, d) => s + d.balance, 0),
  }), {} as Record<string, number>)
  const grandTotal = data.reduce((s, d) => s + d.balance, 0)

  const handleDownloadPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("AP Aging Report", 14, 20)
    doc.setFontSize(10)
    doc.text(`As of ${new Date().toLocaleDateString()}`, 14, 28)

    const summaryRows = buckets.map(b => [b, `PKR ${(totals[b] || 0).toLocaleString()}`])
    autoTable(doc, {
      startY: 35,
      head: [["Bucket", "Amount"]],
      body: summaryRows,
      foot: [["Total", `PKR ${grandTotal.toLocaleString()}`]],
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138] },
    })

    const detailRows = data.map(d => [
      d.invoice_no,
      d.supplier_name,
      d.due_date,
      d.days_overdue.toString(),
      `PKR ${d.balance.toLocaleString()}`,
      d.bucket,
    ])
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Bill No", "Supplier", "Due Date", "Days", "Balance", "Bucket"]],
      body: detailRows,
      theme: "striped",
    })

    doc.save("ap-aging-report.pdf")
  }

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/reports")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📅 AP Aging Report</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Accounts Payable aging analysis</p>
        </div>
        <button onClick={handleDownloadPDF}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "white", border: "1px solid #E2E8F0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          <Download size={14} /> Download PDF
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {buckets.map(b => (
          <div key={b} style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>{b}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: b === ">90 days" ? "#EF4444" : "#1E3A8A" }}>PKR {(totals[b] || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700 }}>Total Outstanding</span>
        <span style={{ fontWeight: 800, fontSize: 18, color: "#EF4444" }}>PKR {grandTotal.toLocaleString()}</span>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 90px 90px 90px", padding: "10px 14px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
            <span>Bill No</span><span>Supplier</span><span>Due Date</span><span>Days</span><span>Balance</span><span>Bucket</span>
          </div>
          {data.map((d, i) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 90px 90px 90px", padding: "10px 14px", borderBottom: i < data.length - 1 ? "1px solid #F1F5F9" : "none", fontSize: 12, alignItems: "center" }}>
              <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{d.invoice_no}</span>
              <span>{d.supplier_name}</span>
              <span>{d.due_date}</span>
              <span style={{ color: d.days_overdue > 60 ? "#EF4444" : "#64748B" }}>{d.days_overdue}d</span>
              <span style={{ fontWeight: 600 }}>PKR {d.balance.toLocaleString()}</span>
              <span style={{ color: d.bucket === ">90 days" ? "#EF4444" : "#F59E0B", fontWeight: 600 }}>{d.bucket}</span>
            </div>
          ))}
        </div>
      }
    </div>
  )
}