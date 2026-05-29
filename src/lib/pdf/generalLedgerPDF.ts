import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY   = [7, 8, 91] as [number,number,number]
const DARK   = [17,24,39] as [number,number,number]
const MUTED  = [107,114,128] as [number,number,number]
const BORDER = [229,231,235] as [number,number,number]
const WHITE  = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]

const pkr = (n: number) => "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

export interface LedgerLine {
  date: string
  entry_no: string
  description: string
  debit: number
  credit: number
  running_balance: number
  isOpening?: boolean
}

export interface GeneralLedgerPDFData {
  companyName: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTagline: string
  logoUrl?: string | null
  accountName: string
  accountCode: string
  startDate: string
  endDate: string
  totalDebit: number
  totalCredit: number
  closingBalance: number
  ledgerLines: LedgerLine[]
  tagLabels?: Record<string, string>   // e.g. { project: "Relief Fund" }
}

export async function generateGeneralLedgerPDF(data: GeneralLedgerPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14, CW = PW - ML - MR

  // Logo & company info
  const LOGO_SIZE = 20, LOGO_X = ML, LOGO_Y = 7
  let logoData: string | null = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)

  const textX = logoData ? LOGO_X + LOGO_SIZE + 5 : ML
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(data.companyName || "", textX, LOGO_Y + 7)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)
  let infoY = LOGO_Y + 19
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // Title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(24)
  doc.setTextColor(...NAVY)
  doc.text("GENERAL LEDGER", PW - MR, LOGO_Y + 8, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`${data.accountCode} – ${data.accountName}`, PW - MR, LOGO_Y + 16, { align: "right" })
  doc.text(`From: ${data.startDate}  To: ${data.endDate}`, PW - MR, LOGO_Y + 21, { align: "right" })

  // Divider
  const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

  // Optional tag chips
  let Y = HEADER_BOTTOM + 6
  if (data.tagLabels && Object.keys(data.tagLabels).length > 0) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    const tags = Object.entries(data.tagLabels).map(([k, v]) => `${k}: ${v}`).join("  |  ")
    doc.setTextColor(...MUTED)
    doc.text(tags, ML, Y)
    Y += 5
  }

  // Build table rows
  const headers = ["Date", "Entry #", "Description", "Debit", "Credit", "Balance"]
  const rows: any[] = data.ledgerLines.map(line => [
    line.isOpening ? "" : line.date,
    line.entry_no,
    line.description,
    line.debit > 0 ? pkr(line.debit) : "–",
    line.credit > 0 ? pkr(line.credit) : "–",
    pkr(line.running_balance) + (line.running_balance >= 0 ? " Dr" : " Cr"),
  ])
  // Totals row
  rows.push(["", "", "Total", pkr(data.totalDebit), pkr(data.totalCredit), pkr(data.closingBalance)])

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: MR },
    head: [headers],
    body: rows,
    styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: DARK, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 38, halign: "right" },
      4: { cellWidth: 38, halign: "right" },
      5: { cellWidth: 42, halign: "right" },
    },
    didParseCell: (hookData) => {
      // Opening row styling
      const rowData = hookData.row.raw as string[]
      if (rowData[2] === "Opening Balance") {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.fillColor = [240, 240, 245]
      }
      // Totals row
      if (rowData[2] === "Total") {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.fillColor = NAVY
        hookData.cell.styles.textColor = WHITE
      }
    },
  })

  // Footer
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(ML, PH - 14, PW - MR, PH - 14)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(`Generated by ${data.companyName}  ·  ${data.companyTagline}`, PW / 2, PH - 8, { align: "center" })

  return doc
}