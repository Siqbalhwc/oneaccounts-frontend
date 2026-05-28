import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours (same as invoice) ────────────────────────────────
const NAVY  = [7,   8,  91]  as [number,number,number]
const RED   = [220, 38,  38]  as [number,number,number]
const AMBER = [245,158,  11]  as [number,number,number]
const DARK  = [17,  24,  39]  as [number,number,number]
const MUTED = [107,114, 128]  as [number,number,number]
const BORDER = [229,231, 235]  as [number,number,number]
const WHITE = [255,255, 255]  as [number,number,number]
const ROW_ALT = [248,249, 252]  as [number,number,number]

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
  } catch {
    return null
  }
}

const pkr = (n: number) =>
  "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function filledRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  fillRgb: [number,number,number],
  radius = 0,
) {
  doc.setFillColor(...fillRgb)
  radius > 0
    ? doc.roundedRect(x, y, w, h, radius, radius, "F")
    : doc.rect(x, y, w, h, "F")
}

export interface TrialBalanceRow {
  code: string
  name: string
  type: string
  debit: number
  credit: number
}

export interface TrialBalancePDFData {
  companyName: string
  companyTagline: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  logoUrl?: string | null

  startDate: string
  endDate: string
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
}

export async function generateTrialBalancePDF(data: TrialBalancePDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const PW = 210
  const PH = 297
  const ML = 14
  const MR = 14
  const CW = PW - ML - MR

  // ── LOGO ──────────────────────────────────────────────────────────
  const LOGO_SIZE = 18
  const LOGO_X = ML
  const LOGO_Y = 6
  let logoData: string | null = null
  if (data.logoUrl) {
    logoData = await loadImage(data.logoUrl)
  }
  if (logoData) {
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML
  // Company name
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  // Tagline
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  // Optional address / contact
  let infoY = LOGO_Y + 18
  if (data.companyAddress) {
    doc.text(data.companyAddress, textX, infoY)
    infoY += 4
  }
  if (data.companyPhone) {
    doc.text("Phone: " + data.companyPhone, textX, infoY)
    infoY += 4
  }
  if (data.companyEmail) {
    doc.text("Email: " + data.companyEmail, textX, infoY)
  }

  // ── REPORT TITLE ───────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text("TRIAL BALANCE", PW - MR, LOGO_Y + 9, { align: "right" })

  // Date range – now on one line
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`From: ${data.startDate}  To: ${data.endDate}`, PW - MR, LOGO_Y + 16, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── TABLE HEADER (dark background) ─────────────────────────────────
  let Y = HEADER_H + 10   // slightly more space after removing summary
  const HEADER_ROW_H = 10
  const HEADER_RADIUS = 4

  filledRect(doc, ML, Y, CW, HEADER_ROW_H, NAVY, HEADER_RADIUS)

  // Column widths (same as before)
  const codeColW = 14
  const typeColW = 16
  const debitColW = 32
  const creditColW = 34
  const nameColW = CW - codeColW - typeColW - debitColW - creditColW - (8+2) // gap

  const descColX = ML + codeColW + 2   // start of name column
  const textY = Y + HEADER_ROW_H / 2 + 1.5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)

  doc.text("Code", ML + codeColW / 2, textY, { align: "center" })
  doc.text("Account Name", descColX + 3, textY, { align: "left" })
  doc.text("Type", descColX + nameColW + typeColW / 2, textY, { align: "center" })
  doc.text("Debit", descColX + nameColW + typeColW + debitColW / 2, textY, { align: "center" })
  doc.text("Credit", descColX + nameColW + typeColW + debitColW + creditColW / 2, textY, { align: "center" })

  // ── TABLE BODY including totals row ────────────────────────────────
  const tableStartY = Y + HEADER_ROW_H

  const tableRows: any[] = data.rows.map(row => [
    row.code,
    row.name,
    row.type,
    row.debit > 0 ? pkr(row.debit) : "",
    row.credit > 0 ? pkr(row.credit) : "",
  ])

  // Totals row as last row
  tableRows.push([
    "",
    "Total",
    "",
    pkr(data.totalDebit),
    pkr(data.totalCredit),
  ])

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: ML, right: MR },
    body: tableRows,
    showHead: false,
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: codeColW, halign: "center" },
      1: { cellWidth: nameColW, halign: "left" },
      2: { cellWidth: typeColW, halign: "center" },
      3: { cellWidth: debitColW, halign: "right" },
      4: { cellWidth: creditColW, halign: "right" },
    },
    // Bold and gray background for the totals row (last row)
    didParseCell: (hookData) => {
      if (hookData.row.index === tableRows.length - 1 && hookData.row.section === 'body') {
        hookData.cell.styles.fontStyle = 'bold'
        hookData.cell.styles.fillColor = [240, 240, 245]  // light gray
      }
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // Rounded border for table
  const TABLE_RADIUS = 4
  const cornerSize = TABLE_RADIUS + 1
  doc.setFillColor(...WHITE)
  doc.rect(ML, afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.rect(ML + CW - cornerSize, afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(ML, tableStartY, CW, afterTable - tableStartY, TABLE_RADIUS, TABLE_RADIUS, "S")

  // ── FOOTER ─────────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, PH - 16, PW - MR, PH - 16)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const footerParts = ["Generated by " + data.companyName, data.companyTagline].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}