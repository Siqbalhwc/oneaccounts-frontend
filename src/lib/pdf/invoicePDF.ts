import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours ────────────────────────────────────────────────
const NAVY     = [7,   8,  91]  as [number,number,number]
const RED      = [220, 38,  38]  as [number,number,number]
const AMBER    = [245,158,  11]  as [number,number,number]
const DARK     = [17,  24,  39]  as [number,number,number]
const MUTED    = [107,114, 128]  as [number,number,number]
const BORDER   = [229,231, 235]  as [number,number,number]
const WHITE    = [255,255, 255]  as [number,number,number]
const ROW_ALT  = [248,249, 252]  as [number,number,number]

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
) {
  doc.setFillColor(...fillRgb)
  doc.rect(x, y, w, h, "F")
}

export interface InvoiceItem {
  description:   string
  qty:           number
  unit_price:    number
  total:         number
  image_path?:   string | null
  product_id?:   string | null
  product_name?: string
}

export interface InvoicePDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null
  businessType?:  string

  invoiceNo:  string
  date:       string
  dueDate:    string

  customerName:    string
  customerAddress: string
  customerPhone:   string
  customerEmail?:  string

  paymentTerms?: string | null
  notes?:       string | null
  createdBy?:   string | null

  status:     string
  items:      InvoiceItem[]
  subtotal:   number
  total:      number
  paid:       number
  balanceDue: number

  reference?: string
}

