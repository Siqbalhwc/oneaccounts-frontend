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
  supplierName: string
  supplierId: number
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

interface APInvoice {
  invoice_id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  party_id: number
  supplier_name: string
  supplier_id: number
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

export default function APAgingPage() {
  const router = useRouter()
  const { companyId } = useCompany()
  const { companyName, companyTagline, logoUrl } = useCompany()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [data, setData] = useState<AgingRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split("T")[0]
  const [asOfDate, setAsOfDate] = useState(today)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([])
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const supplierDropdownRef = useRef<HTMLDivElement>(null)

  // Fetch suppliers list
  useEffect(() => {
    if (!companyId) return
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => data && setSuppliers(data))
  }, [companyId])

  // ── Fetch invoices using RPC ──
  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return
    }
    setLoading(true)

    supabase
      .rpc('get_ap_aging', {
        p_company_id: companyId,
        p_as_of_date: asOfDate
      })
      .then(({ data: invoices, error }) => {
        if (error) {
          console.error("AP Aging RPC error:", error)
          setData([])
          setLoading(false)
          return
        }

        if (!invoices || invoices.length === 0) {
          setData([])
          setLoading(false)
          return
        }

        let filteredInvoices: APInvoice[] = invoices
        if (selectedSupplierIds.length > 0) {
          filteredInvoices = invoices.filter((inv: APInvoice) =>
            selectedSupplierIds.includes(inv.supplier_id)
          )
        }

        const refDate = new Date(asOfDate)
        const rows: AgingRow[] = filteredInvoices
          .map((inv: APInvoice) => {
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
              supplierName: inv.supplier_name || "Unknown",
              supplierId: inv.supplier_id || inv.party_id,
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

        // Group by supplier
        const grouped: AgingRow[] = []
        let currentSuppId = -1
        let subCurrent = 0, sub1to30 = 0, sub31to60 = 0, sub61to90 = 0, subOver90 = 0, subTotal = 0

        rows.forEach((row, idx) => {
          if (row.supplierId !== currentSuppId) {
            if (currentSuppId !== -1) {
              grouped.push({
                supplierName: "",
                supplierId: -1,
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
            currentSuppId = row.supplierId

            grouped.push({
              supplierName: row.supplierName,
              supplierId: row.supplierId,
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
            supplierName: "",
            supplierId: row.supplierId,
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
              supplierName: "",
              supplierId: -1,
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
  }, [companyId, asOfDate, selectedSupplierIds])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false)
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

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  )

  const toggleSupplier = (id: number) => {
    setSelectedSupplierIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const clearSupplierFilter = () => {
    setSelectedSupplierIds([])
    setSupplierSearch("")
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
    doc.text("AP AGING REPORT", PW - MR, LOGO_Y + 8, { align: "right" })

    const supplierFilter = selectedSupplierIds.length === 1
      ? suppliers.find(s => s.id === selectedSupplierIds[0])?.name || "Selected Supplier"
      : "All Suppliers"

    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
    doc.text(`Supplier: ${supplierFilter}`, PW - MR, LOGO_Y + 16, { align: "right" })
    doc.text(`As of: ${asOfDate}`, PW - MR, LOGO_Y + 21, { align: "right" })

    // ── Header Line ──
    const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
    doc.setDrawColor(...NAVY).setLineWidth(0.6).line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

    // ── Table ──
    let Y = HEADER_BOTTOM + 6
    const headers = ["Supplier", "Invoice #", "Inv Date", "Current", "1-30", "31-60", "61-90", ">90", "Total"]

    const rows: any[] = []
    data.forEach((row) => {
      const isSubtotal = row.invoiceNo === "Subtotal"
      const isSupplierHeader = !isSubtotal && row.supplierName && row.supplierName.length > 0

      if (isSupplierHeader) {
        rows.push([
          { content: row.supplierName, styles: { fontStyle: "bold", fillColor: [245, 247, 250] } },
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

    doc.save("ap-aging-report.pdf")
  }

  const format = (v: number) => v ? v.toLocaleString() : "–"

  if (!companyId) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading company…</div>
  if (loading && data.length === 0) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading AP Aging…</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      {/* ... rest of the JSX remains the same ... */}
    </div>
  )
}