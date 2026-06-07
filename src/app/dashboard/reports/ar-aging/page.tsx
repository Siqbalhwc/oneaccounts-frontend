"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download } from "lucide-react"
import { useRouter } from "next/navigation"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface AgingRow {
  customerName: string
  customerId: number
  invoiceNo: string
  invoiceDate: string
  dueDate: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  over90: number
  total: number
}

export default function ARAgingPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [data, setData] = useState<AgingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    supabase
      .from("invoices")
      .select("id, invoice_no, date, due_date, total, paid, party_id, customers!inner(name)")
      .eq("company_id", companyId)
      .eq("type", "sale")
      .neq("status", "Paid")
      .order("due_date")
      .then(({ data: invoices }) => {
        if (!invoices) {
          setData([])
          setLoading(false)
          return
        }
        const today = new Date()
        const rows: AgingRow[] = invoices.map((inv: any) => {
          const bal = (inv.total || 0) - (inv.paid || 0)
          if (bal <= 0) return null
          const due = new Date(inv.due_date)
          const days = Math.floor((today.getTime() - due.getTime()) / 86400000)
          let current = 0, d1to30 = 0, d31to60 = 0, d61to90 = 0, over90 = 0
          if (days <= 0) current = bal
          else if (days <= 30) d1to30 = bal
          else if (days <= 60) d31to60 = bal
          else if (days <= 90) d61to90 = bal
          else over90 = bal
          return {
            customerName: inv.customers?.name || "Unknown",
            customerId: inv.party_id,
            invoiceNo: inv.invoice_no,
            invoiceDate: inv.date,
            dueDate: inv.due_date,
            current,
            days1to30: d1to30,
            days31to60: d31to60,
            days61to90: d61to90,
            over90,
            total: bal,
          }
        }).filter(Boolean) as AgingRow[]

        const grouped: AgingRow[] = []
        let currentCustId = -1
        let subCurrent = 0, sub1to30 = 0, sub31to60 = 0, sub61to90 = 0, subOver90 = 0, subTotal = 0
        rows.forEach((row, idx) => {
          if (row.customerId !== currentCustId) {
            if (currentCustId !== -1) {
              grouped.push({
                customerName: "",
                customerId: -1,
                invoiceNo: "Subtotal",
                invoiceDate: "",
                dueDate: "",
                current: subCurrent,
                days1to30: sub1to30,
                days31to60: sub31to60,
                days61to90: sub61to90,
                over90: subOver90,
                total: subTotal,
              })
              subCurrent = sub1to30 = sub31to60 = sub61to90 = subOver90 = subTotal = 0
            }
            currentCustId = row.customerId
          }
          grouped.push(row)
          subCurrent += row.current
          sub1to30 += row.days1to30
          sub31to60 += row.days31to60
          sub61to90 += row.days61to90
          subOver90 += row.over90
          subTotal += row.total
          if (idx === rows.length - 1) {
            grouped.push({
              customerName: "",
              customerId: -1,
              invoiceNo: "Subtotal",
              invoiceDate: "",
              dueDate: "",
              current: subCurrent,
              days1to30: sub1to30,
              days31to60: sub31to60,
              days61to90: sub61to90,
              over90: subOver90,
              total: subTotal,
            })
          }
        })

        setData(grouped)
        setLoading(false)
      })
  }, [companyId])

  const totals = data.filter(d => d.invoiceNo === "Subtotal").reduce((acc, d) => ({
    current: acc.current + d.current,
    days1to30: acc.days1to30 + d.days1to30,
    days31to60: acc.days31to60 + d.days31to60,
    days61to90: acc.days61to90 + d.days61to90,
    over90: acc.over90 + d.over90,
    total: acc.total + d.total,
  }), { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 })

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(16)
    doc.text("AR Aging Report", 14, 20)
    doc.setFontSize(10)
    doc.text(`As of ${new Date().toLocaleDateString()}`, 14, 28)

    const head = [["Customer", "Invoice #", "Inv Date", "Current", "1-30", "31-60", "61-90", ">90", "Total"]]
    const body = data.map(d => [
      d.customerName || (d.invoiceNo === "Subtotal" ? "Subtotal" : ""),
      d.invoiceNo === "Subtotal" ? "" : d.invoiceNo,
      d.invoiceDate,
      d.current.toLocaleString(),
      d.days1to30.toLocaleString(),
      d.days31to60.toLocaleString(),
      d.days61to90.toLocaleString(),
      d.over90.toLocaleString(),
      d.total.toLocaleString(),
    ])

    autoTable(doc, {
      startY: 35,
      head,
      body,
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 25 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 20 },
        7: { cellWidth: 20 },
        8: { cellWidth: 20 },
      },
    })

    doc.save("ar-aging-report.pdf")
  }

  const format = (v: number) => v ? `PKR ${v.toLocaleString()}` : "–"

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading AR Aging…</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .aging-header {
          display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .aging-title { font-size: 22px; font-weight: 800; color: var(--text); }
        .aging-subtitle { font-size: 13px; color: var(--text-muted); }
        .aging-btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
          border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
          border: 1.5px solid var(--border); background: transparent; color: var(--text-muted);
          font-family: inherit;
        }
        .aging-btn:hover { background: var(--card-hover); }
        .aging-table {
          width: 100%; border-collapse: collapse; font-size: 13px;
          background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
        }
        .aging-table th {
          text-align: right; padding: 12px 16px; background: var(--card-hover);
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .aging-table th:first-child, .aging-table th:nth-child(2), .aging-table th:nth-child(3) {
          text-align: left;
        }
        .aging-table td {
          text-align: right; padding: 10px 16px; border-bottom: 1px solid var(--border);
        }
        .aging-table td:first-child, .aging-table td:nth-child(2), .aging-table td:nth-child(3) {
          text-align: left;
        }
        .aging-table tr.subtotal td {
          font-weight: 700; background: var(--bg-soft);
        }
        .aging-table tr.grand-total td {
          font-weight: 800; background: var(--primary); color: var(--primary-text);
        }
        .aging-summary {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px;
        }
        .aging-summary-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px; text-align: center;
        }
        .aging-summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .aging-summary-value { font-size: 18px; font-weight: 800; }
        @media (max-width: 768px) {
          .aging-table th, .aging-table td { padding: 8px 10px; font-size: 11px; }
        }
      `}</style>

      <div className="aging-header">
        <button className="aging-btn" onClick={() => router.push("/dashboard/reports")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 className="aging-title">📅 AR Aging Report</h1>
          <p className="aging-subtitle">Accounts Receivable aging analysis as of {new Date().toLocaleDateString()}</p>
        </div>
        <button className="aging-btn" onClick={handleDownloadPDF}><Download size={14} /> PDF</button>
      </div>

      <div className="aging-summary">
        {[
          { label: "Current", value: totals.current, color: "#10B981" },
          { label: "1-30 days", value: totals.days1to30, color: "#F59E0B" },
          { label: "31-60 days", value: totals.days31to60, color: "#F97316" },
          { label: "61-90 days", value: totals.days61to90, color: "#EF4444" },
          { label: ">90 days", value: totals.over90, color: "#B91C1C" },
          { label: "Grand Total", value: totals.total, color: "#1E3A8A" },
        ].map(s => (
          <div key={s.label} className="aging-summary-card">
            <div className="aging-summary-label">{s.label}</div>
            <div className="aging-summary-value" style={{ color: s.color }}>
              {format(s.value)}
            </div>
          </div>
        ))}
      </div>

      <table className="aging-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Invoice #</th>
            <th>Inv Date</th>
            <th>Current</th>
            <th>1-30</th>
            <th>31-60</th>
            <th>61-90</th>
            <th>&gt;90</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No outstanding receivables</td></tr>
          ) : (
            data.map((row, i) => {
              const isSubtotal = row.invoiceNo === "Subtotal"
              return (
                <tr key={i} className={isSubtotal ? "subtotal" : ""}>
                  <td>{row.customerName}</td>
                  <td>{isSubtotal ? "" : row.invoiceNo}</td>
                  <td>{row.invoiceDate}</td>
                  <td>{format(row.current)}</td>
                  <td>{format(row.days1to30)}</td>
                  <td>{format(row.days31to60)}</td>
                  <td>{format(row.days61to90)}</td>
                  <td>{format(row.over90)}</td>
                  <td>{format(row.total)}</td>
                </tr>
              )
            })
          )}
        </tbody>
        <tfoot>
          <tr className="grand-total">
            <td colSpan={3}>Grand Total</td>
            <td>{format(totals.current)}</td>
            <td>{format(totals.days1to30)}</td>
            <td>{format(totals.days31to60)}</td>
            <td>{format(totals.days61to90)}</td>
            <td>{format(totals.over90)}</td>
            <td>{format(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}