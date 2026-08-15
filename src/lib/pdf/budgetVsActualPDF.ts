import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY    = [7, 8, 91]      as [number, number, number]
const DARK    = [17, 24, 39]    as [number, number, number]
const MUTED   = [107, 114, 128] as [number, number, number]
const BORDER  = [229, 231, 235] as [number, number, number]
const WHITE   = [255, 255, 255] as [number, number, number]
const ROW_ALT = [248, 249, 252] as [number, number, number]
const HEADING_BG = [235, 238, 250] as [number, number, number]
const SUBTOTAL_BG = [219, 224, 245] as [number, number, number]
const SUCCESS = [16, 185, 129]  as [number, number, number]
const DANGER  = [239, 68, 68]   as [number, number, number]

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

export interface BudgetVsActualRow {
  activity: string
  location: string
  accountCode: string
  accountName: string
  budget: number
  actual: number
  isHeading?: boolean
  isSubtotal?: boolean
  isGrandTotal?: boolean
  isSpacer?: boolean
}

export interface BudgetVsActualPDFData {
  companyName: string
  companyTagline: string
  logoUrl?: string | null
  projectName: string
  donorName?: string
  periodStart?: string
  periodEnd?: string
  rows: BudgetVsActualRow[]
}

// Left-aligned columns: Activity/Location (0) and Account (1).
// Center-aligned columns: Budget (2), Actual (3), Variance (4).
function colAlign(colIndex: number): "left" | "center" {
  return colIndex <= 1 ? "left" : "center"
}

export async function generateBudgetVsActualPDF(data: BudgetVsActualPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14

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

  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.setTextColor(...NAVY)
  doc.text("BUDGET VS ACTUAL", PW - MR, LOGO_Y + 12, { align: "right" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`Project: ${data.projectName}`, PW - MR, LOGO_Y + 19, { align: "right" })
  if (data.donorName) doc.text(`Donor: ${data.donorName}`, PW - MR, LOGO_Y + 24, { align: "right" })
  if (data.periodStart || data.periodEnd) {
    const s = data.periodStart ? new Date(data.periodStart).toLocaleDateString("en-PK") : "-"
    const e = data.periodEnd ? new Date(data.periodEnd).toLocaleDateString("en-PK") : "-"
    doc.text(`Project Period: ${s} to ${e}`, PW - MR, LOGO_Y + 29, { align: "right" })
  }

  const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

  const Y = HEADER_BOTTOM + 7

  const fmt = (n: number) =>
    n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Insert a blank spacer row between each activity's subtotal and the
  // next activity's heading, so they don't visually blend together.
  const rowsWithSpacers: BudgetVsActualRow[] = []
  data.rows.forEach((row, i) => {
    rowsWithSpacers.push(row)
    const next = data.rows[i + 1]
    if (row.isSubtotal && next && !next.isGrandTotal) {
      rowsWithSpacers.push({
        activity: "", location: "", accountCode: "", accountName: "",
        budget: 0, actual: 0, isSpacer: true,
      })
    }
  })

  const tableRows = rowsWithSpacers.map(row => {
    if (row.isSpacer) {
      return { description: "", account: "", budget: "", actual: "", variance: "" }
    }
    const variance = row.budget - row.actual
    if (row.isGrandTotal) {
      return { description: "Grand Total", account: "", budget: fmt(row.budget), actual: fmt(row.actual), variance: fmt(variance) }
    }
    if (row.isSubtotal) {
      return { description: `Sub Total - ${row.activity}`, account: "", budget: fmt(row.budget), actual: fmt(row.actual), variance: fmt(variance) }
    }
    if (row.isHeading) {
      return { description: row.activity, account: "", budget: "", actual: "", variance: "" }
    }
    return {
      description: `    ${row.location}`,
      account: `${row.accountCode} - ${row.accountName}`,
      budget: fmt(row.budget),
      actual: fmt(row.actual),
      variance: fmt(variance),
    }
  })

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    head: [["Activity / Location", "Account", "Budget (PKR)", "Actual (PKR)", "Variance (PKR)"]],
    body: tableRows.map(r => [r.description, r.account, r.budget, r.actual, r.variance]),
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 60 },
      2: { cellWidth: 40 },
      3: { cellWidth: 40 },
      4: { cellWidth: 40, fontStyle: "bold" },
    },
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    didParseCell: hookData => {
      // Alignment applies to BOTH head and body - set explicitly per column
      // here since headStyles/columnStyles alone don't reliably combine.
      hookData.cell.styles.halign = colAlign(hookData.column.index)

      if (hookData.section !== "body") return
      const row = rowsWithSpacers[hookData.row.index]
      if (!row) return

      if (row.isSpacer) {
        hookData.cell.styles.fillColor = WHITE
        hookData.cell.styles.lineWidth = 0
        hookData.cell.styles.minCellHeight = 2
      } else if (row.isHeading) {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.textColor = NAVY
        hookData.cell.styles.fillColor = HEADING_BG
      } else if (row.isSubtotal) {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.fillColor = SUBTOTAL_BG
        hookData.cell.styles.textColor = NAVY
      } else if (row.isGrandTotal) {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.fillColor = NAVY
        hookData.cell.styles.textColor = WHITE
      } else if (hookData.column.index === 4) {
        const variance = row.budget - row.actual
        hookData.cell.styles.textColor = variance < 0 ? DANGER : variance > 0 ? SUCCESS : MUTED
      }
    },
  })

  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(ML, PH - 14, PW - MR, PH - 14)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(
    `Generated by ${data.companyName} - ${data.companyTagline}`,
    PW / 2, PH - 8, { align: "center" }
  )

  return doc
}