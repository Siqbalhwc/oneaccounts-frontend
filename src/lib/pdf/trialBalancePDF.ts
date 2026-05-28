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

  // Date range
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`From: ${data.startDate}`, PW - MR, LOGO_Y + 16, { align: "right" })
  doc.text(`To:   ${data.endDate}`, PW - MR, LOGO_Y + 21, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── SUMMARY BOX ────────────────────────────────────────────────────
  let Y = HEADER_H + 7
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text("Summary", ML, Y)
  Y += 6

  const summaryData = [
    ["Total Debits",  pkr(data.totalDebit)],
    ["Total Credits", pkr(data.totalCredit)],
    ["Status",        data.isBalanced ? "Balanced" : "Imbalance"],
  ]

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    body: summaryData,
    showHead: false,
    styles: {
      fontSize: 9,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40, fillColor: [248, 249, 252] },
      1: { halign: "right", cellWidth: "auto" },
    },
  })

  Y = (doc as any).lastAutoTable.finalY + 5

  // ── TABLE HEADER (dark background) ─────────────────────────────────
  const HEADER_ROW_H = 10
  const HEADER_RADIUS = 4

  filledRect(doc, ML, Y, CW, HEADER_ROW_H, NAVY, HEADER_RADIUS)

  const descColX = ML + 14 + 8 + 2   // same logic as invoice table
  const descColW = CW - (14 + 8 + 2) - (16 + 32 + 34 + 4)  // adjust for trial columns

  const textY = Y + HEADER_ROW_H / 2 + 1.5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)

  doc.text("Code", ML + 14 + 8 / 2, textY, { align: "center" })
  doc.text("Account Name", descColX + 3, textY, { align: "left" })
  doc.text("Type", descColX + descColW + 16 / 2, textY, { align: "center" })
  doc.text("Debit", descColX + descColW + 16 + 32 / 2, textY, { align: "center" })
  doc.text("Credit", descColX + descColW + 16 + 32 + 34 / 2, textY, { align: "center" })

  // ── TABLE BODY ─────────────────────────────────────────────────────
  const tableStartY = Y + HEADER_ROW_H

  const tableRows = data.rows.map(row => [
    row.code,
    row.name,
    row.type,
    row.debit > 0 ? pkr(row.debit) : "",
    row.credit > 0 ? pkr(row.credit) : "",
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
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: "auto", halign: "left" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
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