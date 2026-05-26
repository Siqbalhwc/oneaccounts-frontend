/**
 * paymentPDF.ts
 * Generates a supplier payment PDF with the same premium format as the invoice.
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

export interface AppliedBill {
  bill_no: string
  amount: number
}

export interface JournalLinePDF {
  account_code: string
  account_name: string
  debit: number
  credit: number
}

export interface PaymentPDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null

  paymentNo:  string
  date:       string

  supplierName:    string
  supplierAddress: string
  supplierPhone:   string
  supplierEmail?:  string

  bankName?:      string
  paymentMethod?: string
  notes?:         string | null

  status:     string
  bills:      AppliedBill[]        // list of applied bills
  journalLines?: JournalLinePDF[] // journal entry lines

  total:      number
  paid:       number
  balanceDue: number
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

function filledRect(doc: jsPDF, x: number, y: number, w: number, h: number, fillRgb: [number,number,number], radius = 0) {
  doc.setFillColor(...fillRgb)
  radius > 0 ? doc.roundedRect(x, y, w, h, radius, radius, "F") : doc.rect(x, y, w, h, "F")
}

export async function generatePaymentPDF(data: PaymentPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR

  const LOGO_SIZE = 18, LOGO_X = ML, LOGO_Y = 6
  let logoData = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)

  // Clean logo
  if (logoData) {
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML
  doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(13)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 18
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone) { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail) { doc.text("Email: " + data.companyEmail, textX, infoY) }

  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(...NAVY)
  doc.text("PAYMENT", PW - MR, LOGO_Y + 9, { align: "right" })

  // META INFO – increased space to prevent overlapping
  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  doc.text("Payment No:", PW - MR - 48, metaY)
  doc.text("Date:",       PW - MR - 48, metaY + 5)
  doc.setFont("helvetica", "bold").setTextColor(...DARK)
  doc.text(data.paymentNo, PW - MR, metaY,     { align: "right" })
  doc.text(data.date,      PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER).setLineWidth(0.4).line(ML, HEADER_H, PW - MR, HEADER_H)

  // Supplier & Amount
  let Y = HEADER_H + 7
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("SUPPLIER",  ML,      Y)
  doc.text("AMOUNT",    PW - MR, Y, { align: "right" })
  Y += 5
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...DARK)
  doc.text(data.supplierName || "", ML, Y)
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...AMBER)
  doc.text(pkr(data.total), PW - MR, Y, { align: "right" })
  Y += 5

  const phone = (data.supplierPhone ?? "").trim()
  if (phone) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); doc.text("- " + phone, ML, Y); Y += 4.5 }
  const address = (data.supplierAddress ?? "").trim()
  if (address) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); const addrLines = doc.splitTextToSize("- " + address, CW * 0.55); doc.text(addrLines, ML, Y); Y += addrLines.length * 4.5 }
  const email = (data.supplierEmail ?? "").trim()
  if (email) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); doc.text("- " + email, ML, Y); Y += 4.5 }

  // Bank and method
  if (data.bankName) {
    Y += 2
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED)
    doc.text("Bank:", ML, Y)
    doc.setFont("helvetica", "normal").setTextColor(...DARK)
    doc.text(data.bankName, ML + 12, Y)
    Y += 5
  }
  if (data.paymentMethod) {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED)
    doc.text("Method:", ML, Y)
    doc.setFont("helvetica", "normal").setTextColor(...DARK)
    doc.text(data.paymentMethod, ML + 16, Y)
    Y += 5
  }

  // Status badge
  const statusText = (data.status || "Processed").toUpperCase()
  const badgeColor: [number,number,number] = statusText === "PROCESSED" ? [5,150,105] : RED
  const statusLabelY = HEADER_H + 7 + 5 + 5
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })
  const badgeW = 22, badgeH = 6, badgeX = PW - MR - badgeW, badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor, 2)
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, divY, PW - MR, divY)

  // ── APPLIED BILLS TABLE – identical style to invoice items ──
  const tableY = divY + 4
  const HEADER_ROW_H = 10
  const HEADER_RADIUS = 4

  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY, HEADER_RADIUS)

  // Columns: #, Bill No., Amount
  const numColW = 14
  const billColW = CW - numColW - 34 - 4 // remaining for bill number, then amount column 34
  const amountColW = 34

  const FONT_SIZE_HEADER = 9
  const textY = tableY + HEADER_ROW_H / 2 + FONT_SIZE_HEADER * 0.35

  doc.setFont("helvetica", "bold").setFontSize(FONT_SIZE_HEADER).setTextColor(...WHITE)
  doc.text("#", ML + 2, textY, { align: "left" })
  doc.text("Bill No.", ML + numColW + 4, textY, { align: "left" })
  doc.text("Amount", PW - MR, textY, { align: "right" })

  const bodyStartY = tableY + HEADER_ROW_H

  const tableRows = data.bills.map((bill, i) => ({
    num: i + 1,
    bill_no: bill.bill_no,
    amount: pkr(bill.amount),
  }))

  const tableColumns = [
    { header: "#",       dataKey: "num",    },
    { header: "Bill No.", dataKey: "bill_no" },
    { header: "Amount",  dataKey: "amount"  },
  ]

  autoTable(doc, {
    startY: bodyStartY,
    margin: { left: ML, right: MR },
    columns: tableColumns,
    body: tableRows,
    showHead: false,
    styles: {
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      minCellHeight: 10,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      num:    { cellWidth: numColW, halign: "left" },
      bill_no: { cellWidth: "auto", halign: "left" },
      amount: { cellWidth: amountColW, halign: "right", fontStyle: "bold" },
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // Rounded border around table
  const TABLE_RADIUS = 4
  const cornerSize = TABLE_RADIUS + 1
  doc.setFillColor(...WHITE)
  doc.rect(ML, afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.rect(ML + CW - cornerSize, afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.setDrawColor(...BORDER).setLineWidth(0.3)
  doc.roundedRect(ML, bodyStartY, CW, afterTable - bodyStartY, TABLE_RADIUS, TABLE_RADIUS, "S")

  // ── TOTAL SECTION (same as invoice) ──
  let SY = afterTable + 6
  const sumX = PW - MR - 70
  const valX = PW - MR

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
  doc.text("Subtotal", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(data.total), valX, SY, { align: "right" })
  SY += 5.5

  doc.setFont("helvetica", "bold").setTextColor(...MUTED)
  doc.text("Tax (0%)", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(0), valX, SY, { align: "right" })
  SY += 5.5

  const TOTAL_RADIUS = 4
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, TOTAL_RADIUS)
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...WHITE)
  doc.text("Total", sumX + 2, SY + 1.5)
  doc.text(pkr(data.total), valX - 2, SY + 1.5, { align: "right" })
  SY += 10

  if (data.paid > 0 && data.balanceDue >= 0) {
    SY += 2
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
    doc.text("Amount Paid", sumX, SY)
    doc.setTextColor(16, 185, 129)
    doc.text("- " + pkr(data.paid), valX, SY, { align: "right" })
    SY += 5.5

    if (data.balanceDue > 0) {
      doc.setFont("helvetica", "bold").setTextColor(...RED)
      doc.text("Balance Due", sumX, SY)
      doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
      SY += 5
    }
  }

  // ── JOURNAL ENTRY (if any) ──
  if (data.journalLines && data.journalLines.length > 0) {
    SY += 6
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...NAVY)
    doc.text("Journal Entry", ML, SY)
    SY += 4

    const jeBody = data.journalLines.map(line => ({
      account: `${line.account_code} – ${line.account_name}`,
      debit: line.debit > 0 ? pkr(line.debit) : "",
      credit: line.credit > 0 ? pkr(line.credit) : "",
    }))

    const jeColumns = [
      { header: "Account", dataKey: "account" },
      { header: "Debit", dataKey: "debit" },
      { header: "Credit", dataKey: "credit" },
    ]

    autoTable(doc, {
      startY: SY,
      margin: { left: ML, right: MR },
      columns: jeColumns,
      body: jeBody,
      styles: { fontSize: 9, cellPadding: 3, textColor: DARK, lineColor: BORDER, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        account: { cellWidth: "auto", halign: "left" },
        debit:   { cellWidth: 34, halign: "right" },
        credit:  { cellWidth: 34, halign: "right" },
      },
    })

    SY = (doc as any).lastAutoTable.finalY + 6

    const totalDebit = data.journalLines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = data.journalLines.reduce((s, l) => s + l.credit, 0)
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...DARK)
    doc.text("Total", sumX, SY)
    doc.text(pkr(totalDebit), valX - 34, SY, { align: "right" })
    doc.text(pkr(totalCredit), valX, SY, { align: "right" })
    SY += 6
  }

  // ── NOTES ──
  SY += 4
  const termsLines: string[] = []
  if (data.paymentMethod) termsLines.push(`Payment Method: ${data.paymentMethod}`)
  if (data.notes) termsLines.push(data.notes)
  if (termsLines.length === 0) termsLines.push("Payment processed.")
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("NOTES", ML, SY)
  SY += 4
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...DARK)
  const noteLines = doc.splitTextToSize(termsLines.join("\n"), CW)
  doc.text(noteLines, ML, SY)

  // ── FOOTER ──
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 16, PW - MR, PH - 16)
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  const footerParts = ["Thank you for your business!", data.companyName, data.companyTagline].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}