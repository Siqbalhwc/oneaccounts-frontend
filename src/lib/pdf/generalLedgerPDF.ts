/**
 * generalLedgerPDF.ts
 * Generates a professional General Ledger report (landscape).
 */

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY    = [7, 8, 91] as [number, number, number]
const DARK    = [17, 24, 39] as [number, number, number]
const MUTED   = [107, 114, 128] as [number, number, number]
const BORDER  = [229, 231, 235] as [number, number, number]
const WHITE   = [255, 255, 255] as [number, number, number]
const ROW_ALT = [248, 249, 252] as [number, number, number]

export interface GeneralLedgerLine {
  date: string
  entry_no: string
  description: string
  debit: number
  credit: number
  running_balance: number
  isOpening?: boolean
}

export interface GeneralLedgerPDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null

  accountName: string
  accountCode: string
  startDate:   string
  endDate:     string

  totalDebit:      number
  totalCredit:     number
  closingBalance:  number

  ledgerLines: GeneralLedgerLine[]
  tagLabels?: Record<string, string>
}

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
  fillRgb: [number, number, number],
  radius = 0
) {
  doc.setFillColor(...fillRgb)
  radius > 0 ? doc.roundedRect(x, y, w, h, radius, radius, "F") : doc.rect(x, y, w, h, "F")
}

export async function generateGeneralLedgerPDF(data: GeneralLedgerPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14, CW = PW - ML - MR

  // ── LOGO & COMPANY INFO ───────────────────────────────────────────
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

  // ── REPORT TITLE ──────────────────────────────────────────────────
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...NAVY)
  doc.text("GENERAL LEDGER", PW - MR, LOGO_Y + 8, { align: "right" })

  const metaY = LOGO_Y + 18
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  doc.text(`Account: ${data.accountCode} – ${data.accountName}`, PW - MR, metaY, { align: "right" })

  // ── HEADER SEPARATOR ────────────────────────────────────────────
  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER).setLineWidth(0.4).line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── PERIOD (now below the separator, safe from being cut) ───────
  const periodY = HEADER_H + 5
  doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(...MUTED)
  doc.text(`Period: ${data.startDate} – ${data.endDate}`, PW - MR, periodY)

  // ── TABLE ───────────────────────────────────────────────────────
  const tableY = periodY + 5
  const HEADER_ROW_H = 8
  const HEADER_RADIUS = 3

  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY, HEADER_RADIUS)

  const dateW = 28, entryW = 41, debitW = 30, creditW = 30, balanceW = 32
  const descW = CW - dateW - entryW - debitW - creditW - balanceW

  const FONT_SIZE_HEADER = 8
  const headerTextY = tableY + HEADER_ROW_H / 2 + FONT_SIZE_HEADER * 0.35
  doc.setFont("helvetica", "bold").setFontSize(FONT_SIZE_HEADER).setTextColor(...WHITE)

  let colX = ML
  doc.text("Date", colX + 2, headerTextY); colX += dateW
  doc.text("Entry #", colX + 2, headerTextY); colX += entryW
  doc.text("Description", colX + 2, headerTextY); colX += descW
  doc.text("Debit", colX + debitW / 2, headerTextY, { align: "center" }); colX += debitW
  doc.text("Credit", colX + creditW / 2, headerTextY, { align: "center" }); colX += creditW
  doc.text("Balance", colX + balanceW / 2, headerTextY, { align: "center" })

  const bodyStartY = tableY + HEADER_ROW_H

  const tableColumns = [
    { header: "Date",        dataKey: "date"        },
    { header: "Entry #",     dataKey: "entry_no"    },
    { header: "Description", dataKey: "description" },
    { header: "Debit",       dataKey: "debit"       },
    { header: "Credit",      dataKey: "credit"      },
    { header: "Balance",     dataKey: "balance"     },
  ]

  const tableRows = data.ledgerLines.map(line => ({
    date:        line.isOpening ? "" : line.date,
    entry_no:    line.entry_no,
    description: line.description,
    debit:       line.debit  > 0 ? line.debit.toLocaleString()  : "-",
    credit:      line.credit > 0 ? line.credit.toLocaleString() : "-",
    balance:     line.running_balance === 0 ? "-" : line.running_balance.toLocaleString(),
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
      date:        { cellWidth: dateW, halign: "left" },
      entry_no:    { cellWidth: entryW, halign: "left" },
      description: { cellWidth: descW, halign: "left" },
      debit:       { cellWidth: debitW, halign: "right" },
      credit:      { cellWidth: creditW, halign: "right" },
      balance:     { cellWidth: balanceW, halign: "right", fontStyle: "bold" },
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

  // Tiny corner masks (no more white squares over data)
  const TABLE_RADIUS = 4
  const maskSize = 1.5
  doc.setFillColor(...WHITE)
  doc.rect(ML - 0.1, afterTable - maskSize + 0.5, maskSize, maskSize, "F")
  doc.rect(ML + CW - maskSize + 0.1, afterTable - maskSize + 0.5, maskSize, maskSize, "F")

  doc.setDrawColor(...BORDER).setLineWidth(0.3)
  doc.roundedRect(ML, bodyStartY, CW, afterTable - bodyStartY, TABLE_RADIUS, TABLE_RADIUS, "S")

  // ── SUMMARY TOTALS ───────────────────────────────────────────────
  let SY = afterTable + 8
  const sumX = PW - MR - 80
  const valX = PW - MR

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...DARK)
  doc.text("Total Debits", sumX, SY)
  doc.text(pkr(data.totalDebit), valX, SY, { align: "right" })
  SY += 5.5

  doc.text("Total Credits", sumX, SY)
  doc.text(pkr(data.totalCredit), valX, SY, { align: "right" })
  SY += 5.5

  const TOTAL_RADIUS = 4
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, TOTAL_RADIUS)
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...WHITE)
  doc.text("Closing Balance", sumX + 2, SY + 1.5)
  doc.text(pkr(data.closingBalance), valX - 2, SY + 1.5, { align: "right" })
  SY += 10

  // ── FOOTER ───────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 12, PW - MR, PH - 12)
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  const footerParts = ["Generated by OneAccounts", data.companyName, new Date().toLocaleDateString()].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 6, { align: "center" })

  return doc
}