import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours ────────────────────────────────────────────────
const NAVY   = [7,8,91]  as [number,number,number]
const DARK   = [17,24,39]  as [number,number,number]
const MUTED  = [107,114,128]  as [number,number,number]
const BORDER = [229,231,235]  as [number,number,number]
const WHITE  = [255,255,255]  as [number,number,number]
const ROW_ALT = [248,249,252]  as [number,number,number]

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

export interface TrialBalanceRow {
  code: string
  name: string
  type: string
  category: string     // ✅ added
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

  // ── LOGO & COMPANY INFO ─────────────────────────────────────────
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
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 18
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // ── REPORT TITLE ─────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text("TRIAL BALANCE", PW - MR, LOGO_Y + 9, { align: "right" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`From: ${data.startDate}  To: ${data.endDate}`, PW - MR, LOGO_Y + 16, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── COLUMN WIDTHS – added Category column ────────────────────────
  const codeColW  = 12
  const typeColW  = 18
  const catColW   = 24
  const debitColW = 30
  const creditColW = 30
  const nameColW  = CW - codeColW - typeColW - catColW - debitColW - creditColW

  const ROW_HEIGHT = 6
  let Y = HEADER_H + 10
  const HEADER_ROW_H = ROW_HEIGHT

  doc.setFillColor(...NAVY)
  doc.rect(ML, Y, CW, HEADER_ROW_H, "F")

  const headerTextY = Y + HEADER_ROW_H / 2 + 1.5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)

  const codeX = ML + codeColW / 2
  const nameX = ML + codeColW + 2
  const typeX = ML + codeColW + nameColW + typeColW / 2
  const catX  = typeX + typeColW/2 + catColW/2
  const debitX  = catX + catColW/2 + debitColW/2
  const creditX = debitX + debitColW/2 + creditColW/2

  doc.text("Code", codeX, headerTextY, { align: "center" })
  doc.text("Account Name", nameX + 3, headerTextY, { align: "left" })
  doc.text("Type", typeX, headerTextY, { align: "center" })
  doc.text("Category", catX, headerTextY, { align: "center" })
  doc.text("Debit", debitX, headerTextY, { align: "center" })
  doc.text("Credit", creditX, headerTextY, { align: "center" })

  const tableStartY = Y + HEADER_ROW_H

  const tableRows: any[] = data.rows.map(row => [
    row.code,
    row.name,
    row.type,
    row.category || "",
    row.debit > 0 ? pkr(row.debit) : "",
    row.credit > 0 ? pkr(row.credit) : "",
  ])

  // Totals row
  tableRows.push([
    "",
    "Total",
    "",
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
      cellPadding: { top: 1, bottom: 1, left: 3, right: 3 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      minCellHeight: ROW_HEIGHT,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: codeColW, halign: "center" },
      1: { cellWidth: nameColW, halign: "left" },
      2: { cellWidth: typeColW, halign: "center" },
      3: { cellWidth: catColW, halign: "center" },
      4: { cellWidth: debitColW, halign: "right" },
      5: { cellWidth: creditColW, halign: "right" },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === tableRows.length - 1 && hookData.row.section === 'body') {
        hookData.cell.styles.fontStyle = 'bold'
        hookData.cell.styles.textColor = WHITE
        hookData.cell.styles.fillColor = NAVY
      }
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(ML, Y, CW, afterTable - Y, "S")

  // ── FOOTER ───────────────────────────────────────────────────────
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