export async function generateInvoicePDF(data: InvoicePDFData): Promise<jsPDF> {
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
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)

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

  // ── Prepared by ─────────────────────────────────────────────────
  if (data.createdBy) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text("Prepared by: " + data.createdBy, ML, infoY + 4)
  }

  // ── REPORT TITLE ─────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text("INVOICE", PW - MR, LOGO_Y + 9, { align: "right" })

  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text("Invoice No:", PW - MR - 36, metaY)
  doc.text("Date:",       PW - MR - 36, metaY + 5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK)
  doc.text(data.invoiceNo, PW - MR, metaY,     { align: "right" })
  doc.text(data.date,      PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── BILL TO / AMOUNT DUE ────────────────────────────────────────
  let Y = HEADER_H + 7

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("BILL TO",    ML,        Y)
  doc.text("AMOUNT DUE", PW - MR,   Y, { align: "right" })

  Y += 5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...DARK)
  doc.text(data.customerName || "", ML, Y)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...AMBER)
  doc.text(pkr(data.balanceDue), PW - MR, Y, { align: "right" })

  Y += 5

  const phone = (data.customerPhone ?? "").trim()
  if (phone) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("- " + phone, ML, Y)
    Y += 4.5
  }

  const address = (data.customerAddress ?? "").trim()
  if (address) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const addrLines = doc.splitTextToSize("- " + address, CW * 0.55)
    doc.text(addrLines, ML, Y)
    Y += addrLines.length * 4.5
  }

  const email = (data.customerEmail ?? "").trim()
  if (email) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("- " + email, ML, Y)
    Y += 4.5
  }

  const statusText = (data.status || "Unpaid").toUpperCase()
  const isUnpaid   = ["UNPAID", "OVERDUE"].includes(statusText)
  const isPaid     = statusText === "PAID"
  const badgeColor: [number,number,number] = isPaid
    ? [5, 150, 105] : isUnpaid ? RED : AMBER

  const statusLabelY = HEADER_H + 7 + 5 + 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })

  const badgeW = 22
  const badgeH = 6
  const badgeX = PW - MR - badgeW
  const badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, divY, PW - MR, divY)

  // ── THINNER TABLE HEADER (6 mm) with white separators ───────────
  const tableY = divY + 4
  const ROW_H = 6
  const HEADER_ROW_H = ROW_H

  // Column widths (same as before)
  const codeColW = 14
  const nameColW = CW - codeColW - 16 - 32 - 34 - (8+2)  // approximate
  const qtyColW = 16
  const priceColW = 32
  const amtColW = 34

  // Draw navy background
  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY)

  // White vertical separators between columns
  doc.setDrawColor(...WHITE)
  doc.setLineWidth(0.2)
  let sepX = ML + codeColW
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)

  sepX += nameColW
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)

  sepX += qtyColW
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)

  sepX += priceColW
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)

  // Header text
  const headerTextY = tableY + HEADER_ROW_H / 2 + 1.5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)

  // Column positions (approximate)
  const col1X = ML + codeColW / 2
  const col2X = ML + codeColW + 3
  const col3X = ML + codeColW + nameColW + qtyColW / 2
  const col4X = ML + codeColW + nameColW + qtyColW + priceColW / 2
  const col5X = ML + codeColW + nameColW + qtyColW + priceColW + amtColW / 2

  doc.text("#",        col1X, headerTextY, { align: "center" })
  doc.text("Description", col2X, headerTextY, { align: "left" })
  doc.text("Qty",      col3X, headerTextY, { align: "center" })
  doc.text("Unit Price", col4X, headerTextY, { align: "center" })
  doc.text("Amount",   col5X, headerTextY, { align: "center" })

  // ── TABLE BODY ───────────────────────────────────────────────────
  const bodyStartY = tableY + HEADER_ROW_H

  const tableRows = data.items.map((item, i) => {
    const productIdStr = String(item.product_id ?? "")
    let namepart = ""
    if (item.product_name) namepart = ` - ${item.product_name}`
    let desc = ""
    if (productIdStr) {
      desc = `${productIdStr}${namepart}`
      const extra = (item.description ?? "").trim()
      const isDuplicate =
        extra === "" ||
        extra === (item.product_name?.trim() || "") ||
        extra === productIdStr.trim() ||
        extra === `${productIdStr}${namepart}`.trim()
      if (!isDuplicate) desc += "\n" + extra
    } else {
      desc = (item.description ?? "").trim()
    }

    return [
      i + 1,
      desc,
      item.qty.toString(),
      pkr(item.unit_price),
      pkr(item.total),
    ]
  })

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
      0: { cellWidth: codeColW, halign: "center" },
      1: { cellWidth: nameColW, halign: "left" },
      2: { cellWidth: qtyColW, halign: "center" },
      3: { cellWidth: priceColW, halign: "right" },
      4: { cellWidth: amtColW, halign: "right", fontStyle: "bold" },
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // ── Square border around table body ─────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(ML, bodyStartY, CW, afterTable - bodyStartY, "S")

  // ── SUBTOTAL / TAX / TOTAL (square box) ─────────────────────────
  let SY = afterTable + 6

  const sumX = PW - MR - 70
  const valX = PW - MR

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text("Subtotal", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(data.subtotal), valX, SY, { align: "right" })
  SY += 5.5

  doc.setFont("helvetica", "bold")
  doc.setTextColor(...MUTED)
  doc.text("Tax (0%)", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(0), valX, SY, { align: "right" })
  SY += 5.5

  // Square total box
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text("Total", sumX + 2, SY + 1.5)
  doc.text(pkr(data.total), valX - 2, SY + 1.5, { align: "right" })
  SY += 10

  if (data.paid > 0) {
    SY += 2
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Amount Paid", sumX, SY)
    doc.setTextColor(16, 185, 129)
    doc.text("- " + pkr(data.paid), valX, SY, { align: "right" })
    SY += 5.5

    doc.setFont("helvetica", "bold")
    doc.setTextColor(...RED)
    doc.text("Balance Due", sumX, SY)
    doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
    SY += 5
  }

  // ── NOTES & TERMS ───────────────────────────────────────────────
  SY += 6

  const terms = data.paymentTerms || "Payment is due within 30 days of invoice date."
  const termsLines: string[] = [terms]
  if (data.notes) termsLines.push(data.notes)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("NOTES & TERMS", ML, SY)
  SY += 4

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...DARK)
  const noteLines = doc.splitTextToSize(termsLines.join("\n"), CW)
  doc.text(noteLines, ML, SY)

  // ── FOOTER ───────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, PH - 16, PW - MR, PH - 16)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const footerParts = ["Thank you for your business!", data.companyName, data.companyTagline].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}