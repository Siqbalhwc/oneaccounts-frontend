/**
 * generalLedgerPDF.ts
 * Generates a professional General Ledger report (landscape).
 *
 * Fixes:
 *  1. Added tagLabels to interface and prints active filters below the period line.
 *  2. Fixed opening-row highlight in didDrawCell — isOpening is now carried
 *     through the row data so the hook can detect it.
 *  3. Balance column shows absolute value + Dr/Cr suffix (consistent with UI).
 *  4. toLocaleString("en-PK") pinned for consistent comma formatting.
 */

import jsPDF      from "jspdf"
import autoTable  from "jspdf-autotable"

const NAVY    = [7,  8,  91]  as [number,number,number]
const DARK    = [17, 24, 39]  as [number,number,number]
const MUTED   = [107,114,128] as [number,number,number]
const BORDER  = [229,231,235] as [number,number,number]
const WHITE   = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]
const OB_FILL = [240,242,255] as [number,number,number]   // light navy tint for OB row

export interface GeneralLedgerLine {
  date:            string
  entry_no:        string
  description:     string
  debit:           number
  credit:          number
  running_balance: number
  isOpening?:      boolean
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

  totalDebit:     number
  totalCredit:    number
  closingBalance: number

  ledgerLines: GeneralLedgerLine[]

  // Resolved tag names from the API — only present keys are active filters
  tagLabels?: Record<string, string>
}

// ── Helpers ──────────────────────────────────────────────────────────

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
  } catch { return null }
}

const pkr = (n: number) =>
  "PKR " + Math.abs(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const drCr = (n: number) => n >= 0 ? "Dr" : "Cr"

function filledRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  fillRgb: [number,number,number],
  radius = 0,
) {
  doc.setFillColor(...fillRgb)
  radius > 0
    ? doc.roundedRect(x, y, w, h, radius, radius, "F")
    : doc.rect(x, y, w, h, "F")
}

// ── Main export ───────────────────────────────────────────────────────

