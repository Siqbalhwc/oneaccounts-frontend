import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours ────────────────────────────────────────────────
const NAVY  = [7,   8,  91]  as [number,number,number]
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

// Simple section row definition
interface SectionRow {
  text: string       // e.g. "Cash & Bank" or "Fixed Assets" or "1000 – Cash"
  amount: number
  isHeader?: boolean // true for category headers
  indent?: number    // 0 for header, 10 for account
}

export interface BalanceSheetPDFData {
  companyName: string
  companyTagline: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  logoUrl?: string | null

  asOfDate: string
  // Assets
  currentAssetSections: SectionRow[]
  totalCurrentAssets: number
  fixedAssetSections: SectionRow[]
  totalFixedAssets: number
  totalAssets: number

  // Liabilities & Equity
  liabilitySections: SectionRow[]
  totalLiabilities: number
  equitySections: SectionRow[]
  netProfit: number        // retained earnings
  totalEquity: number
  totalLiabEquity: number
}

export async function generateBalanceSheetPDF(data: BalanceSheetPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const PW = 210, PH = 297
  const ML = 14, MR = 14
  const CW = PW - ML - MR
  const LEFT_X = ML
  const RIGHT_X = ML + CW / 2 + 4   // start of right column

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
  doc.text("BALANCE SHEET", PW - MR, LOGO_Y + 9, { align: "right" })

  // Single‑line date
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`As at: ${data.asOfDate}`, PW - MR, LOGO_Y + 16, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── Column headers ──────────────────────────────────────────────
  let Y = HEADER_H + 10
  const ROW_H = 6
  const colW = CW / 2 - 4   // width for each side

  // Left column header (navy)
  doc.setFillColor(...NAVY)
  doc.rect(LEFT_X, Y, colW, ROW_H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)
  doc.text("ASSETS", LEFT_X + 2, Y + ROW_H / 2 + 1.5)

  // Right column header (navy)
  doc.setFillColor(...NAVY)
  doc.rect(RIGHT_X, Y, colW, ROW_H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)
  doc.text("LIABILITIES & EQUITY", RIGHT_X + 2, Y + ROW_H / 2 + 1.5)
  Y += ROW_H + 2

  // ── Helper to draw a column ─────────────────────────────────────
  const drawColumn = (x: number, sections: SectionRow[], total: number, totalLabel: string) => {
    let currentY = Y
    // Draw each row
    sections.forEach(sec => {
      doc.setFont("helvetica", sec.isHeader ? "bold" : "normal")
      doc.setFontSize(sec.isHeader ? 8 : 7.5)
      doc.setTextColor(...DARK)
      const indent = sec.indent || (sec.isHeader ? 0 : 8)
      doc.text(sec.text, x + indent, currentY + 4)
      doc.text(pkr(sec.amount), x + colW - 2, currentY + 4, { align: "right" })
      currentY += ROW_H
    })
    // Total line
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.line(x, currentY, x + colW, currentY)
    currentY += 2
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text(totalLabel, x + 2, currentY + 4)
    doc.text(pkr(total), x + colW - 2, currentY + 4, { align: "right" })
    return currentY + ROW_H + 2
  }

  // Draw left column (Assets)
  let leftEndY = drawColumn(LEFT_X, data.currentAssetSections, data.totalCurrentAssets, "Total Current Assets")
  // Fixed assets sub-section (if any)
  if (data.fixedAssetSections.length > 0) {
    leftEndY = drawColumn(LEFT_X, data.fixedAssetSections, data.totalFixedAssets, "Total Fixed Assets") - 2
  }

  // Draw right column (Liabilities & Equity)
  let rightEndY = drawColumn(RIGHT_X, data.liabilitySections, data.totalLiabilities, "Total Liabilities")
  // Equity sub-section
  if (data.equitySections.length > 0) {
    rightEndY = drawColumn(RIGHT_X, data.equitySections, data.totalEquity, "Total Equity") - 2
  }

  // Move Y to the max of both columns
  Y = Math.max(leftEndY, rightEndY) + 4

  // ── Grand totals ─────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(LEFT_X, Y, CW, ROW_H + 2, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text("TOTAL ASSETS", LEFT_X + 2, Y + ROW_H / 2 + 1.5)
  doc.text(pkr(data.totalAssets), LEFT_X + colW - 2, Y + ROW_H / 2 + 1.5, { align: "right" })
  doc.text("TOTAL LIABILITIES + EQUITY", RIGHT_X + 2, Y + ROW_H / 2 + 1.5)
  doc.text(pkr(data.totalLiabEquity), RIGHT_X + colW - 2, Y + ROW_H / 2 + 1.5, { align: "right" })

  // ── Footer ───────────────────────────────────────────────────────
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