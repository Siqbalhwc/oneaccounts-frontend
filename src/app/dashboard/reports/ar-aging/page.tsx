"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Search, X, Check } from "lucide-react"
import { useRouter } from "next/navigation"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useCompany } from "@/contexts/CompanyContext"

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

interface ARInvoice {
  invoice_id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  party_id: number
  customer_name: string
  customer_id: number
}

export default function ARAgingPage() {
  const router = useRouter()
  const { companyId } = useCompany()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [data, setData] = useState<AgingRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split("T")[0]
  const [asOfDate, setAsOfDate] = useState(today)
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)

  // Fetch customers list
  useEffect(() => {
    if (!companyId) return
    supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => data && setCustomers(data))
  }, [companyId])

  // ── Fetch invoices using RPC ──
  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return
    }
    setLoading(true)

    supabase
      .rpc('get_ar_aging', {
        p_company_id: companyId,
        p_as_of_date: asOfDate
      })
      .then(({ data: invoices, error }) => {
        if (error) {
          console.error("AR Aging RPC error:", error)
          setData([])
          setLoading(false)
          return
        }

        if (!invoices || invoices.length === 0) {
          setData([])
          setLoading(false)
          return
        }

        let filteredInvoices: ARInvoice[] = invoices
        if (selectedCustomerIds.length > 0) {
          filteredInvoices = invoices.filter((inv: ARInvoice) =>
            selectedCustomerIds.includes(inv.customer_id)
          )
        }

        const refDate = new Date(asOfDate)
        const rows: AgingRow[] = filteredInvoices
          .map((inv: ARInvoice) => {
            const bal = (inv.total || 0) - (inv.paid || 0)
            if (bal <= 0) return null
            const due = new Date(inv.due_date)
            const days = Math.floor((refDate.getTime() - due.getTime()) / 86400000)
            let current = 0, d1to30 = 0, d31to60 = 0, d61to90 = 0, over90 = 0
            if (days <= 0) current = bal
            else if (days <= 30) d1to30 = bal
            else if (days <= 60) d31to60 = bal
            else if (days <= 90) d61to90 = bal
            else over90 = bal
            return {
              customerName: inv.customer_name || "Unknown",
              customerId: inv.customer_id || inv.party_id,
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
          })
          .filter(Boolean) as AgingRow[]

        // Group by customer
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

            grouped.push({
              customerName: row.customerName,
              customerId: row.customerId,
              invoiceNo: "",
              invoiceDate: "",
              dueDate: "",
              current: 0,
              days1to30: 0,
              days31to60: 0,
              days61to90: 0,
              over90: 0,
              total: 0,
            })
          }

          grouped.push({
            customerName: "",
            customerId: row.customerId,
            invoiceNo: row.invoiceNo,
            invoiceDate: row.invoiceDate,
            dueDate: row.dueDate,
            current: row.current,
            days1to30: row.days1to30,
            days31to60: row.days31to60,
            days61to90: row.days61to90,
            over90: row.over90,
            total: row.total,
          })

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
  }, [companyId, asOfDate, selectedCustomerIds])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const totals = data.filter(d => d.invoiceNo === "Subtotal").reduce((acc, d) => ({
    current: acc.current + d.current,
    days1to30: acc.days1to30 + d.days1to30,
    days31to60: acc.days31to60 + d.days31to60,
    days61to90: acc.days61to90 + d.days61to90,
    over90: acc.over90 + d.over90,
    total: acc.total + d.total,
  }), { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 })

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  )

  const toggleCustomer = (id: number) => {
    setSelectedCustomerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const clearCustomerFilter = () => {
    setSelectedCustomerIds([])
    setCustomerSearch("")
  }

  // ── PDF Export ──
  const handleDownloadPDF = () => {
    if (data.length === 0) return alert("No data to export")

    const doc = new jsPDF({ orientation: "landscape" })
    const pageWidth = doc.internal.pageSize.getWidth()

    // Header
    doc.setFontSize(16)
    doc.setTextColor(30, 58, 138)
    doc.text("AR Aging Report", 14, 20)

    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`As of ${asOfDate}`, 14, 28)

    // Currency note
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text("Amounts in PKR", pageWidth - 14, 28, { align: "right" })

    // ── Table ──
    const head = [["Customer", "Invoice #", "Inv Date", "Current", "1-30", "31-60", "61-90", ">90", "Total"]]

    const body: any[] = []
    data.forEach((row) => {
      const isSubtotal = row.invoiceNo === "Subtotal"
      const isCustomerHeader = !isSubtotal && row.customerName && row.customerName.length > 0

      if (isCustomerHeader) {
        body.push([
          { content: row.customerName, styles: { fontStyle: "bold", fillColor: [245, 247, 250] } },
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ])
      } else {
        body.push([
          isSubtotal ? "Subtotal" : "",
          isSubtotal ? "" : row.invoiceNo,
          isSubtotal ? "" : row.invoiceDate,
          row.current > 0 ? row.current.toLocaleString() : "",
          row.days1to30 > 0 ? row.days1to30.toLocaleString() : "",
          row.days31to60 > 0 ? row.days31to60.toLocaleString() : "",
          row.days61to90 > 0 ? row.days61to90.toLocaleString() : "",
          row.over90 > 0 ? row.over90.toLocaleString() : "",
          row.total > 0 ? row.total.toLocaleString() : "",
        ])
      }
    })

    // Grand Total row
    body.push([
      { content: "Grand Total", styles: { fontStyle: "bold", fillColor: [30, 58, 138], textColor: [255, 255, 255] } },
      "",
      "",
      totals.current > 0 ? totals.current.toLocaleString() : "",
      totals.days1to30 > 0 ? totals.days1to30.toLocaleString() : "",
      totals.days31to60 > 0 ? totals.days31to60.toLocaleString() : "",
      totals.days61to90 > 0 ? totals.days61to90.toLocaleString() : "",
      totals.over90 > 0 ? totals.over90.toLocaleString() : "",
      { content: totals.total > 0 ? totals.total.toLocaleString() : "", styles: { fontStyle: "bold" } },
    ])

    autoTable(doc, {
      startY: 35,
      head: head,
      body: body,
      theme: "striped",
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: "linebreak",
        halign: "right",
      },
      columnStyles: {
        0: { cellWidth: 45, halign: "left" },
        1: { cellWidth: 30, halign: "left" },
        2: { cellWidth: 25, halign: "left" },
        3: { cellWidth: 25, halign: "right" },
        4: { cellWidth: 25, halign: "right" },
        5: { cellWidth: 25, halign: "right" },
        6: { cellWidth: 25, halign: "right" },
        7: { cellWidth: 25, halign: "right" },
        8: { cellWidth: 30, halign: "right" },
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
      },
      didParseCell: (data) => {
        // Highlight subtotal rows with a different background
        if (data.section === "body") {
          const row = data.row.raw
          if (row && Array.isArray(row) && row[0] === "Subtotal") {
            data.cell.styles.fillColor = [240, 242, 245]
            data.cell.styles.fontStyle = "bold"
          }
        }
      },
      margin: { left: 14, right: 14 },
    })

    doc.save("ar-aging-report.pdf")
  }

  const format = (v: number) => v ? v.toLocaleString() : "–"

  if (!companyId) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading company…</div>
  if (loading && data.length === 0) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading AR Aging…</div>

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

        .aging-table-wrapper {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .aging-table {
          width: 100%;
          min-width: 900px;
          border-collapse: collapse;
          font-size: 12px;
          background: var(--card);
          table-layout: fixed;
        }

        .aging-table th {
          padding: 10px 8px;
          background: var(--card-hover);
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          border-bottom: 2px solid var(--border);
          white-space: nowrap;
          text-align: right;
          letter-spacing: 0.04em;
        }

        .aging-table th:first-child {
          text-align: left;
          width: 14%;
          min-width: 100px;
        }
        .aging-table th:nth-child(2) {
          text-align: left;
          width: 12%;
          min-width: 80px;
        }
        .aging-table th:nth-child(3) {
          text-align: left;
          width: 10%;
          min-width: 75px;
        }

        .aging-table th:nth-child(4),
        .aging-table th:nth-child(5),
        .aging-table th:nth-child(6),
        .aging-table th:nth-child(7),
        .aging-table th:nth-child(8),
        .aging-table th:nth-child(9) {
          width: 11%;
          min-width: 90px;
          text-align: right;
        }

        .aging-table td {
          padding: 8px 8px;
          border-bottom: 1px solid var(--border);
          text-align: right;
          white-space: nowrap;
          overflow: visible;
        }

        .aging-table td:first-child {
          text-align: left;
          font-weight: 600;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .aging-table td:nth-child(2),
        .aging-table td:nth-child(3) {
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .aging-table tr.customer-header td {
          font-weight: 700;
          font-size: 14px;
          color: var(--primary);
          padding-top: 16px;
          padding-bottom: 4px;
          border-bottom: 1.5px solid var(--border);
          background: var(--bg);
          text-align: left !important;
        }
        .aging-table tr.customer-header td:first-child {
          font-size: 14px;
        }
        .aging-table tr.customer-header td:not(:first-child) {
          color: var(--text-muted);
          font-weight: 400;
          font-size: 11px;
          text-align: right !important;
        }

        .aging-table tr.invoice-row td {
          font-weight: 400;
          font-size: 11.5px;
          color: var(--text);
        }
        .aging-table tr.invoice-row td:first-child {
          padding-left: 24px;
          font-weight: 400;
          color: var(--text-muted);
          font-size: 11px;
        }

        .aging-table tr.subtotal-row td {
          font-weight: 700 !important;
          font-size: 12px;
          background: var(--bg-soft);
          border-top: 1.5px solid var(--border);
          border-bottom: 2px solid var(--border);
          padding-top: 6px;
          padding-bottom: 6px;
          text-align: right !important;
        }
        .aging-table tr.subtotal-row td:first-child {
          font-weight: 700 !important;
          color: var(--text);
          padding-left: 8px;
          text-align: left !important;
          font-size: 12px;
        }

        .aging-table tr.grand-total td {
          font-weight: 800;
          background: var(--primary);
          color: var(--primary-text);
          border-top: 2px solid var(--border);
          padding: 10px 8px;
          font-size: 13px;
          text-align: right !important;
        }
        .aging-table tr.grand-total td:first-child {
          text-align: left !important;
        }
        .aging-table tr.grand-total td:not(:first-child) {
          text-align: right !important;
        }

        .aging-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }

        .aging-summary-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
          text-align: center;
        }

        .aging-summary-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 2px;
        }

        .aging-summary-value {
          font-size: 18px;
          font-weight: 800;
        }

        .aging-summary-value .currency-prefix {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          margin-right: 2px;
        }

        .filter-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .date-input {
          height: 38px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          background: var(--card);
          color: var(--text);
          font-family: inherit;
        }

        .multi-select {
          position: relative;
          flex: 1;
          min-width: 200px;
          max-width: 400px;
        }

        .multi-select-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 38px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          background: var(--card);
          color: var(--text);
          cursor: pointer;
        }

        .multi-select-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          max-height: 220px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .multi-select-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 13px;
          color: var(--text);
        }

        .multi-select-option:hover {
          background: var(--card-hover);
        }

        .multi-select-search {
          position: sticky;
          top: 0;
          background: var(--card);
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
        }

        @media (max-width: 768px) {
          .aging-table {
            font-size: 10px;
            min-width: 700px;
          }
          .aging-table th,
          .aging-table td {
            padding: 5px 4px;
          }
          .aging-table th:first-child {
            min-width: 70px;
          }
          .aging-table th:nth-child(2) {
            min-width: 50px;
          }
          .aging-table th:nth-child(3) {
            min-width: 50px;
          }
          .aging-table th:nth-child(4),
          .aging-table th:nth-child(5),
          .aging-table th:nth-child(6),
          .aging-table th:nth-child(7),
          .aging-table th:nth-child(8),
          .aging-table th:nth-child(9) {
            min-width: 60px;
          }
          .aging-summary {
            grid-template-columns: repeat(2, 1fr);
          }
          .aging-table tr.invoice-row td:first-child {
            padding-left: 12px;
            font-size: 9px;
          }
        }

        .currency-note {
          font-size: 10px;
          color: var(--text-muted);
          text-align: right;
          padding: 4px 8px 0 0;
          font-weight: 500;
        }
      `}</style>

      <div className="aging-header">
        <button className="aging-btn" onClick={() => router.push("/dashboard/reports")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 className="aging-title">📅 AR Aging Report</h1>
          <p className="aging-subtitle">Accounts Receivable aging analysis as of {asOfDate}</p>
        </div>
        <button className="aging-btn" onClick={handleDownloadPDF}><Download size={14} /> PDF</button>
      </div>

      <div className="filter-row">
        <label style={{ fontSize: 13, color: "var(--text-muted)", marginRight: -4 }}>As of:</label>
        <input type="date" className="date-input" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />

        <div className="multi-select" ref={customerDropdownRef}>
          <div className="multi-select-trigger" onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}>
            <span>
              {selectedCustomerIds.length === 0
                ? "All Customers"
                : `${selectedCustomerIds.length} selected`}
            </span>
            <X size={14} color="var(--text-muted)" onClick={(e) => { e.stopPropagation(); clearCustomerFilter(); }} />
          </div>
          {showCustomerDropdown && (
            <div className="multi-select-dropdown">
              <div className="multi-select-search">
                <Search size={14} color="var(--text-muted)" style={{ position: "absolute", left: 12, top: 10 }} />
                <input
                  style={{ width: "100%", height: 30, border: "1px solid var(--border)", borderRadius: 6, paddingLeft: 32, fontSize: 13, background: "var(--bg)", color: "var(--text)" }}
                  placeholder="Search customers…"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              </div>
              {filteredCustomers.map(c => (
                <div key={c.id} className="multi-select-option" onClick={() => toggleCustomer(c.id)}>
                  <div style={{ width: 16, height: 16, border: "1px solid var(--border)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {selectedCustomerIds.includes(c.id) && <Check size={12} />}
                  </div>
                  <span>{c.name}</span>
                </div>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="multi-select-option" style={{ color: "var(--text-muted)" }}>No customers found</div>
              )}
            </div>
          )}
        </div>
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
              <span className="currency-prefix">PKR</span> {format(s.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="currency-note">Amounts in PKR</div>

      <div className="aging-table-wrapper">
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
                const isCustomerHeader = !isSubtotal && row.customerName && row.customerName.length > 0

                return (
                  <tr
                    key={i}
                    className={
                      isSubtotal ? "subtotal-row" :
                      isCustomerHeader ? "customer-header" :
                      "invoice-row"
                    }
                  >
                    <td title={row.customerName || (isSubtotal ? "Subtotal" : "")}>
                      {isCustomerHeader ? row.customerName : (isSubtotal ? "Subtotal" : "")}
                    </td>
                    <td title={isSubtotal ? "" : row.invoiceNo}>
                      {isSubtotal ? "" : row.invoiceNo}
                    </td>
                    <td title={isSubtotal ? "" : row.invoiceDate}>
                      {isSubtotal ? "" : row.invoiceDate}
                    </td>
                    <td title={format(row.current)}>{format(row.current)}</td>
                    <td title={format(row.days1to30)}>{format(row.days1to30)}</td>
                    <td title={format(row.days31to60)}>{format(row.days31to60)}</td>
                    <td title={format(row.days61to90)}>{format(row.days61to90)}</td>
                    <td title={format(row.over90)}>{format(row.over90)}</td>
                    <td title={format(row.total)}>{format(row.total)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="grand-total">
              <td colSpan={3}>Grand Total</td>
              <td title={format(totals.current)}>{format(totals.current)}</td>
              <td title={format(totals.days1to30)}>{format(totals.days1to30)}</td>
              <td title={format(totals.days31to60)}>{format(totals.days31to60)}</td>
              <td title={format(totals.days61to90)}>{format(totals.days61to90)}</td>
              <td title={format(totals.over90)}>{format(totals.over90)}</td>
              <td title={format(totals.total)}>{format(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}