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
  } catch { return null }
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

// ── Journal line from the receipt ─────────────────────────────────
export interface ReceiptJournalLine {
  account_code: string
  account_name: string
  description?: string
  debit: number
  credit: number
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
  amount:         number
  reference?:     string
  notes?:         string

  status?:         string
  journalLines:    ReceiptJournalLine[]     // ✅ used for the main table
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

  // Receipt number & date – add space between label and value
  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text("Receipt No:",  PW - MR - 42, metaY)       // slightly wider column
  doc.text("Date:",        PW - MR - 42, metaY + 5)
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
  doc.setTextColor(16, 185, 129)   // green
  doc.text(pkr(data.amount), PW - MR, Y, { align: "right" })

  Y += 5

  if (data.customerPhone) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("- " + data.customerPhone, ML, Y)
    Y += 4.5
  }
  if (data.customerAddress) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const addrLines = doc.splitTextToSize("- " + data.customerAddress, CW * 0.55)
    doc.text(addrLines, ML, Y)
    Y += addrLines.length * 4.5
  }

  // Status badge
  const statusText = (data.status || "Active").toUpperCase()
  const statusColor: [number,number,number] = [5, 150, 105]
  const statusLabelY = HEADER_H + 7 + 5 + 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })
  const badgeW = 22, badgeH = 6
  const badgeX = PW - MR - badgeW, badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, statusColor)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, divY, PW - MR, divY)

  // ── PAYMENT METHOD (above the journal table) ─────────────────────
  Y = divY + 6
  if (data.paymentMethod) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text("Method: ", ML, Y)
    doc.setFont("helvetica", "normal")
    doc.text(data.paymentMethod, ML + 22, Y)
    Y += 7
  }

  // ── JOURNAL ENTRY TABLE ──────────────────────────────────────────
  if (data.journalLines.length > 0) {
    const ROW_H = 6
    const tableStartY = Y + 2

    // Column widths
    const NUM_W   = 10
    const ACC_W   = 50
    const DESC_W  = CW - NUM_W - ACC_W - 40 - 40   // remaining for description
    const DEB_W   = 40
    const CRED_W  = 40

    // Navy header
    filledRect(doc, ML, tableStartY, CW, ROW_H, NAVY)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...WHITE)
    const hTextY = tableStartY + ROW_H / 2 + 1.2
    let xPos = ML
    doc.text("Sr.",      xPos + NUM_W/2, hTextY, { align: "center" })
    xPos += NUM_W
    doc.text("Account",  xPos + ACC_W/2, hTextY, { align: "center" })
    xPos += ACC_W
    doc.text("Description", xPos + DESC_W/2, hTextY, { align: "center" })
    xPos += DESC_W
    doc.text("Debit (PKR)", xPos + DEB_W/2, hTextY, { align: "center" })
    xPos += DEB_W
    doc.text("Credit (PKR)", xPos + CRED_W/2, hTextY, { align: "center" })

    // White vertical separators
    doc.setDrawColor(...WHITE)
    doc.setLineWidth(0.2)
    xPos = ML + NUM_W
    doc.line(xPos, tableStartY, xPos, tableStartY + ROW_H)
    xPos += ACC_W
    doc.line(xPos, tableStartY, xPos, tableStartY + ROW_H)
    xPos += DESC_W
    doc.line(xPos, tableStartY, xPos, tableStartY + ROW_H)
    xPos += DEB_W
    doc.line(xPos, tableStartY, xPos, tableStartY + ROW_H)

    const bodyStartY = tableStartY + ROW_H
    const rows = data.journalLines.map((line, i) => [
      i + 1,
      `${line.account_code} – ${line.account_name}`,
      line.description || "—",
      line.debit > 0 ? pkr(line.debit) : "–",
      line.credit > 0 ? pkr(line.credit) : "–",
    ])

    // Totals row
    const totalDebit = data.journalLines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = data.journalLines.reduce((s, l) => s + l.credit, 0)
    rows.push([
      "",
      "Total",
      "",
      pkr(totalDebit),
      pkr(totalCredit),
    ])

    autoTable(doc, {
      startY: bodyStartY,
      margin: { left: ML, right: MR },
      body: rows,
      showHead: false,
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
        textColor: DARK,
        lineColor: BORDER,
        lineWidth: 0.2,
        minCellHeight: ROW_H,
      },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: NUM_W,  halign: "center" },
        1: { cellWidth: ACC_W,  halign: "left" },
        2: { cellWidth: DESC_W, halign: "left" },
        3: { cellWidth: DEB_W,  halign: "right" },
        4: { cellWidth: CRED_W, halign: "right" },
      },
      didParseCell: (hookData) => {
        // Last row is totals → bold & navy background
        if (hookData.row.index === rows.length - 1) {
          hookData.cell.styles.fontStyle = "bold"
          hookData.cell.styles.fillColor = NAVY
          hookData.cell.styles.textColor = WHITE
        }
      },
    })

    const afterTable = (doc as any).lastAutoTable.finalY as number

    // Square border around table
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect(ML, bodyStartY, CW, afterTable - bodyStartY, "S")

    Y = afterTable + 8
  }

  // ── REFERENCE & NOTES (if present) ─────────────────────────────
  if (data.reference) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text("Reference:", ML, Y)
    doc.setFont("helvetica", "normal")
    doc.text(data.reference, ML + 28, Y)
    Y += 6
  }
  if (data.notes) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text("Notes:", ML, Y)
    doc.setFont("helvetica", "normal")
    doc.text(data.notes, ML + 20, Y)
    Y += 6
  }

  // ── TOTAL RECEIVED (navy box) ────────────────────────────────────
  const TOTAL_H = 6
  const totalX = PW - MR - 70
  const totalW = 70
  filledRect(doc, totalX - 2, Y + 2, totalW + 4, TOTAL_H, NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text("Total Received", totalX + 2, Y + 2 + TOTAL_H / 2 + 0.2)
  doc.text(pkr(data.amount), PW - MR - 2, Y + 2 + TOTAL_H / 2 + 0.2, { align: "right" })
  Y += TOTAL_H + 10

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