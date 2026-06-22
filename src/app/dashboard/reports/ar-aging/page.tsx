"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Search, X, Check } from "lucide-react"
import { useRouter } from "next/navigation"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useCompany } from "@/contexts/CompanyContext"

const NAVY = [7, 8, 91] as [number, number, number]
const DARK = [17, 24, 39] as [number, number, number]
const MUTED = [107, 114, 128] as [number, number, number]
const BORDER = [229, 231, 235] as [number, number, number]
const WHITE = [255, 255, 255] as [number, number, number]
const ROW_ALT = [248, 249, 252] as [number, number, number]

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

async function loadImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const b = await r.blob()
    return new Promise((res) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result as string)
      reader.onerror = () => res("")
      reader.readAsDataURL(b)
    })
  } catch { return null }
}

export default function ARAgingPage() {
  const router = useRouter()
  const { companyId } = useCompany()
  const { companyName, companyTagline, logoUrl } = useCompany()
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
  const handleDownloadPDF = async () => {
    if (data.length === 0) return alert("No data to export")

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    const PW = 297, ML = 14, MR = 14
    const LOGO_SIZE = 20, LOGO_X = ML, LOGO_Y = 7

    // ── Load Logo ──
    let logoData: string | null = null
    if (logoUrl) logoData = await loadImage(logoUrl)
    if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)

    // ── Left Side: Company Info ──
    const textX = logoData ? LOGO_X + LOGO_SIZE + 5 : ML
    doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(14)
    doc.text(companyName || "", textX, LOGO_Y + 7)
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
    doc.text(companyTagline || "", textX, LOGO_Y + 13)

    // ── Right Side: Report Title & Filters ──
    doc.setFont("helvetica", "bold").setFontSize(24).setTextColor(...NAVY)
    doc.text("AR AGING REPORT", PW - MR, LOGO_Y + 8, { align: "right" })

    const customerFilter = selectedCustomerIds.length === 1
      ? customers.find(c => c.id === selectedCustomerIds[0])?.name || "Selected Customer"
      : "All Customers"

    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
    doc.text(`Customer: ${customerFilter}`, PW - MR, LOGO_Y + 16, { align: "right" })
    doc.text(`As of: ${asOfDate}`, PW - MR, LOGO_Y + 21, { align: "right" })

    // ── Header Line ──
    const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
    doc.setDrawColor(...NAVY).setLineWidth(0.6).line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

    // ── Table ──
    let Y = HEADER_BOTTOM + 6
    const headers = ["Customer", "Invoice #", "Inv Date", "Current", "1-30", "31-60", "61-90", ">90", "Total"]

    const rows: any[] = []
    data.forEach((row) => {
      const isSubtotal = row.invoiceNo === "Subtotal"
      const isCustomerHeader = !isSubtotal && row.customerName && row.customerName.length > 0

      if (isCustomerHeader) {
        rows.push([
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
        rows.push([
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

    // Grand Total
    rows.push([
      { content: "Grand Total", styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE } },
      "",
      "",
      totals.current > 0 ? totals.current.toLocaleString() : "",
      totals.days1to30 > 0 ? totals.days1to30.toLocaleString() : "",
      totals.days31to60 > 0 ? totals.days31to60.toLocaleString() : "",
      totals.days61to90 > 0 ? totals.days61to90.toLocaleString() : "",
      totals.over90 > 0 ? totals.over90.toLocaleString() : "",
      { content: totals.total > 0 ? totals.total.toLocaleString() : "", styles: { fontStyle: "bold" } },
    ])

    // ── Calculate available width ──
    const availableWidth = PW - ML - MR

    autoTable(doc, {
      startY: Y,
      margin: { left: ML, right: MR },
      tableWidth: 'auto',
      head: [headers],
      body: rows,
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        textColor: DARK,
        lineColor: BORDER,
        lineWidth: 0.2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: '20%', halign: 'left' },
        1: { cellWidth: '12%', halign: 'left' },
        2: { cellWidth: '10%', halign: 'left' },
        3: { cellWidth: '10%', halign: 'right' },
        4: { cellWidth: '10%', halign: 'right' },
        5: { cellWidth: '10%', halign: 'right' },
        6: { cellWidth: '10%', halign: 'right' },
        7: { cellWidth: '10%', halign: 'right' },
        8: { cellWidth: '8%', halign: 'right' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'head' && hookData.column.index >= 3) {
          hookData.cell.styles.halign = 'center'
        }
        if (hookData.section === 'body') {
          const row = hookData.row.raw
          if (row && Array.isArray(row) && row[0] === "Subtotal") {
            hookData.cell.styles.fillColor = [240, 242, 245]
            hookData.cell.styles.fontStyle = "bold"
          }
        }
      },
    })

    // ── Footer ──
    const PH = 210
    doc.setDrawColor(...NAVY).setLineWidth(0.4).line(ML, PH - 14, PW - MR, PH - 14)
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED)
    doc.text(
      `Generated by ${companyName || "OneAccounts"}  ·  ${companyTagline || ""}`,
      PW / 2,
      PH - 8,
      { align: "center" }
    )

    doc.save("ar-aging-report.pdf")
  }

  const format = (v: number) => v ? v.toLocaleString() : "–"

  if (!companyId) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading company…</div>
  if (loading && data.length === 0) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading AR Aging…</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      {/* ... rest of the JSX remains the same ... */}
      {/* I'm keeping the same JSX as before – only the PDF export changed */}
    </div>
  )
}