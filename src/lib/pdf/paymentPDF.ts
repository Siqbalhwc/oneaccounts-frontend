/**
 * paymentPDF.ts
 * Generates a supplier payment PDF with detailed breakdown.
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

export interface PaymentItem {
  description:  string
  qty:          number
  unit_price:   number
  total:        number
  image_path?:  string | null
  product_id?:  string | null
  product_name?:string
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
  items:      PaymentItem[]          // applied bills
  journalLines?: JournalLinePDF[]    // journal entry lines

  subtotal:   number
  total:      number
  balanceDue: number
  paid:       number
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

  // Clean logo – no circle or background
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

  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  doc.text("Payment No:", PW - MR - 36, metaY)
  doc.text("Date:",       PW - MR - 36, metaY + 5)
  doc.setFont("helvetica", "bold").setTextColor(...DARK)
  doc.text(data.paymentNo, PW - MR, metaY,     { align: "right" })
  doc.text(data.date,      PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER).setLineWidth(0.4).line(ML, HEADER_H, PW - MR, HEADER_H)

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

  // Bank name and payment method
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

  // ── APPLIED TO BILLS TABLE ──
  const tableY = divY + 4
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...NAVY)
  doc.text("Applied to Bills", ML, tableY - 2)

  const billBody = data.items.map((item, i) => ({
    num: i + 1,
    description: item.description,
    amount: pkr(item.total),
  }))

  const billColumns = [
    { header: "#", dataKey: "num" },
    { header: "Bill", dataKey: "description" },
    { header: "Amount", dataKey: "amount" },
  ]

  autoTable(doc, {
    startY: tableY + 2,
    margin: { left: ML, right: MR },
    columns: billColumns,
    body: billBody,
    styles: { fontSize: 9, cellPadding: 3, textColor: DARK, lineColor: BORDER, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      num: { cellWidth: 10, halign: "center" },
      description: { cellWidth: "auto", halign: "left" },
      amount: { cellWidth: 34, halign: "right", fontStyle: "bold" },
    },
  })

  const afterBills = (doc as any).lastAutoTable.finalY + 4

  // ── JOURNAL ENTRY TABLE ──
  if (data.journalLines && data.journalLines.length > 0) {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...NAVY)
    doc.text("Journal Entry", ML, afterBills)

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
      startY: afterBills + 4,
      margin: { left: ML, right: MR },
      columns: jeColumns,
      body: jeBody,
      styles: { fontSize: 9, cellPadding: 3, textColor: DARK, lineColor: BORDER, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        account: { cellWidth: "auto", halign: "left" },
        debit: { cellWidth: 34, halign: "right" },
        credit: { cellWidth: 34, halign: "right" },
      },
    })

    const afterJE = (doc as any).lastAutoTable.finalY + 6

    // Total row for journal entry
    const totalDebit = data.journalLines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = data.journalLines.reduce((s, l) => s + l.credit, 0)
    const sumX = PW - MR - 70
    const valX = PW - MR
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...DARK)
    doc.text("Total", sumX, afterJE)
    doc.text(pkr(totalDebit), valX - 34, afterJE, { align: "right" })
    doc.text(pkr(totalCredit), valX, afterJE, { align: "right" })

    // ── NOTES ──
    let SY = afterJE + 10
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

    doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 16, PW - MR, PH - 16)
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
    const footerParts = ["Thank you for your business!", data.companyName, data.companyTagline].filter(Boolean)
    doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })
  } else {
    // Fallback if no journal lines
    let SY = afterBills + 10
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

    doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 16, PW - MR, PH - 16)
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
    const footerParts = ["Thank you for your business!", data.companyName, data.companyTagline].filter(Boolean)
    doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })
  }

  return doc
}