import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours (same as invoice) ────────────────────────────────
const NAVY     = [7,   8,  91]  as [number,number,number]
const RED      = [220, 38,  38]  as [number,number,number]
const AMBER    = [245,158,  11]  as [number,number,number]
const DARK     = [17,  24,  39]  as [number,number,number]
const MUTED    = [107,114, 128]  as [number,number,number]
const BORDER   = [229,231, 235]  as [number,number,number]
const WHITE    = [255,255, 255]  as [number,number,number]
const ROW_ALT  = [248,249, 252]  as [number,number,number]

async function loadImage(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url
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

// ── Receipt allocation item ────────────────────────────────────────
export interface ReceiptAllocation {
  invoice_no: string
  amount:     number
}

export interface ReceiptPDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null

  receiptNo:  string
  date:       string

  customerName:    string
  customerAddress: string
  customerPhone:   string
  customerEmail?:  string

  paymentMethod?: string | null
  bankName?:      string | null
  amount:         number
  reference?:     string
  notes?:         string

  status?:          string           // "Active"
  allocations?:     ReceiptAllocation[]   // invoices the receipt is applied to
  journalSummary?: { debit: number; credit: number } | null
}

export async function generateReceiptPDF(data: ReceiptPDFData): Promise<jsPDF> {
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

  // ── REPORT TITLE ─────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text("RECEIPT", PW - MR, LOGO_Y + 9, { align: "right" })

  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text("Receipt No:", PW - MR - 36, metaY)
  doc.text("Date:",       PW - MR - 36, metaY + 5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK)
  doc.text(data.receiptNo, PW - MR, metaY,     { align: "right" })
  doc.text(data.date,      PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── RECEIVED FROM / AMOUNT ──────────────────────────────────────
  let Y = HEADER_H + 7

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("RECEIVED FROM", ML,        Y)
  doc.text("AMOUNT",        PW - MR,   Y, { align: "right" })

  Y += 5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...DARK)
  doc.text(data.customerName || "", ML, Y)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(16, 185, 129)   // green for received payment
  doc.text(pkr(data.amount), PW - MR, Y, { align: "right" })

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

  // Status badge
  const statusText = (data.status || "Active").toUpperCase()
  const statusColor: [number,number,number] = [5, 150, 105]   // green

  const statusLabelY = HEADER_H + 7 + 5 + 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })

  const badgeW = 22
  const badgeH = 6
  const badgeX = PW - MR - badgeW
  const badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, statusColor)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, divY, PW - MR, divY)

  // ── DETAILS TABLE (navy header with white separators) ────────────
  const tableY = divY + 4
  const ROW_H = 6
  const HEADER_ROW_H = ROW_H

  // Columns: label / value
  const LABEL_W = 60
  const VALUE_W = CW - LABEL_W

  // Navy header
  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY)
  // White separator
  doc.setDrawColor(...WHITE)
  doc.setLineWidth(0.2)
  doc.line(ML + LABEL_W, tableY, ML + LABEL_W, tableY + HEADER_ROW_H)

  const headerTextY = tableY + HEADER_ROW_H / 2 + 1.5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text("Detail", ML + 2, headerTextY)
  doc.text("Value",  ML + LABEL_W + 2, headerTextY)

  // Body rows
  const bodyStartY = tableY + HEADER_ROW_H

  const detailRows = [
    ["Payment Method", data.paymentMethod || "—"],
    ["Bank",           data.bankName || "—"],
    ["Reference",      data.reference || "—"],
    ["Notes",          data.notes || "—"],
  ].filter(([_, val]) => val !== "—")   // hide empty rows (optional)

  autoTable(doc, {
    startY: bodyStartY,
    margin: { left: ML, right: MR },
    body: detailRows,
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
      0: { cellWidth: LABEL_W, fontStyle: "bold", halign: "left" },
      1: { cellWidth: VALUE_W, halign: "left" },
    },
  })

  const afterDetails = (doc as any).lastAutoTable.finalY as number

  // Square border around details
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(ML, bodyStartY, CW, afterDetails - bodyStartY, "S")

  let SY = afterDetails + 8

  // ── INVOICE ALLOCATIONS (if any) ─────────────────────────────────
  if (data.allocations && data.allocations.length > 0) {
    const allocStartY = SY

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...NAVY)
    doc.text("Applied to Invoices", ML, SY)
    SY += 6

    const allocRows = data.allocations.map((a, i) => [
      i + 1,
      a.invoice_no,
      pkr(a.amount),
    ])

    // mini table
    const ALLOC_NUM_W = 12
    const ALLOC_INV_W = CW - ALLOC_NUM_W - 50
    const ALLOC_AMT_W = 50

    // Header row
    filledRect(doc, ML, SY, CW, ROW_H, NAVY)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...WHITE)
    doc.text("#",        ML + ALLOC_NUM_W / 2, SY + ROW_H / 2 + 1.5, { align: "center" })
    doc.text("Invoice #", ML + ALLOC_NUM_W + 2, SY + ROW_H / 2 + 1.5, { align: "left" })
    doc.text("Amount",    PW - MR - ALLOC_AMT_W / 2, SY + ROW_H / 2 + 1.5, { align: "center" })
    SY += ROW_H

    autoTable(doc, {
      startY: SY,
      margin: { left: ML, right: MR },
      body: allocRows,
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
        0: { cellWidth: ALLOC_NUM_W, halign: "center" },
        1: { cellWidth: ALLOC_INV_W, halign: "left" },
        2: { cellWidth: ALLOC_AMT_W, halign: "right", fontStyle: "bold" },
      },
    })

    const afterAlloc = (doc as any).lastAutoTable.finalY as number

    // Square border around allocations
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect(ML, allocStartY, CW, afterAlloc - allocStartY, "S")

    SY = afterAlloc + 6
  }

  // ── JOURNAL SUMMARY (if present) ─────────────────────────────────
  if (data.journalSummary) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...NAVY)
    doc.text("Journal Entry Summary", ML, SY)
    SY += 6

    const sumX = PW - MR - 70
    const valX = PW - MR

    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Total Debits",  sumX, SY)
    doc.setTextColor(220, 38, 38)
    doc.text(pkr(data.journalSummary.debit), valX, SY, { align: "right" })
    SY += 5.5

    doc.setTextColor(...MUTED)
    doc.text("Total Credits", sumX, SY)
    doc.setTextColor(16, 185, 129)
    doc.text(pkr(data.journalSummary.credit), valX, SY, { align: "right" })
    SY += 5.5
  }

  // ── TOTAL RECEIPT AMOUNT (navy box) ─────────────────────────────
  SY += 2

  const sumX = PW - MR - 70
  const valX = PW - MR
  const TOTAL_H = ROW_H
  filledRect(doc, sumX - 2, SY - 2, valX - sumX + 4, TOTAL_H, NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text("Total Received", sumX + 2, SY + TOTAL_H / 2 - 0.5)
  doc.text(pkr(data.amount), valX - 2, SY + TOTAL_H / 2 - 0.5, { align: "right" })
  SY += TOTAL_H + 6

  // ── NOTES (if any) ──────────────────────────────────────────────
  if (data.notes) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text("NOTES", ML, SY)
    SY += 4

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK)
    const noteLines = doc.splitTextToSize(data.notes, CW)
    doc.text(noteLines, ML, SY)
  }

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