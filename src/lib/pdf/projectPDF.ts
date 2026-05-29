// lib/pdf/projectBudgetPDF.ts

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY    = [7, 8, 91]   as [number, number, number]
const DARK    = [17, 24, 39]  as [number, number, number]
const MUTED   = [107, 114, 128] as [number, number, number]
const BORDER  = [229, 231, 235] as [number, number, number]
const WHITE   = [255, 255, 255] as [number, number, number]
const ROW_ALT = [248, 249, 252] as [number, number, number]
const SUBTOTAL_BG = [240, 245, 255] as [number, number, number]

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => resolve("")
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

export interface ProjectPDFData {
  companyName: string
  companyTagline: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  logoUrl?: string | null

  projectName: string
  donorName?: string
  projectStatus?: string
  isApproved?: boolean
  totalBudgeted?: number
  startDate?: string
  endDate?: string

  // For GL mode:  columns = GL accounts  →  groupBy = "gl"
  // For Month mode: columns = months     →  groupBy = "month"
  groupBy?: "gl" | "month"

  columns: { code: string; name: string }[]
  rows: {
    activity: string
    location: string
    amounts: Record<string, number>
    total: number
    isSubtotal?: boolean
    isGrandTotal?: boolean
  }[]
  columnTotals: Record<string, number>
  grandTotal: number
}

export async function generateProjectPDF(data: ProjectPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14

  // ── Logo & company block ─────────────────────────────────────
  const LOGO_SIZE = 20, LOGO_X = ML, LOGO_Y = 7
  let logoData: string | null = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)

  const textX = logoData ? LOGO_X + LOGO_SIZE + 5 : ML
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 19
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // ── Report title block (right) ───────────────────────────────
  const reportTitle = data.groupBy === "month"
    ? "PROJECT BUDGET\n(Activity × Month)"
    : "PROJECT BUDGET\n(Activity × GL)"

  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(...NAVY)
  doc.text(reportTitle, PW - MR, LOGO_Y + 8, { align: "right" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`Project: ${data.projectName}`, PW - MR, LOGO_Y + 19, { align: "right" })
  doc.text(`Donor: ${data.donorName || "—"}`, PW - MR, LOGO_Y + 24, { align: "right" })

  // ── Divider ──────────────────────────────────────────────────
  const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

  let Y = HEADER_BOTTOM + 5
  if (data.startDate || data.endDate) {
    const start = data.startDate
      ? new Date(data.startDate).toLocaleDateString("en-PK") : "—"
    const end = data.endDate
      ? new Date(data.endDate).toLocaleDateString("en-PK")   : "—"
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`Duration: ${start} – ${end}`, PW - MR, Y, { align: "right" })
    Y += 6
  }
  Y += 2

  // ── Build columns ────────────────────────────────────────────
  // FIX: Always prepend Activity + Location as the first two columns

  // 1. Drop GL/month columns whose every row is zero (keeps table tidy)
  const nonZeroCols = data.columns.filter(col =>
    data.rows.some(row => (row.amounts[col.code] ?? 0) !== 0)
  )
  // Keep at least one column even if all zeros (edge-case safety)
  const visibleCols = nonZeroCols.length > 0 ? nonZeroCols : data.columns

  // 2. Build the full column list: Activity | Location | GL/Month cols... | Total
  const allColumns: { header: string; dataKey: string; isNumeric?: boolean }[] = [
    { header: "Activity",      dataKey: "activity",  isNumeric: false },
    { header: "Location",      dataKey: "location",  isNumeric: false },
    ...visibleCols.map(col => ({
      header:    `${col.code}\n${col.name}\nPKR`,
      dataKey:   col.code,
      isNumeric: true,
    })),
    { header: "Total\nPKR",   dataKey: "total",     isNumeric: true },
  ]

  // ── Format rows ──────────────────────────────────────────────
  const fmt = (n: number) =>
    n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const tableRows = data.rows.map(row => {
    const obj: Record<string, string> = {
      activity: row.activity ?? "",
      location: row.location ?? "",
    }
    visibleCols.forEach(col => {
      obj[col.code] = fmt(row.amounts[col.code] ?? 0)
    })
    obj.total = fmt(row.total)
    return obj
  })

  // ── Column widths (auto-distribute remaining space) ──────────
  const usableWidth   = PW - ML - MR          // e.g. 269 mm
  const activityWidth = 48                     // wider for text
  const locationWidth = 28
  const totalWidth    = 26
  const numericCols   = visibleCols.length
  const remaining     = usableWidth - activityWidth - locationWidth - totalWidth
  const colW          = Math.max(20, Math.floor(remaining / Math.max(numericCols, 1)))

  const columnStyles: Record<string, object> = {
    activity: { cellWidth: activityWidth, halign: "left" as const },
    location: { cellWidth: locationWidth, halign: "left" as const },
    total:    { cellWidth: totalWidth,    halign: "right" as const, fontStyle: "bold" as const },
  }
  visibleCols.forEach(col => {
    columnStyles[col.code] = { cellWidth: colW, halign: "right" as const }
  })

  // ── Render table ─────────────────────────────────────────────
  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    head: [allColumns.map(col => col.header)],
    body: tableRows.map(row => allColumns.map(col => row[col.dataKey] ?? "")),
    columns: allColumns.map(col => ({ dataKey: col.dataKey, header: col.header })),
    columnStyles,
    styles: {
      fontSize: 7,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 7,
      valign: "middle",
      halign: "center",
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    didParseCell: hookData => {
      if (hookData.section === "body") {
        const row = data.rows[hookData.row.index]
        if (!row) return

        if (row.isSubtotal) {
          hookData.cell.styles.fontStyle = "bold"
          hookData.cell.styles.fillColor = SUBTOTAL_BG
          hookData.cell.styles.textColor = NAVY
          // Activity cell for subtotals spans visually — label it clearly
          if (hookData.column.dataKey === "activity") {
            hookData.cell.styles.halign = "left"
          }
        }

        if (row.isGrandTotal) {
          hookData.cell.styles.fontStyle = "bold"
          hookData.cell.styles.fillColor = NAVY
          hookData.cell.styles.textColor = WHITE
        }
      }
    },
  })

  // ── Footer ───────────────────────────────────────────────────
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(ML, PH - 14, PW - MR, PH - 14)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(
    `Generated by ${data.companyName}  ·  ${data.companyTagline}`,
    PW / 2, PH - 8, { align: "center" }
  )

  return doc
}