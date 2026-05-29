import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY    = [7, 8, 91] as [number,number,number]
const DARK    = [17,24,39] as [number,number,number]
const MUTED   = [107,114,128] as [number,number,number]
const BORDER  = [229,231,235] as [number,number,number]
const WHITE   = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]

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
  projectStatus: string
  isApproved: boolean
  totalBudgeted?: number
  startDate?: string
  endDate?: string

  columns: { code: string; name: string }[]
  rows: any[]
  columnTotals: Record<string, number>
  grandTotal: number
}

export async function generateProjectPDF(data: ProjectPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14

  // ── Logo & company info ──────────────────────────────────────
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

  // ── Report title ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(24)
  doc.setTextColor(...NAVY)
  doc.text("PROJECT BUDGET", PW - MR, LOGO_Y + 8, { align: "right" })

  // Project name on the right
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`Project: ${data.projectName}`, PW - MR, LOGO_Y + 16, { align: "right" })

  // Donor line below project name, above the divider
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`Donor: ${data.donorName || "—"}`, PW - MR, LOGO_Y + 20, { align: "right" })

  // Divider
  const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

  // ── Duration below the divider (right side) ──────────────────
  let Y = HEADER_BOTTOM + 5
  if (data.startDate || data.endDate) {
    const start = data.startDate ? new Date(data.startDate).toLocaleDateString("en-PK") : "—"
    const end = data.endDate ? new Date(data.endDate).toLocaleDateString("en-PK") : "—"
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`Duration: ${start} – ${end}`, PW - MR, Y, { align: "right" })
    Y += 6
  }

  Y += 4

  // ── Build cross‑tab table ─────────────────────────────────────
  const columns = data.columns.map(col => ({
    header: `${col.code}\n${col.name}\nPKR`,
    dataKey: col.code,
  }))
  // Add total column at the end
  columns.push({ header: "Total\nPKR", dataKey: "total" })

  // Prepare rows: each row has activity, location, amounts per GL, and total
  const tableRows = data.rows.map(row => {
    const obj: any = {
      activity: row.isSubtotal ? "" : row.activity,
      location: row.location,
    }
    data.columns.forEach(col => {
      obj[col.code] = row.amounts[col.code]?.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"
    })
    obj.total = row.total.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return obj
  })

  // Optional: if more than 10 columns, remove zero‑only columns
  let displayColumns = columns
  if (columns.length - 1 > 10) { // -1 for total column
    const zeroCols = data.columns.filter(col =>
      data.rows.every(row => (row.amounts[col.code] || 0) === 0)
    ).map(col => col.code)
    if (zeroCols.length > 0) {
      displayColumns = columns.filter(col => col.dataKey === "total" || !zeroCols.includes(col.dataKey as string))
    }
  }

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    head: [displayColumns.map(col => col.header)],
    body: tableRows.map(row => displayColumns.map(col => row[col.dataKey])),
    styles: {
      fontSize: 7,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    didParseCell: (hookData) => {
      const row = data.rows[hookData.row.index]
      if (row?.isSubtotal) {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.fillColor = [240, 245, 255]
      }
      if (row?.isGrandTotal) {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.fillColor = NAVY
        hookData.cell.styles.textColor = WHITE
      }
    },
  })

  // Footer
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(ML, PH - 14, PW - MR, PH - 14)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(`Generated by ${data.companyName}  ·  ${data.companyTagline}`, PW / 2, PH - 8, { align: "center" })

  return doc
}