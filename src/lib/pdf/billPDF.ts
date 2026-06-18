/**
 * billPDF.ts
 * Generates a purchase bill PDF using the same square‑edged format as invoices.
 */

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY   = [7,8,91] as [number,number,number]
const RED    = [220,38,38] as [number,number,number]
const AMBER  = [245,158,11] as [number,number,number]
const DARK   = [17,24,39] as [number,number,number]
const MUTED  = [107,114,128] as [number,number,number]
const BORDER = [229,231,235] as [number,number,number]
const WHITE  = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]

export interface BillItem {
  description:  string
  qty:          number
  unit_price:   number
  total:        number
  image_path?:  string | null
  product_id?:  string | null
  product_name?:string
}

export interface BillPDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null

  billNo:    string
  date:      string
  dueDate:   string

  supplierName:    string
  supplierAddress: string
  supplierPhone:   string
  supplierEmail?:  string

  paymentTerms?:  string | null   // ✅ new field

  notes?:         string | null
  status:         string
  items:          BillItem[]
  subtotal:       number
  total:          number
  paid:           number
  balanceDue:     number

  // WHT fields
  whtRate?:       number
  whtAmount?:     number
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

const pkr = (n: number) => "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function filledRect(doc: jsPDF, x: number, y: number, w: number, h: number, fillRgb: [number,number,number]) {
  doc.setFillColor(...fillRgb)
  doc.rect(x, y, w, h, "F")   // always square
}

export async function generateBillPDF(data: BillPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR

  const LOGO_SIZE = 18, LOGO_X = ML, LOGO_Y = 6
  let logoData = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)

  if (logoData) {
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML
  doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(13)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

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

  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(...NAVY)
  doc.text("BILL", PW - MR, LOGO_Y + 9, { align: "right" })

  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  doc.text("Bill No:", PW - MR - 36, metaY)
  doc.text("Date:",    PW - MR - 36, metaY + 5)
  doc.setFont("helvetica", "bold").setTextColor(...DARK)
  doc.text(data.billNo, PW - MR, metaY,     { align: "right" })
  doc.text(data.date,   PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER).setLineWidth(0.4).line(ML, HEADER_H, PW - MR, HEADER_H)

  // Supplier info
  let Y = HEADER_H + 7
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("SUPPLIER",  ML,      Y)
  doc.text("AMOUNT DUE", PW - MR, Y, { align: "right" })
  Y += 5
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...DARK)
  doc.text(data.supplierName || "", ML, Y)
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...AMBER)
  doc.text(pkr(data.balanceDue), PW - MR, Y, { align: "right" })
  Y += 5

  const phone = (data.supplierPhone ?? "").trim()
  if (phone) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); doc.text("- " + phone, ML, Y); Y += 4.5 }
  const address = (data.supplierAddress ?? "").trim()
  if (address) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); const addrLines = doc.splitTextToSize("- " + address, CW * 0.55); doc.text(addrLines, ML, Y); Y += addrLines.length * 4.5 }
  const email = (data.supplierEmail ?? "").trim()
  if (email) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); doc.text("- " + email, ML, Y); Y += 4.5 }

  const statusText = (data.status || "Unpaid").toUpperCase()
  const isUnpaid = ["UNPAID", "OVERDUE"].includes(statusText)
  const isPaid   = statusText === "PAID"
  const badgeColor: [number,number,number] = isPaid ? [5,150,105] : isUnpaid ? RED : AMBER

  const statusLabelY = HEADER_H + 7 + 5 + 5
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })
  const badgeW = 22, badgeH = 6, badgeX = PW - MR - badgeW, badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor)   // square
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, divY, PW - MR, divY)

  // ── TABLE HEADER (square, thin, with white separators) ──────────
  const tableY = divY + 4
  const ROW_H = 6
  const HEADER_ROW_H = ROW_H

  // Column widths
  const COL_NUM_W  = 14
  const COL_QTY_W  = 16
  const COL_PRICE_W = 32
  const COL_AMT_W  = 34
  const COL_DESC_W = CW - COL_NUM_W - COL_QTY_W - COL_PRICE_W - COL_AMT_W

  // Navy background
  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY)

  // White vertical separators
  doc.setDrawColor(...WHITE)
  doc.setLineWidth(0.2)
  let x = ML + COL_NUM_W
  doc.line(x, tableY, x, tableY + HEADER_ROW_H)
  x += COL_DESC_W
  doc.line(x, tableY, x, tableY + HEADER_ROW_H)
  x += COL_QTY_W
  doc.line(x, tableY, x, tableY + HEADER_ROW_H)
  x += COL_PRICE_W
  doc.line(x, tableY, x, tableY + HEADER_ROW_H)

  // Header text
  const headerTextY = tableY + HEADER_ROW_H / 2 + 1.5
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...WHITE)

  const centerX1 = ML + COL_NUM_W / 2
  const leftX2   = ML + COL_NUM_W + 2
  const centerX3 = ML + COL_NUM_W + COL_DESC_W + COL_QTY_W / 2
  const centerX4 = ML + COL_NUM_W + COL_DESC_W + COL_QTY_W + COL_PRICE_W / 2
  const centerX5 = ML + COL_NUM_W + COL_DESC_W + COL_QTY_W + COL_PRICE_W + COL_AMT_W / 2

  doc.text("#",          centerX1, headerTextY, { align: "center" })
  doc.text("Description", leftX2,   headerTextY, { align: "left" })
  doc.text("Qty",        centerX3, headerTextY, { align: "center" })
  doc.text("Unit Price", centerX4, headerTextY, { align: "center" })
  doc.text("Amount",     centerX5, headerTextY, { align: "center" })

  // ── TABLE BODY ───────────────────────────────────────────────────
  const bodyStartY = tableY + HEADER_ROW_H

  const tableRows = data.items.map((item, i) => [
    i + 1,
    item.description || "",
    item.qty || 1,
    pkr(item.unit_price || 0),
    pkr(item.total || 0),
  ])

  autoTable(doc, {
    startY: bodyStartY,
    margin: { left: ML, right: MR },
    body: tableRows,
    showHead: false,
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      minCellHeight: ROW_H,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: COL_NUM_W,  halign: "center" },
      1: { cellWidth: COL_DESC_W, halign: "left" },
      2: { cellWidth: COL_QTY_W,  halign: "center" },
      3: { cellWidth: COL_PRICE_W, halign: "right" },
      4: { cellWidth: COL_AMT_W,  halign: "right", fontStyle: "bold" },
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // ── Square border around table body ─────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(ML, bodyStartY, CW, afterTable - bodyStartY, "S")

  // ── SUBTOTAL / TAX / TOTAL (square) ─────────────────────────────
  let SY = afterTable + 6
  const sumX = PW - MR - 70, valX = PW - MR
  const TOTAL_H = ROW_H

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
  doc.text("Subtotal", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(data.subtotal), valX, SY, { align: "right" })
  SY += 5.5

  // If WHT exists, show it and then "Net Payable" total
  if (data.whtAmount && data.whtAmount > 0) {
    // WHT row
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...MUTED)
    const whtLabel = `WHT (${data.whtRate || 0}%)`
    doc.text(whtLabel, sumX, SY)
    doc.setTextColor(...DARK)
    doc.text("- " + pkr(data.whtAmount), valX, SY, { align: "right" })
    SY += 5.5

    // Net Payable box
    filledRect(doc, sumX - 2, SY - 3, valX - sumX + 4, TOTAL_H, NAVY)
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...WHITE)
    doc.text("Net Payable", sumX + 2, SY + TOTAL_H / 2 - 0.5)
    const netPayable = data.total - data.whtAmount
    doc.text(pkr(netPayable), valX - 2, SY + TOTAL_H / 2 - 0.5, { align: "right" })
    SY += TOTAL_H + 2
  } else {
    // Original tax row (no tax)
    doc.setFont("helvetica", "bold").setTextColor(...MUTED)
    doc.text("Tax (0%)", sumX, SY)
    doc.setTextColor(...DARK)
    doc.text(pkr(0), valX, SY, { align: "right" })
    SY += 5.5

    // Total box
    filledRect(doc, sumX - 2, SY - 3, valX - sumX + 4, TOTAL_H, NAVY)
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...WHITE)
    doc.text("Total", sumX + 2, SY + TOTAL_H / 2 - 0.5)
    doc.text(pkr(data.total), valX - 2, SY + TOTAL_H / 2 - 0.5, { align: "right" })
    SY += TOTAL_H + 2
  }

  if (data.paid > 0) {
    SY += 2
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
    doc.text("Amount Paid", sumX, SY)
    doc.setTextColor(16, 185, 129)
    doc.text("- " + pkr(data.paid), valX, SY, { align: "right" })
    SY += 5.5
    doc.setFont("helvetica", "bold").setTextColor(...RED)
    doc.text("Balance Due", sumX, SY)
    doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
    SY += 5
  }

  // ── NOTES & TERMS (actual payment terms) ────────────────────────
  SY += 6
  const terms = data.paymentTerms || "Payment is due within 30 days of bill date."
  const termsLines: string[] = [terms]
  if (data.notes) termsLines.push(data.notes)

  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("NOTES & TERMS", ML, SY)
  SY += 4
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...DARK)
  const noteLines = doc.splitTextToSize(termsLines.join("\n"), CW)
  doc.text(noteLines, ML, SY)

  // ── FOOTER ───────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 16, PW - MR, PH - 16)
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  const footerParts = ["Thank you for your business!", data.companyName, data.companyTagline].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}