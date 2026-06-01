import jsPDF from "jspdf"

// ─── Brand colours ────────────────────────────────────────────────
const NAVY    = [7,   8,  91]  as [number,number,number]
const DARK    = [17,  24,  39]  as [number,number,number]
const MUTED   = [107,114,128]  as [number,number,number]
const BORDER  = [229,231,235]  as [number,number,number]
const WHITE   = [255,255,255]  as [number,number,number]
const LIGHT_BG= [245,246,250]  as [number,number,number]
const NAVY_LIGHT=[230,231,245]  as [number,number,number]

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

export interface SectionRow {
  text: string
  amount: number
  isHeader?: boolean
  indent?: number
  isSubtotal?: boolean
}

export interface BalanceSheetPDFData {
  companyName: string
  companyTagline: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  logoUrl?: string | null

  asOfDate: string
  currentAssetSections: SectionRow[]
  totalCurrentAssets: number
  fixedAssetSections: SectionRow[]
  totalFixedAssets: number
  totalAssets: number

  currentLiabilitySections?: SectionRow[]
  totalCurrentLiabilities?: number
  liabilitySections: SectionRow[]
  totalLiabilities: number
  equitySections: SectionRow[]
  netProfit: number
  totalEquity: number
  totalLiabEquity: number
}

export async function generateBalanceSheetPDF(data: BalanceSheetPDFData): Promise<jsPDF> {
  // ── Landscape A4 ─────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW  = 297
  const PH  = 210
  const ML  = 14
  const MR  = 14
  const CW  = PW - ML - MR
  const GAP = 8                         // gap between the two columns
  const colW = (CW - GAP) / 2          // each column width
  const LEFT_X  = ML
  const RIGHT_X = ML + colW + GAP
  const ROW_H   = 6.2                  // row height

  // ── LOGO & COMPANY INFO ─────────────────────────────────────────
  const LOGO_SIZE = 20
  const LOGO_X    = ML
  const LOGO_Y    = 7
  let logoData: string | null = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)

  if (logoData) {
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

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

  // ── REPORT TITLE (right-aligned) ─────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(28)
  doc.setTextColor(...NAVY)
  doc.text("BALANCE SHEET", PW - MR, LOGO_Y + 10, { align: "right" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`As at: ${data.asOfDate}`, PW - MR, LOGO_Y + 18, { align: "right" })

  // ── Divider under header ──────────────────────────────────────────
  const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

  // ── Column header bars ────────────────────────────────────────────
  let Y = HEADER_BOTTOM + 5
  const COL_HDR_H = 7

  doc.setFillColor(...NAVY)
  doc.rect(LEFT_X,  Y, colW, COL_HDR_H, "F")
  doc.rect(RIGHT_X, Y, colW, COL_HDR_H, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(...WHITE)
  doc.text("ASSETS",                   LEFT_X  + 3, Y + COL_HDR_H / 2 + 1.8)
  doc.text("Amount",                   LEFT_X  + colW - 3, Y + COL_HDR_H / 2 + 1.8, { align: "right" })
  doc.text("LIABILITIES & EQUITY",     RIGHT_X + 3, Y + COL_HDR_H / 2 + 1.8)
  doc.text("Amount",                   RIGHT_X + colW - 3, Y + COL_HDR_H / 2 + 1.8, { align: "right" })

  Y += COL_HDR_H + 1

  // ── Draw helpers ──────────────────────────────────────────────────
  const drawSection = (
    x: number,
    label: string,
    amount: number,
    rows: SectionRow[],
    startY: number,
    isAlternate: boolean
  ): number => {
    let cy = startY

    // Section header row (light navy background)
    if (isAlternate) {
      doc.setFillColor(...NAVY_LIGHT)
      doc.rect(x, cy, colW, ROW_H, "F")
    }
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text(label,       x + 3,       cy + ROW_H / 2 + 1.5)
    doc.text(pkr(amount), x + colW - 3, cy + ROW_H / 2 + 1.5, { align: "right" })
    cy += ROW_H

    // Account rows
    rows.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(...LIGHT_BG)
        doc.rect(x, cy, colW, ROW_H, "F")
      }
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(...DARK)
      doc.text(row.text,      x + (row.indent ?? 10), cy + ROW_H / 2 + 1.5)
      doc.text(pkr(row.amount), x + colW - 3,         cy + ROW_H / 2 + 1.5, { align: "right" })
      cy += ROW_H
    })

    return cy
  }

  const drawSubtotal = (
    x: number,
    label: string,
    amount: number,
    startY: number
  ): number => {
    // thin rule above
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.line(x, startY, x + colW, startY)

    doc.setFillColor(220, 222, 240)   // pale navy tint
    doc.rect(x, startY, colW, ROW_H, "F")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text(label,       x + 3,       startY + ROW_H / 2 + 1.5)
    doc.text(pkr(amount), x + colW - 3, startY + ROW_H / 2 + 1.5, { align: "right" })

    return startY + ROW_H + 2
  }

  // ── LEFT COLUMN — Assets ─────────────────────────────────────────
  interface ColSection { label: string; amount: number; rows: SectionRow[] }

  const groupSections = (flatRows: SectionRow[]): ColSection[] => {
    const groups: ColSection[] = []
    let current: ColSection | null = null
    flatRows.forEach(r => {
      if (r.isHeader) {
        if (current) groups.push(current)
        current = { label: r.text, amount: r.amount, rows: [] }
      } else if (current) {
        current.rows.push(r)
      }
    })
    if (current) groups.push(current)
    return groups
  }

  let leftY  = Y
  let rightY = Y

  // ── Current Assets ───────────────────────────────────────────────
  const currentAssetGroups = groupSections(data.currentAssetSections)
  currentAssetGroups.forEach((g, i) => {
    leftY = drawSection(LEFT_X, g.label, g.amount, g.rows, leftY, i % 2 === 1)
  })
  leftY = drawSubtotal(LEFT_X, "Total Current Assets", data.totalCurrentAssets, leftY)

  // ── Fixed Assets ────────────────────────────────────────────────
  if (data.fixedAssetSections.length > 0) {
    const fixedGroups = groupSections(data.fixedAssetSections)
    fixedGroups.forEach((g, i) => {
      leftY = drawSection(LEFT_X, g.label, g.amount, g.rows, leftY, i % 2 === 0)
    })
    leftY = drawSubtotal(LEFT_X, "Total Fixed Assets", data.totalFixedAssets, leftY)
  }

  // ── RIGHT COLUMN — Liabilities ───────────────────────────────────
  const liabGroups = groupSections(data.liabilitySections)
  liabGroups.forEach((g, i) => {
    rightY = drawSection(RIGHT_X, g.label, g.amount, g.rows, rightY, i % 2 === 1)
  })
  rightY = drawSubtotal(RIGHT_X, "Total Liabilities", data.totalLiabilities, rightY)

  // ── RIGHT COLUMN — Equity ────────────────────────────────────────
  if (data.equitySections.length > 0) {
    const equityGroups = groupSections(data.equitySections)
    equityGroups.forEach((g, i) => {
      rightY = drawSection(RIGHT_X, g.label, g.amount, g.rows, rightY, i % 2 === 0)
    })
    rightY = drawSubtotal(RIGHT_X, "Total Equity", data.totalEquity, rightY)
  }

  // ── Grand Total Bar ───────────────────────────────────────────────
  const GRAND_Y = Math.max(leftY, rightY) + 3
  const GRAND_H = 8

  doc.setFillColor(...NAVY)
  doc.rect(LEFT_X,  GRAND_Y, colW, GRAND_H, "F")
  doc.rect(RIGHT_X, GRAND_Y, colW, GRAND_H, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)

  // Left grand total
  doc.text("TOTAL ASSETS",               LEFT_X  + 3,       GRAND_Y + GRAND_H / 2 + 1.8)
  doc.text(pkr(data.totalAssets),        LEFT_X  + colW - 3, GRAND_Y + GRAND_H / 2 + 1.8, { align: "right" })

  // Right grand total
  doc.text("TOTAL LIABILITIES + EQUITY", RIGHT_X + 3,       GRAND_Y + GRAND_H / 2 + 1.8)
  doc.text(pkr(data.totalLiabEquity),    RIGHT_X + colW - 3, GRAND_Y + GRAND_H / 2 + 1.8, { align: "right" })

  // ── Footer ───────────────────────────────────────────────────────
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(ML, PH - 14, PW - MR, PH - 14)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  const footerParts = [
    "Generated by " + (data.companyName || ""),
    data.companyTagline || ""
  ].filter(Boolean)
  doc.text(footerParts.join("  ·  "), PW / 2, PH - 8, { align: "center" })

  return doc
}