export async function generateGeneralLedgerPDF(data: GeneralLedgerPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14, CW = PW - ML - MR

  // ── Logo + company block ──────────────────────────────────────────
  const LOGO_SIZE = 16, LOGO_X = ML, LOGO_Y = 6
  let logoData: string | null = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)

  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML

  doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(14)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 18
  if (data.companyAddress) { doc.text(data.companyAddress,           textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // ── Report title (right-aligned) ──────────────────────────────────
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...NAVY)
  doc.text("GENERAL LEDGER", PW - MR, LOGO_Y + 8, { align: "right" })

  const metaY = LOGO_Y + 18
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  doc.text(`Account: ${data.accountCode} – ${data.accountName}`, PW - MR, metaY,     { align: "right" })
  doc.text(`Period:  ${data.startDate} – ${data.endDate}`,        PW - MR, metaY + 5, { align: "right" })

  // ── Active tag filters line ───────────────────────────────────────
  // Printed only when at least one tag filter is active.
  const tags = data.tagLabels || {}
  const tagParts: string[] = []
  if (tags.project)  tagParts.push(`Project: ${tags.project}`)
  if (tags.donor)    tagParts.push(`Donor: ${tags.donor}`)
  if (tags.activity) tagParts.push(`Activity: ${tags.activity}`)
  if (tags.location) tagParts.push(`Location: ${tags.location}`)

  let headerBottom = LOGO_Y + LOGO_SIZE + 4
  if (tagParts.length > 0) {
    const tagY = headerBottom + 4
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(...MUTED)
    doc.text("Filters: " + tagParts.join("  ·  "), ML, tagY)
    headerBottom = tagY + 2
  }

  doc.setDrawColor(...BORDER).setLineWidth(0.4).line(ML, headerBottom + 2, PW - MR, headerBottom + 2)

  // ── Column widths ─────────────────────────────────────────────────
  const dateW    = 28
  const entryW   = 41
  const debitW   = 32
  const creditW  = 32
  const balanceW = 36
  const descW    = CW - dateW - entryW - debitW - creditW - balanceW

  // ── Table header bar ──────────────────────────────────────────────
  const tableY     = headerBottom + 8
  const HDR_H      = 8
  const HDR_RADIUS = 3

  filledRect(doc, ML, tableY, CW, HDR_H, NAVY, HDR_RADIUS)

  const hTextY = tableY + HDR_H / 2 + 8 * 0.35
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...WHITE)

  let cx = ML
  doc.text("Date",        cx + 2,                        hTextY); cx += dateW
  doc.text("Entry #",     cx + 2,                        hTextY); cx += entryW
  doc.text("Description", cx + 2,                        hTextY); cx += descW
  doc.text("Debit",       cx + debitW   / 2,             hTextY, { align: "center" }); cx += debitW
  doc.text("Credit",      cx + creditW  / 2,             hTextY, { align: "center" }); cx += creditW
  doc.text("Balance",     cx + balanceW / 2,             hTextY, { align: "center" })

  const bodyStartY = tableY + HDR_H

  // ── Build table rows ──────────────────────────────────────────────
  // Keep _isOpening in the raw row object so didDrawCell can read it.
  const tableRows = data.ledgerLines.map(line => ({
    date:        line.isOpening ? "Opening" : (line.date || ""),
    entry_no:    line.entry_no  || "",
    description: line.description,
    debit:       line.debit  > 0 ? line.debit.toLocaleString("en-PK")  : "—",
    credit:      line.credit > 0 ? line.credit.toLocaleString("en-PK") : "—",
    // Show absolute value + Dr/Cr suffix so sign is always explicit
    balance:     `${Math.abs(line.running_balance).toLocaleString("en-PK")} ${drCr(line.running_balance)}`,
    _isOpening:  !!line.isOpening,   // ← carried for row hook
  }))

  autoTable(doc, {
    startY: bodyStartY,
    margin: { left: ML, right: MR },
    columns: [
      { header: "Date",        dataKey: "date"        },
      { header: "Entry #",     dataKey: "entry_no"    },
      { header: "Description", dataKey: "description" },
      { header: "Debit",       dataKey: "debit"       },
      { header: "Credit",      dataKey: "credit"      },
      { header: "Balance",     dataKey: "balance"     },
    ],
    body: tableRows,
    showHead: false,
    styles: {
      fontSize:      8,
      cellPadding:   { top: 2, bottom: 2, left: 3, right: 3 },
      textColor:     DARK,
      lineColor:     BORDER,
      lineWidth:     0.2,
      minCellHeight: 8,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      date:        { cellWidth: dateW,    halign: "left"  },
      entry_no:    { cellWidth: entryW,   halign: "left"  },
      description: { cellWidth: descW,    halign: "left"  },
      debit:       { cellWidth: debitW,   halign: "right" },
      credit:      { cellWidth: creditW,  halign: "right" },
      balance:     { cellWidth: balanceW, halign: "right", fontStyle: "bold" },
    },
    // Highlight opening balance row with a distinct fill
    didDrawCell(hookData) {
      if (hookData.section !== "body") return
      const raw = hookData.row.raw as any
      if (raw?._isOpening) {
        doc.setFillColor(...OB_FILL)
        doc.rect(
          hookData.cell.x,
          hookData.cell.y,
          hookData.cell.width,
          hookData.cell.height,
          "F",
        )
        // Re-draw text so it's not obscured by the fill rect
        doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...NAVY)
        const textY = hookData.cell.y + hookData.cell.height / 2 + 8 * 0.35
        const align = (hookData.column.dataKey === "debit" ||
                       hookData.column.dataKey === "credit" ||
                       hookData.column.dataKey === "balance") ? "right" : "left"
        const textX = align === "right"
          ? hookData.cell.x + hookData.cell.width - 3
          : hookData.cell.x + 3
        doc.text(String(hookData.cell.raw ?? ""), textX, textY, { align })
      }
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // Rounded border around table body
  const TABLE_RADIUS = 4
  const cornerSize   = TABLE_RADIUS + 1
  doc.setFillColor(...WHITE)
  doc.rect(ML,                   afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.rect(ML + CW - cornerSize, afterTable - cornerSize, cornerSize, cornerSize, "F")
  doc.setDrawColor(...BORDER).setLineWidth(0.3)
  doc.roundedRect(ML, bodyStartY, CW, afterTable - bodyStartY, TABLE_RADIUS, TABLE_RADIUS, "S")

  // ── Summary totals ────────────────────────────────────────────────
  let SY    = afterTable + 8
  const sumX = PW - MR - 88
  const valX = PW - MR

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...DARK)

  doc.text("Total Debits",  sumX, SY)
  doc.text(pkr(data.totalDebit),  valX, SY, { align: "right" })
  SY += 5.5

  doc.text("Total Credits", sumX, SY)
  doc.text(pkr(data.totalCredit), valX, SY, { align: "right" })
  SY += 5.5

  // Closing balance pill
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, 4)
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...WHITE)
  doc.text("Closing Balance",                          sumX + 2,  SY + 1.5)
  doc.text(
    pkr(data.closingBalance) + " " + drCr(data.closingBalance),
    valX - 2, SY + 1.5,
    { align: "right" },
  )

  // ── Footer ────────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 12, PW - MR, PH - 12)
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  const footerParts = ["Generated by OneAccounts", data.companyName, new Date().toLocaleDateString()].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 6, { align: "center" })

  return doc
}
