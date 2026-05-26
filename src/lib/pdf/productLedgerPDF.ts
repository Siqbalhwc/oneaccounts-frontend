/**
 * productLedgerPDF.ts
 * Generates a professional Product Ledger report (landscape).
 */

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY   = [7,8,91] as [number,number,number]
const DARK   = [17,24,39] as [number,number,number]
const MUTED  = [107,114,128] as [number,number,number]
const BORDER = [229,231,235] as [number,number,number]
const WHITE  = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]

export interface ProductLedgerLine {
  date: string
  type: string
  invoice_no: string
  qty_in: number
  qty_out: number
  balance: number
  isOpening?: boolean
}

export interface ProductLedgerPDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null

  productName: string
  productCode: string
  startDate:   string
  endDate:     string

  totalInflow:  number
  totalOutflow: number
  closingBalance: number

  ledgerLines: ProductLedgerLine[]
}

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url); if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => resolve("")
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

function filledRect(doc: jsPDF, x: number, y: number, w: number, h: number, fillRgb: [number,number,number], radius = 0) {
  doc.setFillColor(...fillRgb)
  radius > 0 ? doc.roundedRect(x, y, w, h, radius, radius, "F") : doc.rect(x, y, w, h, "F")
}

export async function generateProductLedgerPDF(data: ProductLedgerPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14, CW = PW - ML - MR

  // ── HEADER ──
  const LOGO_SIZE = 16, LOGO_X = ML, LOGO_Y = 6
  let logoData = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) {
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }
  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML

  doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(14)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 18
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // Report title
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...NAVY)
  doc.text("PRODUCT LEDGER", PW - MR, LOGO_Y + 8, { align: "right" })

  const metaY = LOGO_Y + 18
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  doc.text(`Product: ${data.productCode} – ${data.productName}`, PW - MR, metaY, { align: "right" })
  doc.text(`Period: ${data.startDate} – ${data.endDate}`, PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER).setLineWidth(0.4).line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── LEDGER TABLE ──
  const tableY = HEADER_H + 8
  const HEADER_ROW_H = 8
  const HEADER_RADIUS = 3

  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY, HEADER_RADIUS)

  // Column widths
  const dateW = 28
  const typeW = 30
  const invW = 45
  const inflowW = 32
  const outflowW = 32
  const balanceW = 32
  const descW = CW - dateW - typeW - invW - inflowW - outflowW - balanceW

  const FONT_SIZE_HEADER = 8
  const headerTextY = tableY + HEADER_ROW_H / 2 + FONT_SIZE_HEADER * 0.35
  doc.setFont("helvetica", "bold").setFontSize(FONT_SIZE_HEADER).setTextColor(...WHITE)

  let colX = ML
  doc.text("Date", colX + 2, headerTextY)
  colX += dateW
  doc.text("Type", colX + 2, headerTextY)
  colX += typeW
  doc.text("Invoice #", colX + 2, headerTextY)
  colX += invW
  // Inflow & Outflow centered
  doc.text("Inflow", colX + inflowW / 2, headerTextY, { align: "center" })
  colX += inflowW
  doc.text("Outflow", colX + outflowW / 2, headerTextY, { align: "center" })
  colX += outflowW
  doc.text("Balance", colX + balanceW / 2, headerTextY, { align: "center" })

  const bodyStartY = tableY + HEADER_ROW_H

  const tableColumns = [
    { header: "Date",      dataKey: "date"      },
    { header: "Type",      dataKey: "type"      },
    { header: "Invoice #", dataKey: "invoice_no" },
    { header: "Inflow",    dataKey: "qty_in"    },
    { header: "Outflow",   dataKey: "qty_out"   },
    { header: "Balance",   dataKey: "balance"   },
  ]

  const tableRows = data.ledgerLines.map(line => ({
    date:       line.isOpening ? "" : line.date,
    type:       line.type,
    invoice_no: line.invoice_no,
    qty_in:     line.qty_in  > 0 ? line.qty_in.toLocaleString()  : "-",
    qty_out:    line.qty_out > 0 ? line.qty_out.toLocaleString() : "-",
    balance:    line.balance === 0 ? "-" : line.balance.toLocaleString(),
  }))

  autoTable(doc, {
    startY: bodyStartY,
    margin: { left: ML, right: MR },
    columns: tableColumns,
    body: tableRows,
    showHead: false,
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      minCellHeight: 8,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      date:       { cellWidth: dateW, halign: "left" },
      type:       { cellWidth: typeW, halign: "left" },
      invoice_no: { cellWidth: invW, halign: "left" },
      qty_in:     { cellWidth: inflowW, halign: "right" },
      qty_out:    { cellWidth: outflowW, halign: "right" },
      balance:    { cellWidth: balanceW, halign: "right", fontStyle: "bold" },
    },
    didDrawCell(hookData) {
      const rowData = (hookData.row.raw as any)
      if (hookData.section === "body" && rowData && rowData.isOpening) {
        doc.setFillColor(245, 245, 245)
        doc.rect(hookData.cell.x, hookData.cell.y, hookData.cell.width, hookData.cell.height, "F")
      }
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // Rounded border around table
  const TABLE_RADIUS = 4
  const cornerSize = TABLE_RADIUS + 1
  doc.setFillColor(...WHITE)
  doc.rect(ML,                       afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.rect(ML + CW - cornerSize,     afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.setDrawColor(...BORDER).setLineWidth(0.3)
  doc.roundedRect(ML, bodyStartY, CW, afterTable - bodyStartY, TABLE_RADIUS, TABLE_RADIUS, "S")

  // ── SUMMARY TOTALS ──
  let SY = afterTable + 8
  const sumX = PW - MR - 80
  const valX = PW - MR

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...DARK)
  doc.text("Total Inflow", sumX, SY)
  doc.text(data.totalInflow.toLocaleString(), valX, SY, { align: "right" })
  SY += 5.5

  doc.text("Total Outflow", sumX, SY)
  doc.text(data.totalOutflow.toLocaleString(), valX, SY, { align: "right" })
  SY += 5.5

  const TOTAL_RADIUS = 4
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, TOTAL_RADIUS)
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...WHITE)
  doc.text("Closing Balance", sumX + 2, SY + 1.5)
  doc.text(data.closingBalance.toLocaleString(), valX - 2, SY + 1.5, { align: "right" })
  SY += 10

  // ── FOOTER ──
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 12, PW - MR, PH - 12)
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  const footerParts = ["Generated by OneAccounts", data.companyName, new Date().toLocaleDateString()].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 6, { align: "center" })

  return doc